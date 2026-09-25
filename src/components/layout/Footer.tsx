'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { LOGO } from '@/lib/media';

const FACEBOOK_URL = 'https://www.facebook.com/Hookhappyness';
const LINE_URL = 'https://line.me/R/ti/p/@300bsham';

/**
 * 站内页脚。
 *
 * ⚠️ 这里**只放已经确认过的信息**（营业时间来自业务规则、FB / LINE 来自品牌资料）。
 *    地址与电话尚未确认，故意留空 —— 拿到准确信息再补，别填占位符。
 */
export default function Footer() {
  const t = useTranslations();
  const pathname = usePathname();

  // 与 BottomNav 同一条硬规则：后台不渲染顾客页脚
  if (pathname.startsWith('/admin')) return null;

  return (
    <footer className="mt-8 bg-primary-900 px-4 pb-24 pt-8 text-primary-100">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO.png256}
            alt={t('common.siteName')}
            width={256}
            height={256}
            loading="lazy"
            className="h-14 w-14 rounded-full ring-2 ring-primary-700/60"
          />
          <div>
            <div className="text-base font-bold text-white">{t('common.siteName')}</div>
            <div className="text-xs text-primary-200/80">{t('footer.tagline')}</div>
          </div>
        </div>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-primary-300/80">{t('footer.hoursLabel')}</dt>
            <dd>{t('footer.hours')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-primary-300/80">{t('footer.closedLabel')}</dt>
            <dd>{t('footer.closed')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-primary-300/80">{t('footer.followLabel')}</dt>
            <dd className="flex flex-wrap gap-3">
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-accent-300 underline-offset-2 hover:underline"
              >
                Facebook · Hookhappyness
              </a>
              <a
                href={LINE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-accent-300 underline-offset-2 hover:underline"
              >
                LINE · @300bsham
              </a>
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-primary-700/60 pt-4 text-xs">
          <Link href="/about" className="text-primary-200 transition hover:text-white">
            {t('common.about')}
          </Link>
          <Link href="/pond-rules" className="text-primary-200 transition hover:text-white">
            {t('common.rules')}
          </Link>
          <Link href="/menu" className="text-primary-200 transition hover:text-white">
            {t('common.menu')}
          </Link>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-primary-300/60">
          {t('footer.rights', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
