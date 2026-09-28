import type { Metadata } from 'next';
import './globals.css';
import { BRAND_NAME, SITE_URL } from '@/lib/site';

/**
 * 全站 metadata 底座。
 *
 * - `metadataBase`：下面所有相对 URL（canonical / og:url / og:image）都基于它解析。
 *   这是「让 hookfishpond.com 当正主」的关键一步 —— 没有它，页面 HTML 里不会出现任何绝对 URL。
 * - `title.default`：没有更具体 title 的路由（如 `/t/[code]`）用的兜底标题。
 *   `/[locale]` 会用 `generateMetadata` 覆盖成本地化标题。
 * - `icons`：`public/` 下没有 `favicon.ico`，所以显式指向已入库的品牌徽标。
 *
 * ⚠️ **不要**在这里再导出 `viewport`：`HtmlShell` 已经手写了 `<meta name="viewport">`，
 *    两处并存会产生重复标签。
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: BRAND_NAME,
  title: 'Hook Happyness | 乐钓鱼塘 | บ่อตกปลาแฮปปี้',
  description: 'Book fishing spots, order food & drinks',
  icons: {
    icon: [
      { url: '/media/brand-logo-256.png', type: 'image/png', sizes: '256x256' },
      { url: '/media/brand-logo-640.png', type: 'image/png', sizes: '640x640' },
    ],
    apple: [{ url: '/media/brand-logo-256.png', type: 'image/png', sizes: '256x256' }],
  },
  // 泰国手机号不是北美格式，别让 iOS 把地址/数字自动变成链接
  formatDetection: { telephone: false, address: false, email: false },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
