'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

interface Booking {
  id: string;
  customer: string;
  phone: string;
  pondKey: 'admin.leisurePond' | 'admin.competitionPond';
  spot: number | null;
  date: string;
  timeKey: 'booking.morning' | 'booking.afternoon' | 'booking.evening' | 'booking.fullDay';
  participants: number | null;
  groupName: string | null;
  price: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

const demoBookings: Booking[] = [
  { id: 'BK-001', customer: '张三', phone: '+86 13800138000', pondKey: 'admin.leisurePond', spot: 12, date: '2026-03-20', timeKey: 'booking.morning', participants: null, groupName: null, price: 100, status: 'PENDING' },
  { id: 'BK-002', customer: 'John', phone: '+66 812345678', pondKey: 'admin.competitionPond', spot: null, date: '2026-03-20', timeKey: 'booking.fullDay', participants: 15, groupName: 'Team Alpha', price: 7500, status: 'CONFIRMED' },
  { id: 'BK-003', customer: 'สมชาย', phone: '+66 998765432', pondKey: 'admin.leisurePond', spot: 8, date: '2026-03-20', timeKey: 'booking.afternoon', participants: null, groupName: null, price: 100, status: 'PENDING' },
  { id: 'BK-004', customer: '李四', phone: '+86 13900139000', pondKey: 'admin.competitionPond', spot: null, date: '2026-03-21', timeKey: 'booking.fullDay', participants: 12, groupName: '钓鱼小队', price: 6000, status: 'CANCELLED' },
  { id: 'BK-005', customer: 'Peter', phone: '+66 855556789', pondKey: 'admin.leisurePond', spot: 25, date: '2026-03-21', timeKey: 'booking.fullDay', participants: null, groupName: null, price: 100, status: 'PENDING' },
];

const statusColors: Record<string, string> = {
  PENDING: 'bg-warning-100 text-warning-600',
  CONFIRMED: 'bg-success-100 text-success-600',
  CANCELLED: 'bg-error-100 text-error-600',
};

const statusI18n: Record<string, string> = {
  PENDING: 'orders.pending',
  CONFIRMED: 'orders.confirmed',
  CANCELLED: 'orders.cancelled',
};

const pondColors: Record<string, string> = {
  'admin.leisurePond': 'bg-primary-50 text-primary-700',
  'admin.competitionPond': 'bg-accent-50 text-accent-700',
};

export default function AdminBookingsPage() {
  const t = useTranslations();
  const [bookings, setBookings] = useState(demoBookings);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = bookings.filter((b) => {
    if (dateFilter && b.date !== dateFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  const confirmBooking = (id: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'CONFIRMED' as const } : b))
    );
  };

  const cancelBooking = (id: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: 'CANCELLED' as const } : b))
    );
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">{t('admin.bookings')}</h2>
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

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <div className="flex gap-2">
          {[
            { key: 'all', label: t('orders.all') },
            { key: 'PENDING', label: t('orders.pending') },
            { key: 'CONFIRMED', label: t('orders.confirmed') },
            { key: 'CANCELLED', label: t('orders.cancelled') },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                statusFilter === f.key
                  ? 'bg-primary-700 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings List */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.noData')}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => (
            <div key={booking.id} className="rounded-xl bg-white p-4 shadow-md">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-neutral-400">{booking.id}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[booking.status]}`}>
                  {t(statusI18n[booking.status])}
                </span>
              </div>

              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pondColors[booking.pondKey] || 'bg-neutral-100 text-neutral-600'}`}>
                  {t(booking.pondKey)}
                </span>
                {booking.spot !== null && (
                  <span className="text-xs text-neutral-500">#{booking.spot}</span>
                )}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('admin.customer')}</span>
                  <span className="font-medium text-neutral-900">{booking.customer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('profile.phone')}</span>
                  <span className="text-xs text-neutral-600">{booking.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('orders.date')}</span>
                  <span className="text-neutral-900">{booking.date} | {t(booking.timeKey)}</span>
                </div>
                {booking.groupName && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('booking.groupName')}</span>
                    <span className="text-neutral-900">{booking.groupName}</span>
                  </div>
                )}
                {booking.participants && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('booking.participantCount')}</span>
                    <span className="text-neutral-900">{booking.participants}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                <span className="font-bold text-accent-600">฿{booking.price.toLocaleString()}</span>
                {booking.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelBooking(booking.id)}
                      className="rounded-lg border border-error-200 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={() => confirmBooking(booking.id)}
                      className="rounded-lg bg-success-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-success-700"
                    >
                      {t('common.confirm')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
