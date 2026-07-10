'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

// Demo menu data
const categories = [
  { id: 'thai', name_zh: '泰式料理', name_en: 'Thai Food', name_th: 'อาหารไทย' },
  { id: 'seafood', name_zh: '海鲜', name_en: 'Seafood', name_th: 'อาหารทะเล' },
  { id: 'grill', name_zh: '烧烤', name_en: 'Grilled', name_th: 'ปิ้งย่าง' },
  { id: 'soup', name_zh: '汤类', name_en: 'Soups', name_th: 'ซุป' },
  { id: 'sides', name_zh: '小食', name_en: 'Sides', name_th: 'ของทานเล่น' },
];

const menuItems = [
  { id: '1', catId: 'thai', name_zh: '冬阴功汤', name_en: 'Tom Yum Goong', name_th: 'ต้มยำกุ้ง', price: 180, spice: 2, popular: true, veg: false },
  { id: '2', catId: 'thai', name_zh: '绿咖喱鸡', name_en: 'Green Curry Chicken', name_th: 'แกงเขียวหวานไก่', price: 150, spice: 2, popular: true, veg: false },
  { id: '3', catId: 'thai', name_zh: '泰式炒河粉', name_en: 'Pad Thai', name_th: 'ผัดไทย', price: 120, spice: 1, popular: true, veg: false },
  { id: '4', catId: 'thai', name_zh: '芒果糯米饭', name_en: 'Mango Sticky Rice', name_th: 'ข้าวเหนียวมะม่วง', price: 100, spice: 0, popular: false, veg: true },
  { id: '5', catId: 'seafood', name_zh: '清蒸鲈鱼', name_en: 'Steamed Sea Bass', name_th: 'ปลากะพงนึ่งมะนาว', price: 350, spice: 1, popular: true, veg: false },
  { id: '6', catId: 'seafood', name_zh: '蒜蓉虾', name_en: 'Garlic Prawns', name_th: 'กุ้งกระเทียม', price: 280, spice: 0, popular: false, veg: false },
  { id: '7', catId: 'seafood', name_zh: '辣炒蛤蜊', name_en: 'Spicy Clams', name_th: 'หอยลายผัดพริกเผา', price: 200, spice: 3, popular: false, veg: false },
  { id: '8', catId: 'grill', name_zh: '烤鸡翅', name_en: 'Grilled Chicken Wings', name_th: 'ปีกไก่ย่าง', price: 120, spice: 1, popular: true, veg: false },
  { id: '9', catId: 'grill', name_zh: '烤猪颈肉', name_en: 'Grilled Pork Neck', name_th: 'คอหมูย่าง', price: 160, spice: 0, popular: false, veg: false },
  { id: '10', catId: 'grill', name_zh: '烤鱼', name_en: 'Grilled Fish', name_th: 'ปลาเผา', price: 250, spice: 1, popular: true, veg: false },
  { id: '11', catId: 'soup', name_zh: '酸辣鱼汤', name_en: 'Sour Fish Soup', name_th: 'แกงส้มปลา', price: 180, spice: 2, popular: false, veg: false },
  { id: '12', catId: 'soup', name_zh: '鸡汤', name_en: 'Chicken Soup', name_th: 'ต้มจืดไก่', price: 120, spice: 0, popular: false, veg: false },
  { id: '13', catId: 'sides', name_zh: '青木瓜沙拉', name_en: 'Papaya Salad', name_th: 'ส้มตำ', price: 80, spice: 3, popular: true, veg: true },
  { id: '14', catId: 'sides', name_zh: '炸春卷', name_en: 'Spring Rolls', name_th: 'ปอเปี๊ยะทอด', price: 80, spice: 0, popular: false, veg: true },
  { id: '15', catId: 'sides', name_zh: '白米饭', name_en: 'Steamed Rice', name_th: 'ข้าวสวย', price: 20, spice: 0, popular: false, veg: true },
];

export default function MenuPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [activeCat, setActiveCat] = useState('thai');
  const [cart, setCart] = useState<Record<string, number>>({});

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const filtered = menuItems.filter((item) => item.catId === activeCat);
  const popularItems = menuItems.filter((item) => item.popular);

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const spiceDots = (level: number) =>
    level > 0 ? Array.from({ length: level }).map((_, i) => (
      <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-error-500" />
    )) : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="px-4 pt-6">
        <h2 className="text-2xl font-bold text-neutral-900">{t('menu.title')}</h2>
      </div>

      {/* Category Tabs */}
      <div className="sticky top-14 z-40 bg-bg-page/95 px-4 py-3 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCat('popular')}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              activeCat === 'popular'
                ? 'bg-accent-500 text-white'
                : 'bg-white text-neutral-600 border border-neutral-200'
            }`}
          >
            ★ {t('menu.popular')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeCat === cat.id
                  ? 'bg-primary-700 text-white'
                  : 'bg-white text-neutral-600 border border-neutral-200'
              }`}
            >
              {getLocaleName(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 pb-8">
        <div className="space-y-3">
          {(activeCat === 'popular' ? popularItems : filtered).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-md"
            >
              {/* Placeholder image */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-3xl">
                {item.catId === 'seafood' ? '🐟' : item.catId === 'grill' ? '🔥' : item.catId === 'soup' ? '🍲' : item.catId === 'sides' ? '🥗' : '🍛'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">{getLocaleName(item)}</h3>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      {item.spice > 0 && <span className="flex items-center gap-0.5">{spiceDots(item.spice)}</span>}
                      {item.veg && (
                        <span className="rounded bg-success-50 px-1.5 py-0.5 text-success-600">
                          {t('menu.vegetarian')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-600">฿{item.price}</span>
                  <button
                    onClick={() => addToCart(item.id)}
                    className="rounded-lg bg-accent-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-600"
                  >
                    {cart[item.id]
                      ? `${t('menu.addToCart')} (${cart[item.id]})`
                      : t('menu.addToCart')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-20 right-4 z-50">
          <Link
            href="/cart"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-cta transition hover:bg-accent-600"
            style={{ animation: 'bounce-cart 0.4s ease' }}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error-500 text-xs font-bold text-white">
              {cartCount}
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
