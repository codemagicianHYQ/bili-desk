"""抠掉 logo 四角黑底，写出透明 PNG + 多尺寸 ICO。"""

from __future__ import annotations

import io
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "resources" / "icon.png"
PNG_OUT = ROOT / "resources" / "icon.png"
ICO_OUT = ROOT / "resources" / "icon.ico"
ICO_SIZES = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)]


def is_black_bg(r: int, g: int, b: int) -> bool:
    mx = max(r, g, b)
    if mx <= 28:
        return True
    if mx <= 52 and r < 60 and g < 45 and b < 50:
        return True
    return False


def knock_out_black(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    pix = rgba.load()
    vis = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        vis[y * w + x] = 1
        q.append((x, y))

    while q:
        x, y = q.popleft()
        r, g, b, _a = pix[x, y]
        if not is_black_bg(r, g, b):
            continue
        pix[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and vis[ny * w + nx] == 0:
                vis[ny * w + nx] = 1
                q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a == 0:
                continue
            if max(r, g, b) <= 26:
                pix[x, y] = (0, 0, 0, 0)
                continue
            fringe = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and pix[nx, ny][3] == 0:
                    fringe = True
                    break
            if not fringe:
                continue
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            if luma < 70 and r < 140:
                pix[x, y] = (0, 0, 0, 0)

    return rgba


def write_png_ico(src: Image.Image, dest: Path, sizes: list[tuple[int, int]]) -> None:
    """Windows 任务栏需要带 alpha 的多尺寸 ICO；用 PNG 帧保证四角透明。"""
    blobs: list[bytes] = []
    for size in sizes:
        buf = io.BytesIO()
        frame = src.resize(size, Image.Resampling.LANCZOS)
        frame.save(buf, format="PNG")
        blobs.append(buf.getvalue())

    count = len(blobs)
    offset = 6 + 16 * count
    header = bytearray(6)
    header[2] = 1
    header[4] = count & 0xFF
    header[5] = (count >> 8) & 0xFF
    entries = bytearray()
    for size, blob in zip(sizes, blobs):
        w, h = size
        entry = bytearray(16)
        entry[0] = 0 if w >= 256 else w
        entry[1] = 0 if h >= 256 else h
        entry[4] = 1
        entry[6] = 32
        entry[8:12] = len(blob).to_bytes(4, "little")
        entry[12:16] = offset.to_bytes(4, "little")
        entries.extend(entry)
        offset += len(blob)
    dest.write_bytes(bytes(header) + bytes(entries) + b"".join(blobs))


def main() -> None:
    src = Image.open(SRC)
    clean = knock_out_black(src)
    clean.save(PNG_OUT, format="PNG", optimize=True)
    write_png_ico(clean, ICO_OUT, ICO_SIZES)

    sample = Image.open(PNG_OUT).convert("RGBA")
    w, h = sample.size
    corners = [
        sample.getpixel((0, 0)),
        sample.getpixel((w - 1, 0)),
        sample.getpixel((0, h - 1)),
        sample.getpixel((w - 1, h - 1)),
        sample.getpixel((w // 2, h // 2)),
    ]
    print("png", PNG_OUT.stat().st_size, "corners/center", corners)
    print("ico", ICO_OUT.stat().st_size)


if __name__ == "__main__":
    main()
