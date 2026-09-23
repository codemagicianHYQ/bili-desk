import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 打包完成后只保留当前 package.json 版本的安装包 / blockmap / 说明，
 * 清掉 release/ 里更早版本的产物。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const version = String(pkg.version ?? "").trim();
const releaseDir = path.join(root, "release");

if (!version) {
  console.warn("[clean-old-releases] 无法读取 package.json version，跳过");
  process.exit(0);
}

if (!fs.existsSync(releaseDir)) {
  process.exit(0);
}

const VERSIONED =
  /(?:BiliDesk[ .]Setup[ .])(\d+\.\d+\.\d+)|RELEASE_NOTES_(\d+\.\d+\.\d+)/i;

let removed = 0;
for (const name of fs.readdirSync(releaseDir)) {
  const found = name.match(VERSIONED);
  const fileVersion = found?.[1] || found?.[2];
  if (!fileVersion || fileVersion === version) continue;

  const full = path.join(releaseDir, name);
  if (!fs.statSync(full).isFile()) continue;
  fs.unlinkSync(full);
  removed += 1;
  console.log(`[clean-old-releases] 已删除旧版：${name}`);
}

if (removed === 0) {
  console.log(`[clean-old-releases] 无需清理，当前仅保留 ${version}`);
} else {
  console.log(
    `[clean-old-releases] 已删除 ${removed} 个旧产物，仅保留 ${version}`,
  );
}
