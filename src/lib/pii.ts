/**
 * PII 遮罩工具。
 *
 * 用途：对**没有充分授权**的读取路径，把手机号这类可识别信息遮掉。
 * 原则：内部（管理员、本人）拿完整值；持有「能力 URL」（订单 cuid、支付 id）的
 * 匿名访问者只拿到遮罩值 —— 链接被转发/截图时不会连带泄漏手机号。
 */

/** `0812345678` → `081****678`；长度不足时退化为全星号 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const s = String(phone).trim();
  if (s.length <= 4) return "*".repeat(s.length);
  if (s.length <= 7) return s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2);
  return s.slice(0, 3) + "*".repeat(s.length - 6) + s.slice(-3);
}
