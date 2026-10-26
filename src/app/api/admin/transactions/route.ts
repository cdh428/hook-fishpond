import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { bkkDayStart } from "@/lib/reports";

/**
 * GET /api/admin/transactions
 *
 * 实收现金流 KPI（与报表页 overview / structure.payments 同口径）：
 *  - 数据源 = PaymentRecord（voidedAt IS NULL），按 paidAt +7h 曼谷落日；
 *  - 旧 Payment 表不再进 KPI —— 10-17 起 Payment.amount 语义已变成
 *    「本次结清补差额」，直接求和会少计定金/部分付款；
 *  - 预约段按 Booking.date（DATE 列）落日，与报表 overview 一致；
 *    预约不计入营收（客人到店通过订单流水收钱），仅作运营指标。
 */

/** 曼谷日界：把 YYYY-MM-DD 解析成当天 00:00 (+7h) 的瞬时 */
function bkkDayStartOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return bkkDayStart(y, m, d);
}
/** 曼谷日键：瞬时 → 曼谷当天 YYYY-MM-DD */
function bkkDayKey(instant: Date): string {
  return new Date(instant.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const todayKey = bkkDayKey(new Date());
    const start = startDate ? bkkDayStartOf(startDate) : bkkDayStartOf(todayKey);
    const endInstant = endDate ? bkkDayStartOf(endDate) : new Date();
    const endExclusive = endDate ? bkkDayStartOf(endDate) : null;

    // ----- 实收流水（KPI 唯一营收源）-----
    const records = await prisma.paymentRecord.findMany({
      where: {
        voidedAt: null,
        paidAt: endExclusive
          ? { gte: start, lt: endExclusive }
          : { gte: start, lte: endInstant },
      },
      include: {
        order: {
          select: { orderNumber: true, customerName: true, customerPhone: true },
        },
      },
      orderBy: { paidAt: "desc" },
    });

    const totalRevenue = records.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const byMethod: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    for (const r of records) {
      const amt = Number(r.amount) || 0;
      byMethod[r.method] = (byMethod[r.method] || 0) + amt;
      const day = bkkDayKey(r.paidAt);
      byDay[day] = (byDay[day] || 0) + amt;
    }

    // ----- 预约（运营指标，不计营收）：按 Booking.date 落日 -----
    const allBookings = await prisma.booking.findMany({
      where: {
        status: { not: "CANCELLED" },
        date: endExclusive
          ? { gte: bkkDayKey(start), lte: endDate! }
          : { gte: bkkDayKey(start) },
      },
      include: { pond: true },
    });
    const bookingRevenue = allBookings.reduce((sum, b) => sum + b.totalPrice, 0);

    return NextResponse.json({
      dateRange: { start: start.toISOString(), end: (endExclusive ?? endInstant).toISOString() },
      totalRevenue,
      bookingRevenue,
      orderRevenue: totalRevenue,
      paymentMethodBreakdown: byMethod,
      dailyBreakdown: byDay,
      transactionCount: records.length,
      bookingCount: allBookings.length,
      transactions: records.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.order?.orderNumber,
        method: r.method,
        amount: Number(r.amount) || 0,
        status: "RECORDED",
        paidAt: r.paidAt,
        customerName: r.order?.customerName,
        customerPhone: r.order?.customerPhone,
      })),
    });
  } catch (error: any) {
    console.error("Admin transactions error:", error);
    return NextResponse.json({ error: "Failed to get transactions" }, { status: 500 });
  }
}
