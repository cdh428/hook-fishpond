import HtmlShell from '@/components/layout/HtmlShell';
import { detectRequestLocale } from '@/i18n/detect-locale';

/**
 * 桌码落地页的外壳。
 *
 * `/t/[code]` 不在 `/[locale]` 之下，拿不到那边的布局，所以这里必须自己
 * 提供 <html>/<body> —— 否则 `<html lang>` 与泰文字体类都会缺失，
 * 泰文客人扫桌上二维码时会看到用中文字体渲染的泰文。
 */
export default async function TableLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await detectRequestLocale();

  return <HtmlShell locale={locale}>{children}</HtmlShell>;
}
