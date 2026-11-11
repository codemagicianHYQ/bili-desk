#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AICU 拉取小助手：强制走指定代理，供 Electron 主进程调用。"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def build_opener(proxy: str | None):
    if proxy:
        handler = urllib.request.ProxyHandler(
            {"http": proxy, "https": proxy, "ftp": proxy}
        )
    else:
        handler = urllib.request.ProxyHandler({})
    # 部分代理会做 MITM；用默认上下文即可
    https = urllib.request.HTTPSHandler(context=ssl.create_default_context())
    return urllib.request.build_opener(handler, https)


def do_fetch(url: str, proxy: str | None) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": "https://www.aicu.cc/",
            "Origin": "https://www.aicu.cc",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
        method="GET",
    )
    opener = build_opener(proxy)
    try:
        with opener.open(req, timeout=45) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {
                "ok": True,
                "status": int(resp.status),
                "body": body,
                "proxy": proxy or "",
                "proxies": urllib.request.getproxies(),
            }
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace") if err.fp else ""
        return {
            "ok": False,
            "status": int(err.code),
            "body": body[:4000],
            "error": str(err),
            "proxy": proxy or "",
            "proxies": urllib.request.getproxies(),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--proxy", default="")
    args = parser.parse_args()
    url = args.url
    proxy = (args.proxy or "").strip() or (
        os.environ.get("HTTPS_PROXY")
        or os.environ.get("https_proxy")
        or os.environ.get("HTTP_PROXY")
        or os.environ.get("http_proxy")
        or ""
    ).strip()

    # 先强制指定代理；失败再试系统代理；最后直连
    attempts: list[str | None] = []
    if proxy:
        attempts.append(proxy)
    attempts.append(None)  # 直连 / 系统默认（ProxyHandler({}) 会禁用环境代理）

    # 再用“跟随系统”的默认 opener 试一次
    last = None
    for item in attempts:
        last = do_fetch(url, item)
        if last.get("status") == 200 and last.get("ok"):
            emit(last)
            return 0

    # 系统默认（尊重环境变量 / Windows 代理）
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Referer": "https://www.aicu.cc/",
                "Accept": "application/json, text/plain, */*",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            emit(
                {
                    "ok": True,
                    "status": int(resp.status),
                    "body": body,
                    "proxy": "system-default",
                    "proxies": urllib.request.getproxies(),
                }
            )
            return 0
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace") if err.fp else ""
        last = {
            "ok": False,
            "status": int(err.code),
            "body": body[:4000],
            "error": str(err),
            "proxy": "system-default",
            "proxies": urllib.request.getproxies(),
        }
    except Exception as err:  # noqa: BLE001
        last = {
            "ok": False,
            "status": 0,
            "body": "",
            "error": str(err),
            "proxy": proxy or "",
            "proxies": urllib.request.getproxies(),
        }

    emit(last or {"ok": False, "status": 0, "error": "unknown"})
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
