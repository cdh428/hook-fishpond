'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  fetchAdminTables,
  createTable,
  updateTable,
  deleteTable,
  tableOrderUrl,
  type TableArea,
} from '@/lib/api-client';

interface TableRow {
  id: string;
  code: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  area: TableArea;
  isActive: boolean;
  orderCount?: number;
}

export default function AdminTablesPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TableRow | null>(null);
  const [qrPreview, setQrPreview] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name_zh: '',
    name_en: '',
    name_th: '',
    area: 'HUT' as TableArea,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAdminTables();
      setTables(rows || []);

      // Build small QR previews (data URLs) for each table
      const previews: Record<string, string> = {};
      for (const row of rows || []) {
        try {
          previews[row.id] = await QRCode.toDataURL(tableOrderUrl(row.code), {
            width: 160,
            margin: 1,
            color: { dark: '#155E75', light: '#ffffff' },
          });
        } catch {
          // skip preview on failure
        }
      }
      setQrPreview(previews);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getLocaleName = (row: TableRow) => {
    if (locale === 'en') return row.name_en;
    if (locale === 'th') return row.name_th;
    return row.name_zh;
  };

  const openForm = (row?: TableRow) => {
    if (row) {
      setEditing(row);
      setForm({
        code: row.code,
        name_zh: row.name_zh,
        name_en: row.name_en,
        name_th: row.name_th,
        area: row.area,
      });
    } else {
      setEditing(null);
      const nextArea: TableArea = 'HUT';
      setForm({ code: suggestNextCode(nextArea), name_zh: '', name_en: '', name_th: '', area: nextArea });
    }
    setShowForm(true);
  };

  // Suggest the next table code in a given area, e.g. A11 or C05
  const suggestNextCode = (area: TableArea): string => {
    const prefix = area === 'HUT' ? 'A' : 'C';
    const nums = tables
      .filter((x) => x.code.startsWith(prefix))
      .map((x) => parseInt(x.code.slice(1), 10))
      .filter((n) => !Number.isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${prefix}${String(next).padStart(2, '0')}`;
  };

  // Auto-fill trilingual names when the code or area changes (only for new tables)
  const applyAutoNames = (code: string, area: TableArea) => {
    if (editing) return;
    const num = parseInt(code.replace(/^[A-Z]+/i, ''), 10);
    if (Number.isNaN(num)) return;
    if (area === 'HUT') {
      setForm((f) => ({
        ...f,
        name_zh: `茅草屋 ${num}号桌`,
        name_en: `Hut Table ${num}`,
        name_th: `ซุ้ม ${num}`,
      }));
    } else {
      setForm((f) => ({
        ...f,
        name_zh: `咖啡厅 ${num}号桌`,
        name_en: `Cafe Table ${num}`,
        name_th: `คาเฟ่ ${num}`,
      }));
    }
  };

  const saveTable = async () => {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateTable(editing.id, {
          code: form.code,
          name_zh: form.name_zh,
          name_en: form.name_en,
          name_th: form.name_th,
          area: form.area,
        });
      } else {
        await createTable({
          code: form.code,
          name_zh: form.name_zh,
          name_en: form.name_en,
          name_th: form.name_th,
          area: form.area,
        });
      }
      setShowForm(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: TableRow) => {
    try {
      await updateTable(row.id, { isActive: !row.isActive });
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    }
  };

  const handleDelete = async (row: TableRow) => {
    try {
      await deleteTable(row.id);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    }
  };

  // Render a printable QR sticker: QR code + table label underneath
  const buildStickerDataUrl = async (row: TableRow): Promise<string> => {
    const size = 600;
    const qrSize = 480;
    const qrDataUrl = await QRCode.toDataURL(tableOrderUrl(row.code), {
      width: qrSize,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('QR image load failed'));
      img.src = qrDataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const qrX = (size - qrSize) / 2;
    const qrY = 40;
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

    // Table name label
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`${row.name_zh}  ${row.code}`, size / 2, qrY + qrSize + 52);

    return canvas.toDataURL('image/png');
  };

  const downloadSticker = async (row: TableRow) => {
    setDownloading(row.id);
    try {
      const dataUrl = await buildStickerDataUrl(row);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `table-${row.code}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setDownloading(null);
    }
  };

  // Open a print-ready sheet with every active table's QR sticker
  const printAll = async () => {
    setDownloading('__all__');
    try {
      const active = tables.filter((x) => x.isActive);
      const stickers = await Promise.all(active.map((row) => buildStickerDataUrl(row)));
      const w = window.open('', '_blank');
      if (!w) {
        setError(t('admin.popupBlocked'));
        return;
      }
      w.document.write(`<!DOCTYPE html><html><head><title>Hook Fishpond — Table QR</title>
        <style>
          body { font-family: sans-serif; margin: 16px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
          .item { border: 1px solid #ddd; border-radius: 12px; padding: 12px; text-align: center; page-break-inside: avoid; }
          .item img { width: 100%; max-width: 320px; }
          h1 { font-size: 18px; margin-bottom: 12px; }
          @media print { .hint { display: none; } }
        </style></head><body>
        <h1>${t('admin.tableQrPrintTitle')} (${active.length})</h1>
        <p class="hint">${t('admin.tableQrPrintHint')}</p>
        <div class="grid">
          ${stickers.map((src) => `<div class="item"><img src="${src}" /></div>`).join('')}
        </div>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };</script>
        </body></html>`);
      w.document.close();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setDownloading(null);
    }
  };

  const hutTables = tables.filter((x) => x.area === 'HUT');
  const cafeTables = tables.filter((x) => x.area === 'CAFE');

  const renderSection = (titleKey: string, rows: TableRow[]) => (
    <div className="mb-6">
      <h3 className="mb-3 font-semibold text-neutral-900">
        {t(titleKey)} ({rows.length})
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-xl bg-white p-3 shadow-sm ${!row.isActive ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {getLocaleName(row)}
                </p>
                <span className="mt-0.5 inline-block rounded bg-primary-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-700">
                  {row.code}
                </span>
              </div>
              {qrPreview[row.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrPreview[row.id]}
                  alt={`QR ${row.code}`}
                  className="h-14 w-14 shrink-0 rounded-lg border border-neutral-100"
                />
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              <button
                onClick={() => downloadSticker(row)}
                disabled={downloading === row.id}
                className="rounded px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
              >
                {downloading === row.id ? t('common.saving') : t('admin.downloadQR')}
              </button>
              <button
                onClick={() => openForm(row)}
                className="rounded px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                {t('common.edit')}
              </button>
              <button
                onClick={() => toggleActive(row)}
                className="rounded px-2 py-1 text-[11px] font-medium text-accent-600 hover:bg-accent-50"
              >
                {row.isActive ? t('admin.deactivate') : t('admin.activate')}
              </button>
              <button
                onClick={() => handleDelete(row)}
                className="rounded px-2 py-1 text-[11px] font-medium text-error-600 hover:bg-error-50"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-neutral-400">
            {t('common.noData')}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
          {error}
          <button onClick={loadData} className="ml-2 underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => openForm()}
          className="flex-1 rounded-xl bg-primary-700 px-3 py-2.5 text-sm font-semibold text-white"
        >
          + {t('admin.addTable')}
        </button>
        <button
          onClick={printAll}
          disabled={downloading === '__all__' || tables.length === 0}
          className="flex-1 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm font-semibold text-primary-700 disabled:opacity-50"
        >
          {downloading === '__all__' ? t('common.loading') : t('admin.printAllQR')}
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : (
        <>
          {renderSection('admin.areaHut', hutTables)}
          {renderSection('admin.areaCafe', cafeTables)}
        </>
      )}

      {/* Table form modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {editing ? t('admin.editTable') : t('admin.addTable')}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <select
                value={form.area}
                onChange={(e) => {
                  const area = e.target.value as TableArea;
                  if (editing) {
                    setForm((f) => ({ ...f, area }));
                  } else {
                    const code = suggestNextCode(area);
                    setForm((f) => ({ ...f, area, code }));
                    applyAutoNames(code, area);
                  }
                }}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              >
                <option value="HUT">{t('admin.areaHut')}</option>
                <option value="CAFE">{t('admin.areaCafe')}</option>
              </select>

              <input
                placeholder={t('admin.tableCodePlaceholder')}
                value={form.code}
                onChange={(e) => {
                  const code = e.target.value.toUpperCase();
                  setForm((f) => ({ ...f, code }));
                  applyAutoNames(code, form.area);
                }}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 font-mono text-sm"
              />

              <input
                placeholder={t('admin.nameZhPlaceholder')}
                value={form.name_zh}
                onChange={(e) => setForm((f) => ({ ...f, name_zh: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                placeholder={t('admin.nameEnPlaceholder')}
                value={form.name_en}
                onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                placeholder={t('admin.nameThPlaceholder')}
                value={form.name_th}
                onChange={(e) => setForm((f) => ({ ...f, name_th: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />

              <div className="rounded-lg bg-neutral-50 px-3 py-2">
                <p className="text-[10px] text-neutral-400">{t('admin.qrPointsTo')}</p>
                <p className="break-all font-mono text-[11px] text-neutral-600">
                  {tableOrderUrl(form.code || 'A01')}
                </p>
              </div>

              <button
                onClick={saveTable}
                disabled={saving || !form.code || !form.name_zh}
                className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
