'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

// Demo orders data
const demoOrders = [
  {
    id: 'FP-20260320-001',
    items: [
      { name_zh: '冬阴功汤', name_en: 'Tom Yum Goong', name_th: 'ต้มยำกุ้ง', qty: 2, price: 180 },
      { name_zh: '烤鸡翅', name_en: 'Grilled Wings', name_th: 'ปีกไก่ย่าง', qty: 1, price: 120 },
    ],
    total: 480,
    status: 'PREPARING' as const,
    date: '2026-03-20 14:30',
  },
  {
    id: 'FP-20260320-002',
    items: [
      { name_zh: '泰式奶茶', name_en: 'Thai Iced Tea', name_th: 'ชาเย็น', qty: 3, price: 50 },
    ],
    total: 150,
    status: 'PAID' as const,
    date: '2026-03-20 15:00',
  },
];

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  PAID: 'bg-primary-100 text-primary-700',
  PREPARING: 'bg-accent-100 text-accent-700',
  READY: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
};

const statusKeys: Record<string, string> = {
  PENDING: 'orders.pending',
  PAID: 'orders.paid',
  PREPARING: 'orders.preparing',
  READY: 'orders.ready',
  CANCELLED: 'orders.cancelled',
};

type FilterTab = 'all' | 'active' | 'done';

export default function OrdersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [filter, setFilter] = useState<FilterTab>('all');

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const filteredOrders = demoOrders.filter((order) => {
    if (filter === 'active') return ['PENDING', 'PAID', 'PREPARING'].includes(order.status);
    if (filter === 'done') return ['READY', 'CANCELLED'].includes(order.status);
    return true;
  });

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('orders.title') },
    { key: 'active', label: t('orders.preparing') },
    { key: 'done', label: t('orders.ready') },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('orders.title')}</h2>

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
            {tab.label}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
            <svg className="h-10 w-10 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
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
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-neutral-500">
                  {t('orders.orderNumber')}: {order.id}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status]}`}
                >
                  {t(statusKeys[order.status])}
                </span>
              </div>

              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-neutral-700">
                      {getLocaleName(item)} × {item.qty}
                    </span>
                    <span className="text-neutral-600">฿{item.price * item.qty}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                <span className="text-xs text-neutral-400">{order.date}</span>
                <span className="font-bold text-accent-600">฿{order.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
