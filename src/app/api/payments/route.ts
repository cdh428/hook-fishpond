import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePromptPayQR, getPromptPayId, getMerchantName, maskPromptPayId } from "@/lib/promptpay";
import { sumCollected, round2 } from "@/lib/payment-records";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, method } = body;

    if (!orderId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: orderId, amount" },
        { status: 400 },
      );
    }

    // Verify the order exists
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    // 收款码只收「需付」= 总应付 − 已付（流水实收）。
    // 首次下单 prepaid=0 时等价于全额；部分付款后自动变成补差额。
    // 与 /api/admin/orders/[id]/settle 的 create 分支保持同一口径，避免两条路径金额打架。
    const prepaid = Math.min(await sumCollected(prisma, orderId), order.totalPrice);
    const remaining = round2(Math.max(0, order.totalPrice - prepaid));

    // Check if a payment already exists for this order
    const existing = await prisma.payment.findUnique({
      where: { orderId },
    });

    if (existing && existing.status !== "FAILED") {
      // Return existing pending/processing payment（金额统一为需付差额）
      const promptPayId = getPromptPayId();
      const qrString =
        remaining > 0 ? generatePromptPayQR(promptPayId, remaining) : "";
      return NextResponse.json({
        paymentId: existing.id,
        qrString,
        amount: remaining,
        prepaid,
        totalDue: order.totalPrice,
        status: existing.status,
        merchantName: getMerchantName(),
        maskedPromptPayId: maskPromptPayId(promptPayId),
        expiresAt: existing.expiresAt?.toISOString() || null,
      });
    }

    // Generate PromptPay QR（需付差额；0 元已付清则不出码）
    const promptPayId = getPromptPayId();
    const qrString =
      remaining > 0 ? generatePromptPayQR(promptPayId, remaining) : "";
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create (or refresh) the payment record for this order.
    // orderId 上有唯一约束，所以这里必须 upsert：既避免失败后重建撞约束，
    // 也能让已经在看支付页的顾客继续用同一个 paymentId。
    const payment = await prisma.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        method: method || "PROMPTPAY",
        amount: remaining,
        currency: "THB",
        status: "PENDING",
        expiresAt,
        metadata: {
          ...(qrString ? { qrString } : {}),
          merchantName: getMerchantName(),
          prepaid,
          totalDue: order.totalPrice,
        },
      },
      update: {
        method: method || "PROMPTPAY",
        amount: remaining,
        status: "PENDING",
        paidAt: null,
        expiresAt,
        metadata: {
          ...(qrString ? { qrString } : {}),
          merchantName: getMerchantName(),
          prepaid,
          totalDue: order.totalPrice,
        },
      },
    });

    return NextResponse.json({
      paymentId: payment.id,
      qrString,
      amount: remaining,
      prepaid,
      totalDue: order.totalPrice,
      status: "PENDING",
      merchantName: getMerchantName(),
      maskedPromptPayId: maskPromptPayId(promptPayId),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { error: "Payment creation failed" },
      { status: 500 },
    );
  }
}
