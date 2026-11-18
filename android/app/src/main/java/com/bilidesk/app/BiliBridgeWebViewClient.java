package com.bilidesk.app;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 给视频和封面补上 B 站要求的 Referer，否则 WebView 直接拉 CDN 会 403。 */
public class BiliBridgeWebViewClient extends BridgeWebViewClient {
  public BiliBridgeWebViewClient(Bridge bridge) {
    super(bridge);
  }

  @Override
  public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    String host = request.getUrl().getHost();
    if (!needsBiliReferer(host)) {
      return super.shouldInterceptRequest(view, request);
    }
    try {
      return proxy(request);
    } catch (Exception ignored) {
      return super.shouldInterceptRequest(view, request);
    }
  }

  private boolean needsBiliReferer(String host) {
    if (host == null) return false;
    return host.endsWith("bilivideo.com")
        || host.endsWith("akamaized.net")
        || host.endsWith("hdslb.com");
  }

  private WebResourceResponse proxy(WebResourceRequest request) throws Exception {
    HttpURLConnection conn =
        (HttpURLConnection) new URL(request.getUrl().toString()).openConnection();
    conn.setInstanceFollowRedirects(true);
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(20000);
    conn.setRequestMethod(request.getMethod());
    conn.setRequestProperty("Referer", "https://www.bilibili.com/");
    conn.setRequestProperty("Origin", "https://www.bilibili.com");
    conn.setRequestProperty(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
    String range = request.getRequestHeaders().get("Range");
    if (range == null) range = request.getRequestHeaders().get("range");
    if (range != null && !range.isEmpty()) conn.setRequestProperty("Range", range);

    int code = conn.getResponseCode();
    InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
    Map<String, String> headers = new HashMap<>();
    for (Map.Entry<String, List<String>> entry : conn.getHeaderFields().entrySet()) {
      if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isEmpty()) {
        continue;
      }
      headers.put(entry.getKey(), String.join(",", entry.getValue()));
    }
    String mime = conn.getContentType();
    if (mime == null || mime.isEmpty()) mime = "application/octet-stream";
    int semi = mime.indexOf(';');
    if (semi > 0) mime = mime.substring(0, semi);
    String message = code == 206 ? "Partial Content" : "OK";
    return new WebResourceResponse(mime, null, code, message, headers, stream);
  }
}
