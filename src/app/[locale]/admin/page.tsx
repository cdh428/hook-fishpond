'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

const stats = [
  {
    labelKey: 'admin.todayBookings',
    value: '24',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    color: 'bg-primary-50 text-primary-700',
  },
  {
    labelKey: 'admin.todayRevenue',
    value: '฿12,450',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'bg-success-50 text-success-600',
  },
  {
    labelKey: 'admin.pendingOrders',
    value: '8',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    color: 'bg-accent-50 text-accent-700',
  },
  {
    labelKey: 'admin.activeSpots',
    value: '45/70',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      </svg>
    ),
    color: 'bg-neutral-100 text-neutral-700',
  },
];

const recentBookings = [
  { id: 'BK-001', customer: '张三', pond: '休闲塘', spot: 12, date: '2026-03-20', time: '上午', price: 100, status: 'PENDING' },
  { id: 'BK-002', customer: 'John', pond: '竞赛塘', spot: null, date: '2026-03-20', time: '全天', price: 7500, status: 'CONFIRMED' },
  { id: 'BK-003', customer: 'สมชาย', pond: '休闲塘', spot: 8, date: '2026-03-20', time: '下午', price: 100, status: 'PENDING' },
];

const recentOrders = [
  { id: 'FP-001', customer: '张三', total: 480, status: 'PREPARING', date: '2026-03-20 14:30' },
  { id: 'FP-002', customer: 'John', total: 150, status: 'PAID', date: '2026-03-20 15:00' },
  { id: 'FP-003', customer: 'สมชาย', total: 320, status: 'READY', date: '2026-03-20 13:00' },
];

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  CONFIRMED: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
  PAID: 'bg-primary-100 text-primary-700',
  PREPARING: 'bg-accent-100 text-accent-700',
  READY: 'bg-success-100 text-success-600',
};

const statusI18n: Record<string, string> = {
  PENDING: 'orders.pending',
  CONFIRMED: 'common.confirm',
  CANCELLED: 'orders.cancelled',
  PAID: 'orders.paid',
  PREPARING: 'orders.preparing',
  READY: 'orders.ready',
};

const adminTabs = [
  { href: '/admin', labelKey: 'admin.dashboard', icon: '📊' },
  { href: '/admin/collect', labelKey: 'admin.collectPayment', icon: '💳' },
  { href: '/admin/menu', labelKey: 'admin.menu', icon: '🍽️' },
  { href: '/admin/bookings', labelKey: 'admin.bookings', icon: '📅' },
  { href: '/admin/transactions', labelKey: 'admin.transactions', icon: '💰' },
];

export default function AdminDashboard() {
  const t = useTranslations();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = () => {
    if (!username || !password) {
      setLoginError(t('admin.loginFailed'));
      return;
    }
    // Auth - accept hook/Happy@2026
    if (username === 'hook' && password === 'Happy@2026') {
      setIsLoggedIn(true);
      setShowLogin(false);
      setLoginError('');
      setUsername('');
      setPassword('');
    } else {
      setLoginError(t('admin.loginFailed'));
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <h2 className="mb-6 text-2xl font-bold text-neutral-900">{t('admin.loginTitle')}</h2>
        <div className="rounded-2xl bg-white p-6 shadow-md">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t('admin.loginUsername')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t('admin.loginPassword')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            {loginError && <p className="text-xs text-error-600">{loginError}</p>}
            <button
              onClick={handleLogin}
              className="w-full rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800"
            >
              {t('common.login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">{t('admin.dashboard')}</h2>
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
          <button
            onClick={() => setIsLoggedIn(false)}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.logout')}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1">
        {adminTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              tab.href === '/admin'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <span>{tab.icon}</span>
            {t(tab.labelKey)}
          </Link>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.labelKey} className={`rounded-xl p-4 ${stat.color}`}>
            <div className="mb-2">{stat.icon}</div>
            <p className="text-xs opacity-70">{t(stat.labelKey)}</p>
            <p className="mt-1 text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Bookings */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.bookings')}</h3>
        <div className="space-y-2">
          {recentBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">
                  {b.customer} — {b.pond}
                </p>
                <p className="text-xs text-neutral-500">
                  {b.date} | {b.time}{b.spot ? ` | #${b.spot}` : ''}
                </p>
              </div>
              <div className="ml-2 text-right shrink-0">
                <p className="text-sm font-bold text-neutral-900">฿{b.price}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[b.status]}`}>
                  {t(statusI18n[b.status])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.recentOrders')}</h3>
        <div className="space-y-2">
          {recentOrders.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">{o.id}</p>
                <p className="text-xs text-neutral-500">{o.customer}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-neutral-900">฿{o.total}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.status]}`}>
                  {t(statusI18n[o.status])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
