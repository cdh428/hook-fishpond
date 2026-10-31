import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  buildBillHtml,
  buildKitchenTicketHtml,
  makeQrDataUrl,
  type PrintLabels,
} from "@/lib/print-receipt";
import { toReceiptOrder } from "@/lib/order-view";
import { tableOrderUrl } from "@/lib/api-client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * 内部 token：从 DATABASE_URL 派生（与 auth.ts 的 sessionSecret 同模式）。
 * 服务端与桥端都从 DATABASE_URL 算出同一值，**无需额外环境变量**，
 * 本地与生产（同一个 Neon 库）天然一致。
 * 若配置了 PRINT_WATCH_TOKEN 则优先用它（可覆盖，便于轮换）。
 */
function expectedToken(): string {
  const s = process.env.PRINT_WATCH_TOKEN || process.env.DATABASE_URL;
  if (!s) return "";
  return createHmac("sha256", s).update("hook-fishpond-print-watch-v1").digest("hex");
}

function checkToken(request: NextRequest): boolean {
  const expect = expectedToken();
  if (!expect) return false;
  const got = request.headers.get("x-print-token") || "";
  return got === expect;
}

// 三语文案（服务端渲染小票用）。只取小票相关，避免整包。
// 运行时读 messages 文件会太慢；直接内联小票渲染所需的最小文案。
// 注意：三语必须与 messages/*.json 的 printLabels 一致，改文案要同步。
function loadLabels(locale: string): PrintLabels {
  const zh: PrintLabels = {
    brand: "Hook Fishpond",
    brandSub: "泰国 · 垂钓 · 美食",
    kitchenTicket: "后厨单",
    kitchenCopy1: "【 ครัว / 厨房留存联 】",
    bill: "预结单",
    receipt: "收款收据",
    orderNo: "单号",
    table: "桌号",
    takeaway: "外带",
    dineIn: "堂食",
    customer: "顾客",
    time: "时间",
    item: "品名",
    qty: "数量",
    amount: "金额",
    subtotal: "小计",
    fishCharge: "渔获",
    fishWeight: "重量",
    discount: "折扣",
    total: "应付",
    note: "备注",
    status: "状态",
    settlementMode: "结算",
    prepaid: "先付",
    postpaid: "后付",
    scanToPay: "扫码支付",
    paidAt: "结清时间",
    thanks: "谢谢光临，欢迎再来",
    scanMoreFood: "扫此码继续加菜",
  };
  const en: PrintLabels = {
    brand: "Hook Fishpond",
    brandSub: "Thailand · Fishing · Dining",
    kitchenTicket: "Kitchen Ticket",
    kitchenCopy1: "【 Kitchen Copy 】",
    bill: "Bill",
    receipt: "Receipt",
    orderNo: "Order No.",
    table: "Table",
    takeaway: "Takeaway",
    dineIn: "Dine-in",
    customer: "Customer",
    time: "Time",
    item: "Item",
    qty: "Qty",
    amount: "Amount",
    subtotal: "Subtotal",
    fishCharge: "Catch",
    fishWeight: "Weight",
    discount: "Discount",
    total: "Total",
    note: "Note",
    status: "Status",
    settlementMode: "Settlement",
    prepaid: "Prepaid",
    postpaid: "Postpaid",
    scanToPay: "Scan to Pay",
    paidAt: "Paid at",
    thanks: "Thank you, welcome again",
    scanMoreFood: "Scan to add more",
  };
  const th: PrintLabels = {
    brand: "Hook Fishpond",
    brandSub: "ประเทศไทย · ตกปลา · อาหาร",
    kitchenTicket: "ใบครัว",
    kitchenCopy1: "【 ครัว / ใบครัว 】",
    bill: "ใบเสร็จ",
    receipt: "ใบรับเงิน",
    orderNo: "เลขที่",
    table: "โต๊ะ",
    takeaway: "ซื้อกลับบ้าน",
    dineIn: "ทานที่ร้าน",
    customer: "ลูกค้า",
    time: "เวลา",
    item: "รายการ",
    qty: "จำนวน",
    amount: "ราคา",
    subtotal: "รวม",
    fishCharge: "ปลา",
    fishWeight: "น้ำหนัก",
    discount: "ส่วนลด",
    total: "ยอดสุทธิ",
    note: "หมายเหตุ",
    status: "สถานะ",
    settlementMode: "ชำระ",
    prepaid: "จ่ายล่วงหน้า",
    postpaid: "จ่ายทีหลัง",
    scanToPay: "สแกนจ่าย",
    paidAt: "ชำระเมื่อ",
    thanks: "ขอบคุณครับ ยินดีต้อนรับอีกครั้ง",
    scanMoreFood: "สแกนเพื่อสั่งเพิ่ม",
  };
  if (locale === "th") return th;
  if (locale === "en") return en;
  return zh;
}

/**
 * GET /api/admin/print/watch —— 打印桥轮询入口（内部）
 *
 * 桥（目标机常驻进程）每 N 秒拉一次，取「未出票的新单」，渲染好 HTML 返回。
 * 桥打印两联+播报后调 POST /api/admin/print/mark 回写 PRINTED。
 *
 * 领取语义：命中即置 printState=FAILED(processing) 防并发，避免多个轮询者重复打印。
 * 渲染失败则不领取（保持 null），下次再试。
 *
 * 响应：
 *   { orders: [ { id, orderNumber, tableCode, tableName,
 *                 billHtml, kitchenHtml, thText, zhText } ], taken: number }
 */
export async function GET(request: NextRequest) {
  if (!checkToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await prisma.order.findMany({
      where: {
        printState: null, // 从未出票
        status: { notIn: ["SETTLED", "CANCELLED"] },
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: { name_zh: true, name_en: true, name_th: true },
            },
          },
        },
        table: true,
      },
      orderBy: { createdAt: "asc" },
      take: 5,
    });

    const out: unknown[] = [];
    const takenIds: string[] = [];

    for (const order of orders) {
      const tableCode = order.table?.code || "";
      const tableName = order.table
        ? order.table.name_zh || order.table.name_en || order.table.name_th || ""
        : "";

      // 渲染小票（可能因 QR 生成失败而异常）
      let billHtml: string | null = null;
      let kitchenHtml: string | null = null;
      try {
        const ro = toReceiptOrder(order, "zh"); // 渲染用中文（桥端按需）
        const labels = loadLabels("zh");
        // 桌号续点单 QR
        let tableQrDataUrl: string | null = null;
        if (tableCode) {
          try {
            tableQrDataUrl = await makeQrDataUrl(tableOrderUrl(tableCode, "https://www.hookfishpond.com"));
          } catch {
            tableQrDataUrl = null;
          }
        }
        billHtml = buildBillHtml(ro, {
          labels,
          qrDataUrl: null,
          tableQrDataUrl,
          tableQrLabel: tableCode ? labels.scanMoreFood : null,
        });
        kitchenHtml = buildKitchenTicketHtml(ro, labels, labels.kitchenCopy1);
      } catch (e) {
        // 渲染失败：不领取，保持 null，下次再试
        console.error("watch render fail", order.id, e);
        continue;
      }

      // 领取：置 FAILED(processing)，防止并发轮询重复打印
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: { printState: "FAILED", printError: "processing" },
        });
      } catch {
        continue;
      }
      takenIds.push(order.id);

      out.push({
        id: order.id,
        orderNumber: order.orderNumber,
        tableCode,
        tableName,
        billHtml,
        kitchenHtml,
        thText: tableCode
          ? `มีออเดอร์ใหม่ โต๊ะ ${tableCode} ค่ะ`
          : "มีออเดอร์ใหม่ค่ะ",
        zhText: tableName
          ? `Hook Fishpond，${tableName}，收到后厨新订单！`
          : "Hook Fishpond，收到后厨新订单！",
      });
    }

    return NextResponse.json({ orders: out, taken: takenIds.length });
  } catch (error: any) {
    console.error("watch error:", error);
    return NextResponse.json({ error: "watch failed" }, { status: 500 });
  }
}
