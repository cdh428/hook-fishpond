#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
票据 HTML → 80mm 热敏位图。

链路：
  HTML ──(Chrome headless 截图, 3x)──▶ PNG
        ──(Pillow 裁白边 / 缩放到 576 点 / 二值化)──▶ 1-bit 位图

为什么用 Chrome 而不是自己排版？
  票据模板（src/lib/print-receipt.ts）已经是一份设计好的 HTML+CSS，
  直接拿浏览器渲染能保证「屏幕上看到的 = 打出来的」，
  而且泰文/中文字形、虚线、二维码全部由浏览器保证正确。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

# 80mm 纸在 96 CSS-dpi 下的宽度（CSS px）
MM80_CSS_PX = 80 / 25.4 * 96  # ≈ 302.36

# 渲染高度的试探序列（CSS px）。先从小的试，不够再加大，避免每次都很慢。
_HEIGHT_LADDER = (1500, 2600, 4200, 7000)

_CHROME_CANDIDATES = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome Beta\Application\chrome.exe",
)


class RenderError(RuntimeError):
    pass


def find_chrome() -> str:
    """定位一个可用的 Chromium 内核浏览器（Chrome 优先，其次 Edge）。"""
    override = os.environ.get("PRINT_BRIDGE_CHROME")
    if override and Path(override).exists():
        return override

    for cand in _CHROME_CANDIDATES:
        if Path(cand).exists():
            return cand

    for exe in ("chrome.exe", "msedge.exe"):
        found = shutil.which(exe)
        if found:
            return found

    raise RenderError(
        "找不到 Chrome / Edge。请安装 Chrome，"
        "或设置环境变量 PRINT_BRIDGE_CHROME 指向浏览器可执行文件。"
    )


def _screenshot(chrome: str, html_path: Path, png_path: Path, css_h: int, scale: int,
                timeout: int = 90) -> None:
    css_w = round(MM80_CSS_PX)
    profile = Path(tempfile.mkdtemp(prefix="pb-chrome-"))
    try:
        args = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-features=Translate,OptimizationHints",
            "--hide-scrollbars",
            "--default-background-color=FFFFFFFF",
            f"--user-data-dir={profile}",
            f"--force-device-scale-factor={scale}",
            f"--window-size={css_w},{css_h}",
            f"--screenshot={png_path}",
            "--virtual-time-budget=5000",
            html_path.as_uri(),
        ]
        proc = subprocess.run(
            args, capture_output=True, timeout=timeout, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if not png_path.exists() or png_path.stat().st_size == 0:
            detail = (proc.stderr or b"").decode("utf-8", "replace")[-500:]
            raise RenderError(f"浏览器截图失败：{detail or '未产出图片'}")
    except subprocess.TimeoutExpired as exc:
        raise RenderError(f"浏览器渲染超时（{timeout}s）") from exc
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def _crop_content(img: Image.Image, pad_top: int = 6, pad_bottom: int = 10) -> tuple[Image.Image, bool]:
    """
    裁掉上下白边。

    返回 (裁剪后的图, 内容是否顶到了下边缘)。顶到下边缘说明页面被窗口截断，
    调用方需要换更大的窗口高度重试。
    """
    gray = img.convert("L")
    content = ImageOps.invert(gray)  # 有内容的地方变亮
    box = content.getbbox()
    if box is None:  # 整页空白
        return img, False

    _, top, _, bottom = box
    touched_bottom = bottom >= img.height - 2

    top = max(0, top - pad_top)
    bottom = min(img.height, bottom + pad_bottom)
    return img.crop((0, top, img.width, bottom)), touched_bottom


def _to_bitmap(img: Image.Image, target_w: int, mode: str, threshold: int) -> Image.Image:
    """缩放到目标点宽并二值化。"""
    gray = img.convert("L")

    if gray.width != target_w:
        ratio = target_w / gray.width
        new_h = max(1, int(round(gray.height * ratio)))
        # LANCZOS 先把 3x 的抗锯齿边缘平滑下来，再二值化才不会出现锯齿碎点
        gray = gray.resize((target_w, new_h), Image.LANCZOS)

    gray = ImageOps.autocontrast(gray, cutoff=0)

    if mode == "dither":
        return gray.convert("1")  # Floyd–Steinberg
    return gray.point(lambda p: 255 if p > threshold else 0, mode="L").convert(
        "1", dither=Image.NONE
    )


def render_html_to_bitmap(
    html: str,
    *,
    target_width: int = 576,
    scale: int = 3,
    mode: str = "threshold",
    threshold: int = 128,
    chrome: str | None = None,
) -> Image.Image:
    """
    把一份完整票据 HTML 渲染成 1-bit 位图（宽度 = target_width 点）。

    抛 RenderError 表示渲染链路不可用。
    """
    if not html or not html.strip():
        raise RenderError("HTML 内容为空")
    if target_width % 8 != 0:
        raise RenderError("target_width 必须是 8 的倍数")
    if mode not in ("threshold", "dither"):
        raise RenderError(f"不支持的二值化模式：{mode}")

    chrome = chrome or find_chrome()

    workdir = Path(tempfile.mkdtemp(prefix="pb-render-"))
    try:
        html_path = workdir / "ticket.html"
        html_path.write_text(html, encoding="utf-8")

        last_img: Image.Image | None = None
        for css_h in _HEIGHT_LADDER:
            png_path = workdir / f"shot-{css_h}.png"
            _screenshot(chrome, html_path, png_path, css_h, scale)
            with Image.open(png_path) as raw:
                shot = raw.copy()
            cropped, truncated = _crop_content(shot)
            last_img = cropped
            if not truncated:
                break

        if last_img is None:
            raise RenderError("渲染未产出任何图像")

        return _to_bitmap(last_img, target_width, mode, threshold)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
