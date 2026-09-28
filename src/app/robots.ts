import type { MetadataRoute } from 'next';

import { locales } from '@/i18n/config';
import { SITE_URL } from '@/lib/site';

/**
 * 不参与索引的路径。
 * - `admin`：后台，在登录门后面，没有任何索引价值
 * - `cart` / `payment` / `orders` / `profile`：用户私有流程页，内容因人而异
 *
 * 要索引的是首页 / 菜单 / 预约 / 规则 / 关于那几个「给客人和搜索看的」页面，
 * 它们由 `sitemap.ts` 列出。
 */
const PRIVATE_PATHS = [
  'admin',
  'cart',
  'payment',
  'orders',
  'profile',
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // 接口一律不索引
          '/api/',
          // 餐桌扫码短链：内容由 code 决定，会与首页高度重复
          '/t/',
          // 上面那些私有页在每种语言下各有一条（`/zh/admin`、`/en/cart` …）
          ...locales.flatMap((locale) =>
            PRIVATE_PATHS.map((path) => `/${locale}/${path}`),
          ),
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
