'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

type MenuType = 'FOOD' | 'DRINK';
type TabType = MenuType;

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
  description_zh?: string;
  description_en?: string;
  description_th?: string;
  price: number;
  spice: number;
  popular: boolean;
  veg: boolean;
  type: MenuType;
}

const categories: Category[] = [
  { id: 'thai', name_zh: '泰式料理', name_en: 'Thai Food', name_th: 'อาหารไทย', type: 'FOOD' },
  { id: 'seafood', name_zh: '海鲜', name_en: 'Seafood', name_th: 'อาหารทะเล', type: 'FOOD' },
  { id: 'grill', name_zh: '烧烤', name_en: 'Grilled', name_th: 'ปิ้งย่าง', type: 'FOOD' },
  { id: 'soup', name_zh: '汤类', name_en: 'Soups', name_th: 'ซุป', type: 'FOOD' },
  { id: 'sides', name_zh: '小食', name_en: 'Sides', name_th: 'ของทานเล่น', type: 'FOOD' },
  { id: 'cold', name_zh: '冷饮', name_en: 'Cold Drinks', name_th: 'เครื่องดื่มเย็น', type: 'DRINK' },
  { id: 'hot', name_zh: '热饮', name_en: 'Hot Drinks', name_th: 'เครื่องดื่มร้อน', type: 'DRINK' },
  { id: 'alcohol', name_zh: '酒类', name_en: 'Alcoholic', name_th: 'เครื่องดื่มแอลกอฮอล์', type: 'DRINK' },
  { id: 'juice', name_zh: '鲜榨果汁', name_en: 'Fresh Juice', name_th: 'น้ำผลไม้สด', type: 'DRINK' },
];

const menuItems: MenuItem[] = [
  // Food items
  { id: '1', catId: 'thai', name_zh: '冬阴功汤', name_en: 'Tom Yum Goong', name_th: 'ต้มยำกุ้ง', description_zh: '酸辣鲜虾汤', description_en: 'Spicy sour shrimp soup', description_th: 'ซุปกุ้งเผ็ดเปรี้ยว', price: 180, spice: 2, popular: true, veg: false, type: 'FOOD' },
  { id: '2', catId: 'thai', name_zh: '绿咖喱鸡', name_en: 'Green Curry Chicken', name_th: 'แกงเขียวหวานไก่', price: 150, spice: 2, popular: true, veg: false, type: 'FOOD' },
  { id: '3', catId: 'thai', name_zh: '泰式炒河粉', name_en: 'Pad Thai', name_th: 'ผัดไทย', price: 120, spice: 1, popular: true, veg: false, type: 'FOOD' },
  { id: '4', catId: 'thai', name_zh: '芒果糯米饭', name_en: 'Mango Sticky Rice', name_th: 'ข้าวเหนียวมะม่วง', price: 100, spice: 0, popular: false, veg: true, type: 'FOOD' },
  { id: '5', catId: 'seafood', name_zh: '清蒸鲈鱼', name_en: 'Steamed Sea Bass', name_th: 'ปลากะพงนึ่งมะนาว', price: 350, spice: 1, popular: true, veg: false, type: 'FOOD' },
  { id: '6', catId: 'seafood', name_zh: '蒜蓉虾', name_en: 'Garlic Prawns', name_th: 'กุ้งกระเทียม', price: 280, spice: 0, popular: false, veg: false, type: 'FOOD' },
  { id: '7', catId: 'seafood', name_zh: '辣炒蛤蜊', name_en: 'Spicy Clams', name_th: 'หอยลายผัดพริกเผา', price: 200, spice: 3, popular: false, veg: false, type: 'FOOD' },
  { id: '8', catId: 'grill', name_zh: '烤鸡翅', name_en: 'Grilled Chicken Wings', name_th: 'ปีกไก่ย่าง', price: 120, spice: 1, popular: true, veg: false, type: 'FOOD' },
  { id: '9', catId: 'grill', name_zh: '烤猪颈肉', name_en: 'Grilled Pork Neck', name_th: 'คอหมูย่าง', price: 160, spice: 0, popular: false, veg: false, type: 'FOOD' },
  { id: '10', catId: 'grill', name_zh: '烤鱼', name_en: 'Grilled Fish', name_th: 'ปลาเผา', price: 250, spice: 1, popular: true, veg: false, type: 'FOOD' },
  { id: '11', catId: 'soup', name_zh: '酸辣鱼汤', name_en: 'Sour Fish Soup', name_th: 'แกงส้มปลา', price: 180, spice: 2, popular: false, veg: false, type: 'FOOD' },
  { id: '12', catId: 'soup', name_zh: '鸡汤', name_en: 'Chicken Soup', name_th: 'ต้มจืดไก่', price: 120, spice: 0, popular: false, veg: false, type: 'FOOD' },
  { id: '13', catId: 'sides', name_zh: '青木瓜沙拉', name_en: 'Papaya Salad', name_th: 'ส้มตำ', price: 80, spice: 3, popular: true, veg: true, type: 'FOOD' },
  { id: '14', catId: 'sides', name_zh: '炸春卷', name_en: 'Spring Rolls', name_th: 'ปอเปี๊ยะทอด', price: 80, spice: 0, popular: false, veg: true, type: 'FOOD' },
  { id: '15', catId: 'sides', name_zh: '白米饭', name_en: 'Steamed Rice', name_th: 'ข้าวสวย', price: 20, spice: 0, popular: false, veg: true, type: 'FOOD' },
  // Drink items
  { id: 'd1', catId: 'cold', name_zh: '泰式奶茶', name_en: 'Thai Iced Tea', name_th: 'ชาเย็น', price: 50, spice: 0, popular: true, veg: true, type: 'DRINK' },
  { id: 'd2', catId: 'cold', name_zh: '冰咖啡', name_en: 'Iced Coffee', name_th: 'กาแฟเย็น', price: 60, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd3', catId: 'cold', name_zh: '可乐', name_en: 'Cola', name_th: 'โคล่า', price: 30, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd4', catId: 'cold', name_zh: '矿泉水', name_en: 'Water', name_th: 'น้ำเปล่า', price: 15, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd5', catId: 'hot', name_zh: '热咖啡', name_en: 'Hot Coffee', name_th: 'กาแฟร้อน', price: 50, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd6', catId: 'hot', name_zh: '热茶', name_en: 'Hot Tea', name_th: 'ชาร้อน', price: 40, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd7', catId: 'alcohol', name_zh: 'Chang啤酒', name_en: 'Chang Beer', name_th: 'เบียร์ช้าง', price: 80, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd8', catId: 'juice', name_zh: '西瓜汁', name_en: 'Watermelon Juice', name_th: 'น้ำแตงโม', price: 60, spice: 0, popular: false, veg: true, type: 'DRINK' },
  { id: 'd9', catId: 'juice', name_zh: '芒果冰沙', name_en: 'Mango Smoothie', name_th: 'มะม่วงปั่น', price: 70, spice: 0, popular: true, veg: true, type: 'DRINK' },
];

const foodEmojis: Record<string, string> = {
  thai: '🍛',
  seafood: '🐟',
  grill: '🔥',
  soup: '🍲',
  sides: '🥗',
  cold: '🧊',
  hot: '☕',
  alcohol: '🍺',
  juice: '🥤',
};

export default function MenuPage() {
  const t = useTranslations();
  const locale = useLocale();

  const [activeTab, setActiveTab] = useState<TabType>('FOOD');
  const [activeCat, setActiveCat] = useState<string>('popular');
  const [cart, setCart] = useState<Record<string, number>>({});

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const getLocaleDesc = (item: { description_zh?: string; description_en?: string; description_th?: string }) => {
    if (locale === 'en') return item.description_en;
    if (locale === 'th') return item.description_th;
    return item.description_zh;
  };

  const filteredCategories = categories.filter((c) => c.type === activeTab);
  const allItems = menuItems.filter((i) => i.type === activeTab);

  const filteredItems =
    activeCat === 'popular'
      ? allItems.filter((i) => i.popular)
      : allItems.filter((i) => i.catId === activeCat);

  const popularItemsForTab = allItems.filter((i) => i.popular);

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[id] > 1) {
        next[id] = next[id] - 1;
      } else {
        delete next[id];
      }
      return next;
    });
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const spiceDots = (level: number) =>
    level > 0
      ? Array.from({ length: level }).map((_, i) => (
          <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-error-500" />
        ))
      : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="px-4 pt-6">
        <h2 className="text-2xl font-bold text-neutral-900">{t('menu.title')}</h2>
      </div>

      {/* Food/Drink Tab Bar */}
      <div className="sticky top-14 z-40 bg-bg-page/95 px-4 pt-3 backdrop-blur-md">
        <div className="flex rounded-xl bg-neutral-100 p-1">
          <button
            onClick={() => {
              setActiveTab('FOOD');
              setActiveCat('popular');
            }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'FOOD'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            🍽️ {t('menu.food')}
          </button>
          <button
            onClick={() => {
              setActiveTab('DRINK');
              setActiveCat('popular');
            }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'DRINK'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            🥤 {t('menu.drinks')}
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto py-3">
          {popularItemsForTab.length > 0 && (
            <button
              onClick={() => setActiveCat('popular')}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeCat === 'popular'
                  ? 'bg-accent-500 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              ★ {t('menu.popular')}
            </button>
          )}
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeCat === cat.id
                  ? 'bg-primary-700 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              {getLocaleName(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 pb-8">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <svg className="mb-3 h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm">{t('menu.noResults')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-md transition hover:shadow-lg"
              >
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-neutral-50 text-3xl">
                  {foodEmojis[item.catId] || '🍽️'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">
                        {getLocaleName(item)}
                      </h3>
                      {getLocaleDesc(item) && (
                        <p className="mt-0.5 text-xs text-neutral-400 line-clamp-1">
                          {getLocaleDesc(item)}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                        {item.spice > 0 && (
                          <span className="flex items-center gap-0.5" title={`${t('menu.spicy')}: ${item.spice}/3`}>
                            {spiceDots(item.spice)}
                          </span>
                        )}
                        {item.veg && (
                          <span className="rounded bg-success-50 px-1.5 py-0.5 text-success-600">
                            {t('menu.vegetarian')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-accent-600">฿{item.price}</span>
                    {cart[item.id] ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
                        >
                          −
                        </button>
                        <span className="min-w-[16px] text-center text-xs font-semibold">
                          {cart[item.id]}
                        </span>
                        <button
                          onClick={() => addToCart(item.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-sm font-medium text-white hover:bg-accent-600"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item.id)}
                        className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-600"
                      >
                        {t('menu.addToCart')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-20 right-4 z-50">
          <Link
            href="/cart"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-cta transition hover:bg-accent-600 active:scale-95"
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
