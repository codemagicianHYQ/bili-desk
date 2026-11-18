# Temporary probe. Prints counts only. Do not print cookies.
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

MIXIN = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
    20, 34, 44, 52,
]

cfg = json.loads(
    Path(r"C:\Users\18503\AppData\Roaming\bili-desk\bilidesk-config.json").read_text(
        encoding="utf-8"
    )
)
cookies = cfg.get("cookies") or {}
cookie = "; ".join(f"{k}={v}" for k, v in cookies.items() if v)
ua = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def get(url, referer):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": ua,
            "Referer": referer,
            "Cookie": cookie,
        },
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        body = res.read()
        return res.status, body


status, body = get("https://api.bilibili.com/x/web-interface/nav", "https://www.bilibili.com/")
nav = json.loads(body.decode("utf-8"))
wbi = (nav.get("data") or {}).get("wbi_img") or {}
img = wbi.get("img_url", "").rsplit("/", 1)[-1].split(".")[0].split("@")[0]
sub = wbi.get("sub_url", "").rsplit("/", 1)[-1].split(".")[0].split("@")[0]
mixin = "".join((img + sub)[i] for i in MIXIN)[:32]
print("nav", nav.get("code"), "wbi", bool(img and sub), "cookie_keys", sorted(cookies))


def sign(params):
    signed = {**params, "wts": int(time.time())}
    parts = []
    for key in sorted(signed):
        value = str(signed[key]).translate({ord(c): None for c in "!\'()*"})
        parts.append(
            f"{urllib.parse.quote(key, safe='')}={urllib.parse.quote(value, safe='')}"
        )
    query = "&".join(parts)
    rid = hashlib.md5((query + mixin).encode()).hexdigest()
    return query + "&w_rid=" + rid


def search(page, order, page_size=20):
    q = sign(
        {
            "search_type": "video",
            "keyword": "starwalkin",
            "page": page,
            "page_size": page_size,
            "order": order,
            "platform": "pc",
            "single_column": 0,
            "source": "",
        }
    )
    url = "https://api.bilibili.com/x/web-interface/wbi/search/type?" + q
    status, body = get(url, "https://search.bilibili.com/")
    text = body[:80]
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        print(order, "page", page, "size", page_size, "status", status, "not_json", text)
        return
    payload = data.get("data") or {}
    result = payload.get("result")
    n = len(result) if isinstance(result, list) else None
    print(
        order,
        "page",
        page,
        "size",
        page_size,
        "code",
        data.get("code"),
        "num",
        payload.get("numResults"),
        "pages",
        payload.get("numPages"),
        "len",
        n,
        "ps",
        payload.get("pagesize"),
    )


for size in (20, 30, 42):
    for page in (1, 2):
        search(page, "totalrank", size)
