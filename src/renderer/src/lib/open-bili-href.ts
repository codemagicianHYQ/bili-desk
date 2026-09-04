import { isBiliShortUrl, parseBiliAppPath } from "@shared/utils/bili-app-link";

/**
 * 视频 / 专栏 / 动态 / 直播 / UP 主页走应用内；
 * 短链先展开。映射不了的（活动页、广告落地、外站）用系统浏览器打开。
 */
export async function openBiliHref(
  href: string,
  navigate: (path: string) => void,
): Promise<void> {
  const direct = parseBiliAppPath(href);
  if (direct) {
    navigate(direct);
    return;
  }

  let target = href;
  if (isBiliShortUrl(href)) {
    try {
      target = await window.biliDesk.app.resolveBiliUrl(href);
    } catch {
      target = href;
    }
    const appPath = parseBiliAppPath(target);
    if (appPath) {
      navigate(appPath);
      return;
    }
  }

  await window.biliDesk.app.openExternal(target);
}
