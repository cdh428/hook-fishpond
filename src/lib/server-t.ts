import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { resolveTicketLocale, type TicketLocale } from "./ticket-locale";

/**
 * 服务端取词（API route / cron / webhook 用）
 * ============================================
 *
 * 规则见 `docs/playbooks/language-consistency.md`：
 *  **用户在哪个语言页面操作，输出/提示就用哪个语言。**
 *
 * API route 不在 `[locale]` 路径段下，next-intl 拿不到请求上下文，
 * 所以必须显式指定 locale —— 由调用方用 {@link requestLocale} 解析后传入。
 *
 * 为什么复用 `messages/*.json` 而不是在服务端另写三套字符串：
 * 前端 `t()` 与服务端 `t()` 读同一份资源，改文案只需改一处，
 * 也不会出现「页面上是 A 说法、报错里是 B 说法」的漂移。
 *
 * ⚠️ 不要在任何 route 里写死 `"zh"` —— 那是 `print/watch` 踩过的坑
 * （详见 `docs/playbooks/print-language.md` 4.1）。
 */
export async function serverT(locale: TicketLocale) {
  return getTranslations({ locale });
}

/**
 * 解析本次请求该用哪个语言。
 *
 * 兜底顺序（与票面语言完全一致，见 `src/lib/ticket-locale.ts`）：
 *  1. 请求体 / query 里显式传的 `locale`
 *  2. `Referer` 路径里的 `/zh|/en|/th` 段（页面发起的请求必带）
 *  3. `Accept-Language` 首选
 *  4. `zh`
 *
 * 能同时读 body 与 query 的场景，先取 body 再取 query，避免 `<a href>` 下载类请求
 * （没有 body，只能走 query）漏掉。
 */
export function requestLocale(params: {
  bodyLocale?: unknown;
  queryLocale?: unknown;
  request?: NextRequest | null;
}): TicketLocale {
  return resolveTicketLocale(
    params.bodyLocale ?? params.queryLocale,
    params.request,
  );
}
