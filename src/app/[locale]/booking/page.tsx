'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';

// Demo data - in production this comes from the database
const zones = [
  { id: '1', name_zh: 'A区 - 大鱼塘', name_en: 'Zone A - Main Pond', name_th: 'โซน A - บ่อใหญ่' },
  { id: '2', name_zh: 'B区 - 休闲塘', name_en: 'Zone B - Leisure Pond', name_th: 'โซน B - บ่อพักผ่อน' },
  { id: '3', name_zh: 'C区 - VIP塘', name_en: 'Zone C - VIP Pond', name_th: 'โซน C - บ่อ VIP' },
];

const spotsPerZone: Record<string, Array<{ id: string; number: number; priceHalf: number; priceFull: number; booked: boolean }>> = {
  '1': Array.from({ length: 40 }, (_, i) => ({
    id: `a${i + 1}`,
    number: i + 1,
    priceHalf: 200,
    priceFull: 350,
    booked: [3, 7, 12, 15, 28].includes(i + 1),
  })),
  '2': Array.from({ length: 30 }, (_, i) => ({
    id: `b${i + 1}`,
    number: i + 1,
    priceHalf: 150,
    priceFull: 250,
    booked: [5, 10, 20].includes(i + 1),
  })),
  '3': Array.from({ length: 20 }, (_, i) => ({
    id: `c${i + 1}`,
    number: i + 1,
    priceHalf: 500,
    priceFull: 800,
    booked: [2, 8].includes(i + 1),
  })),
};

type TimeSlotKey = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY';

export default function BookingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [selectedZone, setSelectedZone] = useState('1');
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState<TimeSlotKey>('MORNING');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const spots = spotsPerZone[selectedZone] || [];
  const selectedSpotData = spots.find((s) => s.id === selectedSpot);

  const timeSlots: { key: TimeSlotKey; label: string }[] = [
    { key: 'MORNING', label: t('booking.morning') },
    { key: 'AFTERNOON', label: t('booking.afternoon') },
    { key: 'EVENING', label: t('booking.evening') },
    { key: 'FULL_DAY', label: t('booking.fullDay') },
  ];

  const getZoneName = (zone: typeof zones[0]) => {
    if (locale === 'en') return zone.name_en;
    if (locale === 'th') return zone.name_th;
    return zone.name_zh;
  };

  const price =
    selectedSpotData
      ? selectedTime === 'FULL_DAY'
        ? selectedSpotData.priceFull
        : selectedSpotData.priceHalf
      : 0;

  const steps = [t('booking.selectZone'), t('booking.selectDate'), t('booking.selectSpot'), t('common.confirm')];

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('booking.title')}</h2>

      {/* Step Indicator */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              idx === 0 ? 'bg-primary-700 text-white' : 'bg-neutral-200 text-neutral-500'
            }`}>
              {idx + 1}
            </div>
            {idx < steps.length - 1 && <div className="h-0.5 flex-1 bg-neutral-200" />}
          </div>
        ))}
      </div>

      {/* Zone Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectZone')}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {zones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => {
                setSelectedZone(zone.id);
                setSelectedSpot(null);
              }}
              className={`shrink-0 rounded-xl px-4 py-3 text-sm font-medium transition ${
                selectedZone === zone.id
                  ? 'bg-primary-700 text-white shadow-brand'
                  : 'bg-white text-neutral-700 shadow-sm hover:bg-primary-50'
              }`}
            >
              {getZoneName(zone)}
            </button>
          ))}
        </div>
      </div>

      {/* Date Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectDate')}
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {/* Time Slot Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectTime')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {timeSlots.map((slot) => (
            <button
              key={slot.key}
              onClick={() => setSelectedTime(slot.key)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                selectedTime === slot.key
                  ? 'bg-primary-700 text-white shadow-brand'
                  : 'bg-white text-neutral-700 shadow-sm hover:bg-primary-50'
              }`}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spot Grid */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectSpot')}
        </label>
        <div className="mb-2 flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-primary-50 border border-primary-200" />
            {t('booking.available')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-error-100 border border-error-500/30" />
            {t('booking.booked')}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {spots.map((spot) => (
            <button
              key={spot.id}
              disabled={spot.booked}
              onClick={() => setSelectedSpot(spot.id)}
              className={`flex h-12 w-full items-center justify-center rounded-lg text-sm font-medium transition ${
                spot.booked
                  ? 'cursor-not-allowed bg-error-100 text-error-400'
                  : selectedSpot === spot.id
                    ? 'bg-primary-700 text-white shadow-brand'
                    : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
              }`}
            >
              {spot.number}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Spot Info & Form */}
      {selectedSpot && selectedSpotData && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-neutral-600">
              {t('booking.spotNumber')}: <strong className="text-neutral-900">{selectedSpotData.number}</strong>
            </span>
            <span className="text-lg font-bold text-accent-600">฿{price}</span>
          </div>

          <div className="mb-3 space-y-2">
            <input
              type="text"
              placeholder={t('booking.yourName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <input
              type="tel"
              placeholder={t('booking.yourPhone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      )}

      {/* Sticky CTA */}
      {selectedSpot && selectedSpotData && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div>
              <p className="text-xs text-neutral-500">{t('booking.spotNumber')}: {selectedSpotData.number}</p>
              <p className="text-lg font-bold text-neutral-900">฿{price}</p>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!selectedDate || !name || !phone}
              className="flex-1 rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {t('booking.confirmBooking')}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50">
                <svg className="h-8 w-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">{t('booking.bookingSuccess')}</h3>
            <p className="mt-2 text-sm text-neutral-500">
              {t('booking.spotNumber')}: {selectedSpotData?.number} | ฿{price}
            </p>
            <button
              onClick={() => {
                setShowConfirm(false);
                setSelectedSpot(null);
                setName('');
                setPhone('');
              }}
              className="mt-4 w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white"
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
