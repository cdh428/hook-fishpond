import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import {
  generatePromptPayQR,
  getPromptPayId,
  getMerchantName,
  maskPromptPayId,
} from "@/lib/promptpay";
import { recalcOrderTotals, settleOrder } from "@/lib/orders";

// Neon(us-east-2) ← 泰国：往返延迟较高，放宽函数执行上限
export const maxDuration = 60;

const ORDER_INCLUDE = {
  items: {
    include: {
      menuItem: { select: { name_zh: true, name_en: true, name_th: true, price: true } },
    },
  },
  weighings: { orderBy: { createdAt: "asc" as const } },
  payment: true,
  table: true,
};

/**
 * POST /api/admin/orders/[id]/settle —— 收银台结算
 *
 * body:
 *   action: "create"（默认）  生成/刷新收款单
 *           "confirm"         顾客已付款 → 记支付成功并结清
 *           "mark-paid"       直接标记为已收款并结清（现金 / 已到账转账）
 *   method: "CASH" | "PROMPTPAY"（默认 PROMPTPAY）
 *
 * 结清时会把「预占」转为正式库存扣减（consumeReservation），并把订单置为 SETTLED。
 *
 * 注意：事务内只做写操作；用于回显的订单详情读取放在事务**之后**，
 * 以减少事务内的串行往返（Neon 远端 + 连接池 max:1）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "create");
    const method = String(body?.method || "PROMPTPAY") === "CASH" ? "CASH" : "PROMPTPAY";

    const order = await prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status === "CANCELLED") {
      return NextResponse.json({ error: "Order is cancelled" }, { status: 400 });
    }

    const promptPayId = getPromptPayId();

    // ---------- 结清 ----------
    if (action === "confirm" || action === "mark-paid") {
      const stock = await runTx(async (tx) => {
        const totals = await recalcOrderTotals(tx, id);

        await tx.payment.upsert({
          where: { orderId: id },
          create: {
            orderId: id,
            method: method as any,
            amount: totals.totalPrice,
            currency: "THB",
            status: "SUCCESSFUL",
            paidAt: new Date(),
            metadata: { merchantName: getMerchantName(), settledBy: admin.username },
          },
          update: {
            method: method as any,
            amount: totals.totalPrice,
            status: "SUCCESSFUL",
            paidAt: new Date(),
          },
        });

        return settleOrder(tx, id, { adminName: admin.username });
      });

      const settled = await prisma.order.findUnique({
        where: { id },
        include: ORDER_INCLUDE,
      });

      return NextResponse.json({
        order: settled,
        status: "SUCCESSFUL",
        mask: maskPromptPayId(promptPayId),
        // healed > 0 → 这单有下单时没预占到的菜品，本次结算已补记出库
        stock,
      });
    }

    // ---------- 生成 / 刷新收款单 ----------
    const created = await runTx(async (tx) => {
      const t = await recalcOrderTotals(tx, id);
      const qrString = generatePromptPayQR(promptPayId, t.totalPrice);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const existing = await tx.payment.findUnique({ where: { orderId: id } });
      const alreadyPaid = existing?.status === "SUCCESSFUL";

      let payment = existing;
      if (!alreadyPaid) {
        payment = await tx.payment.upsert({
          where: { orderId: id },
          create: {
            orderId: id,
            method: method as any,
            amount: t.totalPrice,
            currency: "THB",
            status: "PENDING",
            expiresAt,
            metadata: { qrString, merchantName: getMerchantName() },
          },
          update: {
            method: method as any,
            amount: t.totalPrice,
            status: "PENDING",
            paidAt: null,
            expiresAt,
            metadata: { qrString, merchantName: getMerchantName() },
          },
        });
      }

      return {
        paymentId: payment!.id,
        totals: t,
        qrString: alreadyPaid ? null : qrString,
        expiresAt,
      };
    });

    const order2 = await prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });

    return NextResponse.json({
      order: order2,
      totals: created.totals,
      paymentId: created.paymentId,
      qrString: created.qrString,
      amount: created.totals.totalPrice,
      merchantName: getMerchantName(),
      maskedPromptPayId: maskPromptPayId(promptPayId),
      expiresAt: created.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Settle order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to settle order" },
      { status: 500 },
    );
  }
}
