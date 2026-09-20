import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lineAccessToken, lineChannelSecret } from "@/lib/line";
import { sendDailyReport } from "@/lib/line-report-send";
import type { ReportLocale } from "@/lib/daily-report";

/**
 * 后台「LINE 日报」管理接口
 *   GET    → 接收人列表 + 配置状态（token / secret 是否已就位）
 *   POST   → 手动发送 { mode: 'demo' | 'real', locale?, to? }
 *   DELETE → 解绑 ?id=<LineTarget.id>
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const targets = await prisma.lineTarget.findMany({
    orderBy: { boundAt: "asc" },
  });

  return NextResponse.json({
    configured: {
      hasToken: Boolean(lineAccessToken()),
      hasSecret: Boolean(lineChannelSecret()),
      cronSecret: Boolean(process.env.CRON_SECRET),
    },
    targets,
  });
}

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  let body: {
    mode?: "demo" | "real";
    locale?: ReportLocale;
    to?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const locale =
    body.locale === "th" || body.locale === "en" || body.locale === "zh"
      ? body.locale
      : null;

  const result = await sendDailyReport({
    demo: body.mode !== "real",
    onlyTo: body.to ?? null,
    locale,
  });

  const status = result.reason === "no_token" ? 503 : 200;
  return NextResponse.json(result, { status });
}

export async function DELETE(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.lineTarget.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
