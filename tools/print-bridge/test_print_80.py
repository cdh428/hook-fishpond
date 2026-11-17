"""向 POS80 收银机桥发 80mm 测试打印，自动带 authToken（从 config 服务端读取，不打印明文）。"""
import json, urllib.request, urllib.error

BRIDGE = "http://100.85.92.120:17777"
CONFIG = "C:/Users/dnlct/WorkBuddy/hook-fishpond/tools/print-bridge/_deploy_config.json"

# 读 authToken（服务端，不展示明文）
cfg = json.load(open(CONFIG, encoding="utf-8"))
key = (cfg.get("authToken") or "").strip()

# 80mm 票据 HTML（与 print-receipt.ts baseCssFor(80) 一致）
inner = """
  <div class="center"><div class="brand">Hook Fishpond</div><div class="doc-type">测试 80mm</div></div>
  <div class="dashed"></div>
  <div class="meta">
    <div class="row"><span class="k">单号</span><span class="v">TEST-80MM-002</span></div>
    <div class="row"><span class="k">桌号</span><span class="v">茅草屋 01</span></div>
    <div class="row"><span class="k">纸宽</span><span class="v">80mm (576 dots)</span></div>
  </div>
  <div class="items">
    <div class="item"><span class="n item-th">ปลาย่าง</span><span class="q">× 1</span><span class="q" style="min-width:16mm;text-align:right">260</span></div>
    <div class="item-zh">烤鱼套餐</div>
    <div class="item"><span class="n item-th">ส้มตำ</span><span class="q">× 2</span><span class="q" style="min-width:16mm;text-align:right">120</span></div>
    <div class="item-zh">青木瓜沙拉</div>
  </div>
  <div class="solid"></div>
  <div class="row"><span class="k">小计</span><span class="v">฿380</span></div>
  <div class="total-row"><span>应付</span><span class="grand">฿380</span></div>
  <div class="dashed"></div>
  <div class="foot">谢谢惠顾<br/>TEST-80MM-002</div>"""

html = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
@page{size:80mm auto;margin:0}
html,body{margin:0;padding:0;width:80mm;background:#fff;color:#000;font-family:'Leelawadee UI','Noto Sans Thai','Noto Sans SC',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ticket{width:70mm;margin:0 auto;padding:2mm 1mm 6mm}
.center{text-align:center}
.brand{font-size:18px;font-weight:700}
.doc-type{margin:6px 0 4px;padding:3px 0;border-top:2px dashed #000;border-bottom:2px dashed #000;font-size:16px;font-weight:800}
.dashed{border-top:1.5px dashed #000;margin:5px 0}
.solid{border-top:2px solid #000;margin:5px 0}
.row{display:flex;justify-content:space-between;gap:6px;font-size:13px;line-height:1.6}
.row .k{color:#000}.row .v{text-align:right;font-weight:600}
.meta{font-size:13px;line-height:1.6}
.items{margin-top:4px}
.item{display:flex;justify-content:space-between;gap:6px;line-height:1.4;margin-top:4px}
.item .n{flex:1 1 auto;word-break:break-word}
.item-th{font-size:16px;font-weight:800}
.item-zh{font-size:12px;color:#444;margin-top:1px;padding-left:2px}
.item .q{flex:0 0 auto;font-weight:800;padding-right:1mm;font-size:15px}
.total-row{display:flex;justify-content:space-between;font-size:18px;font-weight:800}
.grand{font-size:23px;font-weight:900}
.foot{text-align:center;font-size:12px;margin-top:8px;line-height:1.6}
</style></head><body><div class="ticket">%s</div></body></html>""" % inner

payload = {
    "printer": "POS80",
    "html": html,
    "copies": 1,
    "cut": True,
    "cutMode": "partial",
    "feedLines": 3,
    "width": 576,          # 80mm = 576 点
    "paperWidthMm": 80,    # 网站设定：80mm
}
body = json.dumps(payload).encode("utf-8")

req = urllib.request.Request(
    f"{BRIDGE}/print",
    data=body,
    headers={
        "Content-Type": "application/json",
        "X-Print-Key": key,   # 目标机 config.json 有 authToken，必须带
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        print("HTTP", resp.status, resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode("utf-8", "ignore"))
except Exception as e:
    print("ERR", e)
