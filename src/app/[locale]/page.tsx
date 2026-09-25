'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { adminLogin } from '@/lib/api-client';
import HeroCarousel from '@/components/home/HeroCarousel';
import VideoPromo from '@/components/home/VideoPromo';
import PhotoWall from '@/components/home/PhotoWall';
import { CATCH_PHOTO, FOOD_WALL, PLACE_WALL, photoUrl } from '@/lib/media';

const ponds = [
  {
    type: 'LEISURE' as const,
    nameKey: 'home.leisurePond',
    priceKey: 'home.leisurePrice',
    descKey: 'home.leisureDesc',
    minParticipants: null,
    icon: (
      <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M8 8h.01M16 8h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16c-1.5 0-3 .8-3 2h6c0-1.2-1.5-2-3-2z" />
      </svg>
    ),
    color: 'from-primary-50 to-primary-100 border-primary-200',
    badgeColor: 'bg-primary-50 text-primary-700',
    btnColor: 'bg-primary-700 hover:bg-primary-800',
    ctaKey: 'home.bookNow',
  },
  {
    type: 'COMPETITION' as const,
    nameKey: 'home.competitionPond',
    priceKey: 'home.competitionPrice',
    descKey: 'home.competitionDesc',
    minParticipants: 10,
    icon: (
      <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7a3 3 0 116 0" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v2" />
      </svg>
    ),
    color: 'from-accent-50 to-accent-100 border-accent-200',
    badgeColor: 'bg-accent-50 text-accent-700',
    btnColor: 'bg-accent-500 hover:bg-accent-600',
    ctaKey: 'home.bookNow',
  },
];

const quickActions = [
  {
    href: '/booking',
    labelKey: 'common.booking',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    color: 'bg-primary-50 text-primary-700',
  },
  {
    href: '/menu',
    labelKey: 'common.menu',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v2H3V3zm0 4h18v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm4 3v8m4-8v8m4-8v8" />
      </svg>
    ),
    color: 'bg-accent-50 text-accent-600',
  },
  {
    href: '/profile',
    labelKey: 'common.profile',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    color: 'bg-success-50 text-success-600',
  },
  {
    href: '/pond-rules',
    labelKey: 'common.rules',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v5h5" />
      </svg>
    ),
    color: 'bg-warning-50 text-warning-600',
  },
];

const features = [
  {
    key: 'fishing',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      </svg>
    ),
    color: 'bg-primary-50 text-primary-700',
  },
  {
    key: 'food',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v2H3V3zm0 4h18v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm4 3v8m4-8v8m4-8v8" />
      </svg>
    ),
    color: 'bg-accent-50 text-accent-600',
  },
  {
    key: 'drinks',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'bg-success-50 text-success-600',
  },
  {
    key: 'booking',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    color: 'bg-warning-50 text-warning-600',
  },
];

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  // Single sign-in: authenticate against the real admin API here, so the
  // `admin-session` cookie is set before we land on /admin — the admin shell
  // then sees a valid session and does NOT ask for credentials a second time.
  const handleAdminAccess = async () => {
    if (!adminUsername || !adminPassword) {
      setAdminError(t('admin.loginFailed'));
      return;
    }
    setAdminLoading(true);
    setAdminError('');
    try {
      await adminLogin(adminUsername, adminPassword);
      setShowAdminModal(false);
      setAdminUsername('');
      setAdminPassword('');
      router.push('/admin');
    } catch {
      setAdminError(t('admin.loginFailed'));
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <>
      {/* 首屏 · 实拍照片轮播（全宽出血，故意不套 max-w-lg） */}
      <HeroCarousel />

      <div className="mx-auto max-w-lg">
        {/* 宣传小影片（竖版在手机上播） */}
        <VideoPromo />

        {/* Pond Cards */}
        <section className="px-4 pt-5">
        <h3 className="mb-3 text-lg font-bold text-neutral-900">
          {t('pond.selectPond')}
        </h3>
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {ponds.map((pond) => (
            <div
              key={pond.type}
              className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${pond.color} p-5 shadow-md transition hover:shadow-lg`}
            >
              {/* Pond icon */}
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-xl bg-white/80 p-2 shadow-sm">
                  {pond.icon}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-neutral-900">{t(pond.nameKey)}</h4>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${pond.badgeColor}`}>
                    {t(pond.priceKey)}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="mb-4 text-sm text-neutral-600">
                {t(pond.descKey)}
              </p>

              {/* Min participants badge */}
              {pond.minParticipants && (
                <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700">
                  <svg className="h-3.5 w-3.5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('home.minParticipants')}
                </div>
              )}

              {/* CTA Button */}
              <Link
                href={{
                  pathname: '/booking',
                  query: { pond: pond.type },
                }}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-cta transition ${pond.btnColor}`}
              >
                {t(pond.ctaKey)}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Take Your Catch Home — the single biggest selling point on the Thai
          market, so it gets its own block right under the pond cards. */}
      <section className="px-4 pt-5">
        <div className="relative overflow-hidden rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 to-accent-100 shadow-md">
          {/* 举鱼实拍：整条鱼在画面里，同时避开了人物头部（原片无面部） */}
          <picture>
            <source srcSet={photoUrl(CATCH_PHOTO, 'webp')} type="image/webp" />
            <img
              src={photoUrl(CATCH_PHOTO)}
              alt={t('home.keepFishPhotoAlt')}
              width={CATCH_PHOTO.w}
              height={CATCH_PHOTO.h}
              loading="lazy"
              decoding="async"
              className="aspect-[5/4] w-full object-cover"
            />
          </picture>
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent-500/10" />
          <div className="relative z-10 p-5">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">🐟</span>
              <h3 className="text-base font-bold text-neutral-900">
                {t('home.keepFishTitle')}
              </h3>
            </div>

            <div className="mt-3 rounded-xl bg-white/75 px-4 py-3">
              <div className="text-2xl font-bold tracking-tight text-neutral-900">
                {t('home.keepFishBig')}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-accent-700">
                {t('home.keepFishSub')}
              </div>
            </div>

            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-neutral-600">
              <span className="mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-error-500" />
              {t('home.keepFishBek')}
            </p>

            <Link
              href="/pond-rules"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
            >
              {t('home.keepFishCta')}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* 美食照片墙 */}
      <PhotoWall
        title={t('home.foodWall.title')}
        subtitle={t('home.foodWall.subtitle')}
        photos={FOOD_WALL}
        href="/menu"
        cta={t('home.foodWall.cta')}
      />

      {/* 环境与设施照片墙 */}
      <PhotoWall
        title={t('home.placeWall.title')}
        subtitle={t('home.placeWall.subtitle')}
        photos={PLACE_WALL}
        href="/pond-rules"
        cta={t('home.placeWall.cta')}
      />

      {/* 开塘故事入口（完整 12 步在 /about） */}
      <section className="px-4 pt-6">
        <div className="relative overflow-hidden rounded-2xl bg-primary-900 p-5 text-white">
          <div className="absolute -bottom-8 -right-8 h-28 w-28 rounded-full bg-primary-700/40" />
          <div className="relative z-10">
            <h3 className="text-base font-bold">{t('home.story.title')}</h3>
            <p className="mt-1.5 text-sm text-primary-100/85">{t('home.story.text')}</p>
            <Link
              href="/about"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20"
            >
              {t('home.story.cta')}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="px-4 py-6">
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 shadow-md transition hover:shadow-lg active:scale-95"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${action.color}`}>
                {action.icon}
              </div>
              <span className="text-center text-xs font-medium text-neutral-700">
                {t(action.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-8">
        <h3 className="mb-3 text-lg font-bold text-neutral-900">
          {t('common.seeAll')}
        </h3>
        <div className="space-y-3">
          {features.map((feature) => (
            <div
              key={feature.key}
              className="flex items-start gap-4 rounded-xl bg-white p-4 shadow-md"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${feature.color}`}>
                {feature.icon}
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900">
                  {t(`home.features.${feature.key}`)}
                </h3>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {t(`home.features.${feature.key}Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Admin Access */}
      <section className="px-4 pb-6">
        <button
          onClick={() => setShowAdminModal(true)}
          className="mx-auto flex items-center gap-1.5 text-xs text-neutral-400 transition hover:text-neutral-600"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          {t('common.admin')}
        </button>
      </section>

      {/* Admin Login Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 px-4" onClick={() => setShowAdminModal(false)}>
          <div
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">{t('admin.loginTitle')}</h2>
              <button
                onClick={() => setShowAdminModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {t('admin.loginUsername')}
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminAccess()}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {t('admin.loginPassword')}
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminAccess()}
                />
              </div>
              {adminError && <p className="text-xs text-error-600">{adminError}</p>}
              <button
                onClick={handleAdminAccess}
                disabled={adminLoading}
                className="w-full rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800 disabled:opacity-50"
              >
                {adminLoading ? t('common.loading') : t('common.login')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
