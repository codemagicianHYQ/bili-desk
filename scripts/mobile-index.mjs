import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "dist", "mobile");
const source = path.join(dir, "mobile.html");
const target = path.join(dir, "index.html");
if (!fs.existsSync(source)) {
  console.error("缺少 dist/mobile/mobile.html");
  process.exit(1);
}
fs.copyFileSync(source, target);
