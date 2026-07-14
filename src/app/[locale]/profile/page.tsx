'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { locales, localeNames, type Locale } from '@/i18n/config';

// Demo user data
const defaultUser = {
  id: '1',
  name: '',
  phone: '',
  language: 'zh' as Locale,
  marketingConsent: false,
  isLoggedIn: false,
};

interface Booking {
  id: string;
  pondName: string;
  date: string;
  timeSlot: string;
  spotNumber: number | null;
  price: number;
  status: string;
}

interface Order {
  id: string;
  date: string;
  total: number;
  items: { name: string; qty: number }[];
  status: string;
}

const demoBookings: Booking[] = [
  {
    id: 'BK-001',
    pondName: '休闲塘',
    date: '2026-03-20',
    timeSlot: '上午',
    spotNumber: 12,
    price: 100,
    status: 'PENDING',
  },
  {
    id: 'BK-002',
    pondName: '竞赛塘',
    date: '2026-03-15',
    timeSlot: '全天',
    spotNumber: null,
    price: 7500,
    status: 'CONFIRMED',
  },
];

const demoOrders: Order[] = [
  {
    id: 'FP-001',
    date: '2026-03-20 14:30',
    total: 480,
    items: [
      { name: '冬阴功汤', qty: 2 },
      { name: '烤鸡翅', qty: 1 },
    ],
    status: 'PREPARING',
  },
  {
    id: 'FP-002',
    date: '2026-03-20 15:00',
    total: 150,
    items: [{ name: '泰式奶茶', qty: 3 }],
    status: 'PAID',
  },
];

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  CONFIRMED: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
  PREPARING: 'bg-accent-100 text-accent-700',
  PAID: 'bg-primary-100 text-primary-700',
  READY: 'bg-success-100 text-success-600',
};

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const [isLoggedIn, setIsLoggedIn] = useState(defaultUser.isLoggedIn);
  const [name, setName] = useState(defaultUser.name);
  const [phone, setPhone] = useState(defaultUser.phone);
  const [language, setLanguage] = useState<Locale>(defaultUser.language);
  const [marketingConsent, setMarketingConsent] = useState(defaultUser.marketingConsent);
  const [isEditing, setIsEditing] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginStep, setLoginStep] = useState<'phone' | 'otp'>('phone');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'bookings' | 'orders'>('bookings');

  const handleLogin = () => {
    if (loginPhone.length < 8) {
      setLoginError(t('profile.phoneRequired'));
      return;
    }
    if (loginStep === 'phone') {
      setLoginStep('otp');
      return;
    }
    // Simulate login
    setIsLoggedIn(true);
    setName('');
    setPhone(loginPhone);
    setShowLogin(false);
    setLoginStep('phone');
    setLoginPhone('');
    setLoginError('');
  };

  const handleSaveProfile = () => {
    setIsEditing(false);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">{t('profile.title')}</h2>

      {!isLoggedIn ? (
        /* Unauthenticated State */
        <div className="rounded-2xl bg-white p-6 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
            <svg className="h-10 w-10 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-neutral-900">
            {t('profile.registerTitle')}
          </h3>
          <p className="mb-4 text-sm text-neutral-500">
            {t('profile.registerDesc')}
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="rounded-xl bg-primary-700 px-6 py-3 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800"
          >
            {t('common.login')} / {t('common.register')}
          </button>
        </div>
      ) : (
        <>
          {/* Profile Info */}
          <div className="rounded-2xl bg-white p-5 shadow-md">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700">
                {name ? name.charAt(0).toUpperCase() : phone ? phone.slice(-2) : '?'}
              </div>
              <div className="flex-1">
                {!isEditing ? (
                  <>
                    <h3 className="text-lg font-bold text-neutral-900">
                      {name || phone || t('profile.title')}
                    </h3>
                    <p className="text-sm text-neutral-500">{phone || ''}</p>
                  </>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder={t('profile.name')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <input
                      type="tel"
                      placeholder={t('profile.phone')}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="shrink-0 rounded-lg bg-neutral-100 p-2 text-neutral-500 hover:bg-neutral-200"
              >
                {isEditing ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
              </button>
            </div>

            {isEditing && (
              <>
                {/* Language Preference */}
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-neutral-700">
                    {t('profile.language')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {locales.map((loc) => (
                      <button
                        key={loc}
                        onClick={() => setLanguage(loc)}
                        className={`rounded-lg py-2 text-sm font-medium transition ${
                          language === loc
                            ? 'bg-primary-700 text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                      >
                        {localeNames[loc]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Marketing Consent */}
                <div className="mb-4">
                  <button
                    onClick={() => setMarketingConsent(!marketingConsent)}
                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 p-3 text-left"
                  >
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                      marketingConsent ? 'bg-primary-700' : 'border-2 border-neutral-300'
                    }`}>
                      {marketingConsent && (
                        <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {t('profile.marketingConsent')}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {t('profile.marketingConsentDesc')}
                      </p>
                    </div>
                  </button>
                </div>

                <button
                  onClick={handleSaveProfile}
                  className="w-full rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
                >
                  {t('profile.saveProfile')}
                </button>
              </>
            )}
          </div>

          {/* History Tabs */}
          <div className="mt-6">
            <div className="flex rounded-xl bg-neutral-100 p-1">
              <button
                onClick={() => setActiveTab('bookings')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  activeTab === 'bookings'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {t('profile.bookingHistory')}
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  activeTab === 'orders'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {t('profile.orderHistory')}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {activeTab === 'bookings' ? (
                demoBookings.length === 0 ? (
                  <div className="py-10 text-center text-sm text-neutral-400">
                    {t('common.noData')}
                  </div>
                ) : (
                  demoBookings.map((booking) => (
                    <div key={booking.id} className="rounded-xl bg-white p-4 shadow-md">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-neutral-400">{booking.id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[booking.status]}`}>
                          {booking.status === 'PENDING' ? t('orders.pending') : booking.status === 'CONFIRMED' ? t('common.confirm') : t('orders.cancelled')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{booking.pondName}</p>
                          <p className="text-xs text-neutral-500">
                            {booking.date} | {booking.timeSlot}
                            {booking.spotNumber && ` | #${booking.spotNumber}`}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-accent-600">฿{booking.price}</span>
                      </div>
                    </div>
                  ))
                )
              ) : (
                demoOrders.length === 0 ? (
                  <div className="py-10 text-center text-sm text-neutral-400">
                    {t('common.noData')}
                  </div>
                ) : (
                  demoOrders.map((order) => (
                    <div key={order.id} className="rounded-xl bg-white p-4 shadow-md">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-neutral-400">
                          {t('orders.orderNumber')}: {order.id}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.status]}`}>
                          {order.status === 'PREPARING' ? t('orders.preparing') : t('orders.paid')}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-neutral-700">{item.name} × {item.qty}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
                        <span className="text-xs text-neutral-400">{order.date}</span>
                        <span className="text-sm font-bold text-accent-600">฿{order.total}</span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* Login/Register Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {t('profile.registerTitle')}
              </h3>
              <button
                onClick={() => {
                  setShowLogin(false);
                  setLoginStep('phone');
                  setLoginPhone('');
                  setLoginError('');
                }}
                className="rounded-lg p-1 text-neutral-400 hover:text-neutral-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-500">
              {loginStep === 'phone' ? t('profile.registerDesc') : t('profile.otpSent')}
            </p>

            <div className="space-y-3">
              <input
                type="tel"
                placeholder={t('profile.phone')}
                value={loginPhone}
                onChange={(e) => {
                  setLoginPhone(e.target.value);
                  setLoginError('');
                }}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />

              {loginStep === 'otp' && (
                <input
                  type="text"
                  placeholder={t('profile.otpVerify')}
                  maxLength={6}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-center text-lg font-semibold tracking-widest focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              )}

              {loginError && (
                <p className="text-xs text-error-600">{loginError}</p>
              )}

              <button
                onClick={handleLogin}
                className="w-full rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800"
              >
                {loginStep === 'phone' ? t('profile.registerTitle') : t('profile.otpVerify')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
