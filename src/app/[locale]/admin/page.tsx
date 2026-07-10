'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Tab = 'overview' | 'spots' | 'menu' | 'orders';

export default function AdminPage() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: t('admin.dashboard'), icon: 'chart' },
    { key: 'spots', label: t('admin.spots'), icon: 'fishing' },
    { key: 'menu', label: t('admin.menu'), icon: 'food' },
    { key: 'orders', label: t('admin.orders'), icon: 'list' },
  ];

  const renderIcon = (icon: string) => {
    switch (icon) {
      case 'chart':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
      case 'fishing':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
        );
      case 'food':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v2H3V3zm0 4h18v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm4 3v8m4-8v8m4-8v8" />
          </svg>
        );
      case 'list':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        );
      default:
        return null;
    }
  };

  const stats = [
    { label: t('admin.todayBookings'), value: '24', color: 'primary' },
    { label: t('admin.todayRevenue'), value: '฿12,450', color: 'success' },
    { label: t('admin.pendingOrders'), value: '8', color: 'accent' },
    { label: t('admin.activeSpots'), value: '92/120', color: 'neutral' },
  ];

  const colorMap: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-700',
    success: 'bg-success-50 text-success-600',
    accent: 'bg-accent-50 text-accent-700',
    neutral: 'bg-neutral-100 text-neutral-700',
  };

  const recentOrders = [
    { id: 'FP-001', customer: 'John', amount: 480, status: 'PREPARING' },
    { id: 'FP-002', customer: '张三', amount: 150, status: 'PAID' },
    { id: 'FP-003', customer: 'สมชาย', amount: 320, status: 'READY' },
  ];

  const statusColors: Record<string, string> = {
    PENDING: 'bg-warning-100 text-warning-600',
    PAID: 'bg-primary-100 text-primary-700',
    PREPARING: 'bg-accent-100 text-accent-700',
    READY: 'bg-success-100 text-success-600',
    CANCELLED: 'bg-error-100 text-error-600',
  };

  const statusKeys: Record<string, string> = {
    PENDING: 'orders.pending',
    PAID: 'orders.paid',
    PREPARING: 'orders.preparing',
    READY: 'orders.ready',
    CANCELLED: 'orders.cancelled',
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('common.admin')}</h2>

      {/* Tab Navigation */}
      <div className="sticky top-14 z-40 mb-6 flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1 backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === tab.key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {renderIcon(tab.icon)}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className={`rounded-xl p-4 ${colorMap[stat.color]}`}>
                <p className="text-xs opacity-80">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Recent Orders */}
          <div className="rounded-xl bg-white p-4 shadow-md">
            <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.recentOrders')}</h3>
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{order.id}</p>
                    <p className="text-xs text-neutral-500">{order.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-neutral-900">฿{order.amount}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.status]}`}>
                      {t(statusKeys[order.status])}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Spots Management */}
      {activeTab === 'spots' && (
        <div className="rounded-xl bg-white p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-neutral-900">{t('admin.spots')}</h3>
            <button className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-800">
              {t('admin.addZone')}
            </button>
          </div>
          <p className="text-sm text-neutral-500">
            {t('admin.spotsManage')}
          </p>
        </div>
      )}

      {/* Menu Management */}
      {activeTab === 'menu' && (
        <div className="rounded-xl bg-white p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-neutral-900">{t('admin.menu')}</h3>
            <button className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-800">
              {t('admin.addItem')}
            </button>
          </div>
          <p className="text-sm text-neutral-500">
            {t('admin.menuManage')}
          </p>
        </div>
      )}

      {/* Orders Management */}
      {activeTab === 'orders' && (
        <div className="rounded-xl bg-white p-4 shadow-md">
          <h3 className="mb-3 font-semibold text-neutral-900">{t('admin.orders')}</h3>
          <p className="text-sm text-neutral-500">
            {t('admin.ordersManage')}
          </p>
        </div>
      )}
    </div>
  );
}
