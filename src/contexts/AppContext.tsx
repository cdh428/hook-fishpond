'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  ApiUser,
  getStoredUser,
  setStoredUser,
  loginUser as apiLoginUser,
  registerUser as apiRegisterUser,
} from '@/lib/api-client';
import type { OrderLineOption } from '@/lib/menu-options';

// ---------- Cart item shapes (persisted to localStorage) ----------

/**
 * 购物车菜品行。
 *
 * 【为什么每行要有自己的 lineId】
 * 过去同一菜品的数量靠 menuItemId 累加。加了规格之后，
 * 「加大蛋面」和「标准米粉」是同一个 menuItemId 的两行 ——
 * 再按 menuItemId 合并就会把两种规格搅成一行，后厨做不出来。
 * 所以每行一个 lineId，按「菜品 + 选项 + 备注」判重：
 * 完全一样的行才累加数量，不一样的就是新行。
 */
export interface CartFoodItem {
  type: 'food';
  /** 购物车行 id（唯一）；与 menuItemId 不同，改数量/删行都用它 */
  lineId: string;
  /** menuItemId */
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  /** 菜品基础价（不含选项加价） */
  price: number;
  /** 已选选项（含三语名与加价，提交时只用 optionIds） */
  options: OrderLineOption[];
  /** 选项加价合计 */
  optionsDelta: number;
  /** 该行的特别需求（少葱、面硬一点…） */
  note: string | null;
  quantity: number;
}

export interface CartBookingItem {
  type: 'booking';
  id: string; // local uuid for the cart line
  pondId: string;
  pondType: 'LEISURE' | 'COMPETITION';
  pondName_zh: string;
  pondName_en: string;
  pondName_th: string;
  spotId: string | null;
  spotNumber: number | null;
  date: string;
  timeSlot: string | null; // MORNING | AFTERNOON | EVENING | FULL_DAY
  participantCount: number | null;
  groupName: string | null;
  price: number;
}

export type CartItem = CartFoodItem | CartBookingItem;

/** 新增一行菜品时要传的东西（行 id 与数量由 context 生成） */
export type NewFoodLine = Omit<CartFoodItem, 'type' | 'quantity' | 'lineId'>;

const CART_KEY = 'fp_cart';

/** 行的单价 = 基础价 + 选项加价 */
export function lineUnitPrice(item: {
  price: number;
  optionsDelta?: number;
}): number {
  return Math.round((Number(item.price) + Number(item.optionsDelta || 0)) * 100) / 100;
}

/** 判重键：菜品 + 排序后的选项 id + 备注。三项全同才合并数量 */
export function foodLineSignature(item: NewFoodLine): string {
  const optIds = (item.options ?? [])
    .map((o) => o.optionId)
    .sort()
    .join(',');
  return `${item.id}|${optIds}|${(item.note || '').trim()}`;
}

function newLineId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 老版本 localStorage 里的购物车没有 lineId / options，hydrate 时补齐 */
function migrateCart(raw: any[]): CartItem[] {
  const out: CartItem[] = [];
  for (const it of raw ?? []) {
    if (!it || typeof it !== 'object') continue;
    if (it.type === 'booking') {
      out.push(it as CartBookingItem);
      continue;
    }
    if (it.type !== 'food') continue;
    const options = Array.isArray(it.options) ? (it.options as OrderLineOption[]) : [];
    out.push({
      type: 'food',
      lineId: typeof it.lineId === 'string' && it.lineId ? it.lineId : `legacy-${it.id}`,
      id: it.id,
      name_zh: it.name_zh ?? '',
      name_en: it.name_en ?? '',
      name_th: it.name_th ?? '',
      price: Number(it.price) || 0,
      options,
      optionsDelta:
        typeof it.optionsDelta === 'number'
          ? it.optionsDelta
          : options.reduce((s, o) => s + (Number(o.priceDelta) || 0), 0),
      note: typeof it.note === 'string' && it.note ? it.note : null,
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
    });
  }
  return out;
}

interface AppContextValue {
  // user
  user: ApiUser | null;
  loginUser: (phone: string) => Promise<ApiUser>;
  registerUser: (input: {
    phone: string;
    name: string;
    language?: string;
  }) => Promise<ApiUser>;
  logout: () => void;
  setUser: (user: ApiUser | null) => void;

  // cart
  cart: CartItem[];
  foodCart: CartFoodItem[];
  bookingCart: CartBookingItem[];
  /** 加一行菜品；同菜同选项同备注则累加数量，否则新增一行 */
  addFood: (item: NewFoodLine) => void;
  /** 一次性加多行（「再来一单」用） */
  addFoodBatch: (items: NewFoodLine[]) => void;
  removeFood: (lineId: string) => void;
  setFoodQuantity: (lineId: string, quantity: number) => void;
  /** 改某一行的备注 / 选项（lineId 不变；改选项后可能与别的行重复，会自动合并） */
  updateFoodLine: (
    lineId: string,
    patch: Partial<Pick<CartFoodItem, 'note' | 'options' | 'optionsDelta'>>,
  ) => void;
  /** 所有菜品行的数量总和（底部徽标用） */
  cartCount: number;
  /** 某菜品在购物车里的总数量（菜单页数量角标用，跨规格累加） */
  foodQtyByItem: Record<string, number>;
  addBooking: (item: Omit<CartBookingItem, 'type' | 'id'>) => void;
  removeCartItem: (id: string) => void;
  clearCart: () => void;
  cartTotal: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<ApiUser | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setUserState(getStoredUser());
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) setCart(migrateCart(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist cart
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, hydrated]);

  const setUser = useCallback((u: ApiUser | null) => {
    setUserState(u);
    setStoredUser(u);
  }, []);

  const loginUser = useCallback(
    async (phone: string) => {
      const u = await apiLoginUser(phone);
      setUser(u);
      return u;
    },
    [setUser],
  );

  const registerUser = useCallback(
    async (input: { phone: string; name: string; language?: string }) => {
      const u = await apiRegisterUser(input);
      setUser(u);
      return u;
    },
    [setUser],
  );

  const logout = useCallback(() => {
    setUser(null);
  }, [setUser]);

  // ----- Cart operations -----

  const addFood = useCallback((item: NewFoodLine) => {
    setCart((prev) => {
      const sig = foodLineSignature(item);
      const idx = prev.findIndex(
        (i) => i.type === 'food' && foodLineSignature(i as CartFoodItem) === sig,
      );
      if (idx >= 0) {
        const next = [...prev];
        const existing = next[idx] as CartFoodItem;
        next[idx] = { ...existing, quantity: existing.quantity + 1 };
        return next;
      }
      return [...prev, { ...item, type: 'food', lineId: newLineId(), quantity: 1 }];
    });
  }, []);

  const addFoodBatch = useCallback((items: NewFoodLine[]) => {
    if (!items || items.length === 0) return;
    setCart((prev) => {
      const next = [...prev];
      for (const item of items) {
        const sig = foodLineSignature(item);
        const idx = next.findIndex(
          (i) => i.type === 'food' && foodLineSignature(i as CartFoodItem) === sig,
        );
        if (idx >= 0) {
          const existing = next[idx] as CartFoodItem;
          next[idx] = { ...existing, quantity: existing.quantity + 1 };
        } else {
          next.push({ ...item, type: 'food', lineId: newLineId(), quantity: 1 });
        }
      }
      return next;
    });
  }, []);

  const removeFood = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((i) => !(i.type === 'food' && i.lineId === lineId)));
  }, []);

  const setFoodQuantity = useCallback((lineId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => !(i.type === 'food' && i.lineId === lineId));
      }
      return prev.map((i) =>
        i.type === 'food' && i.lineId === lineId ? { ...i, quantity } : i,
      );
    });
  }, []);

  const updateFoodLine = useCallback<AppContextValue['updateFoodLine']>(
    (lineId, patch) => {
      setCart((prev) => {
        const target = prev.find(
          (i) => i.type === 'food' && i.lineId === lineId,
        ) as CartFoodItem | undefined;
        if (!target) return prev;

        const merged: CartFoodItem = { ...target, ...patch };
        // 改完选项/备注后可能与另一行变成同一规格 → 合并数量，避免出现两行重复
        const sig = foodLineSignature(merged);
        const twin = prev.find(
          (i) =>
            i.type === 'food' &&
            i.lineId !== lineId &&
            foodLineSignature(i as CartFoodItem) === sig,
        ) as CartFoodItem | undefined;

        if (twin) {
          return prev
            .map((i) =>
              i.type === 'food' && i.lineId === twin.lineId
                ? { ...i, quantity: i.quantity + merged.quantity }
                : i,
            )
            .filter((i) => !(i.type === 'food' && i.lineId === lineId));
        }

        return prev.map((i) =>
          i.type === 'food' && i.lineId === lineId ? merged : i,
        );
      });
    },
    [],
  );

  const addBooking = useCallback(
    (item: Omit<CartBookingItem, 'type' | 'id'>) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `bk-${Date.now()}`;
      setCart((prev) => [...prev, { ...item, type: 'booking', id }]);
    },
    [],
  );

  const removeCartItem = useCallback((id: string) => {
    setCart((prev) =>
      prev.filter((i) => !(i.type === 'booking' && i.id === id) && !(i.type === 'food' && i.lineId === id)),
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const foodCart = cart.filter((i) => i.type === 'food') as CartFoodItem[];
  const bookingCart = cart.filter(
    (i) => i.type === 'booking',
  ) as CartBookingItem[];

  const foodQtyByItem: Record<string, number> = {};
  for (const f of foodCart) {
    foodQtyByItem[f.id] = (foodQtyByItem[f.id] || 0) + f.quantity;
  }

  const cartCount =
    foodCart.reduce((s, i) => s + i.quantity, 0) + bookingCart.length;
  const cartTotal =
    foodCart.reduce((s, i) => s + lineUnitPrice(i) * i.quantity, 0) +
    bookingCart.reduce((s, i) => s + i.price, 0);

  const value: AppContextValue = {
    user,
    loginUser,
    registerUser,
    logout,
    setUser,
    cart,
    foodCart,
    bookingCart,
    addFood,
    addFoodBatch,
    removeFood,
    setFoodQuantity,
    updateFoodLine,
    cartCount,
    foodQtyByItem,
    addBooking,
    removeCartItem,
    clearCart,
    cartTotal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
