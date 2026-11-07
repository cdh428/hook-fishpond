import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requestLocale, serverT } from "@/lib/server-t";
import { auditOrderStockLink, sweepStaleReservations } from "@/lib/stock-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 库存挂钩巡检 —— 每日扫一遍「订单 ↔ 库存」的匹配情况。
 *
 * 1. **体检**：列出「卖了没扣」「未预占」「僵尸预占」四类异常（只读）；
 * 2. **清扫**：把「先付 + 支付失败/过期 + 仍未结清」的订单取消，释放它占住的库存。
 *    后付订单只报告、不自动处理 —— 菜可能已经上桌，必须由人来判断。
 *
 * 鉴权与日报一致：Vercel Cron 带 `Authorization: Bearer ${CRON_SECRET}`，
 * 或后台管理员会话。手动参数：
 *   ?apply=1   真的执行清扫（默认只报告）
 */
async function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    return { ok: true as const, via: "cron" as const };
  }
  const admin = await requireAdmin(request);
  if (admin) return { ok: true as const, via: "admin" as const };
  // 与日报 cron 同一口径：提示语言跟随请求（管理员在浏览器打开时看得到）
  const t = await serverT(requestLocale({ request }));
  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error: t("cronErr.secretMissing"),
    };
  }
  return { ok: false as const, status: 401, error: t("cronErr.unauthorized") };
}

async function handle(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "1";

  const [audit, sweep] = await Promise.all([
    auditOrderStockLink(),
    sweepStaleReservations({ apply }),
  ]);

  if (audit.issues.length > 0) {
    console.warn(
      `[stock-sweep] 订单↔库存异常：已结清未过账 ${audit.counts.SETTLED_UNPOSTED}、`
      + `未预占 ${audit.counts.OPEN_UNRESERVED}、僵尸预占 ${audit.counts.STALE_RESERVATION}、`
      + `残留预占 ${audit.counts.RESIDUAL_RESERVATION}`,
    );
  }

  return NextResponse.json({
    via: auth.via,
    applied: apply,
    orderLink: audit,
    sweep,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
