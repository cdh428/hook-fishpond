'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Transaction {
  id: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  method: string;
  pondType: 'LEISURE' | 'COMPETITION' | 'food';
  date: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'REFUNDED';
}

const demoTransactions: Transaction[] = [
  { id: '1', orderNumber: 'FP-20260714-001', customerName: '张先生', amount: 100, method: 'PromptPay', pondType: 'LEISURE', date: '2026-07-14', status: 'SUCCESSFUL' },
  { id: '2', orderNumber: 'FP-20260714-002', customerName: 'สมชาย Team', amount: 7500, method: 'Credit Card', pondType: 'COMPETITION', date: '2026-07-14', status: 'SUCCESSFUL' },
  { id: '3', orderNumber: 'FP-20260714-003', customerName: 'John Smith', amount: 280, method: 'TrueMoney', pondType: 'food', date: '2026-07-14', status: 'SUCCESSFUL' },
  { id: '4', orderNumber: 'FP-20260713-004', customerName: '李经理', amount: 10000, method: 'Alipay', pondType: 'COMPETITION', date: '2026-07-13', status: 'SUCCESSFUL' },
  { id: '5', orderNumber: 'FP-20260713-005', customerName: '小王', amount: 100, method: 'Bank Transfer', pondType: 'LEISURE', date: '2026-07-13', status: 'PENDING' },
];

export default function AdminTransactionsPage() {
  const t = useTranslations();

  const totalRevenue = demoTransactions.filter(t => t.status === 'SUCCESSFUL').reduce((s, t) => s + t.amount, 0);
  const leisureRevenue = demoTransactions.filter(t => t.pondType === 'LEISURE' && t.status === 'SUCCESSFUL').reduce((s, t) => s + t.amount, 0);
  const competitionRevenue = demoTransactions.filter(t => t.pondType === 'COMPETITION' && t.status === 'SUCCESSFUL').reduce((s, t) => s + t.amount, 0);
  const foodRevenue = demoTransactions.filter(t => t.pondType === 'food' && t.status === 'SUCCESSFUL').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('admin.transactions')}</h2>

      {/* Date Range */}
      <div className="mb-4 flex gap-2">
        <input
          type="date"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <input
          type="date"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <button className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-brand">
          {t('common.filter')}
        </button>
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl bg-accent-50 p-4 shadow-md">
          <p className="text-xs font-medium text-accent-700">{t('admin.totalRevenue')}</p>
          <p className="text-2xl font-bold text-accent-800">฿{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-primary-50 p-4 shadow-md">
          <p className="text-xs font-medium text-primary-700">{t('admin.totalOrders')}</p>
          <p className="text-2xl font-bold text-primary-800">{demoTransactions.length}</p>
        </div>
      </div>

      {/* Revenue by Pond */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">{t('admin.revenueByPond')}</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-600">{t('admin.leisurePond')}</span>
            <span className="text-sm font-semibold text-neutral-900">฿{leisureRevenue.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-bg-page">
            <div className="h-2 rounded-full bg-primary-500" style={{ width: `${(leisureRevenue / totalRevenue) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-600">{t('admin.competitionPond')}</span>
            <span className="text-sm font-semibold text-neutral-900">฿{competitionRevenue.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-bg-page">
            <div className="h-2 rounded-full bg-accent-500" style={{ width: `${(competitionRevenue / totalRevenue) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-600">{t('menu.food')}</span>
            <span className="text-sm font-semibold text-neutral-900">฿{foodRevenue.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-bg-page">
            <div className="h-2 rounded-full bg-success-500" style={{ width: `${(foodRevenue / totalRevenue) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">{t('admin.recentOrders')}</h3>
        <div className="space-y-2">
          {demoTransactions.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between rounded-lg bg-bg-page px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">{txn.orderNumber}</p>
                <p className="text-xs text-neutral-500">{txn.customerName} · {txn.date}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-neutral-900">฿{txn.amount.toLocaleString()}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                  txn.status === 'SUCCESSFUL' ? 'bg-success-50 text-success-700' :
                  txn.status === 'PENDING' ? 'bg-warning-50 text-warning-700' :
                  'bg-error-50 text-error-700'
                }`}>
                  {txn.status === 'SUCCESSFUL' ? t('orders.paid') :
                   txn.status === 'PENDING' ? t('orders.pending') : t('orders.cancelled')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <button className="mt-4 w-full rounded-xl border border-primary-200 py-3 text-sm font-medium text-primary-700 transition hover:bg-primary-50">
        {t('admin.exportData')}
      </button>
    </div>
  );
}
