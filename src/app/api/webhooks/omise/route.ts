import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { consumeReservation } from "@/lib/stock";
import { settleOrder } from "@/lib/orders";

/**
 * Omise Webhook Handler
 *
 * Omise sends webhooks for payment events:
 * - charge.complete: Payment successful
 * - charge.create: Charge created
 * - charge.update: Charge status updated
 *
 * Configure webhook URL in Omise dashboard:
 *   https://yourdomain.com/api/webhooks/omise
 *
 * ## 安全与账务（2026-09-20 重写）
 *
 * 1. **必须先配置 `OMISE_WEBHOOK_SECRET`，否则本接口直接停用（503）。**
 *    原先任何匿名请求都能把订单改成 PAID、把支付单改成 SUCCESSFUL ——
 *    既能伪造收款，也不扣库存。
 *    仅配 `OMISE_SECRET_KEY`（那只是出站调用用的）**不足以**放行本接口，
 *    因为 Omise 的 webhook 请求本身没有可验证的签名。
 *    启用后请求必须带 `?token=xxx` 或 `x-omise-webhook-secret: xxx`。
 *
 * 2. **收款成功必须走结算引擎。**
 *    以前这里只写 `status = "PAID"`，而 PAID 的订单在后台被当作「进行中」，
 *    没人再去结清 → 卖出去了、库存永远不扣。
 *    现在统一走 `consumeReservation`（先付）/ `settleOrder`（后付），
 *    与收银台结清是同一条路径、同一套幂等。
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.OMISE_WEBHOOK_SECRET;

    if (!secret) {
      // 未配置回调密钥 —— 关掉写入口，避免成为匿名的订单状态后门
      return NextResponse.json(
        {
          error:
            "Omise webhook is disabled: set OMISE_WEBHOOK_SECRET to enable it",
        },
        { status: 503 },
      );
    }

    const token =
      new URL(request.url).searchParams.get("token") ||
      request.headers.get("x-omise-webhook-secret") ||
      "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { key, data } = body;

    console.log("Omise webhook received:", key, data?.id);

    switch (key) {
      case "charge.complete": {
        const status = data.status; // 'successful' | 'failed'
        const orderId = data.metadata?.orderId;

        if (!orderId) break;

        if (status === "successful") {
          await runTx(async (tx) => {
            const order = await tx.order.findUnique({
              where: { id: orderId },
              select: { settlementMode: true, status: true },
            });
            if (!order || order.status === "CANCELLED") return;

            await tx.payment.updateMany({
              where: { orderId },
              data: { status: "SUCCESSFUL", paidAt: new Date() },
            });

            if (order.settlementMode === "PREPAID") {
              // 先付：付款到账即把预占转为正式出库，后厨流程照常
              await consumeReservation(tx, orderId);
            } else {
              // 后付：这一步就是结清（含库存过账）
              await settleOrder(tx, orderId);
            }
          });

          console.log(`Order ${orderId} payment successful (stock posted)`);
        } else if (status === "failed") {
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
