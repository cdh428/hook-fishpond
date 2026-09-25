'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { STORY, photoUrl } from '@/lib/media';

/**
 * 「关于我们 · 开塘故事」
 *
 * 12 步完整时间线（2026-02-25 荒地 → 现在）。照片全部是施工期实拍，
 * 单独放这一页、不塞首屏 —— 施工期照片讲成「投入的凭证」才是资产。
 */
export default function AboutPage() {
  const t = useTranslations();
  const cover = STORY[STORY.length - 1].photo;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="relative overflow-hidden rounded-2xl">
        <picture>
          <source srcSet={photoUrl(cover, 'webp')} type="image/webp" />
          <img
            src={photoUrl(cover)}
            alt=""
            width={cover.w}
            height={cover.h}
            fetchPriority="high"
            className="aspect-[16/9] w-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="text-xl font-bold text-white">{t('about.title')}</h2>
          <p className="mt-1 text-xs text-white/80">{t('about.subtitle')}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-neutral-600">{t('about.intro')}</p>

      <ol className="mt-7 space-y-7">
        {STORY.map((step, i) => (
          <li key={step.photo.base} className="relative pl-8">
            {i < STORY.length - 1 && (
              <span className="absolute bottom-[-28px] left-[7px] top-3 w-px bg-primary-200" />
            )}
            <span className="absolute left-0 top-2 h-[15px] w-[15px] rounded-full border-2 border-accent-500 bg-white" />

            <div className="text-xs font-semibold tracking-wide text-accent-600">
              {step.date}
            </div>
            <h3 className="mt-0.5 font-bold text-neutral-900">
              {t(`about.step${i + 1}`)}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {t(`about.step${i + 1}Text`)}
            </p>

            <div className="mt-2 overflow-hidden rounded-xl bg-neutral-100">
              <picture>
                <source srcSet={photoUrl(step.photo, 'webp')} type="image/webp" />
                <img
                  src={photoUrl(step.photo)}
                  alt=""
                  width={step.photo.w}
                  height={step.photo.h}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/2] w-full object-cover"
                />
              </picture>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 to-accent-100 p-5">
        <h3 className="font-bold text-neutral-900">{t('about.ctaTitle')}</h3>
        <p className="mt-1 text-sm text-neutral-600">{t('about.ctaText')}</p>
        <Link
          href="/booking"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 active:scale-95"
        >
          {t('home.bookNow')}
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
