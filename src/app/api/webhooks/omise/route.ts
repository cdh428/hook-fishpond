import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Omise Webhook Handler
 *
 * Omise sends webhooks for payment events:
 * - charge.complete: Payment successful
 * - charge.create: Charge created
 * - charge.update: Charge status updated
 *
 * Configure webhook URL in Omise dashboard:
 * https://yourdomain.com/api/webhooks/omise
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, data } = body;

    console.log("Omise webhook received:", key, data?.id);

    switch (key) {
      case "charge.complete": {
        const chargeId = data.id;
        const status = data.status; // 'successful' or 'failed'
        const metadata = data.metadata || {};
        const orderId = metadata.orderId;

        if (status === "successful" && orderId) {
          // Update order status to PAID
          await prisma.order.updateMany({
            where: { id: orderId },
            data: { status: "PAID" },
          });

          // Update payment status to SUCCESSFUL
          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: "SUCCESSFUL", paidAt: new Date() },
          });

          console.log(`Order ${orderId} payment successful`);
        } else if (status === "failed") {
          // Update payment status to failed
          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: "FAILED" },
          });

          console.log(`Order ${orderId} payment failed`);
        }
        break;
      }

      default:
        console.log("Unhandled webhook event:", key);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
