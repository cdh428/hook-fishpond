'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';

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

  return (
    <div className="mx-auto max-w-lg">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 px-6 pb-14 pt-10 text-white">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-600/30" />
        <div className="absolute -left-12 top-16 h-24 w-24 rounded-full bg-primary-500/20" />
        <div className="absolute right-1/4 top-20 h-16 w-16 rounded-full bg-accent-500/15" />

        <div className="relative z-10">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            {t('home.welcome')}
          </h2>
          <p className="mt-2 text-primary-100">{t('home.subtitle')}</p>
        </div>

        <svg
          className="absolute bottom-0 left-0 right-0 text-bg-page"
          viewBox="0 0 1440 60"
          fill="currentColor"
        >
          <path d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,40 1440,35 L1440,60 L0,60 Z" />
        </svg>
      </section>

      {/* Pond Cards */}
      <section className="-mt-4 px-4">
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

      {/* Quick Actions */}
      <section className="px-4 py-6">
        <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}
