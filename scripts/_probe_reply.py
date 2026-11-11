# -*- coding: utf-8 -*-
import json
import urllib.request

NEEDLE = "\u989c\u503c\u5373\u6b63\u4e49"
foot = r"C:\Users\18503\AppData\Roaming\bili-desk\footprint\1513591470.json"
cfg_path = r"C:\Users\18503\AppData\Roaming\bili-desk\bilidesk-config.json"

with open(foot, encoding="utf-8") as f:
    data = json.load(f)

hits = []
for item in data.get("items", []):
    text = str(item.get("text", ""))
    oid = item.get("oid")
    if NEEDLE in text or oid == 470370733 or "470370733" in text:
        hits.append(
            {
                "id": item.get("id"),
                "rpid": item.get("rpid"),
                "oid": item.get("oid"),
                "type": item.get("type"),
                "time": item.get("time"),
                "source": item.get("source"),
                "text": item.get("text"),
            }
        )
print("hits", len(hits))
print(json.dumps(hits, ensure_ascii=False))
print("removed", data.get("removedCommentIds"))
print("comment_count", sum(1 for i in data.get("items", []) if i.get("kind") == "comment"))

with open(cfg_path, encoding="utf-8") as f:
    cfg = json.load(f)
cookies = cfg.get("cookies") or {}
parts = []
for key in ("SESSDATA", "bili_jct", "DedeUserID", "DedeUserID__ckMd5", "buvid3"):
    if cookies.get(key):
        parts.append(f"{key}={cookies[key]}")
cookie = "; ".join(parts)

proxy = "http://127.0.0.1:7897"
handlers = [urllib.request.ProxyHandler({"http": proxy, "https": proxy})]
opener = urllib.request.build_opener(*handlers)

def fetch(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.bilibili.com/",
            "Cookie": cookie,
        },
    )
    with opener.open(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8", "replace"))


def brief(payload):
    data = payload.get("data")
    keys = list(data.keys())[:20] if isinstance(data, dict) else type(data).__name__
    root = data.get("root") if isinstance(data, dict) else None
    reply = data.get("reply") if isinstance(data, dict) else None
    target = root if isinstance(root, dict) else reply if isinstance(reply, dict) else None
    return {
        "code": payload.get("code"),
        "message": payload.get("message"),
        "data_keys": keys,
        "target_rpid": None
        if not isinstance(target, dict)
        else target.get("rpid_str") or target.get("rpid"),
        "state": None if not isinstance(target, dict) else target.get("state"),
        "message_text": None
        if not isinstance(target, dict)
        else str(((target.get("content") or {}).get("message") or ""))[:40],
    }


samples = [h for h in hits if h.get("rpid")]
seen = {h["rpid"] for h in samples}
for item in data.get("items", []):
    if item.get("kind") != "comment" or not item.get("rpid"):
        continue
    if item["rpid"] in seen:
        continue
    if item.get("type") not in (1, None):
        continue
    samples.append(
        {
            "rpid": item["rpid"],
            "oid": item["oid"],
            "type": item.get("type") or 1,
            "text": str(item.get("text") or "")[:24],
        }
    )
    if len(samples) >= 4:
        break

for comment in samples:
    oid = comment["oid"]
    rpid = str(comment["rpid"])
    typ = comment.get("type") or 1
    reply_url = (
        f"https://api.bilibili.com/x/v2/reply/reply?type={typ}&oid={oid}&root={rpid}&pn=1&ps=1"
    )
    main_url = (
        f"https://api.bilibili.com/x/v2/reply/main?type={typ}&oid={oid}"
        f"&mode=2&seek_rpid={rpid}&next=0&plat=1"
    )
    try:
        reply = fetch(reply_url)
        main = fetch(main_url)
    except Exception as exc:
        print("request_error", rpid, type(exc).__name__, exc)
        continue
    raw = json.dumps(main, ensure_ascii=False)
    dyn = None
for item in data.get("items", []):
    if item.get("kind") == "comment" and item.get("type") not in (1, None, 0):
        dyn = {
            "rpid": item.get("rpid"),
            "oid": item.get("oid"),
            "type": item.get("type"),
            "text": str(item.get("text") or "")[:24],
        }
        break
if dyn:
    rpid = str(dyn["rpid"])
    url = (
        f"https://api.bilibili.com/x/v2/reply/reply?type={dyn['type']}&oid={dyn['oid']}"
        f"&root={rpid}&pn=1&ps=1"
    )
    try:
        payload = fetch(url)
        print(
            "dyn",
            json.dumps(
                {
                    **dyn,
                    "code": payload.get("code"),
                    "message": payload.get("message"),
                },
                ensure_ascii=False,
            ),
        )
    except Exception as exc:
        print("dyn_error", type(exc).__name__, exc)
