'use client';

/**
 * Admin shell layout.
 *
 * Site-wide principle: an admin logs in ONCE and can move between every
 * admin sub-page without re-authenticating. This layout owns:
 *   - the session check (against the `admin-session` cookie via /api/admin/auth/me)
 *   - the login gate (shown only when there is no valid session)
 *   - the persistent tab navigation and the logout action
 *
 * Individual admin pages therefore must NOT render their own login form,
 * tab bar or page-level "back" button — they only render their content.
 */

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import {
  adminLogin,
  adminLogout,
  fetchAdminMe,
  type AdminSession,
} from '@/lib/api-client';

const adminTabs = [
  { href: '/admin', labelKey: 'admin.dashboard', icon: '📊' },
  { href: '/admin/orders', labelKey: 'adminOrders.entry', icon: '🧾' },
  { href: '/admin/collect', labelKey: 'admin.collectPayment', icon: '💳' },
  { href: '/admin/menu', labelKey: 'admin.menu', icon: '🍽️' },
  { href: '/admin/stock', labelKey: 'adminStock.entry', icon: '📦' },
  { href: '/admin/reports', labelKey: 'adminReports.entry', icon: '📈' },
  { href: '/admin/tables', labelKey: 'admin.tables', icon: '🪑' },
  { href: '/admin/rest-days', labelKey: 'admin.restDays', icon: '🗓️' },
  { href: '/admin/bookings', labelKey: 'admin.bookings', icon: '📅' },
  { href: '/admin/transactions', labelKey: 'admin.transactions', icon: '💰' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  const [status, setStatus] = useState<'loading' | 'out' | 'in'>('loading');
  const [session, setSession] = useState<AdminSession | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Resolve the existing session once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchAdminMe();
        if (cancelled) return;
        setSession(me);
        setStatus('in');
      } catch {
        if (!cancelled) setStatus('out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setLoginError(t('admin.loginFailed'));
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      const me = await adminLogin(username, password);
      setSession(me);
      setUsername('');
      setPassword('');
      setStatus('in');
    } catch {
      setLoginError(t('admin.loginFailed'));
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await adminLogout();
    } catch {
      /* ignore — clear locally regardless */
    }
    setSession(null);
    setStatus('out');
  };

  if (status === 'loading') {
    return (
      <div className="py-20 text-center text-sm text-neutral-400">
        {t('common.loading')}
      </div>
    );
  }

  if (status === 'out') {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <h2 className="mb-6 text-2xl font-bold text-neutral-900">
          {t('admin.loginTitle')}
        </h2>
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
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            {loginError && <p className="text-xs text-error-600">{loginError}</p>}
            <button
              onClick={handleLogin}
              disabled={loggingIn}
              className="w-full rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800 disabled:opacity-50"
            >
              {loggingIn ? t('common.loading') : t('common.login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Admin top bar — persistent across every sub-page */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">
          {t('admin.title')}
          {session?.username ? (
            <span className="ml-2 align-middle text-xs font-normal text-neutral-400">
              {session.username}
            </span>
          ) : null}
        </h2>
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
            onClick={handleLogout}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.logout')}
          </button>
        </div>
      </div>

      {/* Persistent tab navigation */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1">
        {adminTabs.map((tab) => {
          const active =
            tab.href === '/admin'
              ? pathname === '/admin'
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                active
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span>{tab.icon}</span>
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
