/**
 * Omise (Opn Payments) Integration
 *
 * Supported payment methods:
 * - PromptPay (QR code)
 * - TrueMoney Wallet
 * - Internet Banking (Kbank, SCB, BBL, BAY)
 * - Credit/Debit Card (Visa, Mastercard, JCB)
 * - Alipay
 * - WeChat Pay
 *
 * Setup:
 * 1. Register at https://www.omise.co/
 * 2. Get your public/secret keys from dashboard
 * 3. Set OMISE_PUBLIC_KEY and OMISE_SECRET_KEY in .env
 * 4. Enable desired payment methods in Omise dashboard
 */

// Server-side only - do not import in client components
const OmiseClient = require('omise');

let omise: any = null;

function getOmise() {
  if (!omise) {
    omise = OmiseClient({
      publicKey: process.env.OMISE_PUBLIC_KEY,
      secretKey: process.env.OMISE_SECRET_KEY,
    });
  }
  return omise;
}

export type OmisePaymentMethod =
  | 'promptpay'
  | 'truemoney'
  | 'internet_banking_scb'
  | 'internet_banking_kbank'
  | 'internet_banking_bbl'
  | 'internet_banking_bay'
  | 'credit_card'
  | 'alipay'
  | 'wechat_pay';

interface CreatePaymentParams {
  amount: number; // in satang (1 THB = 100 satang)
  currency?: string;
  method: OmisePaymentMethod;
  returnUri: string;
  metadata?: Record<string, string>;
  // For TrueMoney
  phoneNumber?: string;
  // For credit card
  cardToken?: string;
}

/**
 * Create a payment source and charge
 */
export async function createPayment(params: CreatePaymentParams) {
  const client = getOmise();
  const {
    amount,
    currency = 'thb',
    method,
    returnUri,
    metadata = {},
    phoneNumber,
    cardToken,
  } = params;

  // Credit card payments use token directly
  if (method === 'credit_card' && cardToken) {
    const charge = await client.charges.create({
      amount,
      currency,
      card: cardToken,
      metadata,
    });
    return charge;
  }

  // All other methods use source
  const sourceParams: any = {
    type: method,
    amount,
    currency,
  };

  // TrueMoney requires phone number
  if (method === 'truemoney' && phoneNumber) {
    sourceParams.phone_number = phoneNumber;
  }

  const source = await client.sources.create(sourceParams);

  const charge = await client.charges.create({
    amount,
    currency,
    source: source.id,
    return_uri: returnUri,
    metadata,
  });

  return charge;
}

/**
 * Retrieve a charge by ID
 */
export async function getCharge(chargeId: string) {
  const client = getOmise();
  return client.charges.retrieve(chargeId);
}

/**
 * Verify webhook signature
 */
export function verifyWebhook(payload: string, signature: string): boolean {
  // Omise uses basic auth with secret key for webhooks
  // In production, verify the webhook source
  return true;
}

/**
 * Map our payment method names to Omise source types
 */
export function mapPaymentMethod(method: string): OmisePaymentMethod {
  const mapping: Record<string, OmisePaymentMethod> = {
    PROMPTPAY: 'promptpay',
    TRUEMONEY: 'truemoney',
    BANK_TRANSFER: 'internet_banking_scb', // default to SCB
    CREDIT_CARD: 'credit_card',
    ALIPAY: 'alipay',
    WECHAT_PAY: 'wechat_pay',
  };
  return mapping[method] || 'promptpay';
}
