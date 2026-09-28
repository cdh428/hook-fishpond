/**
 * 站点级常量：**生产标识的唯一真相**。
 *
 * 为什么单独抽一个文件：`canonical` / `og:url` / 分享链接必须都指向**同一个绝对地址**。
 * 之前 `src/app/layout.tsx` 只有 `title` + `description`，页面 HTML 里一个绝对 URL 都没有
 * —— 于是 Google 可能把旧的 `*.vercel.app` 当正主（这与商家资料「两个地址」是同一类病）。
 *
 * ⚠️ 以后再需要「站点绝对地址」，一律从这里取，**别再写死域名**。
 */

function resolveSiteUrl(): string {
  // Vercel Preview 部署：用它自己的域名，避免预览页把 canonical 指到生产域
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://hookfishpond.com'
  );
}

/** 站点绝对地址（已去掉尾斜杠） */
export const SITE_URL = resolveSiteUrl().replace(/\/+$/, '');

/**
 * 对外品牌名。
 *
 * ⚠️ 品牌名目前在四个地方写法不一致：Google 商家资料 `Hook the Happyness` /
 * FB 主页 `Hookhappyness` / 网站英文站名 `Happy Fishing Pond` / 中文 `乐钓鱼塘`。
 * 这里暂定 `Hook Happyness`（泰文别名 `ฮุค เดอะ แฮปปี้เนส`），**待确认实体招牌写法后再统一**。
 *
 * 只用于 OS / PWA 层面的应用名，不参与页面正文，因此不会制造新的**可见**差异。
 */
export const BRAND_NAME = 'Hook Happyness';

/**
 * 公开分享卡片主图。
 * ⚠️ 必须是**已入库**的文件，否则生产 404 —— `public/media/_endcard-*.jpg` 在 `.gitignore` 里，别用。
 */
export const OG_IMAGE = {
  url: '/media/hero-01-sunset.jpg',
  width: 1920,
  height: 1080,
} as const;

/** 语言 → Open Graph locale */
export const OG_LOCALE: Record<string, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  th: 'th_TH',
};
