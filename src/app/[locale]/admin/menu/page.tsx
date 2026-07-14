'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';

interface Category {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  type: 'FOOD' | 'DRINK';
  itemCount: number;
}

interface Item {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  price: number;
  categoryType: 'FOOD' | 'DRINK';
  isPopular: boolean;
  isVegetarian: boolean;
}

const demoCategories: Category[] = [
  { id: '1', name_zh: '泰式主食', name_en: 'Thai Main', name_th: 'อาหารไทยหลัก', type: 'FOOD', itemCount: 8 },
  { id: '2', name_zh: '烧烤', name_en: 'BBQ', name_th: 'บาร์บีคิว', type: 'FOOD', itemCount: 5 },
  { id: '3', name_zh: '小吃', name_en: 'Snacks', name_th: 'อาหารว่าง', type: 'FOOD', itemCount: 6 },
  { id: '4', name_zh: '啤酒', name_en: 'Beer', name_th: 'เบียร์', type: 'DRINK', itemCount: 4 },
  { id: '5', name_zh: '饮品', name_en: 'Drinks', name_th: 'เครื่องดื่ม', type: 'DRINK', itemCount: 5 },
];

const demoItems: Item[] = [
  { id: '1', name_zh: '冬阴功汤', name_en: 'Tom Yum Goong', name_th: 'ต้มยำกุ้ง', price: 180, categoryType: 'FOOD', isPopular: true, isVegetarian: false },
  { id: '2', name_zh: '泰式炒河粉', name_en: 'Pad Thai', name_th: 'ผัดไทย', price: 150, categoryType: 'FOOD', isPopular: true, isVegetarian: false },
  { id: '3', name_zh: '芒果糯米饭', name_en: 'Mango Sticky Rice', name_th: 'ข้าวเหนียวมะม่วง', price: 120, categoryType: 'FOOD', isPopular: false, isVegetarian: true },
  { id: '4', name_zh: '泰式奶茶', name_en: 'Thai Iced Tea', name_th: 'ชาเย็น', price: 50, categoryType: 'DRINK', isPopular: true, isVegetarian: true },
  { id: '5', name_zh: 'Singha啤酒', name_en: 'Singha Beer', name_th: 'เบียร์สิงห์', price: 80, categoryType: 'DRINK', isPopular: false, isVegetarian: false },
];

export default function AdminMenuPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [showAddForm, setShowAddForm] = useState(false);

  const getLocalName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">{t('admin.menu')}</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600"
        >
          {t('admin.addItem')}
        </button>
      </div>

      {/* Categories */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">{t('menu.categories')}</h3>
        <div className="space-y-2">
          {demoCategories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between rounded-lg bg-bg-page px-3 py-2">
              <div className="flex items-center gap-3">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  cat.type === 'FOOD' ? 'bg-accent-50 text-accent-700' : 'bg-primary-50 text-primary-700'
                }`}>
                  {cat.type === 'FOOD' ? t('admin.foodType') : t('admin.drinkType')}
                </span>
                <span className="text-sm font-medium text-neutral-900">{getLocalName(cat)}</span>
              </div>
              <span className="text-xs text-neutral-500">{cat.itemCount} items</span>
            </div>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl bg-white p-4 shadow-md">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">Items</h3>
        <div className="space-y-2">
          {demoItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-bg-page px-3 py-2">
              <div className="flex items-center gap-2">
                {item.isPopular && (
                  <span className="inline-block rounded-full bg-accent-50 px-1.5 py-0.5 text-xs font-semibold text-accent-700">
                    {t('menu.popular')}
                  </span>
                )}
                {item.isVegetarian && (
                  <span className="inline-block rounded-full bg-success-50 px-1.5 py-0.5 text-xs font-semibold text-success-700">
                    {t('menu.vegetarian')}
                  </span>
                )}
                <span className="text-sm font-medium text-neutral-900">{getLocalName(item)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">฿{item.price}</span>
                <button className="text-xs text-neutral-500 hover:text-error-600">{t('admin.editItem')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-neutral-900">{t('admin.addItem')}</h3>
            <div className="space-y-3">
              <input placeholder={t('admin.itemName')} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none" />
              <input placeholder={t('admin.itemPrice')} type="number" className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none" />
              <input placeholder={t('admin.itemDescription')} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none" />
              <button className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50">
                {t('admin.uploadImage')}
              </button>
              <div className="flex gap-2">
                <button className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50">
                  {t('admin.isPopular')}
                </button>
                <button className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50">
                  {t('admin.isVegetarian')}
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white"
              >
                {t('common.save')}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
