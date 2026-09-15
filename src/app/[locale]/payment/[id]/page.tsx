'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Link } from '@/i18n/routing';
import QRCode from 'qrcode';
import { getPayment, confirmPayment } from '@/lib/api-client';

type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';

export default function PaymentPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const paymentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrStringRaw, setQrStringRaw] = useState<string>('');
  const [status, setStatus] = useState<PaymentStatus>('PENDING');
  const [amount, setAmount] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [maskedPromptPayId, setMaskedPromptPayId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(900);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const loadPayment = useCallback(async () => {
    try {
      const data = await getPayment(paymentId);
      setStatus(data.status as PaymentStatus);
      setAmount(data.amount);
      setExpiresAt(data.expiresAt);
      setOrderInfo(data.order);
      setMaskedPromptPayId(data.maskedPromptPayId || '');

      if (data.qrString) {
        setQrStringRaw(data.qrString);
        const dataUrl = await QRCode.toDataURL(data.qrString, {
          width: 300,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrDataUrl(dataUrl);
      }

      // Calculate remaining time
      if (data.expiresAt) {
        const diff = Math.floor(
          (new Date(data.expiresAt).getTime() - Date.now()) / 1000,
        );
        setRemainingSeconds(Math.max(0, diff));
      }
    } catch (e: any) {
      setError(e.message || t('payment.loadError'));
    } finally {
      setLoading(false);
    }
  }, [paymentId, t]);

  // Initial load
  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  // Countdown timer
  useEffect(() => {
    if (status !== 'PENDING') return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('FAILED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Poll for status changes (when user has confirmed payment)
  useEffect(() => {
    if (status !== 'PROCESSING') return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await getPayment(paymentId);
        if (data.status !== status) {
          setStatus(data.status as PaymentStatus);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, paymentId]);

  const handleConfirmPaid = async () => {
    setConfirming(true);
    try {
      await confirmPayment(paymentId, 'user_confirm');
      setStatus('PROCESSING');
    } catch (e: any) {
      setError(e.message || t('payment.confirmError'));
    } finally {
      setConfirming(false);
    }
  };

  const handleDownloadQR = async () => {
    if (!qrStringRaw) return;
    setDownloading(true);
    try {
      // Generate a larger QR for download (512px, high quality)
      const downloadUrl = await QRCode.toDataURL(qrStringRaw, {
        width: 512,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `promptpay-qr-${paymentId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore download errors
    } finally {
      setDownloading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  // --- Error ---
  if (error && !amount) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mb-4 text-5xl">⚠️</div>
        <h2 className="text-xl font-bold text-neutral-900">{t('payment.errorTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-500">{error}</p>
        <Link
          href="/cart"
          className="mt-6 inline-block rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white"
        >
          {t('common.back')}
        </Link>
      </div>
    );
  }

  // --- Success ---
  if (status === 'SUCCESSFUL') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900">{t('payment.successTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-500">{t('payment.successDesc')}</p>
        <p className="mt-4 text-2xl font-bold text-accent-600">฿{amount.toFixed(2)}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => router.push('/orders')}
            className="rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white"
          >
            {t('payment.viewOrders')}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700"
          >
            {t('payment.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  // --- Failed ---
  if (status === 'FAILED') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <svg className="h-10 w-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900">{t('payment.failedTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-500">{t('payment.failedDesc')}</p>
        <p className="mt-4 text-lg font-semibold text-neutral-700">฿{amount.toFixed(2)}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => router.push('/cart')}
            className="rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white"
          >
            {t('payment.retry')}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700"
          >
            {t('payment.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  // --- Processing (user confirmed, waiting for verification) ---
  if (status === 'PROCESSING') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900">{t('payment.verifyingTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-500">{t('payment.verifyingDesc')}</p>
        <p className="mt-4 text-lg font-semibold text-accent-600">฿{amount.toFixed(2)}</p>
        <div className="mt-6 w-full rounded-xl bg-blue-50 p-4 text-center">
          <p className="text-xs text-blue-600">{t('payment.verifyingHint')}</p>
        </div>
      </div>
    );
  }

  // --- Pending (show QR) ---
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h2 className="mb-2 text-center text-xl font-bold text-neutral-900">
        {t('payment.scanQR')}
      </h2>
      <p className="mb-6 text-center text-sm text-neutral-500">
        {t('payment.promptPayDesc')}
      </p>

      {/* QR Code */}
      <div className="flex flex-col items-center rounded-2xl bg-white p-6 shadow-lg">
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="PromptPay QR Code"
            className="h-64 w-64"
          />
        )}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-lg font-semibold text-primary-700">PromptPay</span>
          <span className="text-sm text-neutral-400">|</span>
          <span className="text-sm text-neutral-500">{t('payment.thaiBankQR')}</span>
        </div>
        {maskedPromptPayId && (
          <div className="mt-2 flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.327a12 12 0 005.516 5.516l1.327-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="text-sm font-medium text-neutral-600">
              {maskedPromptPayId}
            </span>
          </div>
        )}
        {/* Download QR Button */}
        {qrDataUrl && (
          <button
            onClick={handleDownloadQR}
            disabled={downloading}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
          >
            {downloading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            {t('payment.downloadQR')}
          </button>
        )}
      </div>

      {/* Amount + Timer */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">{t('payment.amountToPay')}</span>
          <span className="text-2xl font-bold text-accent-600">฿{amount.toFixed(2)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-sm text-neutral-500">{t('payment.timeRemaining')}</span>
          <span
            className={`text-lg font-bold ${remainingSeconds < 60 ? 'text-red-600' : 'text-neutral-900'}`}
          >
            {formatTime(remainingSeconds)}
          </span>
        </div>
      </div>

      {/* Order summary */}
      {orderInfo && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-md">
          <p className="mb-2 text-xs font-semibold text-neutral-500">
            {t('payment.orderNumber')}: {orderInfo.orderNumber}
          </p>
          {orderInfo.items?.length > 0 && (
            <div className="space-y-1">
              {orderInfo.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-neutral-600">
                    {getLocaleName(item)} × {item.quantity}
                  </span>
                  <span className="text-neutral-500">฿{item.totalPrice}</span>
                </div>
              ))}
            </div>
          )}
          {orderInfo.bookings?.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
              {orderInfo.bookings.map((b: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-neutral-600">
                    {locale === 'en' ? b.pondName_en : locale === 'th' ? b.pondName_th : b.pondName_zh}
                  </span>
                  <span className="text-neutral-500">฿{b.totalPrice}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 rounded-xl bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-800">{t('payment.instructions')}</p>
        <ol className="mt-2 space-y-1 text-xs text-amber-700">
          <li>1. {t('payment.step1')}</li>
          <li>2. {t('payment.step2')}</li>
          <li>3. {t('payment.step3')}</li>
          <li>4. {t('payment.step4')}</li>
        </ol>
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        <button
          onClick={handleConfirmPaid}
          disabled={confirming || remainingSeconds <= 0}
          className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {confirming ? t('payment.confirming') : t('payment.iHavePaid')}
        </button>
        <button
          onClick={() => router.push('/cart')}
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 text-sm font-semibold text-neutral-600"
        >
          {t('payment.cancelPayment')}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
