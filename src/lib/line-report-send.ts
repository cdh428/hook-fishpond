import { prisma } from './prisma';
import { pushLineText, clampLineText, lineAccessToken } from './line';
import {
  composeDailyReportText,
  defaultReportLocale,
  demoReportPayload,
  getTodayReport,
  type ReportLocale,
} from './daily-report';

/**
 * 日报推送编排（cron 与后台「测试发送」共用同一套逻辑，
 * 保证测试发出去的格式和每天自动发的完全一致）。
 */

export interface SendDailyReportOptions {
  demo?: boolean;
  onlyTo?: string | null;
  locale?: ReportLocale | null;
}

export interface SendDailyReportResult {
  ok: boolean;
  reason?: 'no_token' | 'no_targets';
  message?: string;
  demo: boolean;
  locale: ReportLocale;
  date: string;
  total: number;
  sent: number;
  failed: number;
  results: {
    targetId: string;
    displayName: string | null;
    ok: boolean;
    status: number;
    detail: string;
  }[];
  preview: string;
}

export async function sendDailyReport(
  opts: SendDailyReportOptions = {},
): Promise<SendDailyReportResult> {
  const locale = opts.locale ?? defaultReportLocale();
  const demo = Boolean(opts.demo);

  let text: string;
  let dateStr: string;
  if (demo) {
    const payload = demoReportPayload();
    text = composeDailyReportText(payload, locale, { demo: true });
    dateStr = payload.overview.period.toDate;
  } else {
    const { payload, closed } = await getTodayReport();
    text = composeDailyReportText(payload, locale, { closed });
    dateStr = payload.overview.period.toDate;
  }

  const base: Omit<SendDailyReportResult, 'total' | 'sent' | 'failed' | 'results'> = {
    ok: false,
    demo,
    locale,
    date: dateStr,
    preview: text,
  };

  if (!lineAccessToken()) {
    return {
      ...base,
      reason: 'no_token',
      message:
        'LINE_CHANNEL_ACCESS_TOKEN 未配置，无法推送。请在 Vercel 环境变量中补上后再试。',
      total: 0,
      sent: 0,
      failed: 0,
      results: [],
    };
  }

  const targets = await prisma.lineTarget.findMany({
    where: {
      isActive: true,
      ...(opts.onlyTo ? { targetId: opts.onlyTo } : {}),
    },
    orderBy: { boundAt: 'asc' },
  });

  if (!targets.length) {
    return {
      ...base,
      reason: 'no_targets',
      message:
        '还没有绑定任何接收人。请用个人 LINE 给官方账号发一句话完成绑定。',
      total: 0,
      sent: 0,
      failed: 0,
      results: [],
    };
  }

  const results: SendDailyReportResult['results'] = [];
  for (const t of targets) {
    const r = await pushLineText(t.targetId, clampLineText(text));
    results.push({
      targetId: t.targetId,
      displayName: t.displayName,
      ok: r.ok,
      status: r.status,
      detail: r.detail.slice(0, 300),
    });
    if (r.ok) {
      await prisma.lineTarget
        .update({ where: { id: t.id }, data: { lastSentAt: new Date() } })
        .catch(() => undefined);
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return {
    ...base,
    ok: sent > 0,
    total: targets.length,
    sent,
    failed: results.length - sent,
    results,
  };
}
