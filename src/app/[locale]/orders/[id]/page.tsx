'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { fetchOrder } from '@/lib/api-client';
import { ORDER_STATUS_COLOR, ORDER_STATUS_I18N, pickName } from '@/lib/order-view';

/**
 * 顾客订单详情 —— 下单成功后落地页，也是「我的订单」点进来的详情页。
 * 显示客户下单的内容、当前进度与结算状态。
 */
export default function OrderDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId) return;
      setLoading(true);
      setError('');
      try {
        const raw = await fetchOrder(orderId);
        if (!cancelled) setOrder(raw);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t('common.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-sm text-neutral-400">
        {t('common.loading')}
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-sm text-error-600">{error || t('common.error')}</p>
        <Link
          href="/menu"
          className="mt-4 inline-block rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white"
        >
          {t('home.orderFood')}
        </Link>
      </div>
    );
  }

  const status = order.status as string;
  const mode = (order.settlementMode as string) || 'POSTPAID';
  const tableName = order.table
    ? `${order.table.code} · ${pickName(order.table, locale)}`
    : null;
  const time = order.createdAt
    ? new Date(order.createdAt).toLocaleString()
    : '';

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* 下单成功提示 */}
      {status === 'PENDING' && (
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-success-50">
            <svg className="h-8 w-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-neutral-900">{t('orderDetail.placed')}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {mode === 'POSTPAID'
              ? t('orderDetail.postpaidHint')
              : t('orderDetail.prepaidHint')}
          </p>
        </div>
      )}

      {/* 订单头 */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-neutral-400">{t('orders.orderNumber')}</p>
            <p className="text-lg font-bold text-neutral-900">{order.orderNumber}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{time}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              ORDER_STATUS_COLOR[status] || 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {t(ORDER_STATUS_I18N[status] || 'orders.pending')}
          </span>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">{t('orderDetail.seat')}</span>
            <span className="font-medium text-neutral-800">
              {order.orderType === 'TAKEAWAY' || !tableName
                ? t('orderType.takeaway')
                : tableName}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">{t('adminOrders.settlementMode')}</span>
            <span
              className={`font-medium ${
                mode === 'PREPAID' ? 'text-primary-600' : 'text-warning-600'
              }`}
            >
              {mode === 'PREPAID' ? t('adminOrders.prepaid') : t('adminOrders.postpaid')}
            </span>
          </div>
        </div>
      </div>

      {/* 下单内容 */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">
          {t('orders.details')}
        </h3>
        <div className="space-y-2">
          {(order.items || []).map((it: any) => (
            <div key={it.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 text-neutral-800">
                {pickName(it.menuItem, locale)}
                <span className="ml-1 text-xs text-neutral-400">× {it.quantity}</span>
                {it.note && (
                  <span className="mt-0.5 block text-[11px] text-warning-600">
                    ※ {it.note}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-neutral-500">฿{it.totalPrice}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">{t('adminOrders.subtotal')}</span>
            <span className="font-medium">฿{order.subtotal}</span>
          </div>
          {order.fishWeightKg > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-500">
                🐟 {t('adminOrders.fishCharge')} ({order.fishWeightKg} kg)
              </span>
              <span className="font-medium">฿{order.fishCharge}</span>
            </div>
          )}
          {order.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-500">
                {t('adminOrders.discount')}
                {order.discountNote ? ` (${order.discountNote})` : ''}
              </span>
              <span className="font-medium text-error-600">−฿{order.discountAmount}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-100 pt-2">
            <span className="font-semibold text-neutral-900">{t('payment.total')}</span>
            <span className="text-xl font-bold text-accent-600">฿{order.totalPrice}</span>
          </div>
        </div>

        {order.note && (
          <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            {t('cart.orderNote')}: {order.note}
          </p>
        )}

        {order.fishWeightKg === 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
            {t('cart.fishChargeNotice')}
          </p>
        )}
      </div>

      {/* 操作 */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/orders"
          className="rounded-xl bg-neutral-100 py-3 text-center text-sm font-medium text-neutral-700"
        >
          {t('common.orders')}
        </Link>
        <Link
          href="/menu"
          className="rounded-xl bg-accent-500 py-3 text-center text-sm font-semibold text-white shadow-cta"
        >
          {t('home.orderFood')}
        </Link>
      </div>
    </div>
  );
}
