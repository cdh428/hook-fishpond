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

    // Generate PromptPay QR
    const promptPayId = getPromptPayId();
    const qrString = generatePromptPayQR(promptPayId, order.totalPrice);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        method: method || "PROMPTPAY",
        amount: order.totalPrice,
        currency: "THB",
        status: "PENDING",
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
