import type { MetadataRoute } from 'next';

import { locales } from '@/i18n/config';
import { SITE_URL } from '@/lib/site';

/**
 * 进 sitemap 的只有「对外可见、内容对搜索有用」的页面。
 *
 * 刻意排除：`/admin`（后台）、`/cart` `/payment` `/orders` `/profile`（用户私有流程页）、
 * `/t/<code>`（餐桌短链，动态且会与首页重复）。不在这里列出的页面同时也被
 * `robots.ts` 挡在索引之外 —— 两处应当保持一致。
 *
 * 刻意**不写 `lastModified`**：这里拿不到每页真实的最后修改时间，用构建时间冒充会让
 * `<lastmod>` 每次部署都变，那是给爬虫制造噪音，不如不给。
 */
const PAGES = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/menu', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/booking', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/pond-rules', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) =>
    PAGES.map((page) => ({
      url: `${SITE_URL}/${locale}${page.path}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      // 每页都带上其余语言版本：这是 sitemap 里被 Google 认真看的那部分
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${SITE_URL}/${l}${page.path}`]),
        ),
      },
    })),
  );
}
