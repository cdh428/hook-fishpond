'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { useApp } from '@/contexts/AppContext';
import { fetchBookings, fetchOrders, updateMe } from '@/lib/api-client';

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  CONFIRMED: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
  PREPARING: 'bg-accent-100 text-accent-700',
  PAID: 'bg-primary-100 text-primary-700',
  READY: 'bg-success-100 text-success-600',
};

const timeSlotKeyMap: Record<string, string> = {
  MORNING: 'booking.morning',
  AFTERNOON: 'booking.afternoon',
  EVENING: 'booking.evening',
  FULL_DAY: 'booking.fullDay',
};

const bookingStatusI18n: Record<string, string> = {
  PENDING: 'orders.pending',
  CONFIRMED: 'orders.confirmed',
  CANCELLED: 'orders.cancelled',
};

const orderStatusI18n: Record<string, string> = {
  PENDING: 'orders.pending',
  PAID: 'orders.paid',
  PREPARING: 'orders.preparing',
  READY: 'orders.ready',
  CANCELLED: 'orders.cancelled',
};

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { user, registerUser, setUser, logout } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState<Locale>(locale);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showLogin, setShowLogin] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'bookings' | 'orders'>('bookings');

  const [bookings, setBookings] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Sync local form state from the user session
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone);
      setLanguage((user.language as Locale) || locale);
      setMarketingConsent(!!user.marketingConsent);
    }
  }, [user, locale]);

  // Load history when logged in
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      setHistoryLoading(true);
      try {
        const [bk, od] = await Promise.all([
          fetchBookings({ userId: user.id }),
          fetchOrders({ userId: user.id }),
        ]);
        if (!cancelled) {
          setBookings(bk);
          setOrders(od);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleLogin = async () => {
    if (loginPhone.trim().length < 8) {
      setLoginError(t('profile.phoneRequired'));
      return;
    }
    if (!loginName.trim()) {
      setLoginError(t('profile.name'));
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      // register is idempotent — returns the existing user or creates one
      await registerUser({
        phone: loginPhone.trim(),
        name: loginName.trim(),
        language: locale,
      });
      setShowLogin(false);
      setLoginPhone('');
      setLoginName('');
    } catch (e: any) {
      setLoginError(e.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updated = await updateMe({ name, language, marketingConsent });
      setUser(updated);
      setIsEditing(false);
    } catch {
      /* keep editing on error */
    } finally {
      setSaving(false);
    }
  };

  const getItemName = (it: any) => {
    const m = it.menuItem || it;
    return locale === 'en' ? m.name_en : locale === 'th' ? m.name_th : m.name_zh;
  };

  const getPondName = (b: any) => {
    const p = b.pond || {};
    return locale === 'en' ? p.name_en : locale === 'th' ? p.name_th : p.name_zh;
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-6 text-2xl font-bold text-neutral-900">
        {t('profile.title')}
      </h2>

      {!user ? (
        /* Unauthenticated State */
        <div className="rounded-2xl bg-white p-6 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
            <svg
              className="h-10 w-10 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
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
                      disabled
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                    />
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="shrink-0 rounded-lg bg-neutral-100 p-2 text-neutral-500 hover:bg-neutral-200"
              >
                {isEditing ? (
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
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
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                        marketingConsent
                          ? 'bg-primary-700'
                          : 'border-2 border-neutral-300'
                      }`}
                    >
                      {marketingConsent && (
                        <svg
                          className="h-4 w-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
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
                  disabled={saving}
                  className="w-full rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 disabled:bg-neutral-300"
                >
                  {saving ? t('common.loading') : t('profile.saveProfile')}
                </button>
              </>
            )}

            {!isEditing && (
              <button
                onClick={logout}
                className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-500 transition hover:bg-neutral-50"
              >
                {t('common.logout')}
              </button>
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
              {historyLoading ? (
                <div className="py-10 text-center text-sm text-neutral-400">
                  {t('common.loading')}
                </div>
              ) : activeTab === 'bookings' ? (
                bookings.length === 0 ? (
                  <div className="py-10 text-center text-sm text-neutral-400">
                    {t('common.noData')}
                  </div>
                ) : (
                  bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-xl bg-white p-4 shadow-md"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-neutral-400">
                          {String(booking.id).slice(0, 8)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColors[booking.status] ||
                            'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {t(
                            bookingStatusI18n[booking.status] ||
                              'orders.pending',
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">
                            {getPondName(booking)}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {String(booking.date).slice(0, 10)}
                            {booking.timeSlot &&
                              ` | ${t(timeSlotKeyMap[booking.timeSlot] || 'booking.fullDay')}`}
                            {booking.spot?.number &&
                              ` | #${booking.spot.number}`}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-accent-600">
                          ฿{booking.totalPrice}
                        </span>
                      </div>
                    </div>
                  ))
                )
              ) : orders.length === 0 ? (
                <div className="py-10 text-center text-sm text-neutral-400">
                  {t('common.noData')}
                </div>
              ) : (
                orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl bg-white p-4 shadow-md"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-neutral-400">
                        {t('orders.orderNumber')}: {order.orderNumber}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusColors[order.status] ||
                          'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {t(orderStatusI18n[order.status] || 'orders.pending')}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-neutral-700">
                            {getItemName(item)} × {item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
                      <span className="text-xs text-neutral-400">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleString()
                          : ''}
                      </span>
                      <span className="text-sm font-bold text-accent-600">
                        ฿{order.totalPrice}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Login/Register Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {t('profile.registerTitle')}
              </h3>
              <button
                onClick={() => {
                  setShowLogin(false);
                  setLoginPhone('');
                  setLoginName('');
                  setLoginError('');
                }}
                className="rounded-lg p-1 text-neutral-400 hover:text-neutral-600"
              >
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-500">
              {t('profile.registerDesc')}
            </p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder={t('profile.name')}
                value={loginName}
                onChange={(e) => {
                  setLoginName(e.target.value);
                  setLoginError('');
                }}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
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

              {loginError && (
                <p className="text-xs text-error-600">{loginError}</p>
              )}

              <button
                onClick={handleLogin}
                disabled={loggingIn}
                className="w-full rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800 disabled:bg-neutral-300"
              >
                {loggingIn
                  ? t('common.loading')
                  : `${t('common.login')} / ${t('common.register')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
