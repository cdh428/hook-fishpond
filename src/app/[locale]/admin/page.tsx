'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

export default function AdminPage() {
  const t = useTranslations();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = () => {
    // Simple mock auth — real auth will use API
    if (username === 'admin' && password === 'Admin@2026') {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError(t('admin.loginFailed'));
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-2xl bg-white p-8 shadow-md">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
              <svg className="h-8 w-8 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <h2 className="mb-2 text-center text-xl font-bold text-neutral-900">
            {t('admin.loginTitle')}
          </h2>
          {loginError && (
            <p className="mb-4 text-center text-sm text-error-600">{loginError}</p>
          )}
          <div className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('admin.loginUsername')}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('admin.loginPassword')}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
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

  // KPI cards — mock data
  const kpis = [
    { key: 'todayBookings', value: '8', color: 'bg-primary-50 text-primary-700', icon: 'calendar' },
    { key: 'todayRevenue', value: '฿4,800', color: 'bg-accent-50 text-accent-700', icon: 'money' },
    { key: 'pendingOrders', value: '3', color: 'bg-warning-50 text-warning-700', icon: 'clock' },
    { key: 'activeSpots', value: '12/70', color: 'bg-success-50 text-success-700', icon: 'spot' },
  ];

  const navLinks = [
    { href: '/admin/menu', label: t('admin.menu'), icon: 'food' },
    { href: '/admin/bookings', label: t('admin.bookings'), icon: 'calendar' },
    { href: '/admin/transactions', label: t('admin.transactions'), icon: 'money' },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('admin.dashboard')}</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {kpis.map((kpi) => (
          <div key={kpi.key} className={`rounded-xl p-4 shadow-md ${kpi.color}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-70">{t(`admin.${kpi.key}`)}</span>
              <svg className="h-5 w-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {kpi.icon === 'calendar' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                {kpi.icon === 'money' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />}
                {kpi.icon === 'clock' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
                {kpi.icon === 'spot' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343" />}
              </svg>
            </div>
            <p className="text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Navigation Links */}
      <div className="space-y-3 mb-6">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-md transition hover:shadow-lg"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
              <svg className="h-5 w-5 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {link.icon === 'food' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v2H3V3zm0 4h18v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm4 3v8m4-8v8m4-8v8" />}
                {link.icon === 'calendar' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                {link.icon === 'money' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />}
              </svg>
            </div>
            <span className="font-medium text-neutral-900">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">{t('admin.recentOrders')}</h3>
        <div className="space-y-2">
          {[
            { id: 'FP-20260714-001', customer: '张先生', amount: '฿800', status: 'paid' },
            { id: 'FP-20260714-002', customer: 'สมชาย', amount: '฿500', status: 'pending' },
            { id: 'FP-20260714-003', customer: 'John', amount: '฿100', status: 'preparing' },
          ].map((order) => (
            <div key={order.id} className="flex items-center justify-between rounded-lg bg-bg-page px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">{order.id}</p>
                <p className="text-xs text-neutral-500">{order.customer}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-neutral-900">{order.amount}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                  order.status === 'paid' ? 'bg-success-50 text-success-700' :
                  order.status === 'pending' ? 'bg-warning-50 text-warning-700' :
                  'bg-primary-50 text-primary-700'
                }`}>
                  {t(`orders.${order.status}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => setIsLoggedIn(false)}
        className="mt-6 w-full rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
      >
        {t('common.logout')}
      </button>
    </div>
  );
}
