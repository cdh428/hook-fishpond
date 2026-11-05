#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hook Fishpond —— 本地打印桥接服务（Print Bridge）
================================================

作用：让网页（包括线上 HTTPS 页面）能够**静默打印到指定的本机打印目标**，
      例如 USB 小票机 `POS80`、蓝牙小票机 `GLPrinter`（走 SPP 串口 COM8），
      80mm 纸宽、576 点。

为什么需要它？
  浏览器 `window.print()` 只会弹系统打印对话框，**无法按目标指定打印机**，
  也做不到静默出纸。桥接服务在收银机/平板本地跑一个小 HTTP 服务，
  网页把票据 HTML 发给它，它渲染成位图后用 ESC/POS 原始指令直发打印机。

支持的两种投递通道（请求里传「目标」即可，自动路由）：
  * `winspool` —— Windows 打印队列（USB / 驱动打印机），RAW 数据类型
  * `serial`   —— 蓝牙串口 SPP（虚拟 COM 口），直接写字节
  注：蓝牙小票机在 Windows 上通常**不会**被装成打印机，只暴露一个 SPP 串口，
      所以必须支持串口通道才能真正静默打印。

安全：
  * 只监听 127.0.0.1，局域网内其它机器访问不到；
  * 只有「要打印的内容」，没有任意命令执行能力；
  * 网页侧若探测不到本服务，会自动退回浏览器打印对话框，功能不中断。

启动：
  python tools/print-bridge/bridge.py
  python tools/print-bridge/bridge.py --printer POS80
  python tools/print-bridge/bridge.py --printer COM8
  python tools/print-bridge/bridge.py --list            # 列出所有打印目标
  python tools/print-bridge/bridge.py --selftest --printer COM8   # 自检页

依赖：pywin32、Pillow、以及本机装有 Chrome 或 Edge。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import escpos  # noqa: E402
import render  # noqa: E402
try:
    import sound_announcer
except ImportError:
    sound_announcer = None

VERSION = "1.1.0"
CONFIG_PATH = HERE / "config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "port": 17777,
    "defaultPrinter": "",
    "widthDots": 576,
    "renderScale": 3,
    "bitmapMode": "threshold",
    "threshold": 128,
    "cut": True,
    "cutMode": "full",      # full=全切(默认,兼容最好) / partial=半切 / none=不切
    "feedLines": 6,         # 切纸前走纸行数（一行≈4mm）；走不够会切在字上或切不断
    "baudRate": 9600,       # 仅蓝牙串口用；SPP 是虚拟链路，此值对吞吐无影响
    "authToken": "",        # 安全通信秘钥（为空时不校验，配上后必须 Header 带 X-Print-Key）
    # 自动出单 watch（桥自己轮询服务端，不依赖浏览器）
    "watchUrl": "",         # 服务端基地址，如 https://www.hookfishpond.com
    "watchToken": "",       # 与服务端 expectedToken 一致的内部 token（从 DATABASE_URL 派生）
    "watchInterval": 5,     # 轮询间隔（秒）
}

# 一次只渲染/打印一份，避免并发把打印机和 Chrome 打爆
_PRINT_LOCK = threading.Lock()

# 允许跨域：线上页面（https）要调本地 http://127.0.0.1 —— 浏览器把 127.0.0.1
# 视为「可信来源」，所以 HTTPS → http://127.0.0.1 不被混合内容策略拦截。
#
# Access-Control-Allow-Private-Network 是 Chrome 的 Private Network Access 预检要求：
# 公网页面访问私有地址（localhost）时，Chrome 会带 Access-Control-Request-Private-Network
# 发 OPTIONS，服务端必须回 true，否则请求被静默拦截（表现为「探测不到桥」）。
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Print-Key",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
}


def log(msg: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line, flush=True)
    # 同时追加到文件（隐藏窗口时 stdout 可能无处可去，日志是唯一观测手段）
    try:
        with open(HERE / "bridge.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def print_log(entry: str) -> None:
    """结构化打印日志：追加到 print.log，方便查「何时打了哪张单」。

    格式：ISO 时间 | 单号 | 动作 | 结果
    例如：2026-11-05T16:11:42+07:00 | FP-20261105-001 | PRINT | ok
    """
    stamp = datetime.now().isoformat(timespec="seconds")
    line = f"{stamp} | {entry}"
    print(line, flush=True)
    try:
        with open(HERE / "print.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_config() -> dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            user = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(user, dict):
                cfg.update({k: v for k, v in user.items() if k in DEFAULT_CONFIG})
        except Exception as exc:
            log(f"config.json 解析失败，改用默认配置：{exc}")
    if not cfg.get("defaultPrinter"):
        try:
            targets = escpos.list_targets()
            cfg["defaultPrinter"] = targets[0]["port"] if targets and targets[0]["kind"] == "serial" \
                else (targets[0]["name"] if targets else "")
        except Exception:
            cfg["defaultPrinter"] = ""
    return cfg


CONFIG = load_config()


# --------------------------------------------------------------------------- #
# 业务
# --------------------------------------------------------------------------- #

def resolve_printer(requested: str | None) -> str:
    """
    把请求里的 printer 解析成一个可投递的「打印目标」。

    目标有两种形态：
      * Windows 打印机名，如 `POS80`   → 走打印队列（RAW）
      * 串口，如 `COM8`               → 走蓝牙串口（SPP）

    为方便调用方，蓝牙目标也允许直接传显示名（如 `GLPrinter (COM8)`），
    这里会自动解析出其中的 COM 口。
    """
    name = (requested or "").strip() or CONFIG.get("defaultPrinter") or ""
    if not name:
        raise ValueError("没有可用打印目标：请在 config.json 里设置 defaultPrinter，或请求里带 printer")

    if escpos.target_exists(name):
        return name

    # 允许传显示名：从 "GLPrinter (COM8)" 里抠出 COM8
    m = re.search(r"\((COM\d+)\)\s*$", name, re.IGNORECASE)
    if m and escpos.target_exists(m.group(1)):
        return m.group(1).upper()

    # 常见误配：把蓝牙机写成了打印机名（没有 COM 口），或把 USB 机写成 COM 口。
    # 这里给出可执行的整改提示，而不是一句「不存在」。
    hint = ""
    lname = name.lower()
    if escpos.is_serial_target(name):
        hint = (f"　{name} 是串口写法但本机没有这个串口。"
                "请确认蓝牙已配对并在「蓝牙和其他设备 → COM 端口」里看到它。")
    elif "gl" in lname or "bt" in lname or "blue" in lname:
        hint = (f"　{name} 像是蓝牙打印机，但它不是一个 COM 口。"
                "蓝牙机要选成 `GLPrinter (COMx)` 这种串口目标，不能按打印机名选。")
    available = ", ".join(t["name"] for t in escpos.list_targets()) or "（无）"
    raise ValueError(f"打印目标不存在：{name}。{hint} 本机可用：{available}")


def do_print(payload: dict[str, Any]) -> dict[str, Any]:
    html = payload.get("html")
    text = payload.get("text")

    printer = resolve_printer(payload.get("printer"))
    width = int(payload.get("width") or CONFIG["widthDots"])
    scale = int(payload.get("scale") or CONFIG["renderScale"])
    mode = str(payload.get("mode") or CONFIG["bitmapMode"])
    threshold = int(payload.get("threshold") or CONFIG["threshold"])
    cut = bool(payload.get("cut", CONFIG["cut"]))
    cut_mode = str(payload.get("cutMode") or CONFIG.get("cutMode") or "full")
    feed = int(payload.get("feedLines", CONFIG["feedLines"]))
    copies = max(1, min(5, int(payload.get("copies") or 1)))
    baud = int(payload.get("baud") or CONFIG.get("baudRate") or 9600)
    # ⚠️ 2026-11-05：纸宽（mm）用于决定 Chrome 渲染视口宽度。
    # 不传时按 width 点推算：576 点→80mm，384 点→50mm（或按默认 80mm）。
    paper_mm = int(payload.get("paperWidthMm") or 0) or round(width / 576 * 80)

    started = time.time()
    with _PRINT_LOCK:
        # 触发目标电脑扬声器语音播报（泰中双语）
        if sound_announcer:
            try:
                table_info = payload.get("tableName") or payload.get("table") or ""
                if not table_info and html:
                    # 从 HTML 提取桌位名称
                    m = re.search(r'class="v">([^<]+)</span>', html)
                    if m:
                        table_info = m.group(1).strip()
                sound_announcer.announce_new_order({"table_no": table_info or "新订单"})
            except Exception as e:
                log(f"语音播报触发跳过：{e}")

        if html:
            img = render.render_html_to_bitmap(
                html, target_width=width, scale=scale, mode=mode, threshold=threshold,
                paper_width_mm=paper_mm,
            )
        elif text:
            img = _text_to_bitmap(text, width)
        else:
            raise ValueError("请求里必须带 html 或 text")

        # 如果目标是 Windows 驱动打印机 (非串口，如 POS80)，走高保真 GDI 驱动渲染
        if not escpos.is_serial_target(printer):
            # ⚠️ 2026-11-05：GDI 直接使用桥已按纸宽渲染好的点宽（384/576），
            # 不再二次缩放；左边距按纸宽物理点居中，确保 50/80mm 都不超出纸边。
            # 203 DPI：80mm≈640px，50mm≈400px。
            phys_w = round(paper_mm / 25.4 * 203)
            left_margin = max(0, (phys_w - img.width) // 2)
            for i in range(copies):
                escpos.send_image_gdi(
                    printer, img,
                    job_name=f"Hook Fishpond ticket {i + 1}/{copies}",
                    auto_cut=cut,
                    feed_lines=feed,
                    target_w=img.width,
                    left_margin=left_margin,
                )
            transport = "winspool-gdi"
            job = b"" # GDI 直接通过 DC 输出
        else:
            job = escpos.build_raster_job(img, cut=cut, feed_lines=feed, cut_mode=cut_mode)
            transport = ""
            for i in range(copies):
                transport = escpos.send(
                    printer, job,
                    job_name=f"Hook Fishpond ticket {i + 1}/{copies}",
                    baudrate=baud,
                )

    elapsed = int((time.time() - started) * 1000)
    return {
        "ok": True,
        "printer": printer,
        "transport": transport,
        "width": img.width,
        "height": img.height,
        "bytes": len(job),
        "copies": copies,
        "ms": elapsed,
    }


def _text_to_bitmap(text: str, width: int):
    """纯文本兜底（不经过浏览器）：用 Pillow 画在等宽字体上。"""
    from PIL import Image, ImageDraw, ImageFont

    font = None
    for cand in (
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\cour.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        if Path(cand).exists():
            font = ImageFont.truetype(cand, 24)
            break
    if font is None:
        font = ImageFont.load_default()

    tmp = Image.new("L", (width, 100), 255)
    draw = ImageDraw.Draw(tmp)
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=6)
    height = max(40, bbox[3] - bbox[1] + 24)
    img = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(img)
    draw.multiline_text((8, 12), text, font=font, fill=0, spacing=6)
    return img.convert("1", dither=Image.NONE).convert("1")


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

class Handler(BaseHTTPRequestHandler):
    server_version = f"PrintBridge/{VERSION}"
    protocol_version = "HTTP/1.1"

    # 静默掉默认的每请求日志，改为一条精简日志
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        return

    # ---------------------------------------------------------------- helpers
    def _send(self, code: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        # 票据 HTML（含 base64 二维码）可能上百 KB，给足上限
        if length > 8 * 1024 * 1024:
            raise ValueError("请求体过大（上限 8MB）")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    # ------------------------------------------------------------------ routes
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?")[0].rstrip("/") or "/"
        try:
            if path in ("/", "/health"):
                targets = escpos.list_targets()
                self._send(200, {
                    "ok": True,
                    "service": "hook-fishpond-print-bridge",
                    "version": VERSION,
                    "defaultPrinter": CONFIG.get("defaultPrinter") or "",
                    "widthDots": CONFIG["widthDots"],
                    "printerCount": len(targets),
                    "targets": targets,
                    "chrome": _chrome_ok(),
                    "lanUrls": [f"http://{ip}:{CONFIG['port']}" for ip in _lan_ips()],
                    "cutMode": CONFIG.get("cutMode", "full"),
                    "feedLines": CONFIG.get("feedLines", 6),
                })
                return
            if path == "/printers":
                self._send(200, {
                    "ok": True,
                    "defaultPrinter": CONFIG.get("defaultPrinter") or "",
                    "printers": escpos.list_targets(),
                    "serialPorts": escpos.list_serial_ports_only(),
                })
                return
            self._send(404, {"ok": False, "error": f"未知路径 {path}"})
        except Exception as exc:
            log(f"GET {path} 失败：{exc}")
            self._send(500, {"ok": False, "error": str(exc)})

    def _check_auth(self) -> bool:
        expected = (CONFIG.get("authToken") or "").strip()
        if not expected:
            return True
        key = self.headers.get("X-Print-Key", "").strip()
        if not key:
            auth = self.headers.get("Authorization", "").strip()
            if auth.lower().startswith("bearer "):
                key = auth[7:].strip()
        return key == expected

    def do_POST(self) -> None:  # noqa: N802
        if not self._check_auth():
            self._send(401, {"ok": False, "error": "未授权：无效或缺失 X-Print-Key"})
            return
        path = self.path.split("?")[0].rstrip("/") or "/"

        if path != "/print":
            self._send(404, {"ok": False, "error": f"未知路径 {path}（支持 /print）"})
            return
        try:
            payload = self._read_json()
            result = do_print(payload)
            log(f"打印成功 target={result['printer']} via={result.get('transport','')} "
                f"{result['width']}x{result['height']}px "
                f"{result['bytes']}B ×{result['copies']} 用时 {result['ms']}ms")
            self._send(200, result)
        except ValueError as exc:
            log(f"请求被拒：{exc}")
            self._send(400, {"ok": False, "error": str(exc)})
        except (render.RenderError, escpos.EscPosError) as exc:
            log(f"打印失败：{exc}")
            self._send(500, {"ok": False, "error": str(exc)})
        except Exception as exc:  # 兜底，避免桥接服务被单个请求搞崩
            log(f"未预期错误：{exc}\n{traceback.format_exc()}")
            self._send(500, {"ok": False, "error": f"未预期错误：{exc}"})


def _chrome_ok() -> bool:
    try:
        render.find_chrome()
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# 自检页 / CLI
# --------------------------------------------------------------------------- #

SELFTEST_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 0 }
html,body{margin:0;padding:0;width:80mm;background:#fff;color:#000;
  font-family:'Noto Sans Thai','Noto Sans SC','Sarabun',sans-serif}
.t{width:80mm;padding:3mm 4mm 6mm}
.c{text-align:center}
.b{font-size:15px;font-weight:700}
.d{margin:6px 0 4px;padding:3px 0;border-top:1.5px dashed #000;
  border-bottom:1.5px dashed #000;font-size:13px;font-weight:700;letter-spacing:1px}
.r{display:flex;justify-content:space-between;font-size:11px;line-height:1.5}
.hr{border-top:1px dashed #000;margin:5px 0}
.ok{text-align:center;font-size:13px;font-weight:700;margin:6px 0}
</style></head><body><div class="t">
<div class="c"><div class="b">HOOK FISHPOND</div>
<div style="font-size:10px">ระบบพิมพ์ - ทดสอบเครื่องพิมพ์</div>
<div class="d">SELF TEST / 自检页</div></div>
<div class="hr"></div>
<div class="r"><span>Printer</span><span id="p">__PRINTER__</span></div>
<div class="r"><span>Width</span><span>__WIDTH__ dots (80mm)</span></div>
<div class="r"><span>Time</span><span>__TIME__</span></div>
<div class="hr"></div>
<div class="r"><span>1234567890</span><span>ASCII</span></div>
<div class="r"><span>ทดสอบภาษาไทย</span><span>TH</span></div>
<div class="r"><span>中文测试</span><span>ZH</span></div>
<div class="ok">— 1bit raster via ESC/POS —</div>
<div class="hr"></div>
<div class="c" style="font-size:10px">ถ้าตัวอักษรชัดและไม่ขาด แสดงว่าพร้อมใช้งาน<br/>If text is clear, the printer is ready.</div>
</div></body></html>"""


def run_selftest(printer: str | None) -> int:
    target = resolve_printer(printer)
    shown = target if not escpos.is_serial_target(target) else _bt_label(target)
    html = (
        SELFTEST_HTML.replace("__PRINTER__", shown)
        .replace("__WIDTH__", str(CONFIG["widthDots"]))
        .replace("__TIME__", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    try:
        result = do_print({"printer": target, "html": html, "cut": True})
    except Exception as exc:
        log(f"自检失败：{exc}")
        return 1
    log(f"自检打印已发送 → {result['printer']} (via {result.get('transport','')}) "
        f"({result['width']}x{result['height']} 点, {result['bytes']} 字节, {result['ms']}ms)")
    return 0


def _bt_label(port: str) -> str:
    for t in escpos.list_serial_targets():
        if t["port"].upper() == port.upper():
            return t["name"]
    return port


def _lan_ips() -> list[str]:
    """本机局域网 IPv4 地址（非 127.0.0.1），供手机等其它设备拼地址用。"""
    ips: list[str] = []
    try:
        import socket
        host = socket.gethostname()
        for info in socket.getaddrinfo(host, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        # 兜底：连一个外部地址看看本机出口 IP（UDP，不发包）
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                if ip and not ip.startswith("127."):
                    ips.append(ip)
            finally:
                s.close()
        except Exception:
            pass
    return ips


# --------------------------------------------------------------------------- #
# 自动出单 watch 模式：桥自己轮询服务端，不依赖浏览器
# --------------------------------------------------------------------------- #

def _http_json(url: str, method: str = "GET", body: dict | None = None,
               headers: dict | None = None, timeout: float = 15) -> tuple[int, dict]:
    """发 HTTP 请求返回 (status, json)。返回 status 0 表示网络失败。"""
    import urllib.request
    import urllib.error
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, {"raw": raw}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}
    except Exception as e:
        return 0, {"error": str(e)}


def _write_pending_announce(table_no: str) -> None:
    """写播报标记文件：桥(Session0) 触发 Session1 播报任务时传递 table_no。

    文件放在桥目录，run_audio.bat（Session 1）读取后播报并删除。
    用文件而非命令行参数，避免命令行编码/转义问题（泰文、空格）。
    """
    try:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pending_announce.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"table_no": table_no, "ts": time.time()}, f, ensure_ascii=False)
    except Exception:
        pass


def watch_loop(args: Any) -> None:
    """轮询服务端 watch API，发现新单打印两联+播报+回写。"""
    import urllib.parse
    base = (args.watch_url or CONFIG.get("watchUrl") or "").rstrip("/")
    token = args.watch_token or CONFIG.get("watchToken") or ""
    interval = args.watch_interval or CONFIG.get("watchInterval") or 5
    if not base:
        log("[watch] 未配置 watchUrl，watch 模式不启动")
        return
    if not token:
        log("[watch] 未配置 watchToken，watch 模式不启动")
        return

    watch_url = f"{base}/api/admin/print/watch"
    mark_url = f"{base}/api/admin/print/mark"
    headers = {"X-Print-Token": token}
    log(f"[watch] 启动：轮询 {watch_url} 每 {interval}s")

    while True:
        try:
            status, payload = _http_json(watch_url, "GET", headers=headers, timeout=12)
            if status != 200:
                log(f"[watch] 拉取失败 HTTP {status}: {payload.get('error') or payload.get('raw','')[:120]}")
            else:
                orders = payload.get("orders") or []
                for o in orders:
                    order_no = o.get("orderNumber") or "?"
                    log(f"[watch] 命中新单 {order_no} table={o.get('tableCode')}")
                    print_log(f"{order_no} | HIT | table={o.get('tableCode')}")
                    ok_bill = False
                    try:
                        # ① 只打印一份（客户票）。服务端已把 kitchenHtml 置 null，不再打后厨票。
                        bill_html = o.get("billHtml")
                        if bill_html:
                            # ⚠️ 2026-11-05：服务端返回了纸宽（mm），桥按此决定视口与输出点宽。
                            pw = int(o.get("paperWidthMm") or 0) or 80
                            r = do_print({
                                "html": bill_html,
                                "printer": args.printer or CONFIG.get("defaultPrinter"),
                                "cut": True,
                                "paperWidthMm": pw,
                                "width": round(pw / 80 * 576),
                            })
                            ok_bill = r.get("ok", True)
                            print_log(f"{order_no} | PRINT | {'ok' if ok_bill else 'fail'}")
                        else:
                            print_log(f"{order_no} | PRINT | no-bill-html")
                        # ③ 播报（成功出纸后）
                        # 桥跑在 Session 0（SYSTEM），SAPI 播报需要音频设备（用户会话 Session 1）。
                        # 因此不直接调 sound_announcer，而是：
                        #   a) 写 pending_announce.json（传 table_no）
                        #   b) 触发 HookFishpondAudioNotify 计划任务（InteractiveToken=McIntosh，Session 1，有音频）
                        # 由 run_audio.bat 读标记文件完成真实播报，播完删除。
                        if ok_bill:
                            try:
                                _write_pending_announce(
                                    o.get("tableName") or o.get("tableCode") or ""
                                )
                                subprocess.run(
                                    ["schtasks", "/run", "/tn", "HookFishpondAudioNotify"],
                                    capture_output=True, timeout=15,
                                )
                                log(f"[watch] 已请求播报 {order_no}")
                            except Exception as e:
                                log(f"[watch] 播报请求失败：{e}")
                    except Exception as e:
                        log(f"[watch] 打印异常 {order_no}：{e}")
                        print_log(f"{order_no} | PRINT | error={e}")
                        ok_bill = False
                    # ④ 回写（打印失败也要回写 FAILED，否则状态停在 processing 不再处理）
                    state = "PRINTED" if ok_bill else "FAILED"
                    print_log(f"{order_no} | MARK | {state}")
                    try:
                        _http_json(mark_url, "POST",
                                   body={"id": o.get("id"), "state": state,
                                         "error": None if state == "PRINTED" else "桥打印失败"},
                                   headers=headers, timeout=10)
                        log(f"[watch] 回写 {state} {o.get('orderNumber')}")
                    except Exception as e:
                        log(f"[watch] 回写失败 {e}")
        except Exception as e:
            log(f"[watch] 循环异常：{e}")
        time.sleep(interval)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hook Fishpond 本地打印桥接服务")
    parser.add_argument("--port", type=int, default=None, help=f"监听端口（默认 {CONFIG['port']}）")
    parser.add_argument("--host", default="0.0.0.0",
                        help="监听地址（默认 0.0.0.0 = 本机 + 局域网，手机才能连；只给本机用可写 127.0.0.1）")
    parser.add_argument("--printer", default=None,
                        help="默认打印目标：Windows 打印机名（如 POS80）或蓝牙串口（如 COM8）")
    parser.add_argument("--width", type=int, default=None, help="打印宽度（点），默认 576")
    parser.add_argument("--selftest", action="store_true", help="只打一张自检页然后退出")
    parser.add_argument("--list", action="store_true", help="列出本机所有打印目标后退出")
    parser.add_argument("--watch", action="store_true",
                        help="轮询服务端 /api/admin/print/watch，发现新单自动打印+播报（不依赖浏览器）")
    parser.add_argument("--watch-url", default=None,
                        help="服务端 watch API 基地址，如 https://www.hookfishpond.com（默认读 config）")
    parser.add_argument("--watch-token", default=None,
                        help="内部打印 token（默认读 config）")
    parser.add_argument("--watch-interval", type=int, default=None,
                        help="轮询间隔秒数（默认 5）")
    args = parser.parse_args(argv)

    if args.list:
        for t in escpos.list_targets():
            target = t["port"] if t["kind"] == "serial" else t["name"]
            tags = []
            if t.get("isThermal"):
                tags.append("票据机")
            if t["kind"] == "serial":
                tags.append("蓝牙")
            if target and target == (CONFIG.get("defaultPrinter") or ""):
                tags.append("默认")
            tag = f" [{'/'.join(tags)}]" if tags else ""
            kind = "蓝牙串口" if t["kind"] == "serial" else "打印队列"
            print(f"  {t['name']}{tag}   {kind}  目标={target}  驱动/端口={t.get('driver') or t.get('port','')}")
        return 0

    if args.printer:
        CONFIG["defaultPrinter"] = args.printer
    if args.width:
        CONFIG["widthDots"] = args.width

    if args.selftest:
        return run_selftest(args.printer)

    port = args.port or CONFIG["port"]

    log(f"Hook Fishpond 打印桥接服务 v{VERSION}")
    try:
        targets = escpos.list_targets()
        log(f"检测到 {len(targets)} 个打印目标，默认 = {CONFIG.get('defaultPrinter') or '(未设置)'}")
        for t in targets:
            target = t["port"] if t["kind"] == "serial" else t["name"]
            marks = []
            if t.get("isThermal"):
                marks.append("票据机")
            if t["kind"] == "serial":
                marks.append("蓝牙")
            # 注意：这里标的是「本服务的默认目标」，不是 Windows 的默认打印机
            if target and target == (CONFIG.get("defaultPrinter") or ""):
                marks.append("默认")
            suffix = f"  ← {'/'.join(marks)}" if marks else ""
            log(f"    · {t['name']}  [{target}]{suffix}")
    except Exception as exc:
        log(f"枚举打印目标失败：{exc}")

    log(f"Chrome/Edge 渲染：{'就绪' if _chrome_ok() else '不可用（HTML 渲染会失败）'}")

    server = ThreadingHTTPServer((args.host, port), Handler)
    log(f"已就绪 → http://127.0.0.1:{port}")
    if args.host in ("0.0.0.0", ""):
        ips = _lan_ips()
        if ips:
            for ip in ips:
                log(f"         手机/其它设备可访问 → http://{ip}:{port}")
            log(f"         在手机「打印设置 → 打印服务地址」里填上面任一地址（与电脑同一 Wi-Fi）")
        else:
            log("         未检测到局域网地址，手机可能连不上（检查 Wi-Fi）")
    log(f"网页端会访问 /health 探测本服务；探测不到就退回浏览器打印对话框。")

    # 自动出单 watch：桥自己轮询服务端，不依赖浏览器
    if args.watch:
        t = threading.Thread(target=watch_loop, args=(args,), daemon=True)
        t.start()
        log(f"自动出单 watch 线程已启动（--watch）")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("正在退出…")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
