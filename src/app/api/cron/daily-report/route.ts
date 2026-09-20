import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendDailyReport } from "@/lib/line-report-send";
import type { ReportLocale } from "@/lib/daily-report";

/**
 * 每日经营日报 → LINE 推送
 *
 * 调度：vercel.json 的 crons（Hobby 每天一次，UTC，精度 ±59 分钟）
 *   0 14 * * *  =  曼谷时间 21:00（泰国无夏令时，全年 UTC+7）
 *
 * 鉴权（二选一）：
 *   a) Vercel Cron 自动带 Authorization: Bearer ${CRON_SECRET}
 *   b) 后台管理员会话（浏览器直接打开 URL 也可触发）
 *
 * 可选手动参数：
 *   ?demo=1          发示例文案（不查库，方便验证格式）
 *   ?to=<targetId>   只发给某一个接收人
 *   ?locale=th|en|zh 覆盖文案语言
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    return { ok: true as const, via: "cron" as const };
  }
  const admin = await requireAdmin(request);
  if (admin) return { ok: true as const, via: "admin" as const };
  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error: "CRON_SECRET 未配置，且当前请求不是管理员会话（无法鉴权）",
    };
  }
  return { ok: false as const, status: 401, error: "Unauthorized" };
}

async function handle(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const localeParam = searchParams.get("locale") as ReportLocale | null;
  const result = await sendDailyReport({
    demo: searchParams.get("demo") === "1",
    onlyTo: searchParams.get("to"),
    locale:
      localeParam === "th" || localeParam === "en" || localeParam === "zh"
        ? localeParam
        : null,
  });

  const status = result.reason === "no_token" ? 503 : 200;
  return NextResponse.json({ ...result, via: auth.via }, { status });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
