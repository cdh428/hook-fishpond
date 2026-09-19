'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchCategories,
  fetchMenuItems,
  getTableByCode,
  ApiCategory,
  ApiMenuItem,
  ApiTable,
  MenuType,
} from '@/lib/api-client';
import { useApp } from '@/contexts/AppContext';
import TablePicker from '@/components/TablePicker';
import {
  getStoredTableCode,
  setStoredTableCode,
  clearStoredTable,
} from '@/lib/table-storage';

type TabType = MenuType;

// Stock info returned by the public menu API (optional — legacy items may
// omit it). `remaining` is only populated when the real remaining is ≤ 10,
// otherwise it is `null` (meaning "don't show a number").
type StockInfo = {
  soldOut: boolean;
  remaining: number | null;
  stockType: 'NONE' | 'MADE' | 'PURCHASED';
};
type MenuItemWithStock = ApiMenuItem & { stock?: StockInfo };

// Emoji keyed by category id (matches seed: cat-rice, cat-grill, cat-snack,
// cat-drink, cat-beer). Falls back to a generic icon for unknown ids.
const foodEmojis: Record<string, string> = {
  'cat-rice': '🍛',
  'cat-grill': '🔥',
  'cat-snack': '🥗',
  'cat-drink': '🥤',
  'cat-beer': '🍺',
};

export default function MenuPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { foodCart, addFood, setFoodQuantity, cartCount } = useApp();

  const [activeTab, setActiveTab] = useState<TabType>('FOOD');
  const [activeCat, setActiveCat] = useState<string>('popular');

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string } | null>(null);

  // Dining table context (scanned QR or manually picked; persists for today)
  const [table, setTable] = useState<ApiTable | null>(null);
  const [tableCode, setTableCode] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Resolve the table: the URL param (QR scan) wins, otherwise today's pick.
  useEffect(() => {
    let cancelled = false;

    const applyCode = (raw: string | null | undefined) => {
      if (!raw) return;
      const code = raw.toUpperCase().trim();
      if (!/^[A-Z0-9]{1,8}$/.test(code)) return;
      setTableCode(code);
      setStoredTableCode(code);
      getTableByCode(code)
        .then((t) => {
          if (!cancelled) setTable(t);
        })
        .catch(() => {
          // Invalid code — ignore, treat as walk-in order
        });
    };

    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('table');

    if (fromUrl) {
      applyCode(fromUrl);
    } else {
      applyCode(getStoredTableCode());
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const clearTable = () => {
    setTable(null);
    setTableCode(null);
    clearStoredTable();
  };

  const selectTable = (code: string) => {
    setTableCode(code);
    setStoredTableCode(code);
    setShowPicker(false);
    getTableByCode(code)
      .then((t) => setTable(t))
      .catch(() => setTable(null));
  };

  // Load all categories + items once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [cats, items] = await Promise.all([
          fetchCategories(),
          fetchMenuItems(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setMenuItems(items as MenuItemWithStock[]);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load menu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getLocaleName = (item: {
    name_zh: string;
    name_en: string;
    name_th: string;
  }) => {
    if (locale === 'en') return item.name_en;
    if (locale === 'th') return item.name_th;
    return item.name_zh;
  };

  const getLocaleDesc = (item: {
    description_zh?: string;
    description_en?: string;
    description_th?: string;
  }) => {
    if (locale === 'en') return item.description_en;
    if (locale === 'th') return item.description_th;
    return item.description_zh;
  };

  // Quantity lookup from shared cart
  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of foodCart) map[f.id] = f.quantity;
    return map;
  }, [foodCart]);

  const filteredCategories = categories.filter((c) => c.type === activeTab);
  const allItems = menuItems.filter((i) => i.type === activeTab);

  const filteredItems =
    activeCat === 'popular'
      ? allItems.filter((i) => i.popular)
      : allItems.filter((i) => i.catId === activeCat);

  const popularItemsForTab = allItems.filter((i) => i.popular);

  const handleAdd = (item: MenuItemWithStock) => {
    // Defensive: never add a sold-out item.
    if (item.stock?.soldOut) return;
    // Cap quantity at the remaining count when it is known (≤10).
    const remaining = item.stock?.remaining;
    const current = cartQtyMap[item.id] || 0;
    if (remaining != null && current >= remaining) return;
    addFood({
      id: item.id,
      name_zh: item.name_zh,
      name_en: item.name_en,
      name_th: item.name_th,
      price: item.price,
    });
  };

  const handleDecrement = (item: MenuItemWithStock) => {
    const current = cartQtyMap[item.id] || 0;
    setFoodQuantity(item.id, current - 1);
  };

  const spiceDots = (level: number) =>
    level > 0
      ? Array.from({ length: level }).map((_, i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full bg-error-500"
          />
        ))
      : null;

  const tableDisplayName = table
    ? locale === 'en'
      ? table.name_en
      : locale === 'th'
        ? table.name_th
        : table.name_zh
    : '';

  return (
    <div className="mx-auto max-w-lg">
      <div className="px-4 pt-6">
        <h2 className="text-2xl font-bold text-neutral-900">{t('menu.title')}</h2>

        {/* Table context — from a scanned QR or manually picked */}
        {tableCode ? (
          <button
            onClick={() => setShowPicker(true)}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-white">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M6 14v6m4-6v6m4-6v6m4-6v6"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-primary-700">
                  {tableDisplayName || tableCode}
                </p>
                <p className="text-[10px] text-primary-500">{t('table.orderingFor')}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-primary-600 hover:bg-primary-100">
              {t('table.changeTable')}
            </span>
          </button>
        ) : (
          <button
            onClick={() => setShowPicker(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-3 py-2.5 text-left"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M6 14v6m4-6v6m4-6v6m4-6v6"
                />
              </svg>
            </span>
            <p className="text-xs font-medium text-neutral-600">
              {t('table.selectTable')}
            </p>
          </button>
        )}
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
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-md"
              >
                <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-neutral-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
                  <div className="h-4 w-1/4 animate-pulse rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <p className="text-sm text-error-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-primary-700 px-4 py-2 text-xs font-medium text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <svg
              className="mb-3 h-12 w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-sm">{t('menu.noResults')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const qty = cartQtyMap[item.id] || 0;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl bg-white p-3 shadow-md transition hover:shadow-lg ${
                    item.stock?.soldOut ? 'opacity-60 grayscale' : ''
                  }`}
                >
                  <div
                    className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-50 text-3xl ${
                      item.imageUrl ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      if (item.imageUrl) {
                        setZoomImage({ url: item.imageUrl, name: getLocaleName(item) });
                      }
                    }}
                  >
                    {item.imageThumbUrl || item.imageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageThumbUrl || item.imageUrl}
                          alt={getLocaleName(item)}
                          className="h-full w-full object-cover"
                        />
                        {item.imageUrl && (
                          <span className="absolute bottom-0 right-0 rounded-tl-lg bg-black/40 px-1 py-0.5 text-[8px] text-white">
                            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </span>
                        )}
                      </>
                    ) : (
                      foodEmojis[item.catId] || '🍽️'
                    )}
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
                            <span
                              className="flex items-center gap-0.5"
                              title={`${t('menu.spicy')}: ${item.spice}/3`}
                            >
                              {spiceDots(item.spice)}
                            </span>
                          )}
                          {item.veg && (
                            <span className="rounded bg-success-50 px-1.5 py-0.5 text-success-600">
                              {t('menu.vegetarian')}
                            </span>
                          )}
                          {item.stock?.soldOut && (
                            <span className="rounded bg-neutral-400 px-1.5 py-0.5 text-white">
                              {t('stock.soldOut')}
                            </span>
                          )}
                          {!item.stock?.soldOut && item.stock?.remaining != null && item.stock.remaining > 0 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                              {t('stock.onlyLeft', { n: item.stock.remaining })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-accent-600">
                        ฿{item.price}
                      </span>
                      {qty > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDecrement(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
                          >
                            −
                          </button>
                          <span className="min-w-[16px] text-center text-xs font-semibold">
                            {qty}
                          </span>
                          <button
                            onClick={() => handleAdd(item)}
                            disabled={item.stock?.soldOut}
                            className={`flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-sm font-medium text-white ${
                              item.stock?.soldOut
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:bg-accent-600'
                            }`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAdd(item)}
                          disabled={item.stock?.soldOut}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white transition ${
                            item.stock?.soldOut
                              ? 'cursor-not-allowed bg-neutral-400'
                              : 'bg-accent-500 hover:bg-accent-600'
                          }`}
                        >
                          {t('menu.addToCart')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
              />
            </svg>
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error-500 text-xs font-bold text-white">
              {cartCount}
            </span>
          </Link>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomImage(null)}
        >
          <button
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setZoomImage(null)}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomImage.url}
              alt={zoomImage.name}
              className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <p className="mt-3 text-sm font-medium text-white">{zoomImage.name}</p>
          </div>
        </div>
      )}

      {/* Table picker */}
      <TablePicker
        open={showPicker}
        currentCode={tableCode}
        onSelect={selectTable}
        onClose={() => setShowPicker(false)}
        allowClear
        onClear={() => {
          clearTable();
          setShowPicker(false);
        }}
      />
    </div>
  );
}
