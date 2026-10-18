"""
test_all_three_tickets.py - 分别测试网站的 3 种小票：后厨单、预结单、收据
通过 tools/print-bridge 的高保真 GDI 驱动模式直接发送到 POS80 打印机
"""

import sys, os, time
sys.path.append("C:/Users/dnlct/WorkBuddy/hook-fishpond/tools/print-bridge")
import bridge

BASE_CSS = """
  * { box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    width: 80mm;
    background: #fff; color: #000;
    font-family: 'Leelawadee UI', 'Noto Sans Thai', 'Noto Sans SC', 'Sarabun', -apple-system, 'Segoe UI', sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* 黄金安全宽度锁定 70mm (400px)，基准点 420 纸边内，绝不超出边界 */
  .ticket { width: 70mm; margin: 0 auto; padding: 2mm 1mm 6mm; }
  .center { text-align: center; }
  .brand { font-size: 18px; font-weight: 700; letter-spacing: .5px; }
  .brand-sub { font-size: 12px; margin-top: 1px; color: #333; }
  .doc-type {
    margin: 6px 0 4px; padding: 3px 0;
    border-top: 2px dashed #000; border-bottom: 2px dashed #000;
    font-size: 16px; font-weight: 800; letter-spacing: 1px;
  }
  .dashed { border-top: 1.5px dashed #000; margin: 6px 0; }
  .solid { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; font-size: 13px; line-height: 1.6; }
  .row .k { color: #000; }
  .row .v { text-align: right; font-weight: 600; }
  .order-no { font-size: 28px; font-weight: 900; letter-spacing: 1px; line-height: 1.15; }
  .meta { font-size: 13px; line-height: 1.6; }
  .items { margin-top: 4px; }
  .item { display: flex; justify-content: space-between; gap: 6px; font-size: 14px; line-height: 1.6; }
  .item .n { flex: 1 1 auto; word-break: break-word; font-weight: 600; }
  .item .q { flex: 0 0 auto; font-weight: 800; padding-right: 1mm; font-size: 15px; }
  .item-note { font-size: 12px; padding-left: 6px; line-height: 1.5; color: #333; }
  .big .item { font-size: 20px; line-height: 1.8; }
  .big .item .n { font-weight: 900; font-size: 20px; }
  .big .item .q { font-size: 22px; font-weight: 900; }
  .big .item-note { font-size: 15px; font-weight: 700; line-height: 1.6; padding-left: 8px; }
  .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; }
  .grand { font-size: 23px; font-weight: 900; }
  .foot { text-align: center; font-size: 12px; margin-top: 8px; line-height: 1.6; }
  .stamp {
    margin: 6px auto; text-align: center; width: 90px;
    font-size: 18px; font-weight: 900; letter-spacing: 2px;
    border: 2px solid #000; padding: 2px 0;
  }
"""

def wrap_html(title, body):
    return f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{BASE_CSS}</style></head><body><div class='ticket'>{body}</div></body></html>"

# 1. 后厨单 HTML
kitchen_body = """
  <div class="center">
    <div class="brand">Hook Fishpond</div>
    <div class="brand-sub">ตกปลา & อาหาร / 垂钓与餐饮</div>
    <div class="doc-type">ใบสั่งอาหารสำหรับครัว / 后厨出票</div>
    <div class="order-no" style="margin-top:6px;">ORD-20261017-001</div>
  </div>
  <div class="dashed"></div>
  <div class="meta">
    <div class="row"><span class="k">桌位 / โต๊ะ:</span><span class="v">กระท่อม 01 / 茅草屋 01</span></div>
    <div class="row"><span class="k">时间 / เวลา:</span><span class="v">2026-10-18 15:30</span></div>
  </div>
  <div class="dashed"></div>
  <div class="big">
    <div class="item"><span class="n item-th">ปลานิลเผาเกลือ</span><span class="q">× 1</span></div>
    <div class="item-zh">炭烤罗非鱼</div>
    <div class="item-note">› รสจัดจ้าน / 香辣中辣</div>
    <div class="item"><span class="n item-th">ผัดกะเพราหมูสับ</span><span class="q">× 2</span></div>
    <div class="item-zh">打抛猪肉碎盖饭</div>
    <div class="item-note">› ไข่ดาวไม่สุก / 溏心蛋</div>
    <div class="item"><span class="n item-th">ต้มยำกุ้งน้ำข้น</span><span class="q">× 1</span></div>
    <div class="item-zh">冬阴功鲜虾浓汤</div>
  </div>
  <div class="dashed"></div>
  <div class="meta"><b>备注 / หมายเหตุ:</b> 不加香菜，鱼皮烤香脆</div>
  <div class="solid"></div>
  <div class="foot">后厨单 · ORD-20261017-001</div>
"""

# 2. 预结单 HTML (泰中双语分行：泰文大字加粗在上，中文在下，金额整齐对齐)
bill_body = """
  <div class="center">
    <div class="brand">Hook Fishpond</div>
    <div class="brand-sub">ตกปลา & อาหาร / 垂钓与餐饮</div>
    <div class="doc-type">ใบแจ้งยอด / 预结单</div>
    <div class="order-no" style="margin-top:6px;">ORD-20261017-001</div>
  </div>
  <div class="dashed"></div>
  <div class="meta">
    <div class="row"><span class="k">桌位 / โต๊ะ:</span><span class="v">1号桌 / โต๊ะที่ 1 (Table 01)</span></div>
    <div class="row"><span class="k">时间 / เวลา:</span><span class="v">2026-10-18 15:30</span></div>
    <div class="row"><span class="k">模式 / วิธีชำระ:</span><span class="v">先享后付 (Postpaid)</span></div>
  </div>
  <div class="dashed"></div>
  <div class="items">
    <div class="item">
      <span class="n item-th">ปลานิลเผาเกลือ</span>
      <span class="q">× 1</span>
      <span class="q" style="min-width:16mm;text-align:right">฿220</span>
    </div>
    <div class="item-zh">炭烤罗非鱼</div>
    <div class="item-note">› รสจัดจ้าน / 香辣中辣</div>

    <div class="item">
      <span class="n item-th">ผัดกะเพราหมูสับราดข้าว</span>
      <span class="q">× 2</span>
      <span class="q" style="min-width:16mm;text-align:right">฿160</span>
    </div>
    <div class="item-zh">打抛猪肉碎盖饭</div>
    <div class="item-note">› ไข่ดาวไม่สุก / 溏心蛋</div>

    <div class="item">
      <span class="n item-th">ต้มยำกุ้งน้ำข้น</span>
      <span class="q">× 1</span>
      <span class="q" style="min-width:16mm;text-align:right">฿180</span>
    </div>
    <div class="item-zh">冬阴功鲜虾浓汤</div>
  </div>
  <div class="solid"></div>
  <div class="row"><span class="k">菜品小计 / รวมค่าอาหาร:</span><span class="v">฿560</span></div>
  <div class="row"><span class="k">渔获加工 / ค่าปลา (2.5 kg):</span><span class="v">฿150</span></div>
  <div class="row"><span class="k">优惠折扣 / ส่วนลด:</span><span class="v">−฿30</span></div>
  <div class="solid"></div>
  <div class="total-row"><span>应付总计 / ยอดรวมทั้งสิ้น:</span><span class="grand">฿680</span></div>
  <div class="dashed"></div>
  <div class="foot">感谢光临 Hook Fishpond<br/>ขอบคุณที่ใช้บริการค่ะ</div>
"""

# 3. 收据 HTML (泰中双语分行)
receipt_body = """
  <div class="center">
    <div class="brand">Hook Fishpond</div>
    <div class="brand-sub">ตกปลา & อาหาร / 垂钓与餐饮</div>
    <div class="doc-type">ใบเสร็จรับเงิน / 收款收据</div>
    <div class="stamp">PAID</div>
    <div class="order-no" style="margin-top:4px;">ORD-20261017-001</div>
  </div>
  <div class="dashed"></div>
  <div class="meta">
    <div class="row"><span class="k">桌位 / โต๊ะ:</span><span class="v">1号桌 / โต๊ะที่ 1</span></div>
    <div class="row"><span class="k">结清时间 / เวลาชำระ:</span><span class="v">2026-10-18 15:45</span></div>
  </div>
  <div class="dashed"></div>
  <div class="items">
    <div class="item">
      <span class="n item-th">ค่าอาหารและเครื่องดื่ม</span>
      <span class="q">× 1</span>
      <span class="q" style="min-width:16mm;text-align:right">฿680</span>
    </div>
    <div class="item-zh">餐饮与渔获结清款项</div>
  </div>
  <div class="solid"></div>
  <div class="total-row"><span>实收金额 / ได้รับเงิน:</span><span class="grand">฿680</span></div>
  <div class="dashed"></div>
  <div class="row"><span class="k">支付方式 / วิธีชำระ:</span><span class="v">PromptPay 扫码支付</span></div>
  <div class="dashed"></div>
  <div class="foot">感谢光临 Hook Fishpond · 祝您生活愉快！<br/>ขอบคุณที่ใช้บริการ ขอให้มีความสุขค่ะ</div>
"""

tickets = [
    ("后厨出票 (Kitchen Ticket)", wrap_html("Kitchen", kitchen_body)),
    ("预结单 (Bill)", wrap_html("Bill", bill_body)),
    ("收款收据 (Receipt)", wrap_html("Receipt", receipt_body)),
]

for name, html in tickets:
    print(f"[*] 正在按最新规格打印: {name} ...")
    res = bridge.do_print({
        "printer": "POS80",
        "html": html,
        "width": 576,
        "cut": True,
        "feedLines": 1
    })
    print(f"  [+] {name} 打印完成 (耗时: {res.get('ms')}ms)")
    time.sleep(2)

print("\n[SUCCESS] 3 种单据全部按最新统一规格输出完毕！")
