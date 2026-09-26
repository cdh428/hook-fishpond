/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * 安全响应头（2026-09-26 新增）。
 *
 * 只加**不会影响页面加载**的项：
 *  - `frame-ancestors 'none'` + `X-Frame-Options: DENY` → 防点击劫持
 *    （后台有「确认结算 / 作废分录」这类按钮，被 iframe 套住诱导点击是真风险）
 *  - `base-uri 'self'` → 防注入 `<base>` 改写相对链接
 *  - `form-action 'self'` → 防表单被改投外站
 *  - `object-src 'none'` → 关掉 plugin 类老攻击面
 *
 * ⚠️ 故意**不加** `script-src` / `style-src`：Next.js 的水合脚本是内联的，
 * 没有 nonce 的严格 CSP 会直接把站点打挂。要上完整 CSP 需要先接 nonce，
 * 那是另一件事，别顺手加。
 *
 * ⚠️ `connect-src` 也不能加：收银台的静默打印要从前端 fetch 到
 * `http://127.0.0.1:<port>` 的本地打印桥（见 skill `windows-thermal-printer-bridge`），
 * 加了就会把打印打断。
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig = {
  // 不再对外宣告技术栈（少一个版本指纹就少一个针对性扫描的理由）
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
