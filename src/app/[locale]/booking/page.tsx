'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';

type PondType = 'LEISURE' | 'COMPETITION';
type TimeSlotKey = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY';

interface Pond {
  id: string;
  type: PondType;
  name_zh: string;
  name_en: string;
  name_th: string;
  price: number;
  minParticipants: number | null;
  maxSpots: number;
}

interface Spot {
  id: string;
  number: number;
  booked: boolean;
}

const pondData: Pond[] = [
  {
    id: '1',
    type: 'LEISURE',
    name_zh: '休闲塘',
    name_en: 'Leisure Pond',
    name_th: 'บ่อพักผ่อน',
    price: 100,
    minParticipants: null,
    maxSpots: 30,
  },
  {
    id: '2',
    type: 'COMPETITION',
    name_zh: '竞赛塘',
    name_en: 'Competition Pond',
    name_th: 'บ่อแข่งขัน',
    price: 500,
    minParticipants: 10,
    maxSpots: 40,
  },
];

const generateSpots = (count: number, booked: number[]): Spot[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `spot-${i + 1}`,
    number: i + 1,
    booked: booked.includes(i + 1),
  }));

export default function BookingPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [pondType, setPondType] = useState<PondType>('LEISURE');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlotKey>('MORNING');
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [groupName, setGroupName] = useState('');
  const [participantCount, setParticipantCount] = useState<number>(10);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showParticipantError, setShowParticipantError] = useState(false);

  const activePond = pondData.find((p) => p.type === pondType)!;

  const spots = generateSpots(
    activePond.maxSpots,
    activePond.type === 'LEISURE'
      ? [3, 7, 12, 15, 22, 28]
      : [5, 10, 15, 20, 25, 30, 35, 38]
  );

  const isLeisure = pondType === 'LEISURE';

  const timeSlots: { key: TimeSlotKey; labelKey: string }[] = [
    { key: 'MORNING', labelKey: 'booking.morning' },
    { key: 'AFTERNOON', labelKey: 'booking.afternoon' },
    { key: 'EVENING', labelKey: 'booking.evening' },
    { key: 'FULL_DAY', labelKey: 'booking.fullDay' },
  ];

  const price = isLeisure ? activePond.price : activePond.price * participantCount;
  const selectedSpotData = spots.find((s) => s.id === selectedSpot);

  const canConfirm = isLeisure
    ? selectedDate && selectedSpot && customerName && customerPhone
    : selectedDate && customerName && customerPhone && participantCount >= 10;

  const handleConfirm = () => {
    if (!isLeisure && participantCount < activePond.minParticipants!) {
      setShowParticipantError(true);
      return;
    }
    setShowSuccess(true);
  };

  const handleReset = () => {
    setShowSuccess(false);
    setSelectedSpot(null);
    setCustomerName('');
    setCustomerPhone('');
    setGroupName('');
    setParticipantCount(10);
    setShowParticipantError(false);
  };

  const getPondName = (pond: Pond) => {
    if (locale === 'en') return pond.name_en;
    if (locale === 'th') return pond.name_th;
    return pond.name_zh;
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h2 className="mb-4 text-2xl font-bold text-neutral-900">{t('booking.title')}</h2>

      {/* Pond Type Selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-neutral-700">
          {t('booking.selectPond')}
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPondType('LEISURE');
              setSelectedSpot(null);
              setParticipantCount(10);
            }}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              isLeisure
                ? 'bg-primary-700 text-white shadow-brand'
                : 'bg-white text-neutral-700 shadow-sm hover:bg-primary-50'
            }`}
          >
            <span className="block">{t('pond.leisure')}</span>
            <span className="block text-xs opacity-80">{t('home.leisurePrice')}</span>
          </button>
          <button
            onClick={() => {
              setPondType('COMPETITION');
              setSelectedSpot(null);
            }}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              !isLeisure
                ? 'bg-accent-500 text-white shadow-brand'
                : 'bg-white text-neutral-700 shadow-sm hover:bg-accent-50'
            }`}
          >
            <span className="block">{t('pond.competition')}</span>
            <span className="block text-xs opacity-80">{t('home.competitionPrice')}</span>
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {isLeisure ? t('booking.leisureMode') : t('booking.competitionMode')}
        </p>
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

      {/* Time Slot Selection — Leisure only */}
      {isLeisure && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            {t('booking.selectTime')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {timeSlots.map((slot) => (
              <button
                key={slot.key}
                onClick={() => setSelectedTimeSlot(slot.key)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  selectedTimeSlot === slot.key
                    ? 'bg-primary-700 text-white shadow-brand'
                    : 'bg-white text-neutral-700 shadow-sm hover:bg-primary-50'
                }`}
              >
                {t(slot.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isLeisure && (
        <div className="mb-4 rounded-xl bg-neutral-50 p-3 text-center text-sm text-neutral-500">
          <svg className="mx-auto mb-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('booking.onlyFullDay')}
        </div>
      )}

      {/* Spot Grid — Leisure only */}
      {isLeisure && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-neutral-700">
              {t('booking.selectSpot')}
            </label>
            <span className="text-xs text-neutral-400">
              {spots.filter((s) => !s.booked).length}/{spots.length} {t('booking.available')}
            </span>
          </div>
          <div className="mb-2 flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-primary-200 bg-primary-50" />
              {t('booking.available')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-error-500/30 bg-error-100" />
              {t('booking.booked')}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-2 md:grid-cols-8">
            {spots.map((spot) => (
              <button
                key={spot.id}
                disabled={spot.booked}
                onClick={() => setSelectedSpot(spot.id)}
                className={`flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium transition ${
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
      )}

      {/* Leisure Form */}
      {isLeisure && selectedSpot && selectedSpotData && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-neutral-600">
              {t('booking.spotNumber')}: <strong className="text-neutral-900">#{selectedSpotData.number}</strong>
            </span>
            <span className="text-lg font-bold text-accent-600">฿{price}</span>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('booking.yourName')}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <input
              type="tel"
              placeholder={t('booking.yourPhone')}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      )}

      {/* Competition Form */}
      {!isLeisure && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-md">
          <h4 className="mb-3 text-sm font-semibold text-neutral-900">{t('booking.groupBooking')}</h4>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                {t('booking.groupName')}
              </label>
              <input
                type="text"
                placeholder={t('booking.groupName')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                {t('booking.participantCount')}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(10, participantCount - 1);
                    setParticipantCount(next);
                    if (next >= 10) setShowParticipantError(false);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  −
                </button>
                <input
                  type="number"
                  min={10}
                  value={participantCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setParticipantCount(val);
                    if (val >= 10) setShowParticipantError(false);
                  }}
                  className="w-20 rounded-xl border border-neutral-200 px-3 py-2.5 text-center text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onClick={() => {
                    const next = participantCount + 1;
                    setParticipantCount(next);
                    if (next >= 10) setShowParticipantError(false);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-lg font-medium text-accent-700 hover:bg-accent-100"
                >
                  +
                </button>
              </div>
              {showParticipantError && (
                <p className="mt-1 text-xs text-error-600">{t('booking.participantCountError')}</p>
              )}
              <p className="mt-1 text-xs text-neutral-400">{t('booking.minParticipants')}</p>
            </div>
            <div className="border-t border-neutral-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">{t('booking.price')}</span>
                <span className="text-lg font-bold text-accent-600">
                  ฿{price.toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-400">
                {activePond.price} × {participantCount} = ฿{price.toLocaleString()}
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <input
                type="text"
                placeholder={t('booking.yourName')}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <input
                type="tel"
                placeholder={t('booking.yourPhone')}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sticky CTA */}
      {(isLeisure ? selectedSpot : true) && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div>
              <p className="text-xs text-neutral-500">
                {isLeisure
                  ? `${t('booking.spotNumber')}: ${selectedSpotData?.number ? `#${selectedSpotData.number}` : '—'}`
                  : getPondName(activePond)}
              </p>
              <p className="text-lg font-bold text-neutral-900">฿{price.toLocaleString()}</p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-1 rounded-xl bg-accent-500 py-3 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {t('booking.confirmBooking')}
            </button>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
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
            <div className="mt-2 space-y-1 text-sm text-neutral-500">
              {!isLeisure && groupName && <p>{t('booking.groupName')}: {groupName}</p>}
              {!isLeisure && <p>{participantCount} {t('booking.participantCount')}</p>}
              <p className="text-lg font-bold text-accent-600">฿{price.toLocaleString()}</p>
            </div>
            <button
              onClick={handleReset}
              className="mt-4 w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800"
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
