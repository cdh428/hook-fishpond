'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';

// Demo cart items (in production, this would come from state management / context)
const demoCartItems = [
  { id: '1', name_zh: '冬阴功汤', name_en: 'Tom Yum Goong', name_th: 'ต้มยำกุ้ง', price: 180, quantity: 2 },
  { id: '8', name_zh: '烤鸡翅', name_en: 'Grilled Chicken Wings', name_th: 'ปีกไก่ย่าง', price: 120, quantity: 1 },
  { id: 'd1', name_zh: '泰式奶茶', name_en: 'Thai Iced Tea', name_th: 'ชาเย็น', price: 50, quantity: 3 },
];

type PaymentMethodType = 'PROMPTPAY' | 'TRUEMONEY' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'ALIPAY' | 'WECHAT_PAY';

const paymentMethods: { key: PaymentMethodType; labelKey: string; icon: string }[] = [
  { key: 'PROMPTPAY', labelKey: 'payment.promptpay', icon: '🏦' },
  { key: 'TRUEMONEY', labelKey: 'payment.truemoney', icon: '💳' },
  { key: 'BANK_TRANSFER', labelKey: 'payment.bankTransfer', icon: '🏧' },
  { key: 'CREDIT_CARD', labelKey: 'payment.creditCard', icon: '💳' },
  { key: 'ALIPAY', labelKey: 'payment.alipay', icon: '🔵' },
  { key: 'WECHAT_PAY', labelKey: 'payment.wechatPay', icon: '🟢' },
];

export default function CartPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [items, setItems] = useState(demoCartItems);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodType | null>(null);
  const [note, setNote] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = items.length > 0 ? 20 : 0;
  const total = subtotal + serviceFee;

  const updateQuantity = (id: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    setShowPayment(true);
  };

  const handlePay = async () => {
    if (!selectedPayment) return;
    setProcessing(true);
    // Simulate payment processing
    await new Promise((r) => setTimeout(r, 2000));
    setProcessing(false);
    setPaymentSuccess(true);
  };

  if (paymentSuccess) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-success-50">
          <svg className="h-10 w-10 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900">{t('payment.success')}</h2>
        <p className="mt-2 text-lg font-semibold text-accent-600">฿{total}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">{t('cart.title')}</h2>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <svg className="mb-3 h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p>{t('cart.empty')}</p>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-md">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xl">
                  🍽️
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-neutral-900">{getLocaleName(item)}</h3>
                  <p className="text-sm text-accent-600">฿{item.price}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100"
                  >
                    +
                  </button>
                </div>
                <span className="w-16 text-right text-sm font-bold text-neutral-900">
                  ฿{item.price * item.quantity}
                </span>
              </div>
            ))}
          </div>

          {/* Order Note */}
          <div className="mt-4">
            <textarea
              placeholder={t('cart.orderNote')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={2}
            />
          </div>

          {/* Price Breakdown */}
          <div className="mt-4 space-y-2 rounded-xl bg-white p-4 shadow-md">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">{t('cart.total')}</span>
              <span className="font-medium text-neutral-900">฿{subtotal}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Service Fee</span>
              <span className="font-medium text-neutral-900">฿{serviceFee}</span>
            </div>
            <div className="border-t border-neutral-100 pt-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900">{t('payment.total')}</span>
                <span className="text-xl font-bold text-accent-600">฿{total}</span>
              </div>
            </div>
          </div>

          {/* Checkout Button */}
          {!showPayment && (
            <button
              onClick={handleCheckout}
              className="mt-4 w-full rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
            >
              {t('cart.checkout')}
            </button>
          )}

          {/* Payment Method Selection */}
          {showPayment && (
            <div className="mt-6">
              <h3 className="mb-3 text-base font-bold text-neutral-900">{t('payment.title')}</h3>
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
                    <span className="text-sm font-medium text-neutral-900">{t(method.labelKey)}</span>
                    {selectedPayment === method.key && (
                      <svg className="ml-auto h-5 w-5 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Sticky CTA */}
      {showPayment && items.length > 0 && (
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
              {processing ? t('payment.processing') : `${t('payment.total')}: ฿${total}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
