'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  OPTION_TEMPLATES,
  findTemplate,
  type OptionGroupInput,
  type OptionGroupPublic,
  type OptionSelectionTypeValue,
} from '@/lib/menu-options';
import {
  fetchItemOptions,
  saveItemOptions,
  applyOptionTemplate,
} from '@/lib/api-client';

/**
 * 后台 —— 菜品选项编辑器。
 *
 * 一个弹窗管两件事：
 *  1）`ItemOptionsEditor`：给单个菜配置「份量 / 面型 / 加料」等选项组（整体替换保存）。
 *  2）`ApplyTemplateModal`：给一批菜批量套用内置模板，省得每个都手敲。
 *
 * 口径与顾客端 OptionSheet 完全一致：加价只改单价，必选组必须有一个默认项。
 */

// ------------------------------------------------------------------ 本地可编辑模型

interface EditableOption {
  key: string;
  id?: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  priceDelta: string;
  isDefault: boolean;
}

interface EditableGroup {
  key: string;
  id?: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  selectionType: OptionSelectionTypeValue;
  isRequired: boolean;
  maxSelect: string;
  options: EditableOption[];
}

let seq = 0;
const uid = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

const fromPublic = (groups: OptionGroupPublic[]): EditableGroup[] =>
  (groups ?? []).map((g) => ({
    key: g.id || uid(),
    id: g.id,
    name_zh: g.name_zh || '',
    name_en: g.name_en || '',
    name_th: g.name_th || '',
    selectionType: g.selectionType,
    isRequired: g.isRequired,
    maxSelect: g.maxSelect == null ? '' : String(g.maxSelect),
    options: (g.options ?? []).map((o) => ({
      key: o.id || uid(),
      id: o.id,
      name_zh: o.name_zh || '',
      name_en: o.name_en || '',
      name_th: o.name_th || '',
      priceDelta: String(o.priceDelta ?? 0),
      isDefault: !!o.isDefault,
    })),
  }));

const toInput = (groups: EditableGroup[]): OptionGroupInput[] =>
  groups.map((g, gi) => ({
    id: g.id,
    name_zh: g.name_zh.trim(),
    name_en: g.name_en.trim(),
    name_th: g.name_th.trim(),
    selectionType: g.selectionType,
    isRequired: g.isRequired,
    maxSelect:
      g.selectionType === 'MULTI'
        ? g.maxSelect.trim() === ''
          ? null
          : Math.max(1, Number(g.maxSelect) || 0)
        : 1,
    sortOrder: gi,
    options: g.options.map((o, oi) => ({
      id: o.id,
      name_zh: o.name_zh.trim(),
      name_en: o.name_en.trim(),
      name_th: o.name_th.trim(),
      priceDelta: Number(o.priceDelta) || 0,
      isDefault: o.isDefault,
      sortOrder: oi,
    })),
  }));

const emptyGroup = (): EditableGroup => ({
  key: uid(),
  name_zh: '',
  name_en: '',
  name_th: '',
  selectionType: 'SINGLE',
  isRequired: true,
  maxSelect: '',
  options: [],
});

const emptyOption = (isDefault = false): EditableOption => ({
  key: uid(),
  name_zh: '',
  name_en: '',
  name_th: '',
  priceDelta: '0',
  isDefault,
});

// ------------------------------------------------------------------ 单个菜品：选项编辑器

interface EditorProps {
  open: boolean;
  itemId: string | null;
  itemName: string;
  onClose: () => void;
  /** 保存成功后回传最新选项组，供列表刷新 */
  onSaved?: (groups: OptionGroupPublic[]) => void;
}

export function ItemOptionsEditor({ open, itemId, itemName, onClose, onSaved }: EditorProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchItemOptions(itemId);
      setGroups(fromPublic(res.groups ?? []));
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [itemId, t]);

  useEffect(() => {
    if (open && itemId) load();
    if (!open) {
      setGroups([]);
      setError('');
    }
  }, [open, itemId, load]);

  const patchGroup = (key: string, patch: Partial<EditableGroup>) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  const patchOption = (gKey: string, oKey: string, patch: Partial<EditableOption>) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.key === gKey
          ? { ...g, options: g.options.map((o) => (o.key === oKey ? { ...o, ...patch } : o)) }
          : g,
      ),
    );

  const toggleDefault = (gKey: string, oKey: string) =>
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== gKey) return g;
        const isSingle = g.selectionType === 'SINGLE';
        return {
          ...g,
          options: g.options.map((o) =>
            isSingle
              ? { ...o, isDefault: o.key === oKey }
              : o.key === oKey
                ? { ...o, isDefault: !o.isDefault }
                : o,
          ),
        };
      }),
    );

  const addOption = (gKey: string) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.key === gKey
          ? { ...g, options: [...g.options, emptyOption(g.options.length === 0 && g.isRequired)] }
          : g,
      ),
    );

  const removeOption = (gKey: string, oKey: string) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.key === gKey ? { ...g, options: g.options.filter((o) => o.key !== oKey) } : g,
      ),
    );

  const removeGroup = (gKey: string) =>
    setGroups((prev) => prev.filter((g) => g.key !== gKey));

  /** 从模板追加一个选项组到本地草稿（不落库，保存时统一提交） */
  const appendTemplate = (tplKey: string) => {
    const tpl = findTemplate(tplKey);
    if (!tpl) return;
    setGroups((prev) => {
      if (prev.some((g) => g.name_zh === tpl.name_zh)) return prev; // 同名不重复加
      return [
        ...prev,
        {
          key: uid(),
          name_zh: tpl.name_zh,
          name_en: tpl.name_en,
          name_th: tpl.name_th,
          selectionType: tpl.selectionType,
          isRequired: tpl.isRequired,
          maxSelect: tpl.maxSelect == null ? '' : String(tpl.maxSelect),
          options: tpl.options.map((o) =>
            emptyOptionFromTemplate(o),
          ),
        },
      ];
    });
  };

  const save = async () => {
    if (!itemId) return;
    // 至少要有名字才能存
    const cleaned = groups
      .map((g) => ({
        ...g,
        name_zh: g.name_zh.trim(),
        name_en: g.name_en.trim(),
        name_th: g.name_th.trim(),
        options: g.options.filter((o) => o.name_zh.trim() || o.name_en.trim() || o.name_th.trim()),
      }))
      .filter((g) => g.name_zh || g.name_en || g.name_th);

    const badGroup = cleaned.find((g) => !g.name_zh);
    if (badGroup) {
      setError(t('adminOptions.nameZhRequired'));
      return;
    }
    const badOption = cleaned.find((g) => g.options.some((o) => !o.name_zh));
    if (badOption) {
      setError(t('adminOptions.optionNameZhRequired'));
      return;
    }
    const noDefault = cleaned.find(
      (g) => g.isRequired && g.options.length > 0 && !g.options.some((o) => o.isDefault),
    );
    if (noDefault) {
      setError(t('adminOptions.needDefault', { name: noDefault.name_zh }));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await saveItemOptions(itemId, toInput(cleaned));
      onSaved?.(res.groups ?? []);
      onClose();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4">
      <div className="my-auto flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
        {/* 头部 */}
        <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-neutral-900">{t('adminOptions.title')}</h3>
            <p className="mt-0.5 truncate text-xs text-neutral-400">
              {itemName} · {t('adminOptions.subtitle')}
            </p>
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

        {/* 模板快捷区 */}
        <div className="border-b border-neutral-100 px-5 py-3">
          <p className="mb-2 text-xs font-medium text-neutral-500">{t('adminOptions.templateHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {OPTION_TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => appendTemplate(tpl.key)}
                className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:border-primary-300 hover:text-primary-700"
              >
                {tpl.icon} {locale === 'en' ? tpl.name_en : locale === 'th' ? tpl.name_th : tpl.name_zh}
              </button>
            ))}
          </div>
        </div>

        {/* 主体 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-neutral-400">{t('common.loading')}</div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-neutral-400">{t('adminOptions.empty')}</p>
              <p className="mt-1 text-xs text-neutral-300">{t('adminOptions.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.key} className="rounded-2xl border border-neutral-200 p-3.5">
                  {/* 组头 */}
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex rounded-lg bg-neutral-100 p-0.5">
                      <button
                        onClick={() => patchGroup(g.key, { selectionType: 'SINGLE' })}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                          g.selectionType === 'SINGLE'
                            ? 'bg-white text-primary-700 shadow-sm'
                            : 'text-neutral-500'
                        }`}
                      >
                        {t('adminOptions.single')}
                      </button>
                      <button
                        onClick={() => patchGroup(g.key, { selectionType: 'MULTI' })}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                          g.selectionType === 'MULTI'
                            ? 'bg-white text-primary-700 shadow-sm'
                            : 'text-neutral-500'
                        }`}
                      >
                        {t('adminOptions.multi')}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patchGroup(g.key, { isRequired: !g.isRequired })}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          g.isRequired
                            ? 'border-accent-400 bg-accent-50 text-accent-700'
                            : 'border-neutral-200 text-neutral-500'
                        }`}
                      >
                        {g.isRequired ? t('adminOptions.required') : t('adminOptions.optional')}
                      </button>
                      <button
                        onClick={() => removeGroup(g.key)}
                        aria-label={t('adminOptions.removeGroup')}
                        className="rounded p-1 text-error-600 hover:bg-error-50"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0v12a1 1 0 001 1h6a1 1 0 001-1V7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* 组名三语 */}
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      placeholder={t('admin.nameZhPlaceholder')}
                      value={g.name_zh}
                      onChange={(e) => patchGroup(g.key, { name_zh: e.target.value })}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-sm"
                    />
                    <input
                      placeholder={t('admin.nameEnPlaceholder')}
                      value={g.name_en}
                      onChange={(e) => patchGroup(g.key, { name_en: e.target.value })}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-sm"
                    />
                    <input
                      placeholder={t('admin.nameThPlaceholder')}
                      value={g.name_th}
                      onChange={(e) => patchGroup(g.key, { name_th: e.target.value })}
                      className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-sm"
                    />
                  </div>

                  {g.selectionType === 'MULTI' && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[11px] text-neutral-500">
                        {t('adminOptions.maxSelect')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        placeholder={t('adminOptions.unlimited')}
                        value={g.maxSelect}
                        onChange={(e) => patchGroup(g.key, { maxSelect: e.target.value })}
                        className="w-24 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  )}

                  {/* 选项列表 */}
                  <div className="mt-3 space-y-2">
                    {g.options.map((o) => (
                      <div key={o.key} className="rounded-xl bg-neutral-50 p-2.5">
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => toggleDefault(g.key, o.key)}
                            title={t('adminOptions.defaultOption')}
                            className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center ${
                              g.selectionType === 'SINGLE' ? 'rounded-full' : 'rounded'
                            } border ${
                              o.isDefault
                                ? 'border-primary-600 bg-primary-600 text-white'
                                : 'border-neutral-300 bg-white'
                            }`}
                          >
                            {o.isDefault && (
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="grid grid-cols-3 gap-1.5">
                              <input
                                placeholder={t('admin.nameZhPlaceholder')}
                                value={o.name_zh}
                                onChange={(e) => patchOption(g.key, o.key, { name_zh: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
                              />
                              <input
                                placeholder={t('admin.nameEnPlaceholder')}
                                value={o.name_en}
                                onChange={(e) => patchOption(g.key, o.key, { name_en: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
                              />
                              <input
                                placeholder={t('admin.nameThPlaceholder')}
                                value={o.name_th}
                                onChange={(e) => patchOption(g.key, o.key, { name_th: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] text-neutral-400">
                                {t('adminOptions.priceDelta')}
                              </label>
                              <input
                                type="number"
                                step="1"
                                value={o.priceDelta}
                                onChange={(e) => patchOption(g.key, o.key, { priceDelta: e.target.value })}
                                className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => removeOption(g.key, o.key)}
                            aria-label={t('common.delete')}
                            className="mt-0.5 shrink-0 rounded p-1 text-neutral-400 hover:bg-white hover:text-error-600"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(g.key)}
                      className="w-full rounded-xl border border-dashed border-neutral-300 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50"
                    >
                      + {t('adminOptions.addOption')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="border-t border-neutral-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && <p className="mb-2 text-xs text-error-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setGroups((prev) => [...prev, emptyGroup()])}
              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-600"
            >
              + {t('adminOptions.addGroup')}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="flex-1 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function emptyOptionFromTemplate(o: {
  name_zh: string;
  name_en: string;
  name_th: string;
  priceDelta: number;
  isDefault?: boolean;
}): EditableOption {
  return {
    key: uid(),
    name_zh: o.name_zh,
    name_en: o.name_en,
    name_th: o.name_th,
    priceDelta: String(o.priceDelta ?? 0),
    isDefault: !!o.isDefault,
  };
}

// ------------------------------------------------------------------ 批量套用模板

interface ApplyProps {
  open: boolean;
  itemIds: string[];
  onClose: () => void;
  onDone?: () => void;
}

export function ApplyTemplateModal({ open, itemIds, onClose, onDone }: ApplyProps) {
  const t = useTranslations();
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (!open) {
      setPicked([]);
      setMode('add');
      setError('');
      setResult('');
    }
  }, [open]);

  const toggle = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const apply = async () => {
    if (picked.length === 0 || itemIds.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await applyOptionTemplate({ itemIds, templateKeys: picked, mode });
      setResult(
        t('adminOptions.applyResult', {
          items: res.items,
          created: res.created,
          skipped: res.skipped,
        }),
      );
      onDone?.();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4">
      <div className="my-auto w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-neutral-900">{t('adminOptions.applyTitle')}</h3>
            <p className="mt-0.5 text-xs text-neutral-400">
              {t('adminOptions.applyTo', { count: itemIds.length })}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-2 text-xs font-medium text-neutral-500">{t('adminOptions.pickTemplates')}</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {OPTION_TEMPLATES.map((tpl) => {
            const on = picked.includes(tpl.key);
            return (
              <button
                key={tpl.key}
                onClick={() => toggle(tpl.key)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  on
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-700'
                }`}
              >
                <span className="text-base">{tpl.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {tpl.name_zh}
                  </span>
                  <span className="block truncate text-[10px] text-neutral-400">
                    {tpl.name_en}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mb-2 text-xs font-medium text-neutral-500">{t('adminOptions.mode')}</p>
        <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
          <button
            onClick={() => setMode('add')}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
              mode === 'add' ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
            }`}
          >
            {t('adminOptions.modeAdd')}
          </button>
          <button
            onClick={() => setMode('replace')}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
              mode === 'replace' ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
            }`}
          >
            {t('adminOptions.modeReplace')}
          </button>
        </div>

        {error && <p className="mb-2 text-xs text-error-600">{error}</p>}
        {result && <p className="mb-2 text-xs text-success-600">{result}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600"
          >
            {t('common.close')}
          </button>
          <button
            onClick={apply}
            disabled={saving || picked.length === 0}
            className="flex-1 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('adminOptions.applySubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}
