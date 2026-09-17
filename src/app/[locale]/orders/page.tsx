'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { useApp } from '@/contexts/AppContext';
import { fetchOrders } from '@/lib/api-client';

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  PAID: 'bg-primary-100 text-primary-700',
  PREPARING: 'bg-accent-100 text-accent-700',
  READY: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
};

const statusI18n: Record<string, string> = {
  PENDING: 'orders.pending',
  PAID: 'orders.paid',
  PREPARING: 'orders.preparing',
  READY: 'orders.ready',
  CANCELLED: 'orders.cancelled',
};

const timeSlotKeyMap: Record<string, string> = {
  MORNING: 'booking.morning',
  AFTERNOON: 'booking.afternoon',
  EVENING: 'booking.evening',
  FULL_DAY: 'booking.fullDay',
};

type FilterTab = 'all' | 'active' | 'completed';

interface OrderView {
  id: string;
  orderNumber: string;
  items: {
    name_zh: string;
    name_en: string;
    name_th: string;
    qty: number;
    price: number;
  }[];
  total: number;
  status: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  date: string;
  table: {
    code: string;
    name_zh: string;
    name_en: string;
    name_th: string;
  } | null;
  booking: {
    pondName_zh: string;
    pondName_en: string;
    pondName_th: string;
    spotNumber: number | null;
    date: string;
    timeSlot: string | null;
  } | null;
}

function mapOrder(raw: any): OrderView {
  const booking =
    raw.bookings && raw.bookings.length > 0 ? raw.bookings[0] : null;
  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    items: (raw.items || []).map((it: any) => ({
      name_zh: it.menuItem?.name_zh ?? '',
      name_en: it.menuItem?.name_en ?? '',
      name_th: it.menuItem?.name_th ?? '',
      qty: it.quantity,
      price: it.unitPrice,
    })),
    total: raw.totalPrice,
    status: raw.status,
    orderType: raw.orderType ?? 'DINE_IN',
    date: raw.createdAt ? new Date(raw.createdAt).toLocaleString() : '',
    table: raw.table
      ? {
          code: raw.table.code,
          name_zh: raw.table.name_zh,
          name_en: raw.table.name_en,
          name_th: raw.table.name_th,
        }
      : null,
    booking: booking
      ? {
          pondName_zh: booking.pond?.name_zh ?? '',
          pondName_en: booking.pond?.name_en ?? '',
          pondName_th: booking.pond?.name_th ?? '',
          spotNumber: booking.spot?.number ?? null,
          date: booking.date ? String(booking.date).slice(0, 10) : '',
          timeSlot: booking.timeSlot ?? null,
        }
      : null,
  };
}

export default function OrdersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useApp();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setLoading(false);
        setOrders([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const raw = await fetchOrders({ userId: user.id });
        if (!cancelled) setOrders(raw.map(mapOrder));
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load orders');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const getLocaleName = (item: {
    name_zh: string;
    name_en: string;
    name_th: string;
  }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === 'active')
      return ['PENDING', 'PAID', 'PREPARING'].includes(order.status);
    if (filter === 'completed')
      return ['READY', 'CANCELLED'].includes(order.status);
    return true;
  });

  const filterTabs: { key: FilterTab; labelKey: string }[] = [
    { key: 'all', labelKey: 'orders.all' },
    { key: 'active', labelKey: 'orders.active' },
    { key: 'completed', labelKey: 'orders.completed' },
  ];

  const getBookingName = (b: OrderView['booking']) => {
    if (!b) return '';
    return locale === 'en'
      ? b.pondName_en
      : locale === 'th'
        ? b.pondName_th
        : b.pondName_zh;
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">
        {t('orders.title')}
      </h2>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-neutral-100 p-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              filter === tab.key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {!user ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
            <svg
              className="h-10 w-10 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <p className="text-neutral-500">{t('profile.registerDesc')}</p>
          <Link
            href="/profile"
            className="mt-4 rounded-xl bg-primary-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800"
          >
            {t('common.login')} / {t('common.register')}
          </Link>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white p-4 shadow-md">
              <div className="mb-3 h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
              <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-20 text-center text-sm text-error-500">{error}</div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
            <svg
              className="h-10 w-10 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <p className="text-neutral-500">{t('common.noData')}</p>
          <Link
            href="/menu"
            className="mt-4 rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
          >
            {t('home.orderFood')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div key={order.id} className="rounded-xl bg-white p-4 shadow-md">
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  {t('orders.orderNumber')}: {order.orderNumber}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statusColors[order.status] ||
                    'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {t(statusI18n[order.status] || 'orders.pending')}
                </span>
              </div>

              {/* Dining Table / Takeaway */}
              {order.table ? (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-accent-50 px-3 py-2">
                  <svg className="h-4 w-4 shrink-0 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M6 14v6m4-6v6m4-6v6m4-6v6" />
                  </svg>
                  <span className="text-xs font-medium text-accent-700">
                    {locale === 'en'
                      ? order.table.name_en
                      : locale === 'th'
                        ? order.table.name_th
                        : order.table.name_zh}
                  </span>
                </div>
              ) : order.orderType === 'TAKEAWAY' ? (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2">
                  <svg className="h-4 w-4 shrink-0 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span className="text-xs font-medium text-neutral-600">
                    {t('orderType.takeaway')}
                  </span>
                </div>
              ) : null}

              {/* Booking Info */}
              {order.booking && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2">
                  <svg
                    className="h-4 w-4 shrink-0 text-primary-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                    />
                  </svg>
                  <div className="text-xs">
                    <span className="font-medium text-primary-700">
                      {getBookingName(order.booking)}
                    </span>
                    <span className="ml-2 text-primary-500">
                      {order.booking.date}
                      {order.booking.timeSlot &&
                        ` | ${t(timeSlotKeyMap[order.booking.timeSlot] || 'booking.fullDay')}`}
                      {order.booking.spotNumber !== null &&
                        ` | #${order.booking.spotNumber}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-neutral-700">
                      {getLocaleName(item)} × {item.qty}
                    </span>
                    <span className="text-neutral-500">
                      ฿{item.price * item.qty}
                    </span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                <span className="text-xs text-neutral-400">{order.date}</span>
                <span className="font-bold text-accent-600">
                  ฿{order.total}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
