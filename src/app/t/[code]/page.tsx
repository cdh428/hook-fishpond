import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { locales, defaultLocale } from '@/i18n/config';

/**
 * Table QR landing page.
 *
 * A customer scans the QR code printed on their table, which points at
 * https://<host>/t/<CODE> (e.g. /t/A01). This page:
 *   1. validates the table code against the database,
 *   2. detects the customer's preferred language (cookie → Accept-Language → zh),
 *   3. forwards them into the normal ordering flow with the table attached:
 *      /{locale}/menu?table=A01
 *
 * The ordering + payment flow itself is unchanged — this route only adds
 * table context to the entry point.
 */
export const dynamic = 'force-dynamic';

type Locale = (typeof locales)[number];

function detectLocale(acceptLanguage: string | null, cookieLocale?: string): Locale {
  if (cookieLocale && (locales as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as Locale;
  }

  if (acceptLanguage) {
    const lower = acceptLanguage.toLowerCase();
    // Thai first — this is a Thai venue; then English, then Chinese
    if (lower.includes('th')) return 'th';
    if (lower.includes('en')) return 'en';
    if (lower.includes('zh')) return 'zh';
  }

  return defaultLocale as Locale;
}

export default async function TableLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = decodeURIComponent(code).toUpperCase().trim();

  const table = await prisma.diningTable.findUnique({
    where: { code: normalized },
  });

  if (!table || !table.isActive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-page px-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-50">
            <svg
              className="h-8 w-8 text-error-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-neutral-900">
            二维码无效 / Invalid QR Code / คิวอาร์โค้ดไม่ถูกต้อง
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            桌号 <span className="font-mono font-semibold">{normalized}</span> 不存在或已停用。
            <br />
            Table <span className="font-mono font-semibold">{normalized}</span> was not found or is
            inactive.
            <br />
            ไม่พบโต๊ะ <span className="font-mono font-semibold">{normalized}</span> หรือถูกปิดใช้งาน
          </p>
          <a
            href={`/${defaultLocale}/menu`}
            className="mt-6 inline-block rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white"
          >
            继续浏览菜单 / Continue / ดำเนินการต่อ
          </a>
        </div>
      </div>
    );
  }

  const cookieStore = await cookies();
  const headerStore = await headers();

  const locale = detectLocale(
    headerStore.get('accept-language'),
    cookieStore.get('NEXT_LOCALE')?.value,
  );

  redirect(`/${locale}/menu?table=${table.code}`);
}
