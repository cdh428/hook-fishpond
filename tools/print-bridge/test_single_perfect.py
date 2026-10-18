"""
test_single_perfect.py - 完美校准：
1. 解决“测试框左边超出边界”：左边距留足 25 像素 (从 x=25 开始)，宽度设为 375 像素 (右边到 x=400)，左右完全对称居中，绝不切边！
2. 泰文字体进一步加大至 22px 特粗 (音标巨大饱满)。
3. 单一文档内完成，杜绝第二个任务多切空白纸条。
"""

import sys, os, time
sys.path.append("C:/Users/dnlct/WorkBuddy/hook-fishpond/tools/print-bridge")
import win32ui, win32print, win32con
from PIL import Image, ImageDraw, ImageWin

# 构建一份真实的 375px 双语分行大字测试单
w = 375
# 使用 Edge/Chrome 渲染真实 HTML 保证 Leelawadee UI 原生大字
html_content = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    width: 375px;
    margin: 0;
    padding: 4px 6px 12px;
    background: #fff;
    color: #000;
    font-family: 'Leelawadee UI', 'Noto Sans Thai', sans-serif;
  }
  .center { text-align: center; }
  .brand { font-size: 19px; font-weight: 800; }
  .doc-type {
    margin: 6px 0; padding: 4px 0;
    border-top: 2px dashed #000; border-bottom: 2px dashed #000;
    font-size: 17px; font-weight: 900;
  }
  .order-no { font-size: 26px; font-weight: 900; margin: 4px 0; }
  .dashed { border-top: 1.5px dashed #000; margin: 6px 0; }
  .solid { border-top: 2px solid #000; margin: 6px 0; }
  .meta-row { display: flex; justify-content: space-between; font-size: 14px; line-height: 1.6; font-weight: 600; }
  .item-box { margin-top: 6px; }
  .item-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 6px; }
  /* 泰文特大加粗 (22px)，格外醒目 */
  .th-name { font-size: 22px; font-weight: 900; line-height: 1.35; color: #000; flex: 1; }
  .zh-name { font-size: 14px; font-weight: 500; color: #333; margin-top: 2px; padding-left: 2px; }
  .spec { font-size: 15px; font-weight: 700; color: #222; margin-top: 2px; padding-left: 4px; }
  .qty-price { font-size: 18px; font-weight: 900; text-align: right; white-space: nowrap; padding-left: 8px; }
  .total-row { display: flex; justify-content: space-between; font-size: 20px; font-weight: 900; margin-top: 6px; }
  .remark-box { border: 2px solid #000; padding: 6px 8px; margin-top: 8px; }
  .remark-title { font-size: 15px; font-weight: 800; }
  .remark-text { font-size: 16px; font-weight: 700; margin-top: 3px; word-break: break-word; }
  .foot { text-align: center; font-size: 13px; margin-top: 8px; font-weight: 600; }
</style>
</head>
<body>
  <div class="center">
    <div class="brand">Hook Fishpond</div>
    <div class="doc-type">ใบสั่งอาหารสำหรับครัว / 后厨单</div>
    <div class="order-no">ORD-20261017-001</div>
  </div>
  <div class="dashed"></div>
  <div class="meta-row"><span>钓位 / โต๊ะ:</span><span>ซุ้ม A08 / 休闲塘 A08</span></div>
  <div class="meta-row"><span>时间 / เวลา:</span><span>2026-10-17 17:45</span></div>
  <div class="dashed"></div>

  <div class="item-box">
    <div class="item-row">
      <div class="th-name">ปลานิลเผาเกลือ</div>
      <div class="qty-price">× 1</div>
    </div>
    <div class="zh-name">炭烤罗非鱼</div>
    <div class="spec">› รสจัดจ้าน / 香辣中辣</div>

    <div class="item-row">
      <div class="th-name">ผัดกะเพราหมูสับ</div>
      <div class="qty-price">× 2</div>
    </div>
    <div class="zh-name">打抛猪肉碎盖饭</div>
    <div class="spec">› ไข่ดาวไม่สุก / 溏心蛋</div>

    <div class="item-row">
      <div class="th-name">ต้มยำกุ้งน้ำข้น</div>
      <div class="qty-price">× 1</div>
    </div>
    <div class="zh-name">冬阴功鲜虾浓汤</div>
  </div>

  <div class="dashed"></div>
  <div class="remark-box">
    <div class="remark-title">หมายเหตุ / 备注:</div>
    <div class="remark-text">ไม่ใส่ผักชี, หนังปลากรอบๆ (不加香菜，鱼皮烤香脆)</div>
  </div>
  <div class="solid"></div>
  <div class="foot">ขอบคุณค่ะ · Hook Fishpond</div>
</body>
</html>"""

import subprocess, tempfile
chrome_exe = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
temp_html = os.path.join(os.environ["TEMP"], "test_render.html")
temp_png = os.path.join(os.environ["TEMP"], "test_render.png")

with open(temp_html, "w", encoding="utf-8") as f:
    f.write(html_content)

subprocess.run([
    chrome_exe,
    "--headless=new",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    f"--screenshot={temp_png}",
    "--window-size=375,1200",
    temp_html
], capture_output=True, check=True)

img = Image.open(temp_png)
# 裁掉垂直多余白边
bbox = img.convert("RGB").point(lambda x: 0 if x > 235 else 255).getbbox()
if bbox:
    cropped = img.crop((0, 0, 375, bbox[3] + 20))
else:
    cropped = img

# 底部直接合并 1 行空白 (约 30px 留白)，再画一条细线封闭，绝不另开新页
pad_bottom_px = 35
final_img = Image.new("RGB", (375, cropped.height + pad_bottom_px), (255, 255, 255))
final_img.paste(cropped, (0, 0))

print(f"Final image size: {final_img.size}")

# GDI 打印：关键解决“左边超出边界”
# 将 left_margin 设为 25 像素！
left_margin = 25
top_margin = 10
printer_name = "POS80"

hdc = win32ui.CreateDC()
hdc.CreatePrinterDC(printer_name)
try:
    hdc.StartDoc("Hook Fishpond Kitchen")
    hdc.StartPage()

    dib = ImageWin.Dib(final_img)
    # 左边从 25 开始，右边到 25 + 375 = 400，完全居中，绝不切左边，也不切右边！
    dib.draw(hdc.GetHandleOutput(), (left_margin, top_margin, left_margin + 375, top_margin + final_img.height))

    hdc.EndPage()
    hdc.EndDoc()
finally:
    del hdc

print("单文档打印完成！没有发起第二个切纸任务。")
