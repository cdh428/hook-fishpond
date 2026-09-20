import { cookies, headers } from 'next/headers';
import { locales, defaultLocale, type Locale } from './config';

/**
 * 语言探测。「/[locale]/*」路由的语言来自 URL 段，但「/t/[code]」
 * （桌上二维码落地页）没有语言段，必须自己判断：
 *   Cookie(NEXT_LOCALE) → Accept-Language → 默认 zh
 *
 * 注意：本场馆在泰国，所以 Accept-Language 里泰语优先级最高。
 */
export function pickLocale(
  acceptLanguage: string | null,
  cookieLocale?: string,
): Locale {
  if (cookieLocale && (locales as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as Locale;
  }

  if (acceptLanguage) {
    const lower = acceptLanguage.toLowerCase();
    if (lower.includes('th')) return 'th';
    if (lower.includes('en')) return 'en';
    if (lower.includes('zh')) return 'zh';
  }

  return defaultLocale;
}

/** 从当前请求（Cookie + 请求头）判断语言 */
export async function detectRequestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return pickLocale(
    headerStore.get('accept-language'),
    cookieStore.get('NEXT_LOCALE')?.value,
  );
}
