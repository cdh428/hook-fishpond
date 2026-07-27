/**
 * PromptPay QR Code payload generator (EMVCo standard)
 * Generates a QR string that can be rendered as a QR code
 * for Thai PromptPay payments with optional amount.
 */

// CRC-16/CCITT-FALSE calculation
function crc16(data: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Format a tag with ID, value, and length prefix
function formatTag(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

/**
 * Format Thai phone number for PromptPay
 * Input: 0812345678 or 081-234-5678
 * Output: 0066XXXXXXXXX (13 digits)
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  // Remove leading 0 and add 66 (Thailand country code)
  if (cleaned.startsWith('0')) {
    cleaned = '66' + cleaned.substring(1);
  } else if (cleaned.startsWith('66')) {
    // Already has country code
  } else {
    cleaned = '66' + cleaned;
  }
  // Pad to 13 digits with leading zeros
  return cleaned.padStart(13, '0');
}

/**
 * Format national ID for PromptPay
 * Input: 1234567890123
 * Output: 1234567890123 (13 digits)
 */
function formatNationalId(id: string): string {
  return id.replace(/\D/g, '').padStart(13, '0');
}

/**
 * Generate PromptPay QR payload string
 * @param target - Phone number or National ID
 * @param amount - Amount in THB (optional, 0 for static QR)
 * @param targetType - 'phone' | 'nid' (default: 'phone')
 */
export function generatePromptPayPayload(
  target: string,
  amount?: number,
  targetType: 'phone' | 'nid' = 'phone'
): string {
  // Format the target
  const formattedTarget =
    targetType === 'nid' ? formatNationalId(target) : formatPhoneNumber(target);

  // Build Merchant Account Information (Tag 29)
  const merchantAccountInfo =
    formatTag('00', 'A000000677010111') + // Application ID for PromptPay
    formatTag(targetType === 'nid' ? '02' : '01', formattedTarget); // Target (01=phone, 02=national ID)

  // Build payload
  let payload = '';
  payload += formatTag('00', '01'); // Payload Format Indicator
  payload += formatTag('01', amount && amount > 0 ? '12' : '11'); // Point of Initiation Method (12=dynamic, 11=static)
  payload += formatTag('29', merchantAccountInfo); // Merchant Account Information
  payload += formatTag('53', '764'); // Currency Code (764 = THB)

  // Add amount if provided and > 0
  if (amount && amount > 0) {
    payload += formatTag('54', amount.toFixed(2)); // Transaction Amount
  }

  payload += formatTag('58', 'TH'); // Country Code

  // Add CRC (Tag 63) - calculate CRC over the payload + tag 63 length placeholder
  const crcTag = '6304'; // Tag 63, length 04
  const crcString = payload + crcTag;
  const crcValue = crc16(crcString);
  payload += formatTag('63', crcValue);

  return payload;
}
