'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import { fetchAdminBookings, updateBookingStatus } from '@/lib/api-client';

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
  LEISURE: 'bg-primary-50 text-primary-700',
  COMPETITION: 'bg-accent-50 text-accent-700',
};

const timeSlotKey: Record<string, string> = {
  MORNING: 'booking.morning',
  AFTERNOON: 'booking.afternoon',
  EVENING: 'booking.evening',
  FULL_DAY: 'booking.fullDay',
};

const pondKeyForType = (type: string) =>
  type === 'COMPETITION' ? 'admin.competitionPond' : 'admin.leisurePond';

export default function AdminBookingsPage() {
  const t = useTranslations();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: { startDate?: string; endDate?: string; status?: string } = {};
      if (dateFilter) {
        params.startDate = dateFilter;
        params.endDate = dateFilter;
      }
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await fetchAdminBookings(params);
      setBookings(data || []);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter, t]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const confirmBooking = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateBookingStatus(id, 'CONFIRMED');
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'CONFIRMED' } : b)),
      );
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelBooking = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateBookingStatus(id, 'CANCELLED');
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'CANCELLED' } : b)),
      );
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
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

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : error ? (
        <div className="py-20 text-center">
          <p className="text-sm text-error-600">{error}</p>
          <button onClick={loadBookings} className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-xs font-medium text-white">
            {t('common.retry')}
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="py-20 text-center text-sm text-neutral-400">
          {t('common.noData')}
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div key={booking.id} className="rounded-xl bg-white p-4 shadow-md">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-neutral-400">{booking.id}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[booking.status] || 'bg-neutral-100 text-neutral-600'}`}>
                  {t(statusI18n[booking.status] || 'orders.pending')}
                </span>
              </div>

              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pondColors[booking.pond?.type] || 'bg-neutral-100 text-neutral-600'}`}>
                  {t(pondKeyForType(booking.pond?.type))}
                </span>
                {booking.spot?.number !== undefined && booking.spot?.number !== null && (
                  <span className="text-xs text-neutral-500">#{booking.spot.number}</span>
                )}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('admin.customer')}</span>
                  <span className="font-medium text-neutral-900">{booking.customerName || booking.user?.name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('profile.phone')}</span>
                  <span className="text-xs text-neutral-600">{booking.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('orders.date')}</span>
                  <span className="text-neutral-900">
                    {booking.date?.slice(0, 10)} | {t(timeSlotKey[booking.timeSlot] || 'booking.fullDay')}
                  </span>
                </div>
                {booking.groupName && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('booking.groupName')}</span>
                    <span className="text-neutral-900">{booking.groupName}</span>
                  </div>
                )}
                {booking.participantCount && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('booking.participantCount')}</span>
                    <span className="text-neutral-900">{booking.participantCount}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                <span className="font-bold text-accent-600">฿{booking.totalPrice?.toLocaleString()}</span>
                {booking.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelBooking(booking.id)}
                      disabled={updatingId === booking.id}
                      className="rounded-lg border border-error-200 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={() => confirmBooking(booking.id)}
                      disabled={updatingId === booking.id}
                      className="rounded-lg bg-success-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-success-700 disabled:opacity-50"
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
    </>
  );
}
