import { NextRequest, NextResponse } from 'next/server';

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

    console.log('Omise webhook received:', key, data?.id);

    switch (key) {
      case 'charge.complete': {
        const chargeId = data.id;
        const status = data.status; // 'successful' or 'failed'
        const metadata = data.metadata || {};
        const orderId = metadata.orderId;

        if (status === 'successful' && orderId) {
          // TODO: Update order status in database
          // await prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
          // await prisma.payment.update({ where: { orderId }, data: { status: 'SUCCESSFUL', paidAt: new Date() } });
          console.log(`Order ${orderId} payment successful`);
        } else if (status === 'failed') {
          // TODO: Update payment status to failed
          // await prisma.payment.update({ where: { orderId }, data: { status: 'FAILED' } });
          console.log(`Order ${orderId} payment failed`);
        }
        break;
      }

      default:
        console.log('Unhandled webhook event:', key);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
