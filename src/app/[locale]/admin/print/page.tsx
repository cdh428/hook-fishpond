'use client';

/**
 * 打印设置与测试
 * ==============
 *
 * 收银机上打开这一页，就能：
 *   1. 看到本地打印桥是否在线（蓝牙小票机是否被识别到）；
 *   2. 给「后厨单 / 预结单 / 收据」分别指定打印目标（USB 机或蓝牙机）；
 *   3. 打测试页，确认纸宽 80mm、泰文/中文、二维码都正常。
 *
 * 选择结果存在本机 localStorage —— 每台收银机各存各的，互不影响。
 */

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearBridgeCache,
  getBridgeUrl,
  getPrintMode,
  getTargetFor,
  pickAutoTarget,
  printViaBridge,
  probeBridge,
  setBridgeUrl,
  setPrintMode,
  setTargetFor,
  targetId,
  type BridgeHealth,
  type BridgeTarget,
  type PrintMode,
  type PrintPurpose,
} from '@/lib/print-agent';
import { buildKitchenTicketHtml, buildBillHtml, type PrintLabels, type ReceiptOrder } from '@/lib/print-receipt';

type Health = BridgeHealth | null;
type ProbeState = 'checking' | 'online' | 'offline';

const PURPOSES: PrintPurpose[] = ['kitchen', 'bill', 'receipt'];

/** 设置页测试用的假订单 —— 只为验证链路，不进数据库 */
function demoOrder(locale: string): ReceiptOrder {
  const pick = (zh: string, en: string, th: string) =>
    locale === 'th' ? th : locale === 'en' ? en : zh;
  return {
    orderNumber: 'TEST-0001',
    createdAt: new Date().toISOString(),
    tableName: pick('A3 桌', 'Table A3', 'โต๊ะ A3'),
    orderType: 'DINE_IN',
    customerName: null,
    settlementMode: 'POSTPAID',
    status: 'PREPARING',
    items: [
      { name: pick('烤鱼套餐', 'Grilled fish set', 'ชุดปลาย่าง'), quantity: 1, unitPrice: 260, totalPrice: 260 },
      { name: pick('青木瓜沙拉', 'Som tam', 'ส้มตำ'), quantity: 2, unitPrice: 60, totalPrice: 120 },
    ],
    subtotal: 380,
    fishWeightKg: 2.5,
    fishCharge: 90,
    discountAmount: 0,
    discountNote: null,
    totalPrice: 470,
    note: null,
  };
}

export default function AdminPrintPage() {
  const t = useTranslations();
  const locale = useMemo(
    () => (typeof document !== 'undefined'
      ? (document.documentElement.lang || 'zh').slice(0, 2)
      : 'zh'),
    [],
  );

  const [probe, setProbe] = useState<ProbeState>('checking');
  const [health, setHealth] = useState<Health>(null);
  const [targets, setTargets] = useState<BridgeTarget[]>([]);
  const [mode, setMode] = useState<PrintMode>('bridge');
  const [bridgeAddr, setBridgeAddr] = useState('');
  const [saved, setSaved] = useState<Record<PrintPurpose, string>>({
    kitchen: '',
    bill: '',
    receipt: '',
  });
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setProbe('checking');
    setError('');
    clearBridgeCache();
    try {
      const h = await probeBridge(true);
      if (h) {
        setHealth(h);
        setProbe('online');
        setTargets(h.targets ?? []);
      } else {
        setHealth(null);
        setProbe('offline');
        setTargets([]);
      }
    } catch {
      setHealth(null);
      setProbe('offline');
      setTargets([]);
    }
  }, []);

  useEffect(() => {
    setMode(getPrintMode());
    setBridgeAddr(getBridgeUrl());
    setSaved({
      kitchen: getTargetFor('kitchen'),
      bill: getTargetFor('bill'),
      receipt: getTargetFor('receipt'),
    });
    void refresh();
  }, [refresh]);

  const labels: PrintLabels = useMemo(
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
      thanks: t('printLabels.thanks'),
    }),
    [t],
  );

  const chooseTarget = (purpose: PrintPurpose, id: string) => {
    setTargetFor(purpose, id);
    setSaved((s) => ({ ...s, [purpose]: id }));
  };

  const applyMode = (m: PrintMode) => {
    setPrintMode(m);
    setMode(m);
  };

  const applyBridgeAddr = () => {
    setBridgeUrl(bridgeAddr);
    void refresh();
  };

  const runTest = async (purpose: 'kitchen' | 'bill') => {
    if (!health) {
      setError(t('adminPrint.needBridge'));
      return;
    }
    const target = saved[purpose] || pickAutoTarget(health, purpose);
    if (!target) {
      setError(t('adminPrint.needTarget'));
      return;
    }
    setTesting(purpose);
    setError('');
    setMessage('');
    try {
      const order = demoOrder(locale);
      const html =
        purpose === 'kitchen'
          ? buildKitchenTicketHtml(order, labels)
          : buildBillHtml(order, { qrDataUrl: null, labels });
      const r = await printViaBridge(html, target, { copies: 1 });
      if (r.ok) {
        setMessage(
          t('adminPrint.testSent', {
            purpose: t(`adminPrint.${purpose}` as never),
            target: health.targets.find((x) => targetId(x) === target)?.name || target,
            ms: Math.round(r.ms ?? 0),
          }),
        );
      } else {
        setError(t('adminPrint.testFailed', { error: r.error || '' }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(null);
    }
  };

  const statusDot = (kind: 'blue' | 'green' | 'red' | 'grey') => {
    const color =
      kind === 'green' ? 'bg-success-500' : kind === 'red' ? 'bg-error-500' : kind === 'blue' ? 'bg-primary-500' : 'bg-neutral-300';
    return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-neutral-900">{t('adminPrint.title')}</h3>
        <button
          onClick={() => void refresh()}
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
        >
          ↻ {t('adminPrint.refresh')}
        </button>
      </div>

      {/* 桥接状态 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {probe === 'checking' && statusDot('blue')}
            {probe === 'online' && statusDot('green')}
            {probe === 'offline' && statusDot('red')}
            <span className="text-sm font-semibold text-neutral-900">
              {t('adminPrint.bridgeStatus')}
            </span>
          </div>
          <span
            className={`text-xs font-medium ${
              probe === 'online' ? 'text-success-600' : probe === 'offline' ? 'text-error-600' : 'text-neutral-400'
            }`}
          >
            {probe === 'checking'
              ? t('adminPrint.checking')
              : probe === 'online'
                ? t('adminPrint.online')
                : t('adminPrint.offline')}
          </span>
        </div>

        {health && (
          <div className="mt-3 space-y-1 text-xs text-neutral-500">
            <div className="flex justify-between">
              <span>{t('adminPrint.version')}</span>
              <span className="font-mono text-neutral-700">{health.version}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('adminPrint.widthDots')}</span>
              <span className="font-mono text-neutral-700">{health.widthDots} dots (80mm)</span>
            </div>
            <div className="flex justify-between">
              <span>{t('adminPrint.targetCount')}</span>
              <span className="font-mono text-neutral-700">{health.printerCount}</span>
            </div>
          </div>
        )}

        {probe === 'offline' && (
          <div className="mt-3 rounded-xl bg-warning-50 p-3 text-xs leading-relaxed text-warning-700">
            <p className="font-semibold">{t('adminPrint.offlineTitle')}</p>
            <p className="mt-1">{t('adminPrint.offlineHint')}</p>
            <code className="mt-2 block break-all rounded bg-white/70 px-2 py-1.5 font-mono text-[11px] text-neutral-700">
              python tools/print-bridge/bridge.py
            </code>
          </div>
        )}
      </div>

      {/* 打印方式 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.mode')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['bridge', 'browser'] as PrintMode[]).map((m) => (
            <button
              key={m}
              onClick={() => applyMode(m)}
              className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
                mode === m
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
              }`}
            >
              {m === 'bridge' ? t('adminPrint.modeBridge') : t('adminPrint.modeBrowser')}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">{t('adminPrint.modeHint')}</p>
      </div>

      {/* 目标分配 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.assign')}</p>
        {probe !== 'online' ? (
          <p className="mt-2 text-xs text-neutral-400">{t('adminPrint.needBridge')}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {PURPOSES.map((p) => (
              <div key={p}>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  {t(`adminPrint.${p}` as never)}
                </label>
                <select
                  value={saved[p]}
                  onChange={(e) => chooseTarget(p, e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                >
                  <option value="">{t('adminPrint.autoPick')}</option>
                  {targets.map((x) => (
                    <option key={`${x.kind}-${targetId(x)}`} value={targetId(x)}>
                      {x.name}
                      {x.isBluetooth ? ` · ${t('adminPrint.bluetooth')}` : ''}
                      {x.kind === 'winspool' ? ` · ${t('adminPrint.usb')}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 测试打印 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.test')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => void runTest('kitchen')}
            disabled={!!testing || probe !== 'online'}
            className="rounded-xl bg-primary-700 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-800 disabled:opacity-50"
          >
            {testing === 'kitchen' ? t('adminPrint.testing') : `🖨️ ${t('adminPrint.kitchen')}`}
          </button>
          <button
            onClick={() => void runTest('bill')}
            disabled={!!testing || probe !== 'online'}
            className="rounded-xl bg-accent-500 py-2.5 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
          >
            {testing === 'bill' ? t('adminPrint.testing') : `🧾 ${t('adminPrint.bill')}`}
          </button>
        </div>
        {message && <p className="mt-3 text-xs text-success-600">{message}</p>}
        {error && <p className="mt-3 text-xs text-error-600">{error}</p>}
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">{t('adminPrint.testHint')}</p>
      </div>

      {/* 目标清单 */}
      {targets.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.targetList')}</p>
          <div className="mt-3 space-y-2">
            {targets.map((x) => (
              <div
                key={`${x.kind}-${targetId(x)}`}
                className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-neutral-800">{x.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-neutral-400">
                    {x.kind === 'serial' ? `SPP ${x.port}` : x.driver || x.port}
                    {x.mac ? ` · ${x.mac}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {x.isThermal && (
                    <span className="rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700">
                      {t('adminPrint.thermal')}
                    </span>
                  )}
                  {x.isBluetooth && (
                    <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                      {t('adminPrint.bluetooth')}
                    </span>
                  )}
                  {x.kind === 'winspool' && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                      {t('adminPrint.usb')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 高级：桥地址 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.advanced')}</p>
        <label className="mt-3 mb-1 block text-xs font-medium text-neutral-600">
          {t('adminPrint.bridgeUrl')}
        </label>
        <div className="flex gap-2">
          <input
            value={bridgeAddr}
            onChange={(e) => setBridgeAddr(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 font-mono text-xs"
          />
          <button
            onClick={applyBridgeAddr}
            className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.save')}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">{t('adminPrint.bridgeUrlHint')}</p>
      </div>
    </div>
  );
}
