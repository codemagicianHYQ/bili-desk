#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在终端侧拉 AICU 并写入 bili-desk footprint，绕过 Electron 内 403。"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from pathlib import Path

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or "http://127.0.0.1:7897"
UID = int(os.environ.get("BILI_UID") or "1513591470")
OUT = Path(os.environ.get("APPDATA") or "") / "bili-desk" / "footprint" / f"{UID}.json"


def fetch(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": "https://www.aicu.cc/",
            "Accept": "application/json",
        },
    )
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
    )
    with opener.open(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load() -> dict:
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8"))
    return {
        "uid": UID,
        "items": [],
        "syncedAt": None,
        "replyPn": 1,
        "replyDone": False,
        "dmPn": 1,
        "dmDone": False,
    }


def save(data: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(OUT)


def upsert(items: list[dict], incoming: list[dict]) -> int:
    seen = {row["id"] for row in items}
    added = 0
    for row in incoming:
        if row["id"] in seen:
            continue
        items.append(row)
        seen.add(row["id"])
        added += 1
    return added


def sync_replies(data: dict) -> int:
    pn = 1
    total_added = 0
    while pn <= 5000:
        raw = fetch(
            f"https://api.aicu.cc/api/v3/search/getreply?uid={UID}&pn={pn}&ps=50&mode=0"
        )
        if raw.get("code") != 0:
            raise RuntimeError(raw)
        payload = raw.get("data") or {}
        cursor = payload.get("cursor") or {}
        replies = payload.get("replies") or []
        mapped = []
        for row in replies:
            rpid = str(row.get("rpid") or "").strip()
            if not rpid:
                continue
            dyn = row.get("dyn") or {}
            mapped.append(
                {
                    "id": f"comment:{rpid}",
                    "kind": "comment",
                    "text": str(row.get("message") or ""),
                    "time": int(row.get("time") or 0),
                    "oid": int(dyn.get("oid") or 0),
                    "type": int(dyn.get("type") or 1),
                    "rpid": rpid,
                    "source": "aicu",
                }
            )
        total_added += upsert(data["items"], mapped)
        print(f"reply pn={pn} got={len(mapped)} all={cursor.get('all_count')}")
        if cursor.get("is_end") or not replies:
            data["replyDone"] = True
            data["replyPn"] = pn
            break
        pn += 1
        time.sleep(0.25)
    return total_added


def sync_dm(data: dict) -> int:
    pn = 1
    total_added = 0
    while pn <= 5000:
        raw = fetch(
            f"https://api.aicu.cc/api/v3/search/getvideodm?uid={UID}&pn={pn}&ps=50"
        )
        if raw.get("code") != 0:
            raise RuntimeError(raw)
        payload = raw.get("data") or {}
        cursor = payload.get("cursor") or {}
        rows = payload.get("videodmlist") or payload.get("danmaku") or []
        mapped = []
        for row in rows:
            did = str(row.get("id") or row.get("idStr") or row.get("dmid") or "").strip()
            if not did:
                continue
            progress = row.get("progress", row.get("progress_ms"))
            item = {
                "id": f"danmaku:{did}",
                "kind": "danmaku",
                "text": str(row.get("content") or row.get("text") or row.get("message") or ""),
                "time": int(row.get("ctime") or row.get("time") or 0),
                "oid": int(row.get("oid") or 0),
                "source": "aicu",
            }
            if progress is not None and str(progress).strip() != "":
                try:
                    item["progressMs"] = max(0, int(progress))
                except Exception:
                    pass
            mapped.append(item)
        total_added += upsert(data["items"], mapped)
        print(f"dm pn={pn} got={len(mapped)} all={cursor.get('all_count')}")
        if cursor.get("is_end") or not rows:
            data["dmDone"] = True
            data["dmPn"] = pn
            break
        pn += 1
        time.sleep(0.25)
    return total_added


def main() -> None:
    print("proxy", PROXY)
    print("out", OUT)
    data = load()
    added_r = sync_replies(data)
    added_d = sync_dm(data)
    data["syncedAt"] = int(time.time() * 1000)
    # 新的在前
    data["items"].sort(key=lambda row: int(row.get("time") or 0), reverse=True)
    save(data)
    comments = sum(1 for row in data["items"] if row.get("kind") == "comment")
    danmaku = sum(1 for row in data["items"] if row.get("kind") == "danmaku")
    print(f"done added_reply={added_r} added_dm={added_d} comments={comments} danmaku={danmaku}")


if __name__ == "__main__":
    main()
