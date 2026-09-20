'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';
import {
  fetchCategories,
  fetchMenuItems,
  getTableByCode,
  fetchTableBill,
  createServiceCall,
  ApiCategory,
  ApiMenuItem,
  ApiTable,
  TableBill,
  MenuType,
} from '@/lib/api-client';
import { useApp } from '@/contexts/AppContext';
import TablePicker from '@/components/TablePicker';
import OptionSheet, { OptionSheetItem } from '@/components/OptionSheet';
import {
  MENU_TYPES,
  MENU_TYPE_EMOJI,
  MENU_TYPE_LABEL_KEY,
} from '@/lib/menu-types';
import { formatLineOptions, type OptionGroupPublic } from '@/lib/menu-options';
import {
  getStoredTableCode,
  setStoredTableCode,
  clearStoredTable,
} from '@/lib/table-storage';

type TabType = MenuType;

type MenuItemWithStock = ApiMenuItem;

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
  const { foodCart, foodQtyByItem, addFood, setFoodQuantity, cartCount } = useApp();

  const [activeTab, setActiveTab] = useState<TabType>('FOOD');
  const [activeCat, setActiveCat] = useState<string>('popular');
  const [query, setQuery] = useState('');

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string } | null>(null);

  // 规格选择面板
  const [sheetItem, setSheetItem] = useState<OptionSheetItem | null>(null);
  const [sheetGroups, setSheetGroups] = useState<OptionGroupPublic[]>([]);

  // 本桌账单 + 呼叫服务员
  const [bill, setBill] = useState<TableBill | null>(null);
  const [showBill, setShowBill] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'sending' | 'sent'>('idle');

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
    setBill(null);
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

  // 本桌账单：进入页面 + 购物车变化后刷新（下单回到菜单页时金额才是新的）
  const refreshBill = (code: string | null) => {
    if (!code) {
      setBill(null);
      return;
    }
    fetchTableBill(code).then(setBill);
  };

  useEffect(() => {
    refreshBill(tableCode);
  }, [tableCode]);

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

  const allItems = menuItems.filter((i) => i.type === activeTab);
  const filteredCategories = categories.filter((c) => c.type === activeTab);

  // 搜索：跨大类全量搜（菜品一多，先在美食里找再切饮品太费事）
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    return menuItems.filter((i) => {
      const hay = [
        i.name_zh,
        i.name_en,
        i.name_th,
        i.description_zh,
        i.description_en,
        i.description_th,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [menuItems, q, searching]);

  const filteredItems = searching
    ? searchResults
    : activeCat === 'popular'
      ? allItems.filter((i) => i.popular)
      : allItems.filter((i) => i.catId === activeCat);

  const popularItemsForTab = allItems.filter((i) => i.popular);

  const hasOptions = (item: MenuItemWithStock) =>
    Array.isArray(item.optionGroups) && item.optionGroups.length > 0;

  const handleAdd = (item: MenuItemWithStock) => {
    if (item.stock?.soldOut) return;
    const remaining = item.stock?.remaining;
    const current = foodQtyByItem[item.id] || 0;
    if (remaining != null && current >= remaining) return;

    if (hasOptions(item)) {
      setSheetItem({
        id: item.id,
        name_zh: item.name_zh,
        name_en: item.name_en,
        name_th: item.name_th,
        price: item.price,
      });
      setSheetGroups(item.optionGroups!);
      return;
    }

    addFood({
      id: item.id,
      name_zh: item.name_zh,
      name_en: item.name_en,
      name_th: item.name_th,
      price: item.price,
      options: [],
      optionsDelta: 0,
      note: null,
    });
  };

  /** 数量角标是跨规格汇总的，减一份就减最后加进购物车的那一行 */
  const handleDecrement = (item: MenuItemWithStock) => {
    const lines = foodCart.filter((f) => f.id === item.id);
    if (lines.length === 0) return;
    const last = lines[lines.length - 1];
    setFoodQuantity(last.lineId, last.quantity - 1);
  };

  /** 售罄时给同类替代，别让客人白跑一趟 */
  const alternativesFor = (item: MenuItemWithStock) =>
    menuItems
      .filter(
        (i) =>
          i.catId === item.catId &&
          i.id !== item.id &&
          !i.stock?.soldOut &&
          i.type === item.type,
      )
      .slice(0, 2);

  const callService = async () => {
    if (!tableCode || callState === 'sending') return;
    setCallState('sending');
    try {
      await createServiceCall({ tableCode, type: 'ASSISTANCE' });
      setCallState('sent');
      window.setTimeout(() => setCallState('idle'), 6000);
    } catch {
      setCallState('idle');
    }
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

  const billItemCount = bill?.summary.itemCount ?? 0;
  const billPayable = bill?.summary.payable ?? 0;

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

        {/* 本桌账单 + 呼叫服务员（仅在有桌号时出现） */}
        {tableCode && (
          <div className="mt-2 flex gap-2">
            {bill && bill.summary.orderCount > 0 ? (
              <button
                onClick={() => setShowBill(true)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] text-neutral-400">
                    {t('menu.bill.myTable')}
                  </span>
                  <span className="block truncate text-xs font-semibold text-neutral-800">
                    {t('menu.bill.summary', {
                      items: billItemCount,
                      amount: `฿${billPayable}`,
                    })}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-600">
                  {t('menu.bill.view')}
                </span>
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2">
                <span className="truncate text-[11px] text-neutral-400">
                  {t('menu.bill.nothingYet')}
                </span>
              </div>
            )}

            <button
              onClick={callService}
              disabled={callState === 'sending'}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                callState === 'sent'
                  ? 'bg-success-50 text-success-600'
                  : 'bg-primary-700 text-white hover:bg-primary-800'
              }`}
            >
              {callState === 'sent' ? (
                t('menu.callSent')
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {callState === 'sending' ? t('menu.callSending') : t('menu.callService')}
                </>
              )}
            </button>
          </div>
        )}

        {/* 搜索 */}
        <div className="relative mt-3">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('menu.searchPlaceholder')}
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {searching && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('common.close')}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 大类页签：美食 / 饮品 / 工具（顺序与文案统一取自 MENU_TYPES） */}
      {!searching && (
        <div className="sticky top-14 z-40 bg-bg-page/95 px-4 pt-3 backdrop-blur-md">
          <div className="flex rounded-xl bg-neutral-100 p-1">
            {MENU_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => {
                  setActiveTab(type);
                  setActiveCat('popular');
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeTab === type
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {MENU_TYPE_EMOJI[type]} {t(MENU_TYPE_LABEL_KEY[type])}
              </button>
            ))}
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
      )}

      {/* 搜索结果标题 */}
      {searching && (
        <div className="px-4 pb-2 pt-4">
          <p className="text-xs text-neutral-500">
            {t('menu.searchResultCount', { n: filteredItems.length })}
          </p>
        </div>
      )}

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
              const qty = foodQtyByItem[item.id] || 0;
              const soldOut = !!item.stock?.soldOut;
              const options = alternativesFor(item);
              return (
                <div
                  key={item.id}
                  className={`rounded-xl bg-white p-3 shadow-md transition hover:shadow-lg ${
                    soldOut ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-50 text-3xl ${
                        item.imageUrl ? 'cursor-pointer' : ''
                      } ${soldOut ? 'grayscale' : ''}`}
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
                        foodEmojis[item.catId] || MENU_TYPE_EMOJI[item.type as MenuType] || '🍽️'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-neutral-900">
                            {getLocaleName(item)}
                          </h3>
                          {getLocaleDesc(item) && (
                            <p className="mt-0.5 text-xs text-neutral-400 line-clamp-1">
                              {getLocaleDesc(item)}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
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
                            {hasOptions(item) && (
                              <span className="rounded bg-primary-50 px-1.5 py-0.5 text-primary-600">
                                {t('menu.hasOptions')}
                              </span>
                            )}
                            {soldOut && (
                              <span className="rounded bg-neutral-400 px-1.5 py-0.5 text-white">
                                {t('stock.soldOut')}
                              </span>
                            )}
                            {!soldOut && item.stock?.remaining != null && item.stock.remaining > 0 && (
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
                              disabled={soldOut}
                              className={`flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-sm font-medium text-white ${
                                soldOut
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
                            disabled={soldOut}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white transition ${
                              soldOut
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

                  {/* 售罄 → 同类热销替代，省客人一趟空跑 */}
                  {soldOut && options.length > 0 && (
                    <div className="mt-2.5 border-t border-dashed border-neutral-100 pt-2.5">
                      <p className="mb-1.5 text-[10px] font-medium text-neutral-400">
                        {t('menu.soldOutAlternatives')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((alt) => (
                          <button
                            key={alt.id}
                            onClick={() => handleAdd(alt)}
                            className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:border-primary-300 hover:text-primary-700"
                          >
                            {getLocaleName(alt)} · ฿{alt.price}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* 规格选择面板 */}
      <OptionSheet
        open={!!sheetItem}
        item={sheetItem}
        groups={sheetGroups}
        locale={locale}
        onClose={() => setSheetItem(null)}
        onConfirm={(res) => {
          if (!sheetItem) return;
          addFood({
            id: sheetItem.id,
            name_zh: sheetItem.name_zh,
            name_en: sheetItem.name_en,
            name_th: sheetItem.name_th,
            price: sheetItem.price,
            options: res.options,
            optionsDelta: res.optionsDelta,
            note: res.note,
          });
          setSheetItem(null);
        }}
      />

      {/* 本桌账单详情 */}
      {showBill && bill && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40"
          onClick={() => setShowBill(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3.5">
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  {t('menu.bill.title')}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {tableDisplayName || tableCode}
                </p>
              </div>
              <button
                onClick={() => setShowBill(false)}
                aria-label={t('common.close')}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {bill.orders.map((o) => (
                <div key={o.id} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-neutral-500">
                      {o.orderNumber}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        o.status === 'SETTLED'
                          ? 'bg-neutral-100 text-neutral-500'
                          : 'bg-warning-100 text-warning-600'
                      }`}
                    >
                      {t(`orders.${o.status.toLowerCase()}` as any)}
                    </span>
                  </div>
                  {o.items.map((it) => {
                    const optLines = formatLineOptions(it.options, locale);
                    return (
                      <div key={it.id} className="mb-2 flex gap-2">
                        <span className="w-6 shrink-0 text-xs text-neutral-400">
                          ×{it.quantity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-neutral-800">
                            {getLocaleName(it)}
                          </p>
                          {optLines.map((l, i) => (
                            <p key={i} className="text-[11px] text-neutral-500">
                              {l}
                            </p>
                          ))}
                          {it.note && (
                            <p className="text-[11px] text-accent-600">※ {it.note}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm text-neutral-700">
                          ฿{it.totalPrice}
                        </span>
                      </div>
                    );
                  })}
                  {o.fishCharge > 0 && (
                    <div className="flex justify-between text-[11px] text-neutral-500">
                      <span>
                        {t('printLabels.fishCharge')}
                        {o.fishWeightKg > 0 ? ` (${o.fishWeightKg} kg)` : ''}
                      </span>
                      <span>฿{o.fishCharge}</span>
                    </div>
                  )}
                  {o.discountAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-success-600">
                      <span>{t('printLabels.discount')}</span>
                      <span>−฿{o.discountAmount}</span>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t border-neutral-100 pt-1 text-sm font-semibold">
                    <span>{t('payment.total')}</span>
                    <span className="text-accent-600">฿{o.totalPrice}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-neutral-400">
                    {t('menu.bill.payableHint')}
                  </p>
                  <p className="text-xl font-bold text-accent-600">฿{billPayable}</p>
                </div>
                <button
                  onClick={() => setShowBill(false)}
                  className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">
                {t('menu.bill.settleAtCounter')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-4"
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
