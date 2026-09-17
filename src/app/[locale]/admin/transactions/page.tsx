'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useMemo } from 'react';
import { fetchAdminTransactions } from '@/lib/api-client';

const methodI18n: Record<string, string> = {
  PROMPTPAY: 'payment.promptpay',
  TRUEMONEY: 'payment.truemoney',
  BANK_TRANSFER: 'payment.bankTransfer',
  CREDIT_CARD: 'payment.creditCard',
  ALIPAY: 'payment.alipay',
  WECHAT_PAY: 'payment.wechatPay',
  CASH: 'payment.cash',
};

const statusColors: Record<string, string> = {
  SUCCESSFUL: 'bg-success-100 text-success-600',
  PENDING: 'bg-warning-100 text-warning-600',
  REFUNDED: 'bg-error-100 text-error-600',
};

export default function AdminTransactionsPage() {
  const t = useTranslations();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTransactions = async () => {
    setLoading(true);
    setError('');
    try {
      const params: { startDate?: string; endDate?: string } = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await fetchAdminTransactions(params);
      setData(res);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = () => {
    loadTransactions();
  };

  const transactions = data?.transactions || [];
  const totalRevenue = data?.totalRevenue || 0;
  const bookingRevenue = data?.bookingRevenue || 0;
  const orderRevenue = data?.orderRevenue || 0;
  const transactionCount = data?.transactionCount || 0;

  const filtered = useMemo(() => {
    return transactions.filter((tx: any) => {
      const txDate = (tx.paidAt || '').slice(0, 10);
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;
      return true;
    });
  }, [transactions, startDate, endDate]);

  const successCount = filtered.filter((tx: any) => tx.status === 'SUCCESSFUL').length;
  const methodRevenue: Record<string, number> = {};
  filtered
    .filter((tx: any) => tx.status === 'SUCCESSFUL')
    .forEach((tx: any) => {
      methodRevenue[tx.method] = (methodRevenue[tx.method] || 0) + tx.amount;
    });

  return (
    <>
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
        <button
          onClick={handleFilter}
          className="self-end rounded-xl bg-primary-700 px-3 py-2 text-xs font-medium text-white hover:bg-primary-800"
        >
          {t('common.filter')}
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : error ? (
        <div className="py-20 text-center">
          <p className="text-sm text-error-600">{error}</p>
          <button onClick={loadTransactions} className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-xs font-medium text-white">
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          {/* Revenue KPI Cards */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success-50 p-4">
              <p className="text-xs text-success-600 opacity-70">{t('admin.totalRevenue')}</p>
              <p className="mt-1 text-2xl font-bold text-success-700">฿{totalRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-primary-50 p-4">
              <p className="text-xs text-primary-600 opacity-70">{t('admin.totalOrders')}</p>
              <p className="mt-1 text-2xl font-bold text-primary-700">{successCount}/{transactionCount}</p>
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
              <p className="mt-1 text-xl font-bold text-neutral-700">฿{orderRevenue.toLocaleString()}</p>
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
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {tx.orderNumber || tx.orderId || tx.id} — {tx.customerName || '—'}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {(tx.paidAt || '').slice(0, 10)} | {t(methodI18n[tx.method] || tx.method)}
                      </p>
                    </div>
                    <div className="ml-2 text-right shrink-0">
                      <p className="text-sm font-bold text-neutral-900">฿{tx.amount?.toLocaleString()}</p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[tx.status] || 'bg-neutral-100 text-neutral-600'}`}>
                        {tx.status === 'SUCCESSFUL' ? t('orders.successful') : tx.status === 'PENDING' ? t('orders.pending') : t('orders.refunded')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
