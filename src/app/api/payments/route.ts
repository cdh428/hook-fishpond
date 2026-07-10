import { NextRequest, NextResponse } from 'next/server';
import { createPayment, mapPaymentMethod } from '@/lib/omise';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, method, orderId, phoneNumber, cardToken } = body;

    if (!amount || !method || !orderId) {
      return NextResponse.json(
        { error: 'Missing required fields: amount, method, orderId' },
        { status: 400 },
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const returnUri = `${baseUrl}/zh/orders?payment=complete&orderId=${orderId}`;

    const charge = await createPayment({
      amount: Math.round(amount * 100), // Convert to satang
      method: mapPaymentMethod(method),
      returnUri,
      phoneNumber,
      cardToken,
      metadata: {
        orderId,
      },
    });

    return NextResponse.json({
      chargeId: charge.id,
      status: charge.status,
      authorizeUri: charge.authorize_uri, // Redirect URL for 3DS / QR code
      source: charge.source,
    });
  } catch (error: any) {
    console.error('Payment error:', error);
    return NextResponse.json(
      { error: error.message || 'Payment creation failed' },
      { status: 500 },
    );
  }
}
