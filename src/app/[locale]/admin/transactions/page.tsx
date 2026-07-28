'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

interface Transaction {
  id: string;
  orderId: string;
  customer: string;
  type: 'booking' | 'order';
  method: string;
  amount: number;
  date: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'REFUNDED';
}

const demoTransactions: Transaction[] = [
  { id: 'T-001', orderId: 'FP-001', customer: '张三', type: 'order', method: 'PROMPTPAY', amount: 480, date: '2026-03-20', status: 'SUCCESSFUL' },
  { id: 'T-002', orderId: 'BK-002', customer: 'John', type: 'booking', method: 'BANK_TRANSFER', amount: 7500, date: '2026-03-20', status: 'SUCCESSFUL' },
  { id: 'T-003', orderId: 'FP-002', customer: 'John', type: 'order', method: 'TRUEMONEY', amount: 150, date: '2026-03-20', status: 'SUCCESSFUL' },
  { id: 'T-004', orderId: 'BK-003', customer: 'สมชาย', type: 'booking', method: 'PROMPTPAY', amount: 100, date: '2026-03-20', status: 'PENDING' },
  { id: 'T-005', orderId: 'FP-003', customer: 'สมชาย', type: 'order', method: 'ALIPAY', amount: 320, date: '2026-03-19', status: 'SUCCESSFUL' },
  { id: 'T-006', orderId: 'BK-004', customer: '李四', type: 'booking', method: 'CREDIT_CARD', amount: 6000, date: '2026-03-19', status: 'REFUNDED' },
  { id: 'T-007', orderId: 'FP-004', customer: '张三', type: 'order', method: 'WECHAT_PAY', amount: 250, date: '2026-03-19', status: 'SUCCESSFUL' },
  { id: 'T-008', orderId: 'BK-001', customer: '张三', type: 'booking', method: 'PROMPTPAY', amount: 100, date: '2026-03-18', status: 'SUCCESSFUL' },
];

const methodI18n: Record<string, string> = {
  PROMPTPAY: 'payment.promptpay',
  TRUEMONEY: 'payment.truemoney',
  BANK_TRANSFER: 'payment.bankTransfer',
  CREDIT_CARD: 'payment.creditCard',
  ALIPAY: 'payment.alipay',
  WECHAT_PAY: 'payment.wechatPay',
};

const statusColors: Record<string, string> = {
  SUCCESSFUL: 'bg-success-100 text-success-600',
  PENDING: 'bg-warning-100 text-warning-600',
  REFUNDED: 'bg-error-100 text-error-600',
};

export default function AdminTransactionsPage() {
  const t = useTranslations();
  const [startDate, setStartDate] = useState('2026-03-01');
  const [endDate, setEndDate] = useState('2026-03-31');

  const filtered = demoTransactions.filter((tx) => {
    if (startDate && tx.date < startDate) return false;
    if (endDate && tx.date > endDate) return false;
    return true;
  });

  const totalRevenue = filtered
    .filter((tx) => tx.status === 'SUCCESSFUL')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const bookingRevenue = filtered
    .filter((tx) => tx.type === 'booking' && tx.status === 'SUCCESSFUL')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const foodRevenue = filtered
    .filter((tx) => tx.type === 'order' && tx.status === 'SUCCESSFUL')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalOrders = filtered.length;
  const successCount = filtered.filter((tx) => tx.status === 'SUCCESSFUL').length;

  // Revenue by method
  const methodRevenue: Record<string, number> = {};
  filtered
    .filter((tx) => tx.status === 'SUCCESSFUL')
    .forEach((tx) => {
      methodRevenue[tx.method] = (methodRevenue[tx.method] || 0) + tx.amount;
    });

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">{t('admin.transactions')}</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H3m0 0l4-4m-4 4l4 4m12-4a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('admin.viewSite')}
          </Link>
          <Link
            href="/admin"
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.back')}
          </Link>
        </div>
      </div>

      {/* Date Range */}
      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-500">{t('admin.startDate')}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-500">{t('admin.endDate')}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Revenue KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-success-50 p-4">
          <p className="text-xs text-success-600 opacity-70">{t('admin.totalRevenue')}</p>
          <p className="mt-1 text-2xl font-bold text-success-700">฿{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-primary-50 p-4">
          <p className="text-xs text-primary-600 opacity-70">{t('admin.totalOrders')}</p>
          <p className="mt-1 text-2xl font-bold text-primary-700">{successCount}/{totalOrders}</p>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-accent-50 p-4">
          <p className="text-xs text-accent-600 opacity-70">{t('admin.bookings')}</p>
          <p className="mt-1 text-xl font-bold text-accent-700">฿{bookingRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-neutral-100 p-4">
          <p className="text-xs text-neutral-600 opacity-70">{t('menu.food')} & {t('menu.drinks')}</p>
          <p className="mt-1 text-xl font-bold text-neutral-700">฿{foodRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Revenue by Payment Method */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.revenueByMethod')}</h3>
        {Object.keys(methodRevenue).length === 0 ? (
          <p className="text-sm text-neutral-400">{t('common.noData')}</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(methodRevenue).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <span className="text-sm font-medium text-neutral-700">
                  {t(methodI18n[method] || method)}
                </span>
                <span className="text-sm font-bold text-neutral-900">฿{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.recentOrders')}</h3>
        <div className="space-y-2">
          {filtered.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">
                  {tx.orderId} — {tx.customer}
                </p>
                <p className="text-xs text-neutral-500">
                  {tx.date} | {t(methodI18n[tx.method] || tx.method)} | {tx.type === 'booking' ? t('common.booking') : t('menu.food')}
                </p>
              </div>
              <div className="ml-2 text-right shrink-0">
                <p className="text-sm font-bold text-neutral-900">฿{tx.amount.toLocaleString()}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[tx.status]}`}>
                  {tx.status === 'SUCCESSFUL' ? t('orders.successful') : tx.status === 'PENDING' ? t('orders.pending') : t('orders.refunded')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
