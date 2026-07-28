'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

type MenuType = 'FOOD' | 'DRINK';

interface Category {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  type: MenuType;
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
}

const initialCategories: Category[] = [
  { id: 'thai', name_zh: '泰式料理', name_en: 'Thai Food', name_th: 'อาหารไทย', type: 'FOOD' },
  { id: 'seafood', name_zh: '海鲜', name_en: 'Seafood', name_th: 'อาหารทะเล', type: 'FOOD' },
  { id: 'grill', name_zh: '烧烤', name_en: 'Grilled', name_th: 'ปิ้งย่าง', type: 'FOOD' },
  { id: 'soup', name_zh: '汤类', name_en: 'Soups', name_th: 'ซุป', type: 'FOOD' },
  { id: 'cold', name_zh: '冷饮', name_en: 'Cold Drinks', name_th: 'เครื่องดื่มเย็น', type: 'DRINK' },
  { id: 'hot', name_zh: '热饮', name_en: 'Hot Drinks', name_th: 'เครื่องดื่มร้อน', type: 'DRINK' },
];

const initialItems: MenuItem[] = [
  { id: '1', catId: 'thai', name_zh: '冬阴功汤', name_en: 'Tom Yum Goong', name_th: 'ต้มยำกุ้ง', price: 180, popular: true, veg: false, spice: 2, type: 'FOOD' },
  { id: '2', catId: 'thai', name_zh: '绿咖喱鸡', name_en: 'Green Curry Chicken', name_th: 'แกงเขียวหวานไก่', price: 150, popular: true, veg: false, spice: 2, type: 'FOOD' },
  { id: '3', catId: 'seafood', name_zh: '清蒸鲈鱼', name_en: 'Steamed Sea Bass', name_th: 'ปลากะพงนึ่งมะนาว', price: 350, popular: true, veg: false, spice: 1, type: 'FOOD' },
];

export default function AdminMenuPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [activeTab, setActiveTab] = useState<MenuType>('FOOD');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);

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

  const saveCategory = () => {
    if (editingCategory) {
      setCategories((prev) =>
        prev.map((c) => (c.id === editingCategory.id ? { ...editingCategory, ...catForm } : c))
      );
    } else {
      const newCat: Category = {
        id: Date.now().toString(),
        ...catForm,
      };
      setCategories((prev) => [...prev, newCat]);
    }
    setShowCategoryForm(false);
  };

  const deleteCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setItems((prev) => prev.filter((i) => i.catId !== id));
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
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
  });

  const openItemForm = (item?: MenuItem) => {
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
      });
    }
    setShowItemForm(true);
  };

  const saveItem = () => {
    const price = parseFloat(itemForm.price) || 0;
    if (editingItem) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? { ...editingItem, ...itemForm, price, type: activeTab }
            : i
        )
      );
    } else {
      const newItem: MenuItem = {
        id: Date.now().toString(),
        ...itemForm,
        price,
        type: activeTab,
      };
      setItems((prev) => [...prev, newItem]);
    }
    setShowItemForm(false);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">{t('admin.menu')}</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H3m0 0l4-4m-4 4l4 4m12-4a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('admin.viewSite')}
          </Link>
          <Link
            href="/admin"
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {t('common.back')}
          </Link>
        </div>
      </div>

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
                  onClick={() => deleteCategory(cat.id)}
                  className="rounded px-2 py-1 text-xs text-error-600 hover:bg-error-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-neutral-900">{t('admin.menu')}</h3>
          <button
            onClick={() => openItemForm()}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white"
          >
            + {t('admin.addItem')}
          </button>
        </div>
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
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
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openItemForm(item)}
                  className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
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
                className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white"
              >
                {t('common.save')}
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
                <div className="rounded-lg border-2 border-dashed border-neutral-200 p-4 text-center">
                  <p className="text-xs text-neutral-400">{t('admin.uploadImage')}</p>
                  <p className="mt-1 text-xs text-neutral-300">{t('admin.imageUploadHint')}</p>
                </div>
              </div>
              <button
                onClick={saveItem}
                className="w-full rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
