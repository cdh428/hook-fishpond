import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import HtmlShell from '@/components/layout/HtmlShell';
import { AppProvider } from '@/contexts/AppContext';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  let messages;
  try {
    messages = (await import(`../../../messages/${locale}.json`)).default;
  } catch {
    notFound();
  }

  return (
    <HtmlShell locale={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1 pb-20">{children}</main>
            <BottomNav />
          </div>
        </AppProvider>
      </NextIntlClientProvider>
    </HtmlShell>
  );
}
