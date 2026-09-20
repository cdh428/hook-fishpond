import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import { generatePromptPayQR, getPromptPayId, maskPromptPayId } from "@/lib/promptpay";
import { consumeReservation } from "@/lib/stock";
import { settleOrder } from "@/lib/orders";

// Neon(us-east-2) ← 泰国：往返延迟较高，放宽函数执行上限
export const maxDuration = 60;

// GET — check payment status (public, used by payment page polling)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            items: { include: { menuItem: true } },
            bookings: { include: { pond: true, spot: true } },
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Check if payment has expired
    if (payment.status === "PENDING" && payment.expiresAt) {
      const now = new Date();
      if (now > payment.expiresAt) {
        await prisma.payment.update({
          where: { id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({
          ...payment,
          status: "FAILED",
          expired: true,
        });
      }
    }

    // Re-generate QR string if it was in metadata (for display)
    const qrString =
      (payment.metadata as any)?.qrString ||
      generatePromptPayQR(getPromptPayId(), payment.amount);

    return NextResponse.json({
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      qrString,
      maskedPromptPayId: maskPromptPayId(getPromptPayId()),
      expiresAt: payment.expiresAt?.toISOString() || null,
      paidAt: payment.paidAt?.toISOString() || null,
      order: payment.order
        ? {
            id: payment.order.id,
            orderNumber: payment.order.orderNumber,
            customerName: payment.order.customerName,
            customerPhone: payment.order.customerPhone,
            items: payment.order.items.map((it) => ({
              name_zh: it.menuItem.name_zh,
              name_en: it.menuItem.name_en,
              name_th: it.menuItem.name_th,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
            })),
            bookings: payment.order.bookings.map((b) => ({
              pondName_zh: b.pond?.name_zh,
              pondName_en: b.pond?.name_en,
              pondName_th: b.pond?.name_th,
              date: b.date,
              timeSlot: b.timeSlot,
              spotNumber: b.spot?.number,
              totalPrice: b.totalPrice,
            })),
          }
        : null,
    });
  } catch (error: any) {
    console.error("Get payment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get payment" },
      { status: 500 },
    );
  }
}

// PUT — user confirms payment ("I've paid") or admin confirms/rejects
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body; // "user_confirm" | "admin_confirm" | "admin_reject"

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (action === "user_confirm") {
      // User clicks "I've paid" — mark as PROCESSING (waiting for verification)
      if (payment.status !== "PENDING") {
        return NextResponse.json(
          { error: "Payment is not in pending state" },
          { status: 400 },
        );
      }
      const updated = await prisma.payment.update({
        where: { id },
        data: { status: "PROCESSING" },
      });
      return NextResponse.json({ status: updated.status });
    }

    if (action === "admin_confirm") {
      // Admin confirms payment received
      const admin = await requireAdmin(request);
      if (!admin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const result = await runTx(async (tx) => {
        const p = await tx.payment.update({
          where: { id },
          data: {
            status: "SUCCESSFUL",
            paidAt: new Date(),
          },
        });

        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          select: { settlementMode: true },
        });

        let stock = { consumed: 0, healed: 0 };
        if (order?.settlementMode === "PREPAID") {
          // 先付订单：付款到账即把「预占」转为正式库存扣减，后厨流程照常继续
          stock = await consumeReservation(tx, payment.orderId, {
            adminName: admin.username,
          });
        } else {
          // 后付订单：这一步就是结清
          stock = await settleOrder(tx, payment.orderId, {
            adminName: admin.username,
          });
        }

        return { payment: p, stock };
      });
      return NextResponse.json({ status: result.payment.status, stock: result.stock });
    }

    if (action === "admin_reject") {
      // Admin rejects payment
      const admin = await requireAdmin(request);
      if (!admin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const updated = await prisma.payment.update({
        where: { id },
        data: { status: "FAILED" },
      });
      return NextResponse.json({ status: updated.status });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Update payment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update payment" },
      { status: 500 },
    );
  }
}
