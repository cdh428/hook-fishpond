'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef } from 'react';
import { Link } from '@/i18n/routing';
import {
  menuExportUrl,
  menuTemplateUrl,
  importMenuPreview,
  commitMenuImport,
  type MenuImportRow,
  type MenuImportPreview,
  type MenuImportResult,
} from '@/lib/api-client';

type Step = 'home' | 'preview' | 'done';
type ImportMode = 'translate' | 'keep';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// The three name fields that can be auto-translated.
const NAME_FIELDS = [
  { key: 'name_zh', label: '中文' },
  { key: 'name_en', label: 'EN' },
  { key: 'name_th', label: 'TH' },
] as const;

export default function AdminMenuBulkPage() {
  const t = useTranslations();

  const [step, setStep] = useState<Step>('home');

  // home state
  const [mode, setMode] = useState<ImportMode>('translate');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [homeError, setHomeError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // preview state
  const [preview, setPreview] = useState<MenuImportPreview | null>(null);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({}); // `${rowNumber}:${field}` -> value
  const [committing, setCommitting] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // done state
  const [result, setResult] = useState<MenuImportResult | null>(null);

  const runPreview = useCallback(
    async (f: File, m: ImportMode) => {
      setBusy(true);
      setHomeError('');
      try {
        const p = await importMenuPreview(f, m);
        setPreview(p);
        setAutoCreateCategories(true);
        setEdits({});
        setStep('preview');
      } catch (err: any) {
        setHomeError(err?.message || t('adminBulk.readFailed'));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const onFileSelected = async (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setHomeError(t('adminBulk.fileTooLarge'));
      return;
    }
    setFile(f);
    await runPreview(f, mode);
  };

  const onModeChange = async (m: ImportMode) => {
    setMode(m);
    // Re-run the preview against the same file if one is loaded.
    if (file) {
      await runPreview(file, m);
    }
  };

  const getCell = (row: MenuImportRow, field: string): string => {
    const edited = edits[`${row.rowNumber}:${field}`];
    if (edited !== undefined) return edited;
    return (row as any)[field] ?? '';
  };

  const onCellEdit = (rowNumber: number, field: string, value: string) => {
    setEdits((e) => ({ ...e, [`${rowNumber}:${field}`]: value }));
  };

  // Build rows to send to commit: drop ERROR rows, apply edits.
  const buildCommitRows = (): MenuImportRow[] => {
    if (!preview) return [];
    return preview.rows
      .filter((r) => r.action !== 'ERROR')
      .map((r) => {
        const out: MenuImportRow = { ...r };
        for (const f of NAME_FIELDS) {
          const edited = edits[`${r.rowNumber}:${f.key}`];
          if (edited !== undefined) (out as any)[f.key] = edited;
        }
        // also apply edits to description fields if present
        (['description_zh', 'description_en', 'description_th'] as const).forEach((f) => {
          const edited = edits[`${r.rowNumber}:${f}`];
          if (edited !== undefined) (out as any)[f] = edited;
        });
        return out;
      });
  };

  const onConfirmImport = async () => {
    if (!preview) return;
    setCommitting(true);
    setPreviewError('');
    try {
      const rows = buildCommitRows();
      const res = await commitMenuImport({ rows, autoCreateCategories });
      setResult(res);
      setStep('done');
    } catch (err: any) {
      setPreviewError(err?.message || t('common.error'));
    } finally {
      setCommitting(false);
    }
  };

  const downloadSkippedCsv = (rows: { rowNumber: number; name: string; reason: string }[]) => {
    const header = ['行号', '分类', '名称', '原因'];
    const lines = rows.map((r) => [String(r.rowNumber), '', r.name, r.reason].join(','));
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skipped-rows.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const skippedRows = preview?.rows.filter((r) => r.action === 'ERROR') ?? [];
  const confirmCount = preview
    ? preview.summary.add + preview.summary.update + preview.summary.delete
    : 0;

  const resetToHome = () => {
    setStep('home');
    setFile(null);
    setPreview(null);
    setResult(null);
    setEdits({});
    setHomeError('');
    setPreviewError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const actionChip = (action: MenuImportRow['action']) => {
    switch (action) {
      case 'ADD':
        return <span className="rounded bg-success-50 px-2 py-0.5 text-xs font-medium text-success-600">{t('adminBulk.willAdd')}</span>;
      case 'UPDATE':
        return <span className="rounded bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{t('adminBulk.willUpdate')}</span>;
      case 'DELETE':
        return <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">{t('adminBulk.willDelete')}</span>;
      case 'ERROR':
        return <span className="rounded bg-error-50 px-2 py-0.5 text-xs font-medium text-error-600">{t('adminBulk.willSkip')}</span>;
    }
  };

  return (
    <>
      {step === 'home' && (
        <>
          <p className="mb-4 text-sm text-neutral-500">{t('adminBulk.explanation')}</p>

          {homeError && (
            <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
              {homeError}
            </div>
          )}

          {/* Export */}
          <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">📤 {t('adminBulk.exportCurrent')}</p>
            <p className="mb-2 mt-0.5 text-xs text-neutral-400">{t('adminBulk.exportHint')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.assign(menuExportUrl('xlsx'))}
                className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
              >
                .xlsx
              </button>
              <button
                onClick={() => window.location.assign(menuExportUrl('csv'))}
                className="rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
              >
                .csv
              </button>
            </div>
          </div>

          {/* Template */}
          <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">📄 {t('adminBulk.downloadTemplate')}</p>
            <p className="mb-2 mt-0.5 text-xs text-neutral-400">{t('adminBulk.templateHint')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => window.location.assign(menuTemplateUrl('xlsx'))}
                className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600"
              >
                .xlsx
              </button>
              <button
                onClick={() => window.location.assign(menuTemplateUrl('csv'))}
                className="rounded-lg bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-600 hover:bg-accent-500 hover:text-white"
              >
                .csv
              </button>
            </div>
          </div>

          {/* Upload */}
          <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">📥 {t('adminBulk.uploadFile')}</p>
            <p className="mb-2 mt-0.5 text-xs text-neutral-400">{t('adminBulk.uploadHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="block w-full text-xs text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-100"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />

            {/* Mode toggle */}
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-neutral-500">{t('adminBulk.mode')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onModeChange('translate')}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                    mode === 'translate'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-500'
                  }`}
                >
                  {t('adminBulk.modeTranslate')}
                </button>
                <button
                  onClick={() => onModeChange('keep')}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                    mode === 'keep'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-500'
                  }`}
                >
                  {t('adminBulk.modeKeep')}
                </button>
              </div>
            </div>

            {busy && (
              <p className="mt-3 text-xs text-primary-600">{t('adminBulk.checking')}</p>
            )}
          </div>
        </>
      )}

      {step === 'preview' && preview && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-neutral-900">{t('adminBulk.previewTitle')}</h3>
            <button
              onClick={resetToHome}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
            >
              {t('common.back')}
            </button>
          </div>

          {/* Summary cards */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-success-50 p-3">
              <p className="text-xs text-success-600">{t('adminBulk.willAdd')}</p>
              <p className="text-lg font-bold text-success-600">{preview.summary.add}</p>
            </div>
            <div className="rounded-xl bg-primary-50 p-3">
              <p className="text-xs text-primary-700">{t('adminBulk.willUpdate')}</p>
              <p className="text-lg font-bold text-primary-700">{preview.summary.update}</p>
            </div>
            <div className="rounded-xl bg-neutral-100 p-3">
              <p className="text-xs text-neutral-500">{t('adminBulk.willDelete')}</p>
              <p className="text-lg font-bold text-neutral-500">{preview.summary.delete}</p>
            </div>
            <div className="rounded-xl bg-error-50 p-3">
              <p className="text-xs text-error-600">{t('adminBulk.willSkip')}</p>
              <p className="text-lg font-bold text-error-600">{preview.summary.error}</p>
            </div>
          </div>

          {preview.summary.translated > 0 && (
            <div className="mb-4 inline-block rounded-full bg-accent-50 px-3 py-1 text-xs font-medium text-accent-600">
              {t('adminBulk.autoTranslated')} {preview.summary.translated}
            </div>
          )}

          {/* New categories */}
          {preview.newCategories.length > 0 && (
            <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={autoCreateCategories}
                  onChange={(e) => setAutoCreateCategories(e.target.checked)}
                  className="mt-0.5 accent-primary-700"
                />
                <span className="text-sm text-neutral-700">{t('adminBulk.autoCreateCategories')}</span>
              </label>
              <div className="mt-2 flex flex-wrap gap-1">
                {preview.newCategories.map((c) => (
                  <span key={c} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Row cards */}
          <div className="mb-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {preview.rows.map((row) => (
              <div
                key={row.rowNumber}
                className={`rounded-xl bg-white p-3 shadow-sm ${
                  row.action === 'ERROR' ? 'border border-error-600/30' : ''
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">
                    {t('adminBulk.rowLabel')}
                    {row.rowNumber}
                    {row.category ? ` · ${row.category}` : ''}
                  </span>
                  {actionChip(row.action)}
                </div>

                {row.action === 'ERROR' ? (
                  <p className="text-xs text-error-600">{row.error}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {NAME_FIELDS.map((f) => {
                        const fieldKey = f.key;
                        const isTranslated = row.autoTranslated.includes(fieldKey);
                        const value = getCell(row, fieldKey);
                        const editKey = `${row.rowNumber}:${fieldKey}`;
                        return (
                          <div
                            key={fieldKey}
                            className={`flex-1 min-w-[80px] rounded-lg px-2 py-1.5 text-sm ${
                              isTranslated
                                ? 'bg-accent-50 text-accent-700'
                                : 'bg-neutral-50 text-neutral-900'
                            }`}
                          >
                            <span className="mr-1 text-[10px] opacity-60">{f.label}</span>
                            {isTranslated ? (
                              <input
                                value={value}
                                onChange={(e) => onCellEdit(row.rowNumber, fieldKey, e.target.value)}
                                className="w-full bg-transparent text-sm text-amber-700 outline-none"
                              />
                            ) : (
                              <span>{value || '—'}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {row.action === 'UPDATE' && row.changes.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-0.5 text-[10px] font-medium text-neutral-400">
                          {t('adminBulk.changes')}
                        </p>
                        <ul className="space-y-0.5">
                          {row.changes.map((c, i) => (
                            <li key={i} className="text-xs text-neutral-500">• {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Error list */}
          {skippedRows.length > 0 && (
            <div className="mb-4 rounded-xl bg-error-50 p-3">
              <p className="mb-1 text-xs font-medium text-error-600">{t('adminBulk.willSkip')}</p>
              <ul className="space-y-0.5">
                {skippedRows.map((r) => (
                  <li key={r.rowNumber} className="text-xs text-error-600">
                    {t('adminBulk.rowLabel')}
                    {r.rowNumber}：{r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {previewError && (
            <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
              {previewError}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            <button
              onClick={onConfirmImport}
              disabled={committing || confirmCount === 0}
              className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {committing ? t('adminBulk.checking') : `${t('adminBulk.confirmImport')} ${confirmCount} ${t('adminBulk.rowLabel')}`}
            </button>
            <button
              onClick={() =>
                downloadSkippedCsv(
                  skippedRows.map((r) => ({
                    rowNumber: r.rowNumber,
                    name: r.name_zh,
                    category: r.category,
                    reason: r.error || '',
                  })),
                )
              }
              disabled={skippedRows.length === 0}
              className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 disabled:opacity-50"
            >
              {t('adminBulk.downloadSkipped')}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="mb-2 text-3xl">✅</div>
          <h3 className="mb-1 font-semibold text-neutral-900">{t('adminBulk.doneTitle')}</h3>
          <p className="text-sm text-neutral-500">{t('adminBulk.importedTitle')} {result.added + result.updated + result.deleted} {t('adminBulk.rowLabel')}</p>

          <div className="my-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-success-50 p-3">
              <p className="text-xs text-success-600">{t('adminBulk.willAdd')}</p>
              <p className="text-lg font-bold text-success-600">{result.added}</p>
            </div>
            <div className="rounded-xl bg-primary-50 p-3">
              <p className="text-xs text-primary-700">{t('adminBulk.willUpdate')}</p>
              <p className="text-lg font-bold text-primary-700">{result.updated}</p>
            </div>
            <div className="rounded-xl bg-neutral-100 p-3">
              <p className="text-xs text-neutral-500">{t('adminBulk.willDelete')}</p>
              <p className="text-lg font-bold text-neutral-500">{result.deleted}</p>
            </div>
          </div>

          {result.skipped.length > 0 && (
            <div className="mb-4 rounded-xl bg-error-50 p-3 text-left">
              <p className="mb-1 text-xs font-medium text-error-600">{t('adminBulk.skippedList')} ({result.skipped.length})</p>
              <ul className="space-y-0.5">
                {result.skipped.map((s) => (
                  <li key={s.rowNumber} className="text-xs text-error-600">
                    {t('adminBulk.rowLabel')}
                    {s.rowNumber}：{s.name} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() =>
                downloadSkippedCsv(result.skipped.map((s) => ({ rowNumber: s.rowNumber, name: s.name, reason: s.reason })))
              }
              disabled={result.skipped.length === 0}
              className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 disabled:opacity-50"
            >
              {t('adminBulk.downloadSkipped')}
            </button>
            <div className="flex gap-2">
              <Link
                href="/admin/menu"
                className="flex-1 rounded-xl bg-primary-700 py-2.5 text-center text-sm font-semibold text-white"
              >
                {t('adminBulk.backToMenu')}
              </Link>
              <button
                onClick={resetToHome}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600"
              >
                {t('adminBulk.importAgain')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
