'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  OptionGroupPublic,
  OrderLineOption,
  QUICK_NOTES,
  composeNote,
  quickNoteLabel,
  round2,
} from '@/lib/menu-options';

/**
 * 菜品规格选择面板（底部抽屉）。
 *
 * 顾客端「加入购物车」与后台「改单加菜」共用同一个组件 ——
 * 同一套必选校验、同一套加价口径，避免两边算出来的价不一样。
 *
 * 面板本身不写购物车，只把结果交给调用方（onConfirm）。
 */

export interface OptionSheetItem {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  price: number;
}

export interface OptionSheetResult {
  optionIds: string[];
  options: OrderLineOption[];
  optionsDelta: number;
  note: string | null;
}

interface Props {
  open: boolean;
  item: OptionSheetItem | null;
  groups: OptionGroupPublic[];
  locale?: string;
  /** 编辑已有行时传入，用于回填 */
  initialOptionIds?: string[];
  initialNote?: string | null;
  /** 确认按钮上的数量（编辑时显示当前数量） */
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (result: OptionSheetResult) => void;
}

const pickName = (row: any, locale: string) => {
  if (!row) return '';
  if (locale === 'en') return row.name_en || row.name_zh || '';
  if (locale === 'th') return row.name_th || row.name_zh || '';
  return row.name_zh || row.name_en || '';
};

/** 把已有备注拆回「快捷标签 + 手打文字」，便于再次编辑 */
function splitNote(note: string | null | undefined, locale: string) {
  const chips: string[] = [];
  let typed = '';
  if (!note) return { chips, typed };
  const labels = QUICK_NOTES.map((n) => quickNoteLabel(n, locale));
  for (const part of note.split('；').map((s) => s.trim()).filter(Boolean)) {
    if (labels.includes(part)) chips.push(part);
    else typed = typed ? `${typed}；${part}` : part;
  }
  return { chips, typed };
}

export default function OptionSheet({
  open,
  item,
  groups,
  locale: localeProp,
  initialOptionIds,
  initialNote,
  confirmLabel,
  onClose,
  onConfirm,
}: Props) {
  const t = useTranslations();
  const hookLocale = useLocale();
  const locale = localeProp || hookLocale;

  const [selected, setSelected] = useState<string[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [typed, setTyped] = useState('');

  const activeGroups = useMemo(
    () =>
      (groups ?? [])
        .filter((g) => g && (g as any).isActive !== false && g.options?.length > 0)
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [groups],
  );

  // 每次打开时按 initial 重置（必选组没给值就自动落到默认项）
  useEffect(() => {
    if (!open) return;
    const seeds = new Set(initialOptionIds ?? []);
    for (const g of activeGroups) {
      const has = g.options.some((o) => seeds.has(o.id));
      if (!has && g.isRequired) {
        const fallback = g.options.find((o) => o.isDefault) ?? g.options[0];
        if (fallback) seeds.add(fallback.id);
      }
    }
    setSelected([...seeds]);
    const parsed = splitNote(initialNote, locale);
    setChips(parsed.chips);
    setTyped(parsed.typed);
  }, [open, item?.id, initialOptionIds, initialNote, activeGroups, locale]);

  const index = useMemo(() => {
    const m = new Map<string, { group: OptionGroupPublic; option: any }>();
    for (const g of activeGroups) {
      for (const o of g.options) m.set(o.id, { group: g, option: o });
    }
    return m;
  }, [activeGroups]);

  const chosen = useMemo(
    () => selected.map((id) => index.get(id)).filter(Boolean) as { group: OptionGroupPublic; option: any }[],
    [selected, index],
  );

  const delta = round2(
    chosen.reduce((s, c) => s + (Number(c.option.priceDelta) || 0), 0),
  );
  const unitPrice = round2((item?.price ?? 0) + delta);

  const missingGroup = activeGroups.find(
    (g) =>
      g.isRequired &&
      !g.options.some((o) => selected.includes(o.id)) &&
      selected.filter((id) => index.get(id)?.group.id === g.id).length === 0,
  );

  const toggle = (group: OptionGroupPublic, optionId: string) => {
    setSelected((prev) => {
      const inGroup = prev.filter((id) => index.get(id)?.group.id === group.id);
      if (group.selectionType === 'SINGLE') {
        return [...prev.filter((id) => index.get(id)?.group.id !== group.id), optionId];
      }
      if (inGroup.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      if (group.maxSelect != null && inGroup.length >= group.maxSelect) {
        return prev; // 到上限就不再加
      }
      return [...prev, optionId];
    });
  };

  const handleConfirm = () => {
    if (missingGroup) return;
    const snapshot: OrderLineOption[] = chosen.map((c) => ({
      groupId: c.group.id,
      groupName_zh: c.group.name_zh,
      groupName_en: c.group.name_en,
      groupName_th: c.group.name_th,
      optionId: c.option.id,
      name_zh: c.option.name_zh,
      name_en: c.option.name_en,
      name_th: c.option.name_th,
      priceDelta: Number(c.option.priceDelta) || 0,
    }));
    const note = composeNote(chips, typed);
    onConfirm({
      optionIds: chosen.map((c) => c.option.id).sort((a, b) => a.localeCompare(b)),
      options: snapshot,
      optionsDelta: delta,
      note: note.length > 0 ? note : null,
    });
  };

  if (!open || !item) return null;

  const toggleChip = (label: string) => {
    setChips((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label],
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-start gap-3 border-b border-neutral-100 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-neutral-900">
              {pickName(item, locale)}
            </h3>
            <p className="mt-0.5 text-xs text-neutral-400">{t('options.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 选项组 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {activeGroups.map((g) => {
            const inGroup = selected.filter((id) => index.get(id)?.group.id === g.id);
            return (
              <div key={g.id} className="mb-5 last:mb-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-700">
                    {pickName(g, locale)}
                    <span
                      className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        g.isRequired
                          ? 'bg-accent-50 text-accent-700'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {g.isRequired ? t('options.required') : t('options.optional')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-neutral-400">
                    {g.selectionType === 'SINGLE'
                      ? t('options.single')
                      : g.maxSelect != null
                        ? t('options.maxSelect', { n: g.maxSelect })
                        : t('options.multi')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {g.options.map((o) => {
                    const on = inGroup.includes(o.id);
                    const d = Number(o.priceDelta) || 0;
                    return (
                      <button
                        key={o.id}
                        onClick={() => toggle(g, o.id)}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                          on
                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        <span className="min-w-0 truncate">{pickName(o, locale)}</span>
                        {d !== 0 && (
                          <span
                            className={`shrink-0 text-xs font-medium ${
                              on ? 'text-accent-700' : 'text-neutral-500'
                            }`}
                          >
                            {d > 0 ? `+฿${d}` : `−฿${Math.abs(d)}`}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 特别需求 */}
          <div className="mb-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-700">
                {t('options.specialRequest')}
              </span>
              <span className="text-[10px] text-neutral-400">{t('options.optional')}</span>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_NOTES.map((n) => {
                const label = quickNoteLabel(n, locale);
                const on = chips.includes(label);
                return (
                  <button
                    key={n.zh}
                    onClick={() => toggleChip(label)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      on
                        ? 'border-accent-400 bg-accent-50 text-accent-700'
                        : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t('options.specialPlaceholder')}
              rows={2}
              maxLength={120}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* 底部：合计 + 确认 */}
        <div className="border-t border-neutral-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {missingGroup && (
            <p className="mb-2 text-xs text-error-600">
              {t('options.needRequired', { name: pickName(missingGroup, locale) })}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-neutral-400">{t('options.total')}</p>
              <p className="text-lg font-bold text-accent-600">฿{unitPrice}</p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!!missingGroup}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white transition ${
                missingGroup
                  ? 'cursor-not-allowed bg-neutral-300'
                  : 'bg-accent-500 hover:bg-accent-600 active:scale-[0.99]'
              }`}
            >
              {confirmLabel || t('options.addToCart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
