import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function HomePage() {
  const t = useTranslations();

  return (
    <div className="mx-auto max-w-lg">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 px-6 pb-12 pt-10 text-white">
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-600/30" />
        <div className="absolute -left-12 top-16 h-24 w-24 rounded-full bg-primary-500/20" />

        <div className="relative z-10">
          <h2 className="text-3xl font-bold leading-tight">
            {t('home.welcome')}
          </h2>
          <p className="mt-2 text-primary-100">{t('home.subtitle')}</p>

          <Link
            href="/booking"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
          >
            {t('home.bookNow')}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>

        {/* Decorative wave */}
        <svg
          className="absolute bottom-0 left-0 right-0 text-bg-page"
          viewBox="0 0 1440 60"
          fill="currentColor"
        >
          <path d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,40 1440,35 L1440,60 L0,60 Z" />
        </svg>
      </section>

      {/* Quick Actions */}
      <section className="px-4 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/booking"
            className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 shadow-md transition hover:shadow-lg"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50">
              <svg className="h-7 w-7 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
            </div>
            <span className="text-center text-xs font-medium text-neutral-700">{t('home.bookNow')}</span>
          </Link>

          <Link
            href="/menu"
            className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 shadow-md transition hover:shadow-lg"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent-50">
              <svg className="h-7 w-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v2H3V3zm0 4h18v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm4 3v8m4-8v8m4-8v8" />
              </svg>
            </div>
            <span className="text-center text-xs font-medium text-neutral-700">{t('home.orderFood')}</span>
          </Link>

          <Link
            href="/drinks"
            className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 shadow-md transition hover:shadow-lg"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-success-50">
              <svg className="h-7 w-7 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-center text-xs font-medium text-neutral-700">{t('home.orderDrinks')}</span>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-8">
        <div className="space-y-3">
          {(['fishing', 'food', 'drinks'] as const).map((key) => (
            <div
              key={key}
              className="flex items-start gap-4 rounded-xl bg-white p-4 shadow-md"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  key === 'fishing'
                    ? 'bg-primary-50 text-primary-700'
                    : key === 'food'
                      ? 'bg-accent-50 text-accent-600'
                      : 'bg-success-50 text-success-600'
                }`}
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900">
                  {t(`home.features.${key}`)}
                </h3>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {t(`home.features.${key}Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
