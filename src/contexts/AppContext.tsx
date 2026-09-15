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

// ---------- Cart item shapes (persisted to localStorage) ----------

export interface CartFoodItem {
  type: 'food';
  id: string; // menuItemId
  name_zh: string;
  name_en: string;
  name_th: string;
  price: number;
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

const CART_KEY = 'fp_cart';

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
  addFood: (item: Omit<CartFoodItem, 'type' | 'quantity'>) => void;
  removeFood: (id: string) => void;
  setFoodQuantity: (id: string, quantity: number) => void;
  addBooking: (item: Omit<CartBookingItem, 'type' | 'id'>) => void;
  removeCartItem: (id: string) => void;
  clearCart: () => void;
  cartCount: number;
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
      if (raw) setCart(JSON.parse(raw));
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

  const addFood = useCallback(
    (item: Omit<CartFoodItem, 'type' | 'quantity'>) => {
      setCart((prev) => {
        const idx = prev.findIndex(
          (i) => i.type === 'food' && i.id === item.id,
        );
        if (idx >= 0) {
          const next = [...prev];
          const existing = next[idx] as CartFoodItem;
          next[idx] = { ...existing, quantity: existing.quantity + 1 };
          return next;
        }
        return [...prev, { ...item, type: 'food', quantity: 1 }];
      });
    },
    [],
  );

  const removeFood = useCallback((id: string) => {
    setCart((prev) =>
      prev.filter((i) => !(i.type === 'food' && i.id === id)),
    );
  }, []);

  const setFoodQuantity = useCallback((id: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => !(i.type === 'food' && i.id === id));
      }
      return prev.map((i) =>
        i.type === 'food' && i.id === id ? { ...i, quantity } : i,
      );
    });
  }, []);

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
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const foodCart = cart.filter((i) => i.type === 'food') as CartFoodItem[];
  const bookingCart = cart.filter(
    (i) => i.type === 'booking',
  ) as CartBookingItem[];

  const cartCount =
    foodCart.reduce((s, i) => s + i.quantity, 0) + bookingCart.length;
  const cartTotal =
    foodCart.reduce((s, i) => s + i.price * i.quantity, 0) +
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
    removeFood,
    setFoodQuantity,
    addBooking,
    removeCartItem,
    clearCart,
    cartCount,
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
