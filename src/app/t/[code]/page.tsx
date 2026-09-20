import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { bangkokDateString } from '@/lib/date-utils';
import { isClosedDate } from '@/lib/closed-days';
import { detectRequestLocale } from '@/i18n/detect-locale';

/**
 * 桌上二维码落地页。
 *
 * 客人扫桌上二维码 → `/t/<CODE>`（例如 `/t/A01`），本页：
 *   1. 校验桌号是否存在且启用；
 *   2. 判断客人语言（Cookie → Accept-Language → zh）；
 *   3. 带着桌号进入正常点单流程：`/{locale}/menu?table=A01`。
 *
 * ⚠️ 所有文案必须走 `tableLanding.*` 翻译键。
 * 曾经这里是把三种语言「/」拼在一起的（"二维码无效 / Invalid QR Code / …"），
 * 甚至整句只有中文——泰文客人看到的就是这种串味页面。
 */
export const dynamic = 'force-dynamic';

export default async function TableLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = decodeURIComponent(code).toUpperCase().trim();
  const locale = await detectRequestLocale();
  const t = await getTranslations({ locale, namespace: 'tableLanding' });

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
          <h1 className="text-lg font-bold text-neutral-900">{t('invalidTitle')}</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {t.rich('invalidBody', {
              code: normalized,
              mono: (chunks) => (
                <span className="font-mono font-semibold">{chunks}</span>
              ),
            })}
          </p>
          <a
            href={`/${locale}/menu`}
            className="mt-6 inline-block rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white"
          >
            {t('continueToMenu')}
          </a>
        </div>
      </div>
    );
  }

  // 今日休息（周一或法定休息日）→ 不进入点单
  if (await isClosedDate(bangkokDateString())) {
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
          <h1 className="text-lg font-bold text-neutral-900">{t('closedTitle')}</h1>
          <p className="mt-2 text-sm text-neutral-500">{t('closedBody')}</p>
          <a
            href={`/${locale}`}
            className="mt-6 inline-block rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white"
          >
            {t('continue')}
          </a>
        </div>
      </div>
    );
  }

  redirect(`/${locale}/menu?table=${table.code}`);
}
