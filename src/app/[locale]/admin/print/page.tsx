'use client';

/**
 * 打印设置页 —— 简化版（2026-11-17）
 * ==============
 *
 * 只保留两个核心配置：
 *   1. 纸宽（50mm / 80mm）
 *   2. 水平偏移（校正热敏机驱动物理左边距）
 *
 * 已移除的过时功能：
 *   · 蓝牙连接（现在只走 POS80 USB 热敏机）
 *   · 通道偏好（usb/bluetooth/auto）—— 只有 USB 一条路
 *   · 切纸模式（全切/半切）—— 桥端自动切
 *   · 走纸行数 —— 桥端固定值
 *   · 浏览器打印回退 —— 一律走桥
 *   · 打印目标清单展示 —— 只有一台 POS80，意义不大
 */

import { useTranslations, useLocale } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  clearBridgeCache,
  getBridgeUrl,
  getBridgeKey,
  getPreferences,
  loadPreferences,
  paperWidthToDots,
  printViaBridge,
  probeBridge,
  savePreferences,
  setPreferences as cachePreferences,
  setBridgeKey,
  setBridgeUrl,
  type BridgeHealth,
  type PaperWidthMm,
  type PrintPreferences,
} from '@/lib/print-agent';
import { buildBillHtml, type PrintLabels, type ReceiptOrder } from '@/lib/print-receipt';

type Health = BridgeHealth | null;
type ProbeState = 'checking' | 'online' | 'offline';

const PAPER_WIDTHS: PaperWidthMm[] = ['50', '80'];

/** 设置页测试用的假订单 */
function demoOrder(locale: string): ReceiptOrder {
  const pick = (zh: string, en: string, th: string) =>
    locale === 'th' ? th : locale === 'en' ? en : zh;
  return {
    orderNumber: 'TEST-0001',
    createdAt: new Date().toISOString(),
    tableName: pick('茅草屋 01', 'Cottage 01', 'กระท่อม 01'),
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
  const locale = useLocale();

  const [probe, setProbe] = useState<ProbeState>('checking');
  const [health, setHealth] = useState<Health>(null);
  const [bridgeAddr, setBridgeAddr] = useState('');
  const [bridgeKey, setBridgeKeyState] = useState('');
  const [prefs, setPrefs] = useState<PrintPreferences>(DEFAULT_PREFERENCES);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState('');
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setProbe('checking');
    setError('');
    clearBridgeCache();
    try {
      const h = await probeBridge(true);
      setHealth(h);
      setProbe(h ? 'online' : 'offline');
    } catch {
      setHealth(null);
      setProbe('offline');
    }
  }, []);

  useEffect(() => {
    setBridgeAddr(getBridgeUrl());
    setBridgeKeyState(getBridgeKey());
    setPrefs(getPreferences());
    void loadPreferences(true).then(setPrefs);
    void refresh();
  }, [refresh]);

  const labels: PrintLabels = {
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
    served: t('printLabels.served'),
    notServed: t('printLabels.notServed'),
    batchAt: t('printLabels.batchAt'),
    itemCount: t('printLabels.itemCount'),
    paidStamp: t('printLabels.paidStamp'),
  };

  /** 改偏好后立刻写库 */
  const updatePrefs = async (patch: Partial<PrintPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    cachePreferences(next);
    setPrefsSaving(true);
    setPrefsSaved('');
    try {
      const r = await savePreferences(next);
      if (r.ok) {
        setPrefsSaved(t('adminPrint.prefsSaved'));
        setTimeout(() => setPrefsSaved(''), 2000);
      } else {
        setError(t('adminPrint.prefsSaveFailed', { error: r.error || '' }));
      }
    } finally {
      setPrefsSaving(false);
    }
  };

  const runTest = async () => {
    if (!health) {
      setError(t('adminPrint.needBridge'));
      return;
    }
    setTesting(true);
    setError('');
    setMessage('');
    try {
      const order = demoOrder(locale);
      const paperWidthMm = Number(prefs.paperWidth) || 80;
      const html = buildBillHtml(order, { qrDataUrl: null, labels, paperWidthMm });
      const target = health.defaultPrinter || health.targets[0]?.name || 'POS80';
      const r = await printViaBridge(html, target, {
        copies: 1,
        cut: true,
        width: paperWidthToDots(prefs.paperWidth),
        paperWidthMm,
        leftShiftMm: prefs.leftShiftMm,
      });
      if (r.ok) {
        setMessage(t('adminPrint.testSent', { target, ms: Math.round(r.ms ?? 0) }));
      } else {
        setError(t('adminPrint.testFailed', { error: r.error || '' }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const statusDot = (kind: 'blue' | 'green' | 'red') => {
    const color =
      kind === 'green' ? 'bg-success-500' : kind === 'red' ? 'bg-error-500' : 'bg-primary-500';
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
              <span className="font-mono text-neutral-700">{health.widthDots} dots</span>
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
            <code className="mt-2 block break-all rounded bg-white/70 px-2 py-1.5 font-mono text-[11px] text-neutral-700">
              python tools/print-bridge/bridge.py
            </code>
          </div>
        )}
      </div>

      {/* 纸宽 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.paperWidth')}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{t('adminPrint.paperWidthHint')}</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {PAPER_WIDTHS.map((mm) => (
            <button
              key={mm}
              onClick={() => void updatePrefs({ paperWidth: mm })}
              className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition ${
                prefs.paperWidth === mm
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
              }`}
            >
              {mm === '80' ? t('adminPrint.paper80') : t('adminPrint.paper50')}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
          {t('adminPrint.paperWidthDots', { dots: paperWidthToDots(prefs.paperWidth) })}
        </p>
      </div>

      {/* 水平偏移 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.leftShift')}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{t('adminPrint.leftShiftHint')}</p>

        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs font-medium text-neutral-600">
              {t('adminPrint.leftShiftPositive')}
            </span>
            <span className="font-mono text-sm text-neutral-700">
              {prefs.leftShiftMm > 0 ? '+' : ''}
              {prefs.leftShiftMm} {t('adminPrint.leftShiftUnit')}
            </span>
            <span className="text-xs font-medium text-neutral-600">
              {t('adminPrint.leftShiftNegative')}
            </span>
          </div>
          <input
            type="range"
            min={-20}
            max={20}
            step={1}
            value={prefs.leftShiftMm}
            onChange={(e) => void updatePrefs({ leftShiftMm: Number(e.target.value) })}
            className="w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
            <span>-20 mm</span>
            <button
              onClick={() => void updatePrefs({ leftShiftMm: 0 })}
              className="font-medium text-neutral-600 hover:text-primary-700"
            >
              {t('adminPrint.leftShiftZero')}
            </button>
            <span>+20 mm</span>
          </div>
        </div>
      </div>

      {/* 测试打印 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminPrint.test')}</p>
        <button
          onClick={() => void runTest()}
          disabled={testing || probe !== 'online'}
          className="mt-3 w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800 disabled:opacity-50"
        >
          {testing ? t('adminPrint.testing') : `🧾 ${t('adminPrint.test')}`}
        </button>
        {message && <p className="mt-3 text-xs text-success-600">{message}</p>}
        {error && <p className="mt-3 text-xs text-error-600">{error}</p>}
      </div>

      {/* 高级：桥地址（本机，不共用） */}
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
            onClick={() => {
              setBridgeUrl(bridgeAddr);
              void refresh();
            }}
            className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.save')}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">{t('adminPrint.bridgeUrlHint')}</p>

        <label className="mt-3 mb-1 block text-xs font-medium text-neutral-600">
          {t('adminPrint.authKey')}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={bridgeKey}
            placeholder={t('adminPrint.authKeyPlaceholder')}
            onChange={(e) => setBridgeKeyState(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 font-mono text-xs"
          />
          <button
            onClick={() => {
              setBridgeKey(bridgeKey);
              setMessage(t('adminPrint.authKeySaved'));
              setTimeout(() => setMessage(''), 2000);
            }}
            className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.save')}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">{t('adminPrint.authKeyHint')}</p>
      </div>

      {/* 保存状态提示 */}
      {(prefsSaving || prefsSaved) && (
        <div className="flex justify-end text-[11px]">
          {prefsSaving ? (
            <span className="text-neutral-400">{t('adminPrint.saving')}</span>
          ) : prefsSaved ? (
            <span className="text-success-600">{prefsSaved}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
