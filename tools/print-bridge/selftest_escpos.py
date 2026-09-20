#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 ESC/POS 光栅编码的正确性（不打印，纯编解码往返）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image
import escpos

pass_n = 0
fail_n = 0


def ok(name, cond, extra=None):
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print(f"  PASS  {name}")
    else:
        fail_n += 1
        print(f"  FAIL  {name}" + (f" :: {extra}" if extra is not None else ""))


print("=== 1. PIL mode '1' 位打包顺序 ===")
# 造一张 8x2 的图：第一行只第 0 个像素黑，第二行只第 7 个像素黑
img = Image.new("1", (8, 2), 1)  # 全白
img.putpixel((0, 0), 0)          # 黑
img.putpixel((7, 1), 0)          # 黑
raw = img.tobytes()
ok("tobytes() 长度 = 宽/8 * 高", len(raw) == 2, len(raw))
# PIL: 1=白。第0位黑 → byte = 0b01111111 = 0x7F
ok("第0列黑 → 0x7F（高位在左）", raw[0] == 0x7F, hex(raw[0]))
# 第7位黑 → byte = 0b11111110 = 0xFE
ok("第7列黑 → 0xFE", raw[1] == 0xFE, hex(raw[1]))

print()
print("=== 2. 反相后应变成 ESC/POS 语义（1 = 打点） ===")
inv = raw.translate(escpos._INVERT)
ok("第0列黑 → 0x80（最高位打点）", inv[0] == 0x80, hex(inv[0]))
ok("第7列黑 → 0x01（最低位打点）", inv[1] == 0x01, hex(inv[1]))

print()
print("=== 3. 光栅作业头 ===")
job = escpos.build_raster_job(img, cut=False, feed_lines=0)
# ESC @  (2B) + GS v 0 m (4B) + xL xH (2B) + yL yH (2B)
head = job[:10]
ok("以 ESC @ 初始化开头", job[:2] == b"\x1b\x40", job[:2])
ok("GS v 0 m 指令正确", job[2:6] == b"\x1d\x76\x30\x00", job[2:6])
bpr = 8 // 8
ok(f"xL/xH = {bpr}", job[6:8] == bytes((bpr, 0)), job[6:8])
ok("yL/yH = 2", job[8:10] == bytes((2, 0)), job[8:10])
ok("数据段紧跟其后", job[10:12] == inv, job[10:12])
ok("总长度 = 10 + 数据", len(job) == 10 + len(inv), len(job))

print()
print("=== 4. 宽度校验 ===")
odd = Image.new("1", (12, 2), 1)
try:
    escpos.build_raster_job(odd, cut=False, feed_lines=0)
    ok("非 8 倍数宽度应报错", False, "没有抛异常")
except escpos.EscPosError:
    ok("非 8 倍数宽度应报错", True)

print()
print("=== 5. 576 点宽度（真实纸宽） ===")
wide = Image.new("1", (576, 100), 1)
job = escpos.build_raster_job(wide, cut=True, feed_lines=2)
bpr = 72
ok("xL=72, xH=0", job[6:8] == bytes((72, 0)), job[6:8])
ok("yL=100, yH=0", job[8:10] == bytes((100, 0)), job[8:10])
ok("含切纸指令 GS V 66 0", job.endswith(b"\x1d\x56\x42\x00"), job[-8:])
ok("数据量 = 72*100", len(job) == 10 + 72 * 100 + 2 + 4, len(job))

print()
print("=== 6. 大高度分页上限 ===")
tall = Image.new("1", (576, 70000), 1)
try:
    escpos.build_raster_job(tall, cut=False, feed_lines=0)
    ok("高度超 65535 应报错", False, "没有抛异常")
except escpos.EscPosError:
    ok("高度超 65535 应报错", True)

print()
print("=== 7. 打印机枚举 ===")
try:
    ps = escpos.list_printers()
    ok("能枚举到打印机", len(ps) > 0, len(ps))
    names = [p["name"] for p in ps]
    ok("POS80 在列表里", "POS80" in names, names)
    ok("thermal 排序把 POS80 排前面", ps[0]["name"] == "POS80", ps[0]["name"])
    ok("printer_exists('POS80')", escpos.printer_exists("POS80"))
    ok("printer_exists('GLPRINTER') 为 False（未安装）", escpos.printer_exists("GLPRINTER") is False)
except Exception as exc:
    ok("打印机枚举", False, str(exc))

print()
print("========================================")
print(f"结果： {pass_n} PASS / {fail_n} FAIL")
print("========================================")
sys.exit(0 if fail_n == 0 else 1)
