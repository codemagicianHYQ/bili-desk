# -*- coding: utf-8 -*-
import urllib.request

proxy = "http://127.0.0.1:7897"
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": proxy, "https": proxy})
)
url = "https://s1.hdslb.com/bfs/static/player/main/widgets/npd.922.abeff5e5.js"
req = urllib.request.Request(
    url, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity"}
)
with opener.open(req, timeout=40) as res:
    raw = res.read()
if raw[:2] == b"\x1f\x8b":
    import gzip

    raw = gzip.decompress(raw)
text = raw.decode("utf-8", "replace")
j = text.find(".bili-danmaku-x-vote {")
if j < 0:
    j = text.find(".bili-danmaku-x-vote{")
print("vote css", j)
print(text[j : j + 6500])
