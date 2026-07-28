'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from '@/i18n/routing';
import QRCode from 'qrcode';
import { generatePromptPayPayload } from '@/lib/promptpay-qr';

type PaymentMethod = 'promptpay' | 'alipay' | 'wechat';

interface PaymentConfig {
  promptpayPhone: string;
  alipayQrImage: string; // base64 data URL
  wechatQrImage: string; // base64 data URL
}

const STORAGE_KEY = 'fishpond_payment_config';

export default function AdminCollectPage() {
  const t = useTranslations();
  const [config, setConfig] = useState<PaymentConfig>({
    promptpayPhone: '',
    alipayQrImage: '',
    wechatQrImage: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('promptpay');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const alipayFileRef = useRef<HTMLInputElement>(null);
  const wechatFileRef = useRef<HTMLInputElement>(null);

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        setTempPhone(parsed.promptpayPhone || '');
      } catch {
        // ignore
      }
    }
  }, []);

  const saveConfig = (newConfig: PaymentConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  };

  const handleSavePhone = () => {
    saveConfig({ ...config, promptpayPhone: tempPhone });
    setShowSettings(false);
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    method: 'alipay' | 'wechat'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert(t('admin.imageTooLarge'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (method === 'alipay') {
        saveConfig({ ...config, alipayQrImage: result });
      } else {
        saveConfig({ ...config, wechatQrImage: result });
      }
    };
    reader.readAsDataURL(file);
  };

  const generateQR = useCallback(async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      alert(t('admin.enterAmountFirst'));
      return;
    }

    if (method === 'promptpay') {
      if (!config.promptpayPhone) {
        alert(t('admin.setPromptPayPhone'));
        setShowSettings(true);
        return;
      }
      const payload = generatePromptPayPayload(config.promptpayPhone, numAmount);
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
      setShowQR(true);
    } else if (method === 'alipay') {
      if (!config.alipayQrImage) {
        alert(t('admin.uploadAlipayQr'));
        setShowSettings(true);
        return;
      }
      setQrDataUrl(config.alipayQrImage);
      setShowQR(true);
    } else if (method === 'wechat') {
      if (!config.wechatQrImage) {
        alert(t('admin.uploadWechatQr'));
        setShowSettings(true);
        return;
      }
      setQrDataUrl(config.wechatQrImage);
      setShowQR(true);
    }
  }, [amount, method, config, t]);

  const methodLabels: Record<PaymentMethod, string> = {
    promptpay: t('payment.promptpay'),
    alipay: t('payment.alipay'),
    wechat: t('payment.wechatPay'),
  };

  const methodColors: Record<PaymentMethod, string> = {
    promptpay: 'bg-blue-50 border-blue-500 text-blue-700',
    alipay: 'bg-blue-50 border-blue-500 text-blue-700',
    wechat: 'bg-green-50 border-green-500 text-green-700',
  };

  const methodIcons: Record<PaymentMethod, string> = {
    promptpay: '💳',
    alipay: '💰',
    wechat: '💬',
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">{t('admin.collectPayment')}</h2>
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

      {/* Settings Toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex w-full items-center justify-between rounded-xl bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('admin.paymentSettings')}
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 space-y-4 rounded-xl bg-white p-4 shadow-md">
          {/* PromptPay Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('admin.promptpayPhone')}
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={tempPhone}
                onChange={(e) => setTempPhone(e.target.value)}
                placeholder="0812345678"
                className="flex-1 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                onClick={handleSavePhone}
                className="rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-800"
              >
                {t('common.save')}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              {t('admin.promptpayPhoneHint')}
            </p>
          </div>

          {/* Alipay QR Upload */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('payment.alipay')} {t('common.image')}
            </label>
            <div className="flex items-center gap-3">
              {config.alipayQrImage ? (
                <img
                  src={config.alipayQrImage}
                  alt={t('payment.alipay')}
                  className="h-16 w-16 rounded-lg border border-neutral-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={alipayFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'alipay')}
                  className="hidden"
                />
                <button
                  onClick={() => alipayFileRef.current?.click()}
                  className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                >
                  {t('admin.uploadImage')}
                </button>
                {config.alipayQrImage && (
                  <button
                    onClick={() => saveConfig({ ...config, alipayQrImage: '' })}
                    className="ml-2 rounded-lg bg-error-50 px-3 py-2 text-xs font-medium text-error-600 hover:bg-error-100"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* WeChat Pay QR Upload */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t('payment.wechatPay')} {t('common.image')}
            </label>
            <div className="flex items-center gap-3">
              {config.wechatQrImage ? (
                <img
                  src={config.wechatQrImage}
                  alt={t('payment.wechatPay')}
                  className="h-16 w-16 rounded-lg border border-neutral-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={wechatFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'wechat')}
                  className="hidden"
                />
                <button
                  onClick={() => wechatFileRef.current?.click()}
                  className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                >
                  {t('admin.uploadImage')}
                </button>
                {config.wechatQrImage && (
                  <button
                    onClick={() => saveConfig({ ...config, wechatQrImage: '' })}
                    className="ml-2 rounded-lg bg-error-50 px-3 py-2 text-xs font-medium text-error-600 hover:bg-error-100"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Amount Input */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('admin.paymentAmount')}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-neutral-400">฿</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="1"
            className="flex-1 border-none bg-transparent text-3xl font-bold text-neutral-900 placeholder-neutral-300 focus:outline-none"
          />
        </div>
        {/* Quick amount buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[100, 200, 500, 1000, 2000, 5000].map((val) => (
            <button
              key={val}
              onClick={() => setAmount(val.toString())}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
            >
              ฿{val.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('payment.title')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(methodLabels) as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-xs font-medium transition ${
                method === m
                  ? methodColors[m]
                  : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
              }`}
            >
              <span className="text-xl">{methodIcons[m]}</span>
              {methodLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Generate QR Button */}
      <button
        onClick={generateQR}
        disabled={!amount || parseFloat(amount) <= 0}
        className="w-full rounded-xl bg-primary-700 py-4 text-base font-semibold text-white shadow-brand transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('admin.generateQR')}
      </button>

      {/* QR Code Modal */}
      {showQR && qrDataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowQR(false)}
              className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-600"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Payment method label */}
            <div className="mb-4 text-center">
              <div className="mb-1 text-3xl">{methodIcons[method]}</div>
              <h3 className="text-lg font-bold text-neutral-900">{methodLabels[method]}</h3>
            </div>

            {/* QR Code */}
            <div className="mb-4 flex justify-center">
              <div className="rounded-2xl border-2 border-neutral-100 bg-white p-4">
                <img
                  src={qrDataUrl}
                  alt={t('admin.generateQR')}
                  className="h-64 w-64"
                />
              </div>
            </div>

            {/* Amount */}
            <div className="mb-4 text-center">
              <p className="text-xs text-neutral-400">{t('payment.total')}</p>
              <p className="text-4xl font-bold text-primary-700">
                ฿{parseFloat(amount).toLocaleString()}
              </p>
            </div>

            {/* Note for Alipay/WeChat */}
            {method !== 'promptpay' && (
              <p className="text-center text-xs text-neutral-400">
                {t('admin.scanAndPayHint')}
              </p>
            )}

            {method === 'promptpay' && (
              <p className="text-center text-xs text-neutral-400">
                {t('admin.promptpayDynamicHint')}
              </p>
            )}

            {/* Close button */}
            <button
              onClick={() => setShowQR(false)}
              className="mt-4 w-full rounded-xl bg-neutral-100 py-3 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
