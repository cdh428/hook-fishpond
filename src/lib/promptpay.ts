/**
 * PromptPay QR Code Generator (EMVCo Standard)
 *
 * Generates a valid PromptPay QR string that works with all Thai banking apps
 * (BBL, KBank, SCB, Krungsri, etc.). No API key or payment gateway required.
 *
 * The QR follows the EMVCo QR Code Specification for Merchant-Presented Mode.
 * Reference: Bank of Thailand PromptPay standard
 */

/**
 * Generate PromptPay QR payload string.
 *
 * @param promptPayId - Phone number (e.g., "0812345678") or Tax/National ID (13 digits)
 * @param amount - Amount in THB (e.g., 100.50)
 * @returns EMVCo QR string ready to be rendered as a QR code
 */
export function generatePromptPayQR(
  promptPayId: string,
  amount: number,
): string {
  const sanitized = promptPayId.replace(/\D/g, "");

  // Determine if it's a phone number (starts with 0, 9-10 digits) or Tax ID (13 digits)
  let idType: string;
  let formattedId: string;

  if (sanitized.length === 13) {
    // Tax ID / National ID — use as-is
    idType = "02"; // National ID / Tax ID
    formattedId = sanitized;
  } else {
    // Phone number — convert to international format (0066XXXXXXXXX)
    idType = "01"; // Phone number
    const phoneWithoutLeading0 = sanitized.replace(/^0+/, "");
    formattedId = `0066${phoneWithoutLeading0}`;
    // Pad to ensure at least 13 characters
    while (formattedId.length < 13) {
      formattedId = `0${formattedId}`;
    }
  }

  // Build the merchant account information (Tag 29)
  const applicationId = "A000000677010111";
  const merchantAccount = `${tag("00", applicationId)}${tag(idType, formattedId)}`;
  const merchantAccountField = tag("29", merchantAccount);

  // Build payload fields
  const payloadFormat = tag("00", "01"); // Payload format indicator
  const pointOfInitiation = tag("01", "12"); // 12 = dynamic (with amount)
  const currency = tag("53", "764"); // 764 = THB
  const amountStr = amount.toFixed(2);
  const amountField = tag("54", amountStr);
  const countryCode = tag("58", "TH");

  // Combine all fields (without CRC)
  const payloadWithoutCrc =
    payloadFormat +
    pointOfInitiation +
    merchantAccountField +
    currency +
    amountField +
    countryCode +
    "6304"; // Tag 63, length 04 (CRC placeholder)

  // Calculate CRC16-CCITT-FALSE
  const crc = crc16(payloadWithoutCrc);
  const crcHex = crc.toString(16).toUpperCase().padStart(4, "0");

  return payloadWithoutCrc + crcHex;
}

/**
 * Create an EMVCo TLV tag.
 * Format: TTLLVV (Tag + Length + Value)
 */
function tag(tagId: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${tagId}${length}${value}`;
}

/**
 * CRC16-CCITT-FALSE calculation.
 * - Initial value: 0xFFFF
 * - Polynomial: 0x1021
 * - No input/output reflection
 */
function crc16(data: string): number {
  let crc = 0xffff;

  for (let i = 0; i < data.length; i++) {
    const byte = data.charCodeAt(i);
    crc ^= byte << 8;

    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }

  return crc;
}

/**
 * Get the configured PromptPay ID from environment.
 * Set PROMPTPAY_ID in .env.local or Vercel env.
 * This should be the fishpond's registered phone number or Tax ID.
 */
export function getPromptPayId(): string {
  return (
    process.env.PROMPTPAY_ID ||
    process.env.NEXT_PUBLIC_PROMPTPAY_ID ||
    "0812345678" // Default placeholder — replace with real PromptPay ID
  );
}

/**
 * Get the merchant display name for the QR.
 */
export function getMerchantName(): string {
  return process.env.PROMPTPAY_MERCHANT_NAME || "Hook Fishpond";
}

/**
 * Mask the PromptPay ID for display to customers.
 * Phone: 0616958324 → 061***8324
 * Tax ID: 1234567890123 → 1234****90123
 *
 * @param promptPayId - The full PromptPay ID (phone or tax ID)
 * @returns Masked string safe for customer display
 */
export function maskPromptPayId(promptPayId: string): string {
  const sanitized = promptPayId.replace(/\D/g, "");

  if (sanitized.length === 13) {
    // Tax ID: show first 4 and last 5 digits
    return `${sanitized.slice(0, 4)}****${sanitized.slice(-5)}`;
  }

  // Phone number: show first 3 and last 4 digits
  if (sanitized.length >= 9) {
    return `${sanitized.slice(0, 3)}***${sanitized.slice(-4)}`;
  }

  return "***";
}
