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
  moveMenuItems,
} from '@/lib/api-client';
import { processImage } from '@/lib/image-utils';
import {
  MENU_TYPES,
  MENU_TYPE_ADMIN_LABEL_KEY,
  MENU_TYPE_EMOJI,
  type MenuTypeValue,
} from '@/lib/menu-types';
import { ItemOptionsEditor, ApplyTemplateModal } from '@/components/ItemOptionsEditor';

type MenuType = MenuTypeValue;

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
  targetMargin?: number | null;
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
    targetMargin: '' as string,
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
        targetMargin:
          item.targetMargin === null || item.targetMargin === undefined
            ? ''
            : String(Math.round(item.targetMargin * 100)),
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
        targetMargin: '',
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
      const targetMargin =
        itemForm.targetMargin === ''
          ? null
          : Number(itemForm.targetMargin) / 100;
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
          targetMargin,
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
          targetMargin,
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

  // ---------- 快速移动（单个 / 批量）----------
  // 场景：菜品建错了大类（例如「工具」类的东西建到了「美食」下面）。
  // 设计：不复用那个十几栏的编辑弹窗，只弹一个「先选大类 → 再选分类」的两段式面板。
  const [moveIds, setMoveIds] = useState<string[] | null>(null); // null = 面板关闭
  const [moveType, setMoveType] = useState<MenuType>('FOOD');
  const [moveCatId, setMoveCatId] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ---------- 规格选项（单个编辑 / 批量套用模板）----------
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [showTemplateApply, setShowTemplateApply] = useState(false);

  // 空大类不能是死胡同：以前「工具」大类下一个分类都没有，按钮又被写死 disabled，
  // 于是无论怎么点都到不了工具类。现在允许在移动面板里直接给该大类建一个分类。
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatForm, setNewCatForm] = useState({ name_zh: '', name_en: '', name_th: '' });
  const [creatingCat, setCreatingCat] = useState(false);

  const catsOfType = (type: MenuType) => categories.filter((c) => c.type === type);

  /** 某分类下的全部菜品 id —— 给「移动整类」用 */
  const idsOfCategory = (catId: string) =>
    items.filter((i) => i.catId === catId).map((i) => i.id);

  const resetNewCat = () => {
    setShowNewCat(false);
    setNewCatForm({ name_zh: '', name_en: '', name_th: '' });
  };

  const openMove = (ids: string[]) => {
    if (ids.length === 0) return;
    // 默认落到「第一个有分类、且与当前不同」的大类——绝大多数情况一眼就是目标
    const currentType = items.find((i) => i.id === ids[0])?.type;
    const preferred =
      MENU_TYPES.find((tp) => tp !== currentType && catsOfType(tp).length > 0) ??
      MENU_TYPES.find((tp) => catsOfType(tp).length > 0) ??
      MENU_TYPES[0];
    setMoveIds(ids);
    setMoveType(preferred);
    setMoveCatId(catsOfType(preferred)[0]?.id ?? '');
    resetNewCat();
  };

  const pickMoveType = (type: MenuType) => {
    setMoveType(type);
    setMoveCatId(catsOfType(type)[0]?.id ?? '');
    resetNewCat();
  };

  const closeMove = () => {
    setMoveIds(null);
    setMoveCatId('');
    resetNewCat();
  };

  /** 在移动面板里现场建分类，建好自动选中，用户直接点「确认移动」 */
  const createMoveCategory = async () => {
    const name_zh = newCatForm.name_zh.trim();
    const name_en = newCatForm.name_en.trim();
    const name_th = newCatForm.name_th.trim();
    if (!name_zh || !name_en || !name_th) return;
    setCreatingCat(true);
    try {
      const created = await createCategory({
        name_zh,
        name_en,
        name_th,
        type: moveType,
      });
      setCategories((prev) => [...prev, { ...created, itemCount: 0 } as Category]);
      setMoveCatId(created.id);
      resetNewCat();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setCreatingCat(false);
    }
  };

  const submitMove = async () => {
    if (!moveIds || !moveCatId) return;
    setMoveSaving(true);
    try {
      await moveMenuItems(moveIds, moveCatId);
      closeMove();
      setSelectedIds([]);
      setSelectMode(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || t('common.error'));
    } finally {
      setMoveSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
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
          {/* 大类页签：美食 / 饮品 / 工具 */}
          <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
            {MENU_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  activeTab === type
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                {t(MENU_TYPE_ADMIN_LABEL_KEY[type])}
              </button>
            ))}
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
                  <span className="min-w-0 truncate text-sm font-medium text-neutral-900">
                    {getLocaleName(cat)}
                    {typeof cat.itemCount === 'number' && (
                      <span className="ml-1.5 text-xs font-normal text-neutral-400">
                        {cat.itemCount}
                      </span>
                    )}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => openMove(idsOfCategory(cat.id))}
                      disabled={idsOfCategory(cat.id).length === 0}
                      title={t('adminMove.moveWholeCat')}
                      aria-label={t('adminMove.moveWholeCat')}
                      className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↗
                    </button>
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
                {!selectMode && (
                  <button
                    onClick={() => setSelectMode(true)}
                    disabled={filteredItems.length === 0}
                    className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
                  >
                    {t('adminMove.selectMode')}
                  </button>
                )}
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

            {selectMode && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2">
                <span className="text-xs font-medium text-primary-700">
                  {t('adminMove.selected', { count: selectedIds.length })}
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      setSelectedIds(
                        selectedIds.length === filteredItems.length
                          ? []
                          : filteredItems.map((i) => i.id),
                      )
                    }
                    className="text-xs font-medium text-primary-700 underline"
                  >
                    {selectedIds.length === filteredItems.length
                      ? t('adminMove.clearAll')
                      : t('adminMove.selectAll')}
                  </button>
                  <button
                    onClick={exitSelectMode}
                    className="text-xs font-medium text-neutral-500 underline"
                  >
                    {t('adminMove.exitSelect')}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {filteredItems.map((item) => {
                const picked = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-lg bg-white p-3 shadow-sm ${
                      !item.isActive ? 'opacity-50' : ''
                    } ${picked ? 'ring-2 ring-primary-500' : ''}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4 shrink-0 accent-primary-700"
                          aria-label={getLocaleName(item)}
                        />
                      )}
                      {item.imageThumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageThumbUrl}
                          alt={getLocaleName(item)}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">
                          {MENU_TYPE_EMOJI[item.type]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">
                          {getLocaleName(item)}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs font-medium text-accent-600">
                            ฿{item.price}
                          </span>
                          {item.popular && (
                            <span className="rounded bg-accent-50 px-1.5 py-0.5 text-xs text-accent-600">
                              ★
                            </span>
                          )}
                          {item.veg && (
                            <span className="rounded bg-success-50 px-1.5 py-0.5 text-xs text-success-600">
                              {t('menu.vegetarian')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {!selectMode && (
                        <button
                          onClick={() => openMove([item.id])}
                          className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                        >
                          ↗ {t('adminMove.action')}
                        </button>
                      )}
                      {!selectMode && (
                        <button
                          onClick={() => setOptionsItem(item)}
                          className="rounded px-2 py-1 text-xs text-accent-600 hover:bg-accent-50"
                        >
                          ⚙ {t('adminOptions.action')}
                        </button>
                      )}
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
                );
              })}
              {filteredItems.length === 0 && (
                <div className="py-10 text-center text-sm text-neutral-400">
                  {t('common.noData')}
                </div>
              )}
            </div>

            {selectMode && (
              <div className="sticky bottom-4 z-20 mt-3 flex items-center gap-2 rounded-xl bg-primary-700 p-2 shadow-lg">
                <span className="flex-1 px-2 text-xs font-medium text-white">
                  {t('adminMove.selected', { count: selectedIds.length })}
                </span>
                <button
                  onClick={() => setShowTemplateApply(true)}
                  disabled={selectedIds.length === 0}
                  className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  ⚙ {t('adminOptions.applyTemplate')}
                </button>
                <button
                  onClick={() => openMove(selectedIds)}
                  disabled={selectedIds.length === 0}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-primary-700 disabled:opacity-50"
                >
                  ↗ {t('adminMove.moveSelected')}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
                {MENU_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(MENU_TYPE_ADMIN_LABEL_KEY[type])}
                  </option>
                ))}
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
              {/* 分类选择：按大类分组列出【全部】分类 —— 允许把菜品挪到另一个大类下 */}
              <select
                value={itemForm.catId}
                onChange={(e) => setItemForm((f) => ({ ...f, catId: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              >
                {MENU_TYPES.map((type) => {
                  const cats = catsOfType(type);
                  return (
                    <optgroup
                      key={type}
                      label={`${MENU_TYPE_EMOJI[type]} ${t(MENU_TYPE_ADMIN_LABEL_KEY[type])}`}
                    >
                      {cats.length === 0 ? (
                        // 空大类也列出来（不可选），否则用户会以为「工具」这个大类根本不存在
                        <option value="" disabled>
                          {t('adminMove.noCatInGroup')}
                        </option>
                      ) : (
                        cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {getLocaleName(c)}
                          </option>
                        ))
                      )}
                    </optgroup>
                  );
                })}
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
                  </>
                )}
              </div>

              {/* Cost & margin / 成本与毛利 —— 任何菜品都能填，用于算毛利 */}
              <div className="space-y-2 border-t border-neutral-100 pt-3">
                <label className="block text-xs font-medium text-neutral-500">
                  {t('adminReports.costAndMargin')}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={t('adminReports.costPricePlaceholder')}
                  value={itemForm.costPrice}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, costPrice: e.target.value }))
                  }
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder={t('adminReports.targetMarginPlaceholder')}
                  value={itemForm.targetMargin}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, targetMargin: e.target.value }))
                  }
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                />
                {(() => {
                  const p = parseFloat(itemForm.price);
                  const c = parseFloat(itemForm.costPrice);
                  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c)) {
                    return (
                      <p className="text-xs text-neutral-400">
                        {t('adminReports.marginPreviewEmpty')}
                      </p>
                    );
                  }
                  const profit = p - c;
                  const rate = profit / p;
                  const target =
                    itemForm.targetMargin === ''
                      ? 0.6
                      : Number(itemForm.targetMargin) / 100;
                  const below = rate < target;
                  return (
                    <div
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                        below
                          ? 'bg-amber-50 text-accent-600'
                          : 'bg-success-50 text-success-700'
                      }`}
                    >
                      <span>
                        {t('adminReports.grossProfit')} ฿
                        {profit.toFixed(2)}
                      </span>
                      <span className="font-bold">
                        {(rate * 100).toFixed(1)}%
                        {below ? ` · ${t('adminReports.belowTarget')}` : ''}
                      </span>
                    </div>
                  );
                })()}
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

      {/* 移动面板（单个 / 批量共用）—— 两段式：先选大类，再选分类 */}
      {moveIds && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4">
          <div className="my-auto max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-neutral-900">
                  {t('adminMove.title')}
                </h3>
                <p className="mt-0.5 truncate text-xs text-neutral-400">
                  {t('adminMove.selected', { count: moveIds.length })}
                  {moveIds.length === 1 &&
                    (() => {
                      const it = items.find((i) => i.id === moveIds[0]);
                      return it ? <> · {getLocaleName(it)}</> : null;
                    })()}
                </p>
              </div>
              <button
                onClick={closeMove}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 第一步：大类 */}
            <p className="mb-1.5 text-xs font-medium text-neutral-500">
              {t('adminMove.bigType')}
            </p>
            {/* 三个大类永远可点：哪怕该大类下还没有分类，也能就地建一个 */}
            <div className="mb-4 flex rounded-xl bg-neutral-100 p-1">
              {MENU_TYPES.map((type) => {
                const count = catsOfType(type).length;
                return (
                  <button
                    key={type}
                    onClick={() => pickMoveType(type)}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                      moveType === type
                        ? 'bg-white text-primary-700 shadow-sm'
                        : count === 0
                          ? 'text-neutral-400'
                          : 'text-neutral-500'
                    }`}
                  >
                    {MENU_TYPE_EMOJI[type]} {t(MENU_TYPE_ADMIN_LABEL_KEY[type])}
                    {count === 0 && <span className="ml-1 text-[10px]">＋</span>}
                  </button>
                );
              })}
            </div>

            {/* 第二步：分类 */}
            <p className="mb-1.5 text-xs font-medium text-neutral-500">
              {t('adminMove.chooseTarget')}
            </p>
            {catsOfType(moveType).length > 0 && (
              <div className="space-y-2">
                {catsOfType(moveType).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setMoveCatId(c.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                      moveCatId === c.id
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 text-neutral-700'
                    }`}
                  >
                    <span className="truncate">{getLocaleName(c)}</span>
                    {moveCatId === c.id && (
                      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
            {catsOfType(moveType).length === 0 && !showNewCat && (
              <p className="rounded-xl bg-neutral-50 px-3 py-3 text-xs text-neutral-400">
                {t('adminMove.noTarget')}
              </p>
            )}

            {/* 空大类就地新建分类，避免「选不到工具类」这种死胡同 */}
            {!showNewCat ? (
              <button
                onClick={() => setShowNewCat(true)}
                className="mt-2 w-full rounded-xl border border-dashed border-neutral-300 py-2.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
              >
                + {t('adminMove.createCategory')}
              </button>
            ) : (
              <div className="mt-2 space-y-2 rounded-xl bg-neutral-50 p-3">
                <p className="text-xs text-neutral-500">{t('adminMove.createCatHint')}</p>
                <input
                  autoFocus
                  placeholder={t('admin.nameZhPlaceholder')}
                  value={newCatForm.name_zh}
                  onChange={(e) => setNewCatForm((f) => ({ ...f, name_zh: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder={t('admin.nameEnPlaceholder')}
                  value={newCatForm.name_en}
                  onChange={(e) => setNewCatForm((f) => ({ ...f, name_en: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                />
                <input
                  placeholder={t('admin.nameThPlaceholder')}
                  value={newCatForm.name_th}
                  onChange={(e) => setNewCatForm((f) => ({ ...f, name_th: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={resetNewCat}
                    className="flex-1 rounded-xl border border-neutral-200 py-2 text-xs font-medium text-neutral-600"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={createMoveCategory}
                    disabled={
                      creatingCat ||
                      !newCatForm.name_zh.trim() ||
                      !newCatForm.name_en.trim() ||
                      !newCatForm.name_th.trim()
                    }
                    className="flex-1 rounded-xl bg-primary-700 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {creatingCat ? t('common.saving') : t('adminMove.createCatSubmit')}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={closeMove}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitMove}
                disabled={moveSaving || !moveCatId}
                className="flex-1 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {moveSaving ? t('adminMove.moving') : t('adminMove.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 规格选项编辑器（单个菜品） */}
      <ItemOptionsEditor
        open={!!optionsItem}
        itemId={optionsItem?.id ?? null}
        itemName={optionsItem ? getLocaleName(optionsItem) : ''}
        onClose={() => setOptionsItem(null)}
        onSaved={() => loadData()}
      />

      {/* 批量套用选项模板 */}
      <ApplyTemplateModal
        open={showTemplateApply}
        itemIds={selectedIds}
        onClose={() => setShowTemplateApply(false)}
        onDone={() => loadData()}
      />
    </>
  );
}
