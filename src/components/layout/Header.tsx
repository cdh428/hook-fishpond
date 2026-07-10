'use client';

import { useTranslations, useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { useState } from 'react';

export default function Header() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale() as Locale;
  const [showLangMenu, setShowLangMenu] = useState(false);

  const switchLocale = (locale: Locale) => {
    router.replace(pathname, { locale });
    setShowLangMenu(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-primary-700 text-white backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <h1 className="text-lg font-bold">{t('siteName')}</h1>

        {/* Language Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1 rounded-lg bg-primary-800/50 px-3 py-1.5 text-sm font-medium transition hover:bg-primary-800"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
            </svg>
            {localeNames[currentLocale]}
          </button>

          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1 overflow-hidden rounded-lg border border-primary-200 bg-white shadow-lg">
              {locales.map((locale) => (
                <button
                  key={locale}
                  onClick={() => switchLocale(locale)}
                  className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-primary-50 ${
                    locale === currentLocale ? 'bg-primary-50 font-medium text-primary-700' : 'text-neutral-700'
                  }`}
                >
                  {localeNames[locale]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
