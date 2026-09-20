/**
 * 全站 HTML 外壳（<html> / <head> / <body>）。
 *
 * 抽出来的原因：`/[locale]/layout.tsx` 与 `/t/[code]/layout.tsx` 都需要
 * 同一套「语言 → 字体 + <html lang>」逻辑。以前 `[locale]` 那份是内联的，
 * 而 `/t/[code]` 因为不在 `[locale]` 下，**既没有 lang 也没有泰文字体类**，
 * 于是泰文页面用了中文字体渲染——这类"看起来不对"的问题就是从这里来的。
 */
export const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;700&family=Sarabun:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap';

/** 语言 → 字体类（globals.css 里定义 font-th / font-zh / font-sans） */
export function fontClassFor(locale: string) {
  return locale === 'th' ? 'font-th' : locale === 'zh' ? 'font-zh' : 'font-sans';
}

export default function HtmlShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <html lang={locale} dir="ltr">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <link href={FONT_HREF} rel="stylesheet" />
      </head>
      <body className={`${fontClassFor(locale)} bg-bg-page text-neutral-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
