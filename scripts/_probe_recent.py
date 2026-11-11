# -*- coding: utf-8 -*-
import json
import time
import urllib.request
from datetime import datetime

foot = r"C:\Users\18503\AppData\Roaming\bili-desk\footprint\1513591470.json"
cfg_path = r"C:\Users\18503\AppData\Roaming\bili-desk\bilidesk-config.json"

with open(foot, encoding="utf-8") as f:
    data = json.load(f)
comments = [i for i in data.get("items", []) if i.get("kind") == "comment"]
comments.sort(key=lambda i: i.get("time") or 0, reverse=True)
print("comment_count", len(comments), "bili", sum(1 for i in comments if i.get("source") == "bili"))
for item in comments[:8]:
    ts = int(item.get("time") or 0)
    print(
        "newest",
        datetime.fromtimestamp(ts).isoformat(sep=" ", timespec="minutes") if ts else "?",
        item.get("source"),
        str(item.get("text") or "")[:30],
    )

with open(cfg_path, encoding="utf-8") as f:
    cfg = json.load(f)
cookies = cfg.get("cookies") or {}
parts = []
for key in ("SESSDATA", "bili_jct", "DedeUserID", "DedeUserID__ckMd5", "buvid3"):
    if cookies.get(key):
        parts.append(f"{key}={cookies[key]}")
cookie = "; ".join(parts)
uid = str(cookies.get("DedeUserID") or "")
proxy = "http://127.0.0.1:7897"
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": proxy, "https": proxy})
)


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


history = fetch("https://api.bilibili.com/x/web-interface/history/cursor?ps=20&type=archive")
rows = ((history.get("data") or {}).get("list") or [])[:8]
print("history_code", history.get("code"), "n", len((history.get("data") or {}).get("list") or []))
videos = []
for row in rows:
    hist = row.get("history") or {}
    videos.append(
        {
            "title": str(row.get("title") or "")[:24],
            "oid": hist.get("oid"),
            "bvid": hist.get("bvid"),
            "view": datetime.fromtimestamp(int(row.get("view_at") or 0)).isoformat(
                sep=" ", timespec="minutes"
            ),
        }
    )
print("videos", json.dumps(videos, ensure_ascii=False))

for video in videos[:4]:
    oid = video["oid"]
    payload = fetch(
        f"https://api.bilibili.com/x/v2/reply/main?type=1&oid={oid}&mode=2&plat=1&next=0"
    )
    body = payload.get("data") or {}
    cursor = body.get("cursor") or {}
    replies = body.get("replies") or []
    mine = []

    def walk(nodes):
        for node in nodes or []:
            member = node.get("member") or {}
            mid = str(node.get("mid") or member.get("mid") or "")
            if mid == uid:
                ctime = int(node.get("ctime") or 0)
                mine.append(
                    {
                        "time": datetime.fromtimestamp(ctime).isoformat(
                            sep=" ", timespec="minutes"
                        )
                        if ctime
                        else "?",
                        "text": str((node.get("content") or {}).get("message") or "")[:30],
                    }
                )
            walk(node.get("replies"))

    walk(replies)
    newest = 0
    if replies:
        newest = max(int(r.get("ctime") or 0) for r in replies)
    print(
        json.dumps(
            {
                "title": video["title"],
                "code": payload.get("code"),
                "reply_n": len(replies),
                "cursor_keys": list(cursor.keys()),
                "is_end": cursor.get("is_end"),
                "next": cursor.get("next"),
                "next_offset": (cursor.get("pagination_reply") or {}).get("next_offset"),
                "page_newest": datetime.fromtimestamp(newest).isoformat(
                    sep=" ", timespec="minutes"
                )
                if newest
                else None,
                "mine": mine,
            },
            ensure_ascii=False,
        )
    )
    time.sleep(0.3)
