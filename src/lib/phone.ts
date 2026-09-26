/**
 * 电话号码规范化 / 校验。
 *
 * 背景：顾客身份就是手机号，之前接口对入参**零校验** ——
 * 任何字符串（超长串、乱码、带引号的东西）都会被当成手机号写进库，
 * 既产生垃圾数据，又让对方可以拿任意字符串去试探「这个号存不存在」。
 *
 * 策略：**宽松但收敛**。只做两件事，不追求完整性校验：
 *  1. 去掉空格 / 连字符 / 括号（泰国人习惯写 `081-234-5678`）
 *  2. 长度限制在 8–15 位数字，允许一个前导 `+`
 * 这样既能挡住垃圾输入，又不会把任何真实号码挡在门外
 * （本地号码 0XXXXXXXXX、国际 +66XXXXXXXXX 都过）。
 */

export interface PhoneCheck {
  ok: boolean;
  /** 规范化后的值（去掉了分隔符） */
  value: string;
  /** 不合法时的机器可读原因，便于前端映射三语 */
  reason?: "EMPTY" | "BAD_FORMAT";
}

export function normalizePhone(input: unknown): PhoneCheck {
  if (input === null || input === undefined) {
    return { ok: false, value: "", reason: "EMPTY" };
  }
  const raw = String(input).trim();
  if (!raw) return { ok: false, value: "", reason: "EMPTY" };

  // 保留前导 +，其余分隔符一律去掉
  const plus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  const value = plus ? `+${digits}` : digits;

  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, value, reason: "BAD_FORMAT" };
  }
  return { ok: true, value };
}
