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
import { recalcOrderTotals, settleOrder, round2 } from "@/lib/orders";
import {
  addPaymentRecord,
  syncPrepaidFromRecords,
  sumCollected,
} from "@/lib/payment-records";

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

    // ---------- 记已付（部分付款 / 定金）----------
    // 落一条**流水**（只增不改），再把 Order.prepaidAmount 重算成流水之和。
    // 防呆：累计不得超过总应付（超出部分拒记，提示线下退款）。
    if (action === "record-prepaid") {
      const amount = round2(Number(body?.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
      }
      const note = body?.note ? String(body.note) : null;

      const result = await runTx(async (tx) => {
        const totals = await recalcOrderTotals(tx, id);
        const curPrepaid = await sumCollected(tx, id);
        const allowed = round2(Math.max(0, totals.totalPrice - curPrepaid));
        if (amount > allowed + 1e-6) {
          return {
            ok: false,
            exceeded: true,
            prepaidAmount: curPrepaid,
            remaining: allowed,
            refundDue: 0,
            message: `最多可再记 ฿${allowed}（总应付 ฿${totals.totalPrice}，已记 ฿${curPrepaid}）`,
          };
        }
        // 首笔记 DEPOSIT，之后算 PARTIAL；结清补差在 confirm / mark-paid 里写 FINAL
        const kind = curPrepaid <= 0 ? "DEPOSIT" : "PARTIAL";
        await addPaymentRecord(tx, {
          orderId: id,
          amount,
          method: method as any,
          kind: kind as any,
          operator: admin.username,
          note,
        });
        const newPrepaid = await syncPrepaidFromRecords(tx, id);
        await tx.order.update({ where: { id }, data: { prepaidNote: note } });
        return {
          ok: true,
          exceeded: false,
          prepaidAmount: newPrepaid,
          remaining: round2(Math.max(0, totals.totalPrice - newPrepaid)),
          refundDue: 0,
          message: `已记 ฿${amount}，累计已付 ฿${newPrepaid}，还需付 ฿${round2(Math.max(0, totals.totalPrice - newPrepaid))}`,
        };
      });

      return NextResponse.json(result);
    }

    // ---------- 退款（现金线下退，系统只留痕）----------
    // 记一条负数流水，实收自动下降。不做自动退款网关，钱由店员当面退。
    if (action === "refund") {
      const amount = round2(Number(body?.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
      }
      const result = await runTx(async (tx) => {
        const curCollected = await sumCollected(tx, id);
        if (amount > curCollected + 1e-6) {
          return {
            ok: false,
            message: `最多可退 ฿${curCollected}（已收合计）`,
            prepaidAmount: curCollected,
            remaining: 0,
            refundDue: 0,
          };
        }
        await addPaymentRecord(tx, {
          orderId: id,
          amount: -amount,
          method: method as any,
          kind: "REFUND" as any,
          operator: admin.username,
          note: body?.note ? String(body.note) : "线下退现",
        });
        const newCollected = await syncPrepaidFromRecords(tx, id);
        const row = await tx.order.findUnique({ where: { id }, select: { totalPrice: true } });
        const total = round2(row?.totalPrice ?? 0);
        return {
          ok: true,
          prepaidAmount: newCollected,
          remaining: round2(Math.max(0, total - newCollected)),
          refundDue: round2(Math.max(0, newCollected - total)),
          message: `已退 ฿${amount}，剩余已收 ฿${newCollected}`,
        };
      });
      return NextResponse.json(result);
    }

    // ---------- 结清 ----------
    if (action === "confirm" || action === "mark-paid") {
      const existingMeta = (await prisma.payment.findUnique({ where: { orderId: id } }))?.metadata as
        | Record<string, unknown>
        | null
        | undefined;
      const stock = await runTx(async (tx) => {
        const totals = await recalcOrderTotals(tx, id);
        // 实收取自流水；预付款上限：已收不得超过总应付（超出部分不记入，需线下退款处理）
        const collected = Math.min(await sumCollected(tx, id), totals.totalPrice);
        const prepaid = collected;
        const remaining = round2(totals.totalPrice - prepaid);
        // 本次补差 > 0 才落 FINAL 流水（避免 0 元流水污染账本）。
        // 这样 006 这类「先付 160、称重后补 120」的单据会有两条清晰流水：DEPOSIT 160 + FINAL 120。
        if (remaining > 0) {
          await addPaymentRecord(tx, {
            orderId: id,
            amount: remaining,
            method: method as any,
            kind: "FINAL" as any,
            operator: admin.username,
            note: action === "mark-paid" ? "结清·直接标记已收" : "结清·补差",
          });
          await syncPrepaidFromRecords(tx, id);
        }
        // 落一张「本次实收」的支付凭证。amount 记 remaining（补差部分），
        // 并带上预付上下文，便于对账（006 这类：已付 160，本次只补差额）。
        await tx.payment.upsert({
          where: { orderId: id },
          create: {
            orderId: id,
            method: method as any,
            amount: remaining,
            currency: "THB",
            status: "SUCCESSFUL",
            paidAt: new Date(),
            metadata: {
              merchantName: getMerchantName(),
              settledBy: admin.username,
              prepaid: totals.totalPrice - remaining,
              totalDue: totals.totalPrice,
            },
          },
          update: {
            method: method as any,
            amount: remaining,
            status: "SUCCESSFUL",
            paidAt: new Date(),
            metadata: {
              ...(existingMeta ?? {}),
              prepaid: totals.totalPrice - remaining,
              totalDue: totals.totalPrice,
            },
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
      const prepaid = Math.min(await sumCollected(tx, id), t.totalPrice);
      const remaining = round2(t.totalPrice - prepaid);
      // 收款码只收「需付」（差额）；若 0 元则不出码（已付满或超额）
      const qrString = remaining > 0 ? generatePromptPayQR(promptPayId, remaining) : "";
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
            amount: remaining,
            currency: "THB",
            status: "PENDING",
            expiresAt,
            metadata: {
              ...(qrString ? { qrString } : {}),
              merchantName: getMerchantName(),
              prepaid,
              totalDue: t.totalPrice,
            },
          },
          update: {
            method: method as any,
            amount: remaining,
            status: "PENDING",
            paidAt: null,
            expiresAt,
            metadata: {
              ...(qrString ? { qrString } : {}),
              merchantName: getMerchantName(),
              prepaid,
              totalDue: t.totalPrice,
            },
          },
        });
      }

      return {
        paymentId: payment!.id,
        totals: t,
        prepaid,
        remaining,
        refundDue: round2(Math.max(0, prepaid - t.totalPrice)),
        qrString: alreadyPaid || remaining <= 0 ? null : qrString,
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
      // 收款码 / 实收金额 = 需付（总应付 − 已付），不是全额
      amount: created.remaining,
      prepaid: created.prepaid,
      refundDue: created.refundDue,
      merchantName: getMerchantName(),
      maskedPromptPayId: maskPromptPayId(promptPayId),
      expiresAt: created.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Settle order error:", error);
    return NextResponse.json(
      { error: "Failed to settle order" },
      { status: 500 },
    );
  }
}
