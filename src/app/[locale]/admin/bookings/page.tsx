'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';

interface Booking {
  id: string;
  pondType: 'LEISURE' | 'COMPETITION';
  pondName: string;
  spotNumber: number | null;
  date: string;
  timeSlot: string | null;
  customerName: string;
  customerPhone: string;
  participantCount: number | null;
  groupName: string | null;
  totalPrice: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

const demoBookings: Booking[] = [
  { id: '1', pondType: 'LEISURE', pondName: '休闲塘', spotNumber: 12, date: '2026-07-14', timeSlot: 'MORNING', customerName: '张先生', customerPhone: '+66-081-234-567', participantCount: null, groupName: null, totalPrice: 100, status: 'CONFIRMED' },
  { id: '2', pondType: 'COMPETITION', pondName: '竞赛塘', spotNumber: null, date: '2026-07-14', timeSlot: null, customerName: 'สมชาย', customerPhone: '+66-089-111-222', participantCount: 15, groupName: 'สมชาย Team', totalPrice: 7500, status: 'PENDING' },
  { id: '3', pondType: 'LEISURE', pondName: '休闲塘', spotNumber: 5, date: '2026-07-15', timeSlot: 'FULL_DAY', customerName: 'John Smith', customerPhone: '+66-085-333-444', participantCount: null, groupName: null, totalPrice: 100, status: 'PENDING' },
  { id: '4', pondType: 'COMPETITION', pondName: '竞赛塘', spotNumber: null, date: '2026-07-16', timeSlot: null, customerName: '李经理', customerPhone: '+66-087-555-666', participantCount: 20, groupName: '公司团建', totalPrice: 10000, status: 'CONFIRMED' },
];

export default function AdminBookingsPage() {
  const t = useTranslations();
  const [bookings, setBookings] = useState(demoBookings);

  const updateStatus = (id: string, status: 'CONFIRMED' | 'CANCELLED') => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('admin.bookings')}</h2>

      {/* Date Filter */}
      <div className="mb-4 flex gap-2">
        <input
          type="date"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <button className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-brand">
          {t('common.filter')}
        </button>
      </div>

      {/* Booking List */}
      <div className="space-y-3">
        {bookings.map((booking) => (
          <div key={booking.id} className="rounded-xl bg-white p-4 shadow-md">
            {/* Pond type badge */}
            <div className="mb-2 flex items-center justify-between">
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                booking.pondType === 'LEISURE'
                  ? 'bg-primary-50 text-primary-700'
                  : 'bg-accent-50 text-accent-700'
              }`}>
                {booking.pondType === 'LEISURE' ? t('admin.leisurePond') : t('admin.competitionPond')}
              </span>
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                booking.status === 'CONFIRMED' ? 'bg-success-50 text-success-700' :
                booking.status === 'PENDING' ? 'bg-warning-50 text-warning-700' :
                'bg-error-50 text-error-700'
              }`}>
                {t(`orders.${booking.status.toLowerCase()}`)}
              </span>
            </div>

            {/* Booking details */}
            <div className="mb-2 space-y-1 text-sm text-neutral-600">
              <p>{t('booking.selectDate')}: {booking.date}</p>
              {booking.spotNumber && <p>{t('booking.spotNumber')}: {booking.spotNumber}</p>}
              {booking.timeSlot && <p>{t('booking.selectTime')}: {booking.timeSlot}</p>}
              {booking.participantCount && (
                <p className="font-medium text-accent-700">
                  {t('booking.participantCount')}: {booking.participantCount} | {t('booking.groupName')}: {booking.groupName}
                </p>
              )}
            </div>

            {/* Customer info */}
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-neutral-900">{booking.customerName}</p>
                <p className="text-xs text-neutral-500">{booking.customerPhone}</p>
              </div>
              <p className="text-lg font-bold text-accent-600">฿{booking.totalPrice.toLocaleString()}</p>
            </div>

            {/* Action buttons */}
            {booking.status === 'PENDING' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => updateStatus(booking.id, 'CONFIRMED')}
                  className="flex-1 rounded-xl bg-success-600 py-2 text-xs font-semibold text-white hover:bg-success-700"
                >
                  {t('common.confirm')}
                </button>
                <button
                  onClick={() => updateStatus(booking.id, 'CANCELLED')}
                  className="flex-1 rounded-xl bg-error-500 py-2 text-xs font-semibold text-white hover:bg-error-600"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
