'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchAdminCategories,
  fetchAdminMenuItems,
  createCategory,
  updateCategory,
  deleteCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '@/lib/api-client';
import { processImage } from '@/lib/image-utils';

type MenuType = 'FOOD' | 'DRINK';

interface Category {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  type: MenuType;
  itemCount?: number;
}

interface MenuItem {
  id: string;
  catId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  price: number;
  popular: boolean;
  veg: boolean;
  spice: number;
  type: MenuType;
  isActive: boolean;
  imageUrl?: string;
  imageThumbUrl?: string;
  stockType?: 'NONE' | 'MADE' | 'PURCHASED';
  dailyLimit?: number | null;
  stockQty?: number | null;
  lowStockAlert?: number | null;
  costPrice?: number | null;
}

export default function AdminMenuPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<MenuType>('FOOD');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cats, menuItems] = await Promise.all([
        fetchAdminCategories(),
        fetchAdminMenuItems(),
      ]);
      setCategories(cats || []);
      setItems(menuItems || []);
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const filteredCategories = categories.filter((c) => c.type === activeTab);
  const filteredItems = items.filter((i) => i.type === activeTab);

  // Category form state
  const [catForm, setCatForm] = useState({ name_zh: '', name_en: '', name_th: '', type: 'FOOD' as MenuType });

  const openCategoryForm = (cat?: Category) => {
    if (cat) {
      setEditingCategory(cat);
      setCatForm({ name_zh: cat.name_zh, name_en: cat.name_en, name_th: cat.name_th, type: cat.type });
    } else {
      setEditingCategory(null);
      setCatForm({ name_zh: '', name_en: '', name_th: '', type: activeTab });
    }
    setShowCategoryForm(true);
  };

  const saveCategory = async () => {
    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name_zh: catForm.name_zh,
          name_en: catForm.name_en,
          name_th: catForm.name_th,
          type: catForm.type,
        });
      } else {
        await createCategory({
          name_zh: catForm.name_zh,
          name_en: catForm.name_en,
          name_th: catForm.name_th,
          type: catForm.type,
        });
      }
      setShowCategoryForm(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteCategory(id);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    }
  };

  const [itemForm, setItemForm] = useState({
    name_zh: '',
    name_en: '',
    name_th: '',
    price: '',
    catId: '',
    popular: false,
    veg: false,
    spice: 0,
    imageUrl: '' as string,
    imageThumbUrl: '' as string,
    stockType: 'NONE' as 'NONE' | 'MADE' | 'PURCHASED',
    dailyLimit: '' as string,
    stockQty: '' as string,
    lowStockAlert: '' as string,
    costPrice: '' as string,
  });

  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openItemForm = (item?: MenuItem) => {
    setImageError('');
    if (item) {
      setEditingItem(item);
      setItemForm({
        name_zh: item.name_zh,
        name_en: item.name_en,
        name_th: item.name_th,
        price: String(item.price),
        catId: item.catId,
        popular: item.popular,
        veg: item.veg,
        spice: item.spice,
        imageUrl: item.imageUrl || '',
        imageThumbUrl: item.imageThumbUrl || '',
        stockType: item.stockType || 'NONE',
        dailyLimit:
          item.dailyLimit === null || item.dailyLimit === undefined
            ? ''
            : String(item.dailyLimit),
        stockQty:
          item.stockQty === null || item.stockQty === undefined
            ? ''
            : String(item.stockQty),
        lowStockAlert:
          item.lowStockAlert === null || item.lowStockAlert === undefined
            ? ''
            : String(item.lowStockAlert),
        costPrice:
          item.costPrice === null || item.costPrice === undefined
            ? ''
            : String(item.costPrice),
      });
    } else {
      setEditingItem(null);
      setItemForm({
        name_zh: '',
        name_en: '',
        name_th: '',
        price: '',
        catId: filteredCategories[0]?.id || '',
        popular: false,
        veg: false,
        spice: 0,
        imageUrl: '',
        imageThumbUrl: '',
        stockType: 'NONE',
        dailyLimit: '',
        stockQty: '',
        lowStockAlert: '',
        costPrice: '',
      });
    }
    setShowItemForm(true);
  };

  const saveItem = async () => {
    setSaving(true);
    try {
      const price = parseFloat(itemForm.price) || 0;
      const imageUrl = itemForm.imageUrl || undefined;
      const imageThumbUrl = itemForm.imageThumbUrl || undefined;
      const stockType = itemForm.stockType;
      const dailyLimit =
        itemForm.dailyLimit === '' ? null : Number(itemForm.dailyLimit);
      const stockQty =
        itemForm.stockQty === '' ? null : Number(itemForm.stockQty);
      const lowStockAlert =
        itemForm.lowStockAlert === '' ? null : Number(itemForm.lowStockAlert);
      const costPrice =
        itemForm.costPrice === '' ? null : Number(itemForm.costPrice);
      if (editingItem) {
        await updateMenuItem(editingItem.id, {
          categoryId: itemForm.catId,
          name_zh: itemForm.name_zh,
          name_en: itemForm.name_en,
          name_th: itemForm.name_th,
          price,
          spiceLevel: itemForm.spice,
          isPopular: itemForm.popular,
          isVegetarian: itemForm.veg,
          imageUrl,
          imageThumbUrl,
          stockType,
          dailyLimit,
          stockQty,
          lowStockAlert,
          costPrice,
        });
      } else {
        await createMenuItem({
          categoryId: itemForm.catId,
          name_zh: itemForm.name_zh,
          name_en: itemForm.name_en,
          name_th: itemForm.name_th,
          price,
          spiceLevel: itemForm.spice,
          isPopular: itemForm.popular,
          isVegetarian: itemForm.veg,
          imageUrl,
          imageThumbUrl,
          stockType,
          dailyLimit,
          stockQty,
          lowStockAlert,
          costPrice,
        });
      }
      setShowItemForm(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteMenuItem(id);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    }
  };

  const handleImageUpload = async (file: File) => {
    setImageError('');
    setImageUploading(true);
    try {
      const { hdUrl, thumbUrl } = await processImage(file);
      setItemForm((f) => ({ ...f, imageUrl: hdUrl, imageThumbUrl: thumbUrl }));
    } catch (err: any) {
      setImageError(err?.message || t('admin.imageUploadFailed'));
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setItemForm((f) => ({ ...f, imageUrl: '', imageThumbUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-error-50 px-4 py-2 text-sm text-error-600">
          {error}
          <button onClick={loadData} className="ml-2 underline">{t('common.retry')}</button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-neutral-400">{t('common.loading')}</div>
      ) : (
        <>
          {/* Food/Drink Tabs */}
          <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
            <button
              onClick={() => setActiveTab('FOOD')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                activeTab === 'FOOD' ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {t('admin.foodType')}
            </button>
            <button
              onClick={() => setActiveTab('DRINK')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                activeTab === 'DRINK' ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {t('admin.drinkType')}
            </button>
          </div>

          {/* Categories */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">{t('menu.categories')}</h3>
              <button
                onClick={() => openCategoryForm()}
                className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-white"
              >
                + {t('admin.addCategory')}
              </button>
            </div>
            <div className="space-y-2">
              {filteredCategories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                  <span className="text-sm font-medium text-neutral-900">{getLocaleName(cat)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openCategoryForm(cat)}
                      className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="rounded px-2 py-1 text-xs text-error-600 hover:bg-error-50"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
              {filteredCategories.length === 0 && (
                <p className="py-4 text-center text-sm text-neutral-400">{t('common.noData')}</p>
              )}
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">{t('admin.menu')}</h3>
              <div className="flex gap-2">
                <Link
                  href="/admin/menu/bulk"
                  className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  ⇅ {t('adminBulk.entry')}
                </Link>
                <button
                  onClick={() => openItemForm()}
                  disabled={filteredCategories.length === 0}
                  className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  + {t('admin.addItem')}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div key={item.id} className={`flex items-center justify-between rounded-lg bg-white p-3 shadow-sm ${!item.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    {item.imageThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageThumbUrl}
                        alt={getLocaleName(item)}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">
                        🍽️
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{getLocaleName(item)}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs font-medium text-accent-600">฿{item.price}</span>
                      {item.popular && (
                        <span className="rounded bg-accent-50 px-1.5 py-0.5 text-xs text-accent-600">★</span>
                      )}
                      {item.veg && (
                        <span className="rounded bg-success-50 px-1.5 py-0.5 text-xs text-success-600">{t('menu.vegetarian')}</span>
                      )}
                    </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openItemForm(item)}
                      className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="rounded px-2 py-1 text-xs text-error-600 hover:bg-error-50"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="py-10 text-center text-sm text-neutral-400">
                  {t('common.noData')}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {editingCategory ? t('common.edit') : t('admin.addCategory')}
              </h3>
              <button onClick={() => setShowCategoryForm(false)} className="text-neutral-400 hover:text-neutral-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <select
                value={catForm.type}
                onChange={(e) => setCatForm((f) => ({ ...f, type: e.target.value as MenuType }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              >
                <option value="FOOD">{t('admin.foodType')}</option>
                <option value="DRINK">{t('admin.drinkType')}</option>
              </select>
              <input
                placeholder={t('admin.nameZhPlaceholder')}
                value={catForm.name_zh}
                onChange={(e) => setCatForm((f) => ({ ...f, name_zh: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                placeholder={t('admin.nameEnPlaceholder')}
                value={catForm.name_en}
                onChange={(e) => setCatForm((f) => ({ ...f, name_en: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                placeholder={t('admin.nameThPlaceholder')}
                value={catForm.name_th}
                onChange={(e) => setCatForm((f) => ({ ...f, name_th: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <button
                onClick={saveCategory}
                disabled={saving}
                className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Form Modal */}
      {showItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {editingItem ? t('admin.editItem') : t('admin.addItem')}
              </h3>
              <button onClick={() => setShowItemForm(false)} className="text-neutral-400 hover:text-neutral-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <select
                value={itemForm.catId}
                onChange={(e) => setItemForm((f) => ({ ...f, catId: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              >
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>{getLocaleName(c)}</option>
                ))}
              </select>
              <input
                placeholder={t('admin.nameZhPlaceholder')}
                value={itemForm.name_zh}
                onChange={(e) => setItemForm((f) => ({ ...f, name_zh: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                placeholder={t('admin.nameEnPlaceholder')}
                value={itemForm.name_en}
                onChange={(e) => setItemForm((f) => ({ ...f, name_en: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                placeholder={t('admin.nameThPlaceholder')}
                value={itemForm.name_th}
                onChange={(e) => setItemForm((f) => ({ ...f, name_th: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <input
                type="number"
                placeholder={t('admin.itemPrice')}
                value={itemForm.price}
                onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              />
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setItemForm((f) => ({ ...f, popular: !f.popular }))}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                      itemForm.popular
                        ? 'border-accent-500 bg-accent-50 text-accent-700'
                        : 'border-neutral-200 text-neutral-500'
                    }`}
                  >
                    ★ {t('admin.isPopular')}
                  </button>
                  <button
                    onClick={() => setItemForm((f) => ({ ...f, veg: !f.veg }))}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                      itemForm.veg
                        ? 'border-success-500 bg-success-50 text-success-700'
                        : 'border-neutral-200 text-neutral-500'
                    }`}
                  >
                    {t('admin.isVegetarian')}
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-500">
                    {t('admin.spiceLevel')}: {itemForm.spice}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    value={itemForm.spice}
                    onChange={(e) => setItemForm((f) => ({ ...f, spice: parseInt(e.target.value) }))}
                    className="w-full accent-primary-700"
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-neutral-500">
                  {t('admin.dishImage')}
                </label>
                {itemForm.imageThumbUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={itemForm.imageThumbUrl}
                      alt="preview"
                      className="h-20 w-20 rounded-xl border border-neutral-200 object-cover"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUploading}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {t('admin.changeImage')}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        disabled={imageUploading}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:opacity-50"
                      >
                        {t('admin.removeImage')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-6 text-neutral-400 hover:border-primary-300 hover:text-primary-500 disabled:opacity-50"
                  >
                    {imageUploading ? (
                      <>
                        <svg className="mb-1 h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-xs">{t('admin.processing')}</span>
                      </>
                    ) : (
                      <>
                        <svg className="mb-1 h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs">{t('admin.uploadImage')}</span>
                        <span className="mt-0.5 text-[10px] text-neutral-300">{t('admin.imageHint')}</span>
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                />
                {imageError && (
                  <p className="text-xs text-error-600">{imageError}</p>
                )}
              </div>

              {/* Stock / 库存 block */}
              <div className="space-y-2 border-t border-neutral-100 pt-3">
                <label className="block text-xs font-medium text-neutral-500">
                  {t('adminStock.stockType')}
                </label>
                <select
                  value={itemForm.stockType}
                  onChange={(e) =>
                    setItemForm((f) => ({
                      ...f,
                      stockType: e.target.value as
                        | 'NONE'
                        | 'MADE'
                        | 'PURCHASED',
                    }))
                  }
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                >
                  <option value="NONE">{t('adminStock.typeNone')}</option>
                  <option value="MADE">{t('adminStock.typeMade')}</option>
                  <option value="PURCHASED">
                    {t('adminStock.typePurchased')}
                  </option>
                </select>
                {itemForm.stockType === 'MADE' && (
                  <input
                    type="number"
                    min={0}
                    placeholder={t('adminStock.dailyLimit')}
                    value={itemForm.dailyLimit}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, dailyLimit: e.target.value }))
                    }
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                  />
                )}
                {itemForm.stockType === 'PURCHASED' && (
                  <>
                    <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
                      {t('adminStock.currentStock')}:{' '}
                      {itemForm.stockQty === ''
                        ? '—'
                        : `${itemForm.stockQty} ${t('adminStock.unitPieces')}`}
                    </div>
                    <input
                      type="number"
                      min={0}
                      placeholder={t('adminStock.lowStockAlertLine')}
                      value={itemForm.lowStockAlert}
                      onChange={(e) =>
                        setItemForm((f) => ({
                          ...f,
                          lowStockAlert: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={t('adminStock.costPrice')}
                      value={itemForm.costPrice}
                      onChange={(e) =>
                        setItemForm((f) => ({
                          ...f,
                          costPrice: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                    />
                  </>
                )}
              </div>

              <button
                onClick={saveItem}
                disabled={saving}
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
