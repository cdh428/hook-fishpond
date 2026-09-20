import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePromptPayQR, getPromptPayId, getMerchantName, maskPromptPayId } from "@/lib/promptpay";

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

    // Check if a payment already exists for this order
    const existing = await prisma.payment.findUnique({
      where: { orderId },
    });

    if (existing && existing.status !== "FAILED") {
      // Return existing pending/processing payment
      const promptPayId = getPromptPayId();
      const qrString = generatePromptPayQR(promptPayId, order.totalPrice);
      return NextResponse.json({
        paymentId: existing.id,
        qrString,
        amount: order.totalPrice,
        status: existing.status,
        merchantName: getMerchantName(),
        maskedPromptPayId: maskPromptPayId(promptPayId),
        expiresAt: existing.expiresAt?.toISOString() || null,
      });
    }

    // Generate PromptPay QR（金额取订单应付净额，含渔获、已扣折扣）
    const promptPayId = getPromptPayId();
    const qrString = generatePromptPayQR(promptPayId, order.totalPrice);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create (or refresh) the payment record for this order.
    // orderId 上有唯一约束，所以这里必须 upsert：既避免失败后重建撞约束，
    // 也能让已经在看支付页的顾客继续用同一个 paymentId。
    const payment = await prisma.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        method: method || "PROMPTPAY",
        amount: order.totalPrice,
        currency: "THB",
        status: "PENDING",
        expiresAt,
        metadata: { qrString, merchantName: getMerchantName() },
      },
      update: {
        method: method || "PROMPTPAY",
        amount: order.totalPrice,
        status: "PENDING",
        paidAt: null,
        expiresAt,
        metadata: { qrString, merchantName: getMerchantName() },
      },
    });

    return NextResponse.json({
      paymentId: payment.id,
      qrString,
      amount: order.totalPrice,
      status: "PENDING",
      merchantName: getMerchantName(),
      maskedPromptPayId: maskPromptPayId(promptPayId),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { error: error.message || "Payment creation failed" },
      { status: 500 },
    );
  }
}
