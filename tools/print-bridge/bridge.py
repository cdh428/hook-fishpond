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
import re
import sys
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
    "feedLines": 4,
    "baudRate": 9600,       # 仅蓝牙串口用；SPP 是虚拟链路，此值对吞吐无影响
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
}


def log(msg: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {msg}", flush=True)


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

    available = ", ".join(t["name"] for t in escpos.list_targets()) or "（无）"
    raise ValueError(f"打印目标不存在：{name}。本机可用：{available}")


def do_print(payload: dict[str, Any]) -> dict[str, Any]:
    html = payload.get("html")
    text = payload.get("text")

    printer = resolve_printer(payload.get("printer"))
    width = int(payload.get("width") or CONFIG["widthDots"])
    scale = int(payload.get("scale") or CONFIG["renderScale"])
    mode = str(payload.get("mode") or CONFIG["bitmapMode"])
    threshold = int(payload.get("threshold") or CONFIG["threshold"])
    cut = bool(payload.get("cut", CONFIG["cut"]))
    feed = int(payload.get("feedLines", CONFIG["feedLines"]))
    copies = max(1, min(5, int(payload.get("copies") or 1)))
    baud = int(payload.get("baud") or CONFIG.get("baudRate") or 9600)

    started = time.time()
    with _PRINT_LOCK:
        if html:
            img = render.render_html_to_bitmap(
                html, target_width=width, scale=scale, mode=mode, threshold=threshold
            )
        elif text:
            img = _text_to_bitmap(text, width)
        else:
            raise ValueError("请求里必须带 html 或 text")

        job = escpos.build_raster_job(img, cut=cut, feed_lines=feed)
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

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?")[0].rstrip("/") or "/"
        if path != "/print":
            self._send(404, {"ok": False, "error": f"未知路径 {path}（只支持 POST /print）"})
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hook Fishpond 本地打印桥接服务")
    parser.add_argument("--port", type=int, default=None, help=f"监听端口（默认 {CONFIG['port']}）")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认仅本机）")
    parser.add_argument("--printer", default=None,
                        help="默认打印目标：Windows 打印机名（如 POS80）或蓝牙串口（如 COM8）")
    parser.add_argument("--width", type=int, default=None, help="打印宽度（点），默认 576")
    parser.add_argument("--selftest", action="store_true", help="只打一张自检页然后退出")
    parser.add_argument("--list", action="store_true", help="列出本机所有打印目标后退出")
    args = parser.parse_args(argv)

    if args.list:
        for t in escpos.list_targets():
            tag = " [默认]" if t["isDefault"] else ""
            tag += " [票据机]" if t["isThermal"] else ""
            kind = "蓝牙串口" if t["kind"] == "serial" else "打印队列"
            target = t["port"] if t["kind"] == "serial" else t["name"]
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
            marks = []
            if t.get("isThermal"):
                marks.append("票据机")
            if t["kind"] == "serial":
                marks.append("蓝牙")
            if t.get("isDefault"):
                marks.append("默认")
            suffix = f"  ← {'/'.join(marks)}" if marks else ""
            target = t["port"] if t["kind"] == "serial" else t["name"]
            log(f"    · {t['name']}  [{target}]{suffix}")
    except Exception as exc:
        log(f"枚举打印目标失败：{exc}")

    log(f"Chrome/Edge 渲染：{'就绪' if _chrome_ok() else '不可用（HTML 渲染会失败）'}")

    server = ThreadingHTTPServer((args.host, port), Handler)
    log(f"已就绪 → http://{args.host}:{port}   (Ctrl+C 退出)")
    log(f"网页端会访问 /health 探测本服务；探测不到就退回浏览器打印对话框。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("正在退出…")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
