'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { fetchOrder } from '@/lib/api-client';
import {
  ORDER_STATUS_COLOR,
  ORDER_STATUS_I18N,
  pickName,
  toReceiptOrder,
} from '@/lib/order-view';
import {
  buildKitchenTicketHtml,
  buildBillHtml,
  type PrintLabels,
} from '@/lib/print-receipt';
import { loadPreferences } from '@/lib/print-agent';
import { formatLineOptions } from '@/lib/menu-options';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * 顾客订单详情 —— 下单成功后落地页，也是「我的订单」点进来的详情页。
 * 显示客户下单的内容、当前进度与结算状态。
 *
 * ⚠️ 2026-11-17：客户侧不再直接调打印桥（客户手机上没有桥，点了必然失败）。
 * 改为**生成 PDF 下载存证**到客户手机，客户可保存/转发。
 * 真实打印由 POS80 那台机的打印桥 --watch 自动拉单完成，客户侧只负责存证。
 */
export default function OrderDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState<'kitchen' | 'bill' | null>(null);
  const [printMsg, setPrintMsg] = useState('');

  const printLabels: PrintLabels = useMemo(
    () => ({
      brand: t('common.siteName'),
      brandSub: t('printLabels.brandSub'),
      kitchenTicket: t('printLabels.kitchenTicket'),
      bill: t('printLabels.bill'),
      receipt: t('printLabels.receipt'),
      orderNo: t('orders.orderNumber'),
      table: t('printLabels.table'),
      takeaway: t('orderType.takeaway'),
      dineIn: t('orderType.dineIn'),
      customer: t('admin.customer'),
      time: t('printLabels.time'),
      item: t('printLabels.item'),
      qty: t('printLabels.qty'),
      amount: t('admin.amount'),
      subtotal: t('adminOrders.subtotal'),
      fishCharge: t('adminOrders.fishCharge'),
      fishWeight: t('adminOrders.weightKg'),
      discount: t('adminOrders.discount'),
      total: t('payment.total'),
      note: t('cart.orderNote'),
      status: t('orders.status'),
      settlementMode: t('adminOrders.settlementMode'),
      prepaid: t('adminOrders.prepaid'),
      postpaid: t('adminOrders.postpaid'),
      scanToPay: t('adminOrders.scanToPay'),
      paidAt: t('adminOrders.settledAt'),
      pickupAt: t('cart.pickupTime'),
      thanks: t('printLabels.thanks'),
      // 行级送餐状态与分批标题（必须按 locale 传入，渲染库不硬编码中文）
      served: t('printLabels.served'),
      notServed: t('printLabels.notServed'),
      batchAt: t('printLabels.batchAt'),
      itemCount: t('printLabels.itemCount'),
      paidStamp: t('printLabels.paidStamp'),
    }),
    [t],
  );

  const doPrint = async (purpose: 'kitchen' | 'bill') => {
    if (!order) return;
    setPrinting(purpose);
    setPrintMsg('');
    try {
      const ro = toReceiptOrder(order, locale);
      // ⚠️ 2026-11-05：纸宽（50/80mm）从偏好读取，决定 HTML 渲染宽度
      const prefs = await loadPreferences();
      const pw = Number(prefs.paperWidth) || 80;
      const html =
        purpose === 'kitchen'
          ? buildKitchenTicketHtml(ro, printLabels, undefined, pw)
          : buildBillHtml(ro, { qrDataUrl: null, labels: printLabels, paperWidthMm: pw });

      // 客户侧存证：把小票 HTML 离屏渲染成 PNG，再用 jsPDF 打包成 PDF 下载。
      // （客户手机上没有打印桥，点了打印必然失败；改成 PDF 让客户存证/转发。）
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:fixed;left:-10000px;top:0;width:${pw}mm;background:#fff;`;
      wrap.innerHTML = html;
      document.body.appendChild(wrap);
      let pdf: jsPDF;
      try {
        const canvas = await html2canvas(wrap, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          windowWidth: wrap.scrollWidth,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pwMm = wrap.scrollWidth * 25.4 / 96;
        const phMm = canvas.height * pwMm / canvas.width;
        pdf = new jsPDF({
          orientation: phMm > pwMm ? 'portrait' : 'landscape',
          unit: 'mm',
          format: [pwMm, phMm],
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, pwMm, phMm);
      } finally {
        document.body.removeChild(wrap);
      }
      const fileName = `${ro.orderNumber || 'order'}-${purpose}.pdf`;
      pdf.save(fileName);
      setPrintMsg(t('orderDetail.pdfSaved'));
    } catch (e: any) {
      setPrintMsg(e?.message || t('common.error'));
    } finally {
      setPrinting(null);
    }
  };

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
      <div className="mx-auto max-w-lg md:max-w-3xl px-4 py-20 text-center text-sm text-neutral-400">
        {t('common.loading')}
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-lg md:max-w-3xl px-4 py-20 text-center">
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
    <div className="mx-auto max-w-lg md:max-w-3xl px-4 py-6">
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

      {/* 合单提示：本次点单已并入本桌既有账单 */}
      {order.merged && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-info-200 bg-info-50 px-4 py-3 text-sm font-medium text-info-800">
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m6 7H4m0 0 4 4m-4-4 4-4" />
          </svg>
          {t('cart.mergedBanner')}
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
          {order.pickupAt && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">{t('cart.pickupTime')}</span>
              <span className="font-medium text-accent-700">
                {new Date(order.pickupAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 下单内容 */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">
          {t('orders.details')}
        </h3>
        <div className="space-y-2">
          {(order.items || []).map((it: any) => {
            const optLines = formatLineOptions(it.options, locale);
            return (
              <div key={it.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 text-neutral-800">
                  {pickName(it.menuItem, locale)}
                  <span className="ml-1 text-xs text-neutral-400">× {it.quantity}</span>
                  {optLines.map((l, i) => (
                    <span key={i} className="mt-0.5 block text-[11px] text-neutral-500">
                      {l}
                    </span>
                  ))}
                  {it.note && (
                    <span className="mt-0.5 block text-[11px] text-warning-600">
                      ※ {it.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-neutral-500">฿{it.totalPrice}</span>
              </div>
            );
          })}
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

          {/* 部分付款：已付 / 需付差额（称重后渔获费追加时自动更新） */}
          {(() => {
            const prepaid = order.prepaidAmount ?? 0;
            const remaining = Math.max(0, Math.round((order.totalPrice - prepaid) * 100) / 100);
            if (prepaid <= 0 && mode !== 'PREPAID') return null;
            return (
              <div className="mt-2 space-y-1 border-t border-dashed border-neutral-200 pt-2">
                {prepaid > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">{t('orders.prepaid')}</span>
                    <span className="font-medium text-success-600">
                      ฿{prepaid}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-neutral-700">{t('orders.remaining')}</span>
                  <span className={`font-bold ${remaining > 0 ? 'text-accent-600' : 'text-success-600'}`}>
                    {remaining > 0 ? `฿${remaining}` : t('orders.paidInFull')}
                  </span>
                </div>
              </div>
            );
          })()}
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

      {/* 存证 PDF（客户手机无打印桥，改下载 PDF 存证；真实打印由 POS80 桥 --watch 完成） */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">
          📄 {t('orderDetail.pdfTitle')}
        </h3>
        <p className="mb-3 text-xs text-neutral-500">{t('orderDetail.pdfHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void doPrint('kitchen')}
            disabled={printing !== null}
            className="rounded-xl bg-primary-700 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-800 disabled:opacity-50"
          >
            {printing === 'kitchen' ? t('adminPrint.testing') : t('adminPrint.kitchen')}
          </button>
          <button
            onClick={() => void doPrint('bill')}
            disabled={printing !== null}
            className="rounded-xl bg-neutral-100 py-2.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {printing === 'bill' ? t('adminPrint.testing') : t('adminPrint.bill')}
          </button>
        </div>
        {printMsg && (
          <p className="mt-2 text-xs text-neutral-500">{printMsg}</p>
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
