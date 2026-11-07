import type { NextRequest } from "next/server";

/**
 * 票面语言解析（下单时记录，自动出单时使用）
 * ==========================================
 *
 * 规则见 `docs/playbooks/print-language.md`：
 *  1. 前端显式传 `body.locale` 最可信；
 *  2. 没传就从 `Referer` 的 `/zh|/en|/th` 路径段推断（顾客端页面总是带 locale 前缀）；
 *  3. 再不行看 `Accept-Language`；
 *  4. 全都没有 ⇒ `zh`（中文是本项目的默认语，且下单人通常是老板/店员）。
 *
 * ⚠️ 永远返回合法值，不返回 null —— Order.locale 为空表示「历史单」，
 * 只有字段上线前创建的单才应为空，新单一律写入。
 */
export type TicketLocale = "zh" | "en" | "th";

export function normalizeLocale(v: unknown): TicketLocale | null {
  const s = String(v || "").slice(0, 2).toLowerCase();
  return s === "zh" || s === "en" || s === "th" ? (s as TicketLocale) : null;
}

/** 从 Referer 路径里提取 locale（如 https://x.com/th/menu → th） */
function fromReferer(request?: NextRequest | null): TicketLocale | null {
  try {
    const ref = request?.headers.get("referer") || "";
    if (!ref) return null;
    const m = new URL(ref).pathname.match(/^\/(zh|en|th)(\/|$)/);
    return m ? (m[1] as TicketLocale) : null;
  } catch {
    return null;
  }
}

/** 从 Accept-Language 里提取（只认第一优先语言） */
function fromAcceptLanguage(request?: NextRequest | null): TicketLocale | null {
  const al = request?.headers.get("accept-language") || "";
  const first = al.split(",")[0]?.trim().toLowerCase() || "";
  return normalizeLocale(first);
}

export function resolveTicketLocale(
  bodyLocale: unknown,
  request?: NextRequest | null,
): TicketLocale {
  return (
    normalizeLocale(bodyLocale) ||
    fromReferer(request) ||
    fromAcceptLanguage(request) ||
    "zh"
  );
}
