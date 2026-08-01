import path from "node:path";
import { rcedit } from "rcedit";

/** @param {import('electron-builder').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );
  const iconPath = path.join(
    context.packager.projectDir,
    "resources",
    "icon.ico",
  );

  await rcedit(exePath, {
    icon: iconPath,
    "version-string": {
      CompanyName: "BiliDesk",
      FileDescription: "BiliDesk",
      ProductName: "BiliDesk",
    },
  });
}
