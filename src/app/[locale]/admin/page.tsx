'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import {
  fetchAdminStats,
  fetchAdminBookings,
  fetchAdminOrders,
  updateAdminOrderTable,
} from '@/lib/api-client';
import TablePicker from '@/components/TablePicker';
import LineCard from '@/components/admin/LineCard';
import { Link } from '@/i18n/routing';

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  CONFIRMED: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
  PAID: 'bg-primary-100 text-primary-700',
  PREPARING: 'bg-accent-100 text-accent-700',
  READY: 'bg-success-100 text-success-600',
  SERVED: 'bg-primary-100 text-primary-700',
  SETTLED: 'bg-neutral-100 text-neutral-500',
};

const statusI18n: Record<string, string> = {
  PENDING: 'orders.pending',
  CONFIRMED: 'orders.confirmed',
  CANCELLED: 'orders.cancelled',
  PAID: 'orders.paid',
  PREPARING: 'orders.preparing',
  READY: 'orders.ready',
  SERVED: 'orders.served',
  SETTLED: 'orders.settled',
};

// time slot + pond helpers
const timeSlotKey: Record<string, string> = {
  MORNING: 'booking.morning',
  AFTERNOON: 'booking.afternoon',
  EVENING: 'booking.evening',
  FULL_DAY: 'booking.fullDay',
};

const pondKeyForType = (type: string) =>
  type === 'COMPETITION' ? 'admin.competitionPond' : 'admin.leisurePond';

export default function AdminDashboard() {
  const t = useTranslations();

  const [stats, setStats] = useState({
    todayBookings: 0,
    todayRevenue: 0,
    yesterdayRevenue: 0,
    yesterdayBookings: 0,
    openOutstanding: 0,
    openOutstandingCount: 0,
    todayProjected: 0,
    pendingOrders: 0,
    activeSpots: 0,
    awaitingSettlementCount: 0,
    awaitingSettlementAmount: 0,
  });
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [rebindOrder, setRebindOrder] = useState<any | null>(null);
  const [rebindBusy, setRebindBusy] = useState(false);

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardData = async () => {
    setDataLoading(true);
    setDataError('');
    try {
      const [statsRes, bookingsRes, ordersRes] = await Promise.all([
        fetchAdminStats(),
        fetchAdminBookings({}),
        fetchAdminOrders({ scope: 'open' }),
      ]);
      setStats({
        todayBookings: statsRes.todayBookings ?? 0,
        todayRevenue: statsRes.todayRevenue ?? 0,
        yesterdayRevenue: statsRes.yesterdayRevenue ?? 0,
        yesterdayBookings: statsRes.yesterdayBookings ?? 0,
        openOutstanding: statsRes.openOutstanding ?? 0,
        openOutstandingCount: statsRes.openOutstandingCount ?? 0,
        todayProjected: statsRes.todayProjected ?? 0,
        pendingOrders: statsRes.pendingOrders ?? 0,
        activeSpots: statsRes.activeSpots ?? 0,
        awaitingSettlementCount: statsRes.awaitingSettlementCount ?? 0,
        awaitingSettlementAmount: statsRes.awaitingSettlementAmount ?? 0,
      });
      setRecentBookings((bookingsRes || []).slice(0, 5));
      setRecentOrders((ordersRes?.orders || []).slice(0, 5));
    } catch (err: any) {
      setDataError(err?.message || t('common.error'));
    } finally {
      setDataLoading(false);
    }
  };

  // Rebind an order to another table (customer moved / ordered without the QR).
  const handleRebind = async (tableCode: string | null) => {
    if (!rebindOrder) return;
    setRebindBusy(true);
    try {
      const updated = await updateAdminOrderTable(rebindOrder.id, tableCode);
      setRecentOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      setRebindOrder(null);
    } catch {
      setDataError(t('common.error'));
    } finally {
      setRebindBusy(false);
    }
  };

  // 环比计算工具
  const pctChange = (today: number, yesterday: number): { pct: number; dir: 'up' | 'down' | 'flat' } => {
    if (yesterday === 0) return { pct: 0, dir: 'flat' };
    const pct = Math.round(((today - yesterday) / yesterday) * 1000) / 10;
    if (pct > 0) return { pct, dir: 'up' };
    if (pct < 0) return { pct: Math.abs(pct), dir: 'down' };
    return { pct: 0, dir: 'flat' };
  };

  const revenueChange = pctChange(stats.todayRevenue, stats.yesterdayRevenue);
  const bookingsChange = pctChange(stats.todayBookings, stats.yesterdayBookings);
  const avgTicketToday = stats.todayBookings > 0 ? stats.todayRevenue / stats.todayBookings : 0;
  const avgTicketYesterday = stats.yesterdayBookings > 0 ? stats.yesterdayRevenue / stats.yesterdayBookings : 0;
  const avgTicketChange = pctChange(avgTicketToday, avgTicketYesterday);

  const arrowIcon = (dir: 'up' | 'down' | 'flat') => dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';

  const statCards = [
    {
      labelKey: 'admin.todayRevenue',
      value: `฿${Math.round(stats.todayRevenue).toLocaleString()}`,
      sub: `${arrowIcon(revenueChange.dir)} ${Math.abs(revenueChange.pct)}% vs 昨日`,
      subDir: revenueChange.dir,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-success-50 text-success-700',
    },
    {
      labelKey: 'admin.todayBookings',
      value: String(stats.todayBookings),
      sub: `${arrowIcon(bookingsChange.dir)} ${Math.abs(bookingsChange.pct)}% vs 昨日`,
      subDir: bookingsChange.dir,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-primary-50 text-primary-700',
    },
    {
      labelKey: 'admin.avgTicket',
      value: `฿${Math.round(avgTicketToday).toLocaleString()}`,
      sub: `${arrowIcon(avgTicketChange.dir)} ${Math.abs(avgTicketChange.pct)}% vs 昨日`,
      subDir: avgTicketChange.dir,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-7 4h8m-9 4h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-teal-50 text-teal-700',
    },
    {
      labelKey: 'admin.pendingOrders',
      value: String(stats.pendingOrders),
      sub: stats.awaitingSettlementCount > 0
        ? `+${stats.awaitingSettlementCount} 待收款`
        : '全部已处理',
      subDir: 'flat' as const,
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: stats.pendingOrders > 0 ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-500',
    },
  ];

  return (
    <>
      {dataLoading ? (
        <div className="py-20 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : dataError ? (
        <div className="py-20 text-center">
          <p className="text-sm text-error-600">{dataError}</p>
          <button
            onClick={loadDashboardData}
            className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-xs font-medium text-white"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            {statCards.map((stat) => {
              const subColor = stat.subDir === 'up' ? 'text-success-600' : stat.subDir === 'down' ? 'text-error-600' : 'text-neutral-400';
              return (
                <div key={stat.labelKey} className={`rounded-xl p-4 ${stat.color}`}>
                  <p className="text-xs opacity-70">{t(stat.labelKey)}</p>
                  <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                  {stat.sub && (
                    <p className={`mt-0.5 text-[11px] font-medium ${subColor}`}>{stat.sub}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 待收款提醒 —— 后付订单还没结清 */}
          {stats.awaitingSettlementCount > 0 && (
            <Link
              href="/admin/orders"
              className="mb-6 flex items-center justify-between rounded-xl bg-accent-500 px-4 py-3 text-white shadow-cta"
            >
              <span className="text-sm font-semibold">
                💰 {t('adminOrders.tabAwaiting')} · {stats.awaitingSettlementCount}{' '}
                {t('adminOrders.ordersUnit')}
              </span>
              <span className="text-base font-bold">
                ฿{stats.awaitingSettlementAmount.toLocaleString()}
              </span>
            </Link>
          )}

          {/* LINE OA 信息卡 —— 账号身份 / 推送凭据 / 接收人，一屏看清 */}
          <div className="mb-6">
            <LineCard />
          </div>

          {/* Recent Bookings */}
          <div className="mb-6 rounded-xl bg-white p-4 shadow-md">
            <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.bookings')}</h3>
            {recentBookings.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2">
                {recentBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {b.customerName || b.user?.name || '—'} — {t(pondKeyForType(b.pond?.type))}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {b.date?.slice(0, 10)} | {t(timeSlotKey[b.timeSlot] || 'booking.fullDay')}
                        {b.spot?.number ? ` | #${b.spot.number}` : ''}
                      </p>
                    </div>
                    <div className="ml-2 text-right shrink-0">
                      <p className="text-sm font-bold text-neutral-900">฿{b.totalPrice?.toLocaleString()}</p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[b.status] || 'bg-neutral-100 text-neutral-600'}`}>
                        {t(statusI18n[b.status] || 'orders.pending')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="rounded-xl bg-white p-4 shadow-md">
            <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.recentOrders')}</h3>
            {recentOrders.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{o.orderNumber || o.id}</p>
                      <p className="truncate text-xs text-neutral-500">{o.customerName}</p>
                      {o.table ? (
                        <button
                          onClick={() => setRebindOrder(o)}
                          disabled={rebindBusy}
                          className="mt-0.5 inline-flex items-center gap-1 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 hover:bg-accent-100"
                        >
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M6 14v6m4-6v6m4-6v6m4-6v6" />
                          </svg>
                          {o.table.code} · {t('table.changeTable')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setRebindOrder(o)}
                          disabled={rebindBusy}
                          className="mt-0.5 inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-neutral-200"
                        >
                          🥡 {t('orderType.takeaway')}
                          <span className="text-neutral-400">· {t('table.changeTable')}</span>
                        </button>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-neutral-900">฿{o.totalPrice?.toLocaleString()}</p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.status] || 'bg-neutral-100 text-neutral-600'}`}>
                        {t(statusI18n[o.status] || 'orders.pending')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Rebind table picker */}
      <TablePicker
        open={!!rebindOrder}
        currentCode={rebindOrder?.table?.code || null}
        onSelect={(code) => handleRebind(code)}
        onClose={() => setRebindOrder(null)}
        allowClear
        onClear={() => handleRebind(null)}
        title={rebindOrder ? `${rebindOrder.orderNumber} · ${t('table.changeTable')}` : undefined}
      />
    </>
  );
}
