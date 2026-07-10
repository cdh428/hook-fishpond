'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

const drinkCategories = [
  { id: 'cold', name_zh: '冷饮', name_en: 'Cold Drinks', name_th: 'เครื่องดื่มเย็น' },
  { id: 'hot', name_zh: '热饮', name_en: 'Hot Drinks', name_th: 'เครื่องดื่มร้อน' },
  { id: 'alcohol', name_zh: '酒类', name_en: 'Alcoholic', name_th: 'เครื่องดื่มแอลกอฮอล์' },
  { id: 'juice', name_zh: '鲜榨果汁', name_en: 'Fresh Juice', name_th: 'น้ำผลไม้สด' },
];

const drinks = [
  { id: 'd1', catId: 'cold', name_zh: '泰式奶茶', name_en: 'Thai Iced Tea', name_th: 'ชาเย็น', price: 50, emoji: '🧋' },
  { id: 'd2', catId: 'cold', name_zh: '冰咖啡', name_en: 'Iced Coffee', name_th: 'กาแฟเย็น', price: 60, emoji: '☕' },
  { id: 'd3', catId: 'cold', name_zh: '可乐', name_en: 'Cola', name_th: 'โคล่า', price: 30, emoji: '🥤' },
  { id: 'd4', catId: 'cold', name_zh: '矿泉水', name_en: 'Water', name_th: 'น้ำเปล่า', price: 15, emoji: '💧' },
  { id: 'd5', catId: 'cold', name_zh: '雪碧', name_en: 'Sprite', name_th: 'สไปรท์', price: 30, emoji: '🥤' },
  { id: 'd6', catId: 'hot', name_zh: '热咖啡', name_en: 'Hot Coffee', name_th: 'กาแฟร้อน', price: 50, emoji: '☕' },
  { id: 'd7', catId: 'hot', name_zh: '热茶', name_en: 'Hot Tea', name_th: 'ชาร้อน', price: 40, emoji: '🍵' },
  { id: 'd8', catId: 'alcohol', name_zh: 'Chang啤酒', name_en: 'Chang Beer', name_th: 'เบียร์ช้าง', price: 80, emoji: '🍺' },
  { id: 'd9', catId: 'alcohol', name_zh: 'Singha啤酒', name_en: 'Singha Beer', name_th: 'เบียร์สิงห์', price: 80, emoji: '🍺' },
  { id: 'd10', catId: 'alcohol', name_zh: 'Leo啤酒', name_en: 'Leo Beer', name_th: 'เบียร์ลีโอ', price: 70, emoji: '🍺' },
  { id: 'd11', catId: 'juice', name_zh: '西瓜汁', name_en: 'Watermelon Juice', name_th: 'น้ำแตงโม', price: 60, emoji: '🍉' },
  { id: 'd12', catId: 'juice', name_zh: '芒果冰沙', name_en: 'Mango Smoothie', name_th: 'มะม่วงปั่น', price: 70, emoji: '🥭' },
  { id: 'd13', catId: 'juice', name_zh: '椰子水', name_en: 'Coconut Water', name_th: 'น้ำมะพร้าว', price: 50, emoji: '🥥' },
];

export default function DrinksPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [activeCat, setActiveCat] = useState('cold');
  const [cart, setCart] = useState<Record<string, number>>({});

  const getLocaleName = (item: { name_zh: string; name_en: string; name_th: string }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const filtered = drinks.filter((d) => d.catId === activeCat);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const newCart = { ...prev };
      if (newCart[id] > 1) {
        newCart[id] = newCart[id] - 1;
      } else {
        delete newCart[id];
      }
      return newCart;
    });
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="px-4 pt-6">
        <h2 className="text-2xl font-bold text-neutral-900">{t('drinks.title')}</h2>
      </div>

      {/* Category Tabs */}
      <div className="sticky top-14 z-40 bg-bg-page/95 px-4 py-3 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {drinkCategories.map((cat) => (
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

      {/* Drinks Grid */}
      <div className="px-4 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((drink) => (
            <div
              key={drink.id}
              className="rounded-xl bg-white p-3 shadow-md"
            >
              <div className="mb-2 flex h-16 items-center justify-center text-4xl">
                {drink.emoji}
              </div>
              <h3 className="text-center text-sm font-semibold text-neutral-900">
                {getLocaleName(drink)}
              </h3>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-accent-600">฿{drink.price}</span>
                {cart[drink.id] ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => removeFromCart(drink.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
                    >
                      −
                    </button>
                    <span className="min-w-[16px] text-center text-xs font-semibold">{cart[drink.id]}</span>
                    <button
                      onClick={() => addToCart(drink.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-sm font-medium text-white hover:bg-accent-600"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addToCart(drink.id)}
                    className="rounded-lg bg-accent-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-600"
                  >
                    +
                  </button>
                )}
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
