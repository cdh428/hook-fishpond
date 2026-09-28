import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import Footer from '@/components/layout/Footer';
import HtmlShell from '@/components/layout/HtmlShell';
import { AppProvider } from '@/contexts/AppContext';
import { BRAND_NAME, OG_IMAGE, OG_LOCALE } from '@/lib/site';

/** 只取 SEO 要用的三个键 */
type SeoMessages = {
  common?: { siteName?: string };
  footer?: { tagline?: string };
  home?: { hero?: { s1Sub?: string } };
};

async function loadMessages(locale: string) {
  try {
    return (await import(`../../../messages/${locale}.json`)).default;
  } catch {
    return null;
  }
}

/**
 * 本地化 metadata：标题 / 描述 / canonical / OpenGraph / Twitter 卡片。
 *
 * 文案全部取自 `messages/*.json` 的**既有键**（`common.siteName`、`footer.tagline`、
 * `home.hero.s1Sub`）—— 不新增硬编码文案，也让「品牌写法」继续只有一个来源。
 * `canonical` 与 `og:url` 写相对路径，由根布局的 `metadataBase` 补成绝对地址，
 * 因此换域名不需要改这里。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) return {};

  const raw = (await loadMessages(locale)) as SeoMessages | null;
  const siteName = raw?.common?.siteName || BRAND_NAME;
  const tagline = raw?.footer?.tagline || '';
  const priceLine = raw?.home?.hero?.s1Sub || '';
  const description = [tagline, priceLine].filter(Boolean).join(' · ') || siteName;

  return {
    title: siteName,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: { zh: '/zh', en: '/en', th: '/th', 'x-default': '/zh' },
    },
    openGraph: {
      type: 'website',
      url: `/${locale}`,
      siteName,
      title: siteName,
      description,
      locale: OG_LOCALE[locale],
      images: [
        {
          url: OG_IMAGE.url,
          width: OG_IMAGE.width,
          height: OG_IMAGE.height,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: siteName,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

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

  const messages = await loadMessages(locale);
  if (!messages) {
    notFound();
  }

  return (
    <HtmlShell locale={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AppProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1 pb-20">{children}</main>
            <Footer />
            <BottomNav />
          </div>
        </AppProvider>
      </NextIntlClientProvider>
    </HtmlShell>
  );
}
