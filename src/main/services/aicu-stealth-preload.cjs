/* Cloudflare Turnstile 在 Electron 里常因 webdriver 标记失败，验证前去掉它 */
try {
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
    configurable: true,
  });
} catch {
  // ignore
}
