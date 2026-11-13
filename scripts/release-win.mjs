import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Windows 打包并发 GitHub Release。
 *
 * 在 bili-desk 目录执行：pnpm run release:win
 *
 * 跑之前：
 * 1. 功能改动已经提交，工作区里不要留着别的未提交文件
 * 2. package.json 的 version 改成这次要发的版本
 * 3. 写好 release/RELEASE_NOTES_<version>.md
 *    没有这份说明时，脚本会生成模板并停下来，写完再跑一次
 *
 * 脚本会：打 NSIS 包 → 只提交版本号文件 → push → 上传
 * GitHub 资源名：BiliLoft.Setup.X.Y.Z.exe
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packOnly = process.argv.includes("--pack-only");

function exe(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function shellArg(arg) {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function run(command, args, extraEnv) {
  const useShell = process.platform === "win32";
  const options = {
    cwd: root,
    stdio: "inherit",
    shell: useShell,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  };
  const result = useShell
    ? spawnSync([command, ...args.map(shellArg)].join(" "), options)
    : spawnSync(command, args, options);
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  return result.status ?? 1;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function readVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const version = String(pkg.version ?? "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`package.json version 不是 x.y.z：${version || "(空)"}`);
    process.exit(1);
  }
  return version;
}

function notesPath(version) {
  return path.join(root, "release", `RELEASE_NOTES_${version}.md`);
}

function ensureNotes(version) {
  const file = notesPath(version);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (
    !fs.existsSync(file) ||
    fs.readFileSync(file, "utf8").trim().length < 20
  ) {
    const body = `## 更新\n\n### \n\n- \n\n## 安装\n\n下载 \`BiliLoft.Setup.${version}.exe\` 安装即可，覆盖安装会保留登录状态和设置。\n`;
    fs.writeFileSync(file, body, "utf8");
    console.error(`还没有更新说明，已写好模板：${file}`);
    console.error("写完内容后再执行一次 pnpm run release:win");
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8");
  const asset = `BiliLoft.Setup.${version}.exe`;
  if (!text.includes(asset)) {
    console.warn(`说明里没有 ${asset}，GitHub 页面上的安装文件名会对不上。`);
  }
  return file;
}

function assertGitReady(version) {
  const status = capture("git", ["status", "--porcelain"]);
  if (status.status !== 0) process.exit(status.status);
  const allowed = new Set(["package.json", "package-lock.json"]);
  const extra = status.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/g, ""))
    .filter((file) => !allowed.has(file));
  if (extra.length > 0) {
    console.error("工作区还有未提交的改动，先提交功能，再发版：");
    for (const file of extra) console.error(`  ${file}`);
    process.exit(1);
  }

  const tag = `v${version}`;
  const local = capture("git", ["tag", "-l", tag]);
  if (local.stdout.trim() === tag) {
    console.error(
      `本地已有标签 ${tag}，先把 package.json 的 version 改成新版本。`,
    );
    process.exit(1);
  }
  const remote = capture("git", [
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${tag}`,
  ]);
  if (remote.status !== 0) process.exit(remote.status);
  if (remote.stdout.trim()) {
    console.error(
      `远程已有标签 ${tag}，先把 package.json 的 version 改成新版本。`,
    );
    process.exit(1);
  }
}

function findSetupExe(dir, version) {
  if (!fs.existsSync(dir)) return null;
  const exact = path.join(dir, `BiliLoft Setup ${version}.exe`);
  if (fs.existsSync(exact)) return exact;
  const hit = fs
    .readdirSync(dir)
    .find(
      (name) =>
        name.includes(version) &&
        name.toLowerCase().endsWith(".exe") &&
        !name.toLowerCase().endsWith(".exe.blockmap"),
    );
  return hit ? path.join(dir, hit) : null;
}

function copyReleaseArtifacts(fromDir, version) {
  const releaseDir = path.join(root, "release");
  fs.mkdirSync(releaseDir, { recursive: true });
  const exe = findSetupExe(fromDir, version);
  if (!exe) {
    console.error(`在 ${fromDir} 里没有找到 ${version} 的安装包。`);
    process.exit(1);
  }
  const names = [
    path.basename(exe),
    `${path.basename(exe)}.blockmap`,
    "latest.yml",
  ];
  for (const name of names) {
    const source = path.join(fromDir, name);
    if (!fs.existsSync(source)) continue;
    const target = path.join(releaseDir, name);
    if (path.resolve(source) === path.resolve(target)) continue;
    fs.copyFileSync(source, target);
  }
  return findSetupExe(releaseDir, version);
}

function pack(version) {
  console.log(`\n开始打包 ${version} …`);
  const packed = run(exe("pnpm"), ["run", "dist:win"]);
  let exePath = findSetupExe(path.join(root, "release"), version);
  if (packed !== 0 || !exePath) {
    console.log("\n输出目录被占用，改打包到 release-tmp 再拷回来。");
    const alt = run(exe("npx"), [
      "electron-builder",
      "--win",
      "-c.directories.output=release-tmp",
    ]);
    if (alt !== 0) process.exit(alt);
    exePath = copyReleaseArtifacts(path.join(root, "release-tmp"), version);
    run(process.execPath, ["./scripts/clean-old-releases.mjs"]);
    fs.rmSync(path.join(root, "release-tmp"), { recursive: true, force: true });
  }
  if (!exePath || !fs.existsSync(exePath)) {
    console.error("打包结束，但没有找到安装包。");
    process.exit(1);
  }
  const dotted = path.join(root, "release", `BiliLoft.Setup.${version}.exe`);
  fs.copyFileSync(exePath, dotted);
  console.log(`安装包：${dotted}`);
  return dotted;
}

function commitVersion(version) {
  const status = capture("git", [
    "status",
    "--porcelain",
    "--",
    "package.json",
    "package-lock.json",
  ]);
  if (status.status !== 0) process.exit(status.status);
  if (!status.stdout.trim()) {
    console.log("版本号文件没有新改动，跳过提交。");
    return;
  }
  const add = run("git", ["add", "--", "package.json", "package-lock.json"]);
  if (add !== 0) process.exit(add);
  const commit = run("git", ["commit", "-m", `release: v${version}`]);
  if (commit !== 0) process.exit(commit);
}

function proxyEnv() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) return {};
  const open = spawnSync(process.execPath, [
    "-e",
    "const n=require('net');const s=n.connect(7897,'127.0.0.1');s.setTimeout(400);s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>{s.destroy();process.exit(1)})",
  ]);
  if ((open.status ?? 1) !== 0) return {};
  const proxy = "http://127.0.0.1:7897";
  console.log("上传走本机代理 127.0.0.1:7897");
  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy,
  };
}

function publish(version, notes, asset) {
  console.log("\n推送 main …");
  const pushed = run("git", ["push", "-u", "origin", "HEAD"]);
  if (pushed !== 0) process.exit(pushed);

  const tag = `v${version}`;
  console.log(`\n创建 GitHub Release ${tag} …`);
  const created = run(
    "gh",
    ["release", "create", tag, "--title", tag, "--notes-file", notes, asset],
    proxyEnv(),
  );
  if (created !== 0) process.exit(created);
  console.log(`\n已发布 ${tag}`);
}

function main() {
  const version = readVersion();
  const notes = ensureNotes(version);
  if (!packOnly) assertGitReady(version);
  const asset = pack(version);
  if (packOnly) {
    console.log("只打包，未提交、未上传。");
    return;
  }
  commitVersion(version);
  publish(version, notes, asset);
}

main();
