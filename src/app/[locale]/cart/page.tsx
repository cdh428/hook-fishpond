'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { useApp } from '@/contexts/AppContext';
import { createOrder, createPayment } from '@/lib/api-client';

type PaymentMethodType =
  | 'PROMPTPAY'
  | 'TRUEMONEY'
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'ALIPAY'
  | 'WECHAT_PAY';

const paymentMethods: {
  key: PaymentMethodType;
  labelKey: string;
  icon: string;
}[] = [
  { key: 'PROMPTPAY', labelKey: 'payment.promptpay', icon: '🔵' },
  { key: 'TRUEMONEY', labelKey: 'payment.truemoney', icon: '💳' },
  { key: 'BANK_TRANSFER', labelKey: 'payment.bankTransfer', icon: '🏧' },
  { key: 'CREDIT_CARD', labelKey: 'payment.creditCard', icon: '💳' },
  { key: 'ALIPAY', labelKey: 'payment.alipay', icon: '🔵' },
  { key: 'WECHAT_PAY', labelKey: 'payment.wechatPay', icon: '🟢' },
];

const timeSlotKeyMap: Record<string, string> = {
  MORNING: 'booking.morning',
  AFTERNOON: 'booking.afternoon',
  EVENING: 'booking.evening',
  FULL_DAY: 'booking.fullDay',
};

export default function CartPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const {
    foodCart,
    bookingCart,
    setFoodQuantity,
    removeCartItem,
    clearCart,
    user,
  } = useApp();

  const [selectedPayment, setSelectedPayment] =
    useState<PaymentMethodType | null>(null);
  const [note, setNote] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dining table carried over from the scanned QR code (set on the menu page)
  const [tableCode, setTableCode] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('fp_table');
      if (stored) setTableCode(stored.toUpperCase());
    } catch {
      // sessionStorage unavailable — treat as walk-in order
    }
  }, []);

  const getLocaleName = (item: {
    name_zh: string;
    name_en: string;
    name_th: string;
  }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const getBookingName = (item: {
    pondName_zh: string;
    pondName_en: string;
    pondName_th: string;
  }) => {
    if (locale === 'en') return item.pondName_en;
    if (locale === 'th') return item.pondName_th;
    return item.pondName_zh;
  };

  const bookingTotal = bookingCart.reduce((s, i) => s + i.price, 0);
  const foodSubtotal = foodCart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = bookingTotal + foodSubtotal;
  const itemCount = foodCart.length + bookingCart.length;

  const updateFoodQuantity = (id: string, delta: number) => {
    const item = foodCart.find((i) => i.id === id);
    if (!item) return;
    setFoodQuantity(id, item.quantity + delta);
  };

  const handlePay = async () => {
    if (!selectedPayment) return;
    setProcessing(true);
    setError(null);
    try {
      const customerName = user?.name || t('common.siteName');
      const customerPhone = user?.phone || '0000000000';

      let orderId: string | null = null;

      // Create a food order if there are food items
      if (foodCart.length > 0) {
        const order = await createOrder({
          userId: user?.id,
          customerName,
          customerPhone,
          items: foodCart.map((i) => ({
            menuItemId: i.id,
            quantity: i.quantity,
          })),
          note: note || undefined,
          tableCode: tableCode || undefined,
        });
        orderId = order.id;
      }

      // If we have an order, create a PromptPay payment and redirect to payment page
      if (orderId && selectedPayment === 'PROMPTPAY') {
        const payment = await createPayment({
          orderId,
          amount: total,
          method: 'PROMPTPAY',
        });
        clearCart();
        router.push(`/payment/${payment.paymentId}`);
        return;
      }

      // Non-PromptPay or booking-only: complete checkout
      clearCart();
      setPaymentSuccess(true);
    } catch (e: any) {
      setError(e.message || t('payment.errorTitle'));
    } finally {
      setProcessing(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-success-50">
          <svg
            className="h-10 w-10 text-success-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900">
          {t('payment.success')}
        </h2>
        <p className="mt-2 text-lg font-semibold text-accent-600">฿{total}</p>
        <button
          onClick={() => router.push('/orders')}
          className="mt-6 rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
        >
          {t('common.orders')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">
        {t('cart.title')}
      </h2>

      {itemCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <svg
            className="mb-3 h-16 w-16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
            />
          </svg>
          <p>{t('cart.empty')}</p>
          <Link
            href="/menu"
            className="mt-4 rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
          >
            {t('home.orderFood')}
          </Link>
        </div>
      ) : (
        <>
          {/* Booking Items Section */}
          {bookingCart.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-neutral-700">
                {t('cart.bookingItems')}
              </h3>
              <div className="space-y-2">
                {bookingCart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-md"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-neutral-900">
                        {getBookingName(item)}
                      </h4>
                      <p className="text-xs text-neutral-500">
                        {item.date}
                        {item.timeSlot &&
                          ` | ${t(timeSlotKeyMap[item.timeSlot] || 'booking.fullDay')}`}
                        {item.spotNumber !== null && ` | #${item.spotNumber}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-accent-600">
                        ฿{item.price}
                      </p>
                      <button
                        onClick={() => removeCartItem(item.id)}
                        className="text-xs text-error-500 hover:text-error-600"
                      >
                        {t('cart.remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Food Items Section */}
          {foodCart.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-neutral-700">
                {t('cart.foodItems')}
              </h3>
              <div className="space-y-2">
                {foodCart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-md"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">
                      🍽️
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-neutral-900">
                        {getLocaleName(item)}
                      </h4>
                      <p className="text-xs text-neutral-500">
                        ฿{item.price} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateFoodQuantity(item.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateFoodQuantity(item.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Note */}
          <div className="mb-4">
            <textarea
              placeholder={t('cart.orderNote')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={2}
            />
          </div>

          {/* Price Summary */}
          <div className="rounded-xl bg-white p-4 shadow-md">
            {bookingTotal > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">
                  {t('cart.bookingItems')}
                </span>
                <span className="font-medium">฿{bookingTotal}</span>
              </div>
            )}
            {foodSubtotal > 0 && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-neutral-500">{t('cart.foodItems')}</span>
                <span className="font-medium">฿{foodSubtotal}</span>
              </div>
            )}
            <div className="mt-3 border-t border-neutral-100 pt-3">
              {tableCode && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">{t('table.yourTable')}</span>
                  <span className="rounded-lg bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                    {tableCode}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900">
                  {t('payment.total')}
                </span>
                <span className="text-xl font-bold text-accent-600">
                  ฿{total}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-error-50 p-3 text-sm text-error-600">
              {error}
            </div>
          )}

          {/* Checkout Button */}
          {!showPayment && (
            <button
              onClick={() => setShowPayment(true)}
              className="mt-4 w-full rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
            >
              {t('cart.checkout')} — ฿{total}
            </button>
          )}

          {/* Payment Selection */}
          {showPayment && (
            <div className="mt-6">
              <h3 className="mb-3 text-base font-bold text-neutral-900">
                {t('payment.title')}
              </h3>
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <button
                    key={method.key}
                    onClick={() => setSelectedPayment(method.key)}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                      selectedPayment === method.key
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-neutral-200 bg-white hover:border-neutral-300'
                    }`}
                  >
                    <span className="text-xl">{method.icon}</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {t(method.labelKey)}
                    </span>
                    {selectedPayment === method.key && (
                      <svg
                        className="ml-auto h-5 w-5 text-primary-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Sticky CTA for payment */}
      {showPayment && itemCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div>
              <p className="text-xs text-neutral-500">{t('payment.total')}</p>
              <p className="text-lg font-bold text-neutral-900">฿{total}</p>
            </div>
            <button
              onClick={handlePay}
              disabled={!selectedPayment || processing}
              className="flex-1 rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {processing
                ? t('payment.processing')
                : `${t('payment.total')}: ฿${total}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
