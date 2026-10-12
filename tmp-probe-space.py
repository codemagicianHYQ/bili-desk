# -*- coding: utf-8 -*-
import json
import urllib.request

mid = 471949556
features = "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,commentsNewVersion,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,htmlOpusStyle"
url = (
    "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space"
    f"?host_mid={mid}&timezone_offset=-480&platform=web&features={features}"
)
req = urllib.request.Request(
    url,
    headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": f"https://space.bilibili.com/{mid}/dynamic",
    },
)
with urllib.request.urlopen(req, timeout=20) as res:
    data = json.loads(res.read().decode("utf-8"))

print("code", data.get("code"), data.get("message"))
items = ((data.get("data") or {}).get("items")) or []
shown = 0
for item in items:
    typ = str(item.get("type") or "")
    if "FORWARD" not in typ and shown >= 3:
        continue
    orig = item.get("orig") or item.get("origin")
    modules = item.get("modules")
    major = None
    if isinstance(modules, dict):
        major = ((modules.get("module_dynamic") or {}).get("major") or {})
    elif isinstance(modules, list):
        for entry in modules:
            if isinstance(entry, dict) and entry.get("module_dynamic"):
                major = (entry.get("module_dynamic") or {}).get("major") or {}
                break
    forward = (major or {}).get("forward") if isinstance(major, dict) else None
    desc = ""
    if isinstance(modules, dict):
        desc = str(((modules.get("module_dynamic") or {}).get("desc") or {}).get("text") or "")[:40]
    print(
        "type", typ,
        "orig", bool(orig),
        "forward", bool(forward),
        "orig_type", (orig or {}).get("type") if isinstance(orig, dict) else None,
        "desc", desc,
    )
    shown += 1
    if shown >= 8:
        break
