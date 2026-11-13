# -*- coding: utf-8 -*-
import gzip
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

MIXIN = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 38, 57, 39, 59,
    48, 42, 54, 22, 41, 19, 24, 13, 49, 29, 36, 16, 26, 21, 44, 56, 7, 55, 43, 40,
    51, 12, 33, 37, 17, 28, 9, 25, 14, 6, 34, 1, 52, 11, 30, 4, 20, 5, 27, 0,
]

conf = json.loads(
    Path(r"C:\Users\18503\AppData\Roaming\bili-desk\bilidesk-config.json").read_text(
        encoding="utf-8"
    )
)
cookies = conf.get("cookies") or {}
cookie = "; ".join(f"{k}={v}" for k, v in cookies.items() if v)
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def fetch(url, referer="https://space.bilibili.com/"):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": ua,
            "Referer": referer,
            "Cookie": cookie,
            "Accept-Encoding": "identity",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        raw = res.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


print("cookie keys", sorted(cookies.keys()))
print("sess len", len(str(cookies.get("SESSDATA") or "")))
nav = fetch("https://api.bilibili.com/x/web-interface/nav", "https://www.bilibili.com/")
wbi = (nav.get("data") or {}).get("wbi_img") or {}
img = wbi.get("img_url", "").rsplit("/", 1)[-1].split(".")[0].split("@")[0]
sub = wbi.get("sub_url", "").rsplit("/", 1)[-1].split(".")[0].split("@")[0]
mixin = "".join((img + sub)[i] for i in MIXIN)[:32]
print("img", wbi.get("img_url", "").rsplit("/", 1)[-1][:80], "keylen", len(img), len(sub), "mixin", len(mixin))


def signed_query(params):
    cleaned = {
        key: "".join(ch for ch in str(value) if ch not in "!'()*")
        for key, value in params.items()
    }
    cleaned["wts"] = str(int(time.time()))
    ordered = dict(sorted(cleaned.items()))
    query = urllib.parse.urlencode(ordered)
    rid = hashlib.md5((query + mixin).encode()).hexdigest()
    ordered["w_rid"] = rid
    return urllib.parse.urlencode(ordered)


def arc(mid, pn, location, extra=True):
    base = {
        "mid": str(mid),
        "pn": pn,
        "ps": 30,
        "tid": 0,
        "keyword": "",
        "order": "pubdate",
        "platform": "web",
        "web_location": location,
        "order_avoided": "true",
    }
    if extra:
        base.update(
            {
                "dm_img_list": "[]",
                "dm_img_str": "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
                "dm_cover_img_str": "QU5HTEUgKEludGVsLCBJbnRlbChSKSBVSEQgR3JhcGhpY3MgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoSW50ZWw",
                "dm_img_inter": '{"ds":[],"wh":[0,0,0],"of":["","",""]}',
            }
        )
    query = signed_query(base)
    url = "https://api.bilibili.com/x/space/wbi/arc/search?" + query
    data = fetch(url, f"https://space.bilibili.com/{mid}/video")
    page = ((data.get("data") or {}).get("page") or {})
    vlist = ((data.get("data") or {}).get("list") or {}).get("vlist") or []
    print(
        "wbi",
        location,
        "pn",
        pn,
        "code",
        data.get("code"),
        "msg",
        data.get("message"),
        "count",
        page.get("count"),
        "n",
        len(vlist),
    )


search = fetch(
    "https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword="
    + urllib.parse.quote("1900影剧室"),
    "https://search.bilibili.com/",
)
users = ((search.get("data") or {}).get("result") or [])[:3]
for user in users:
    print("user", user.get("mid"), user.get("uname"), "videos", user.get("videos"))

mids = [u.get("mid") for u in users if u.get("mid")] or [1577804]
mid = mids[0]
print("use mid", mid)
for loc in ("1550101", "333.1387"):
    arc(mid, 1, loc)
    arc(mid, 2, loc)
