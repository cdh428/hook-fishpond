import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildBillHtml, type PrintLabels } from "@/lib/print-receipt";
import { toReceiptOrder } from "@/lib/order-view";

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

/** 归一化 locale：只认 zh/en/th，其他一律返回 null（由调用方决定回退） */
function normalizeLocale(v: unknown): "zh" | "en" | "th" | null {
  const s = String(v || "").slice(0, 2).toLowerCase();
  return s === "zh" || s === "en" || s === "th" ? (s as "zh" | "en" | "th") : null;
}

/**
 * 服务端自动出单的缺省票面语言（历史单 locale 为空时使用）。
 * 读 Setting 表 `print.locale`，缺省 **th** —— 后厨是泰国人，
 * 语言选错会直接出错菜，比老板看不懂严重。见 docs/playbooks/print-language.md
 */
async function getPrintLocale(): Promise<"zh" | "en" | "th"> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "print.locale" } });
    return normalizeLocale(row?.value) || "th";
  } catch {
    return "th";
  }
}

/** 按 locale 取桌名，别的语言缺了才回退中文 */
function pickLocaleName(
  row: { name_zh?: string | null; name_en?: string | null; name_th?: string | null } | null,
  locale: string,
): string {
  if (!row) return "";
  if (locale === "en") return row.name_en || row.name_zh || row.name_th || "";
  if (locale === "th") return row.name_th || row.name_zh || row.name_en || "";
  return row.name_zh || row.name_en || row.name_th || "";
}

// 三语文案（服务端渲染小票用）。只取小票相关，避免整包。// 运行时读 messages 文件会太慢；直接内联小票渲染所需的最小文案。
// 注意：三语必须与 messages/*.json 的 printLabels 一致，改文案要同步。
function loadLabels(locale: string): PrintLabels {
  const zh: PrintLabels = {
    brand: "Hook Fishpond",
    brandSub: "泰国 · 垂钓 · 美食",
    kitchenTicket: "后厨单",
    kitchenCopy1: "[ 后厨留存联 ]",
    kitchenCopy2: "[ 传菜联 ]",
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
    served: "已送", notServed: "未送", batchAt: "下单", itemCount: "项", paidStamp: "已收款",
  };
  const en: PrintLabels = {
    brand: "Hook Fishpond",
    brandSub: "Thailand · Fishing · Dining",
    kitchenTicket: "Kitchen Ticket",
    kitchenCopy1: "[ Kitchen Copy ]",
    kitchenCopy2: "[ Service Copy ]",
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
    served: "Served", notServed: "Not served", batchAt: "Ordered", itemCount: "items", paidStamp: "PAID",
  };
  const th: PrintLabels = {
    brand: "Hook Fishpond",
    brandSub: "ประเทศไทย · ตกปลา · อาหาร",
    kitchenTicket: "ใบครัว",
    kitchenCopy1: "[ ครัว ]",
    kitchenCopy2: "[ ส่งอาหาร ]",
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
    served: "เสิร์ฟแล้ว", notServed: "ยังไม่เสิร์ฟ", batchAt: "สั่งเมื่อ", itemCount: "รายการ", paidStamp: "ชำระแล้ว",
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
    // 只取「刚修改的新单」：桥不该一启动就翻历史未出票单（踩过：14 张存量单连打）。
    // 用 updatedAt 窗口过滤——「刚修改」（下单/加菜/改单都会更新 updatedAt）在最近
    // WATCH_WINDOW_MS 内才自动打；更早的单保持 null，等店员手动补打（历史遗留不自动出纸）。
    // 开机/换纸不涉及订单修改 → updatedAt 不更新 → 不会触发，杜绝「开机打一大堆」。
    const WATCH_WINDOW_MS = 5 * 60 * 1000; // 最近 5 分钟
    const since = new Date(Date.now() - WATCH_WINDOW_MS);

    // ⚠️ 2026-11-05：读取打印纸宽偏好（50/80mm），决定小票 HTML 渲染宽度。
    let paperWidthMm = 80;
    try {
      const row = await prisma.setting.findUnique({ where: { key: "print.preferences" } });
      if (row) {
        const p = JSON.parse(row.value) as { paperWidth?: string };
        const pw = Number(p.paperWidth);
        if (pw === 50 || pw === 80) paperWidthMm = pw;
      }
    } catch {
      // 读取失败保持默认 80mm
    }

    const orders = await prisma.order.findMany({
      where: {
        printState: null, // 从未出票（防重复打印）
        status: { notIn: ["SETTLED", "CANCELLED"] },
        updatedAt: { gte: since }, // 刚修改（下单/加菜/改单）
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
      orderBy: { updatedAt: "asc" },
      take: 5,
    });

    const out: unknown[] = [];
    const takenIds: string[] = [];

    for (const order of orders) {
      // 票面语言：**按下单时的界面语言**（Order.locale，用户 2026-11-07 定）。
      // 自动出单没有页面，只能靠这个字段；历史单（locale 为空）回退到
      // 服务端配置 print.locale，再缺省 th（后厨是泰国人）。
      // 规则见 docs/playbooks/print-language.md
      const ticketLocale = normalizeLocale((order as any).locale) || (await getPrintLocale());

      const tableCode = order.table?.code || "";
      const tableName = order.table
        ? pickLocaleName(order.table, ticketLocale)
        : "";

      // 渲染小票（可能因 QR 生成失败而异常）
      let billHtml: string | null = null;
      let kitchenHtml: string | null = null;
      try {
        const ro = toReceiptOrder(order, ticketLocale);
        const labels = loadLabels(ticketLocale);
        // 只打印一份（客户票），取消 QR 码 + 后厨票（用户要求）
        billHtml = buildBillHtml(ro, {
          labels,
          qrDataUrl: null,
          tableQrDataUrl: null,
          tableQrLabel: null,
          paperWidthMm,
        });
        kitchenHtml = null; // 不再打后厨票
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
        // ⚠️ 2026-11-05：把纸宽一起返回，桥端 watch 打印时按此设置视口与输出点宽
        paperWidthMm,
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
