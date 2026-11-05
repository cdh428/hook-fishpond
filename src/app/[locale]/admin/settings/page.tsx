'use client';

/**
 * 后台设置 —— 目前只有「折扣确认 PIN」一项。
 *
 * 需求（2026-11-05）：
 *   - 超 10% 折扣需要 admin 授权，但管理员登录密码是 bcrypt 长串，收银输入不便。
 *   - 改成网站内自设的 6 位数字 PIN（明文存储，初始 123456）。
 *   - admin 登录后台后在这里查看明文当前值、改成自己的 PIN。
 *   - 收银端下单/改单打折时输入这个 PIN 即可（见 /api/admin/orders/[id]）。
 */

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function AdminSettingsPage() {
  const t = useTranslations();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // 读取当前 PIN（明文显示）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/discount-pin');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setCurrentPin(data.pin ?? '');
      } catch {
        if (!cancelled) setError(t('adminSettings.pinLoadFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const save = async () => {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      const res = await fetch('/api/admin/settings/discount-pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('adminSettings.pinSaveFailed'));
        return;
      }
      setCurrentPin(data.pin);
      setNewPin('');
      setMsg(t('adminSettings.pinSaved'));
      setTimeout(() => setMsg(''), 2500);
    } catch {
      setError(t('adminSettings.pinSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-neutral-900">{t('adminSettings.title')}</h3>

      {/* 折扣 PIN */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">{t('adminSettings.discountPin')}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{t('adminSettings.discountPinHint')}</p>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            {t('adminSettings.currentPin')}
          </label>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-neutral-100 px-3 py-2 font-mono text-lg tracking-[0.4em] text-neutral-800">
              {currentPin || '—'}
            </span>
            <span className="text-[11px] text-neutral-400">{t('adminSettings.pinVisibleHint')}</span>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-neutral-600">{t('adminSettings.newPin')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('adminSettings.newPinPlaceholder')}
              className="w-40 rounded-xl border border-neutral-200 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              onClick={save}
              disabled={busy || newPin.length !== 6}
              className="rounded-xl bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('adminSettings.savePin')}
            </button>
          </div>
        </div>

        {msg && <p className="mt-2 text-xs text-success-600">{msg}</p>}
        {error && <p className="mt-2 text-xs text-error-600">{error}</p>}
      </div>
    </div>
  );
}
