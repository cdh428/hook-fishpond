"""
test_remote_tailscale_print.py - 从当前笔记本跨网调用目标机的 POS80 打印机
打印机路径: \\100.85.92.120\POS80
规格：
  1. 采用经现场校准的 400px 黄金安全宽度 (绝不切边)
  2. 泰中双语分行 + 泰文大字加粗
  3. 尾部走纸留白 1 行再精准切纸，不切多余空白小纸条
"""

import sys, os, time
import win32ui, win32print, win32con

mock_order = {
    "id": "TAILSCALE-" + time.strftime("%H%M%S"),
    "table_no": "ซุ้ม A08 / 休闲塘 A08",
    "created_at": time.strftime("%Y-%m-%d %H:%M"),
    "remark": "跨网测试：Tailscale WireGuard 加密远程直连打印！",
    "items": [
        {
            "name_th": "ปลานิลเผาเกลือ",
            "name_zh": "炭烤罗非鱼 (招牌香辣)",
            "spec": "รสจัดจ้าน / 香辣中辣",
            "qty": 1
        },
        {
            "name_th": "ผัดกะเพราหมูสับราดข้าว",
            "name_zh": "打抛猪肉碎盖饭 + 荷包蛋",
            "spec": "ไข่ดาวไม่สุก / 溏心蛋",
            "qty": 2
        },
        {
            "name_th": "ต้มยำกุ้งน้ำข้น",
            "name_zh": "冬阴功鲜虾浓汤",
            "spec": "เผ็ดปานกลาง / 经典中辣",
            "qty": 1
        }
    ]
}

def print_to_remote_pos80(order, remote_printer=r"\\100.85.92.120\POS80"):
    print(f"[*] 正在跨网连接远程打印机: {remote_printer} ...")
    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(remote_printer)

    try:
        margin_left = 12
        content_width = 385
        right_edge = margin_left + content_width # 397px 安全线

        hdc.StartDoc("Tailscale Remote Kitchen Ticket")
        hdc.StartPage()

        font_shop = win32ui.CreateFont({"name": "Leelawadee UI", "height": 38, "weight": 700})
        font_title = win32ui.CreateFont({"name": "Leelawadee UI", "height": 30, "weight": 700})
        font_table = win32ui.CreateFont({"name": "Leelawadee UI", "height": 42, "weight": 900})
        font_item_th = win32ui.CreateFont({"name": "Leelawadee UI", "height": 40, "weight": 900})
        font_item_zh = win32ui.CreateFont({"name": "Microsoft YaHei", "height": 24, "weight": 400})
        font_spec_th = win32ui.CreateFont({"name": "Leelawadee UI", "height": 28, "weight": 700})
        font_meta = win32ui.CreateFont({"name": "Leelawadee UI", "height": 24, "weight": 500})
        font_qty = win32ui.CreateFont({"name": "Leelawadee UI", "height": 44, "weight": 900})

        y = 20

        # 1. 店名
        shop_name = "Hook Fishpond"
        hdc.SelectObject(font_shop)
        w, _ = hdc.GetTextExtent(shop_name)
        hdc.TextOut(margin_left + max(0, (content_width - w) // 2), y, shop_name)
        y += 50

        # 2. 标题
        title = "ใบสั่งอาหารสำหรับครัว / 远程后厨单"
        hdc.SelectObject(font_title)
        w, _ = hdc.GetTextExtent(title)
        hdc.TextOut(margin_left + max(0, (content_width - w) // 2), y, title)
        y += 46

        # 3. 钓位 (黑框居中)
        table_no = order.get("table_no", "ซุ้ม A08 / 休闲塘 A08")
        hdc.SelectObject(font_table)
        w, _ = hdc.GetTextExtent(table_no)
        box_pad_x = 12
        box_pad_y = 8
        box_w = min(content_width, w + box_pad_x * 2)
        box_left = margin_left + max(0, (content_width - box_w) // 2)
        box_top = y
        box_right = box_left + box_w
        box_bottom = box_top + 48 + box_pad_y * 2

        pen = win32ui.CreatePen(win32con.PS_SOLID, 3, 0)
        hdc.SelectObject(pen)
        hdc.Rectangle((box_left, box_top, box_right, box_bottom))
        hdc.TextOut(box_left + box_pad_x, box_top + box_pad_y, table_no)
        y = box_bottom + 22

        # 4. 单号与时间
        hdc.SelectObject(font_meta)
        order_id = order.get("id", "ORD-20261018-001")
        created_at = order.get("created_at", time.strftime("%Y-%m-%d %H:%M"))
        hdc.TextOut(margin_left, y, f"单号: {order_id}")
        y += 34
        hdc.TextOut(margin_left, y, f"时间: {created_at}")
        y += 38

        # 分割线
        hdc.MoveTo(margin_left, y)
        hdc.LineTo(right_edge, y)
        y += 12

        # 5. 表头
        hdc.TextOut(margin_left, y, "菜品 / รายการ")
        w_qty, _ = hdc.GetTextExtent("数量/จำนวน")
        hdc.TextOut(right_edge - w_qty, y, "数量/จำนวน")
        y += 36

        hdc.MoveTo(margin_left, y)
        hdc.LineTo(right_edge, y)
        y += 16

        # 6. 菜品列表
        items = order.get("items", [])
        for it in items:
            th_name = it.get("name_th") or it.get("name", "")
            zh_name = it.get("name_zh") or it.get("name_cn", "")
            spec = it.get("spec", "")
            qty = str(it.get("qty", 1))

            hdc.SelectObject(font_qty)
            qty_text = f"x{qty}"
            qw, _ = hdc.GetTextExtent(qty_text)
            hdc.TextOut(right_edge - qw, y + 4, qty_text)

            hdc.SelectObject(font_item_th)
            hdc.TextOut(margin_left, y, th_name)
            y += 54

            if zh_name:
                hdc.SelectObject(font_item_zh)
                hdc.TextOut(margin_left, y, zh_name)
                y += 34

            if spec:
                hdc.SelectObject(font_spec_th)
                hdc.TextOut(margin_left + 6, y, f"• {spec}")
                y += 38

            y += 14

        # 底部分割线
        hdc.MoveTo(margin_left, y)
        hdc.LineTo(right_edge, y)
        y += 14

        # 7. 特别备注 (自动折行)
        remark = order.get("remark", "")
        if remark:
            hdc.SelectObject(font_title)
            hdc.TextOut(margin_left, y, "หมายเหตุ / 备注:")
            y += 38

            hdc.SelectObject(font_spec_th)
            rect = (margin_left, y, right_edge, y + 180)
            drawn_h = hdc.DrawText(remark, rect, win32con.DT_WORDBREAK | win32con.DT_LEFT)
            y += max(36, drawn_h) + 10

        # 在 GDI 页面底端画分界线锁定高度
        hdc.MoveTo(margin_left, y)
        hdc.LineTo(right_edge, y)

        hdc.EndPage()
        hdc.EndDoc()
        print(f"[+] 远程 GDI 打印任务提交成功！")

    finally:
        del hdc

    # 通过马达物理走纸 2 行后全切
    try:
        h = win32print.OpenPrinter(remote_printer)
        try:
            win32print.StartDocPrinter(h, 1, ("Cut", None, "RAW"))
            win32print.WritePrinter(h, b"\n\n\x1d\x56\x00")
            win32print.EndDocPrinter(h)
            print("[+] 远程切纸指令发送成功！")
        finally:
            win32print.ClosePrinter(h)
    except Exception as e:
        print("[Warn] 远程切纸指令发送跳过:", e)

if __name__ == "__main__":
    print_to_remote_pos80(mock_order)
