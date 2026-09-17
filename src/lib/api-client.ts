/**
 * Shared frontend API client.
 * Wraps fetch(), injects the `x-user-id` header (from localStorage) for
 * user-scoped routes, and normalizes DB field names into the shapes the
 * frontend components expect.
 *
 * All functions run in the browser ('use client' components).
 */

// ---------- Types returned to the frontend ----------

export type MenuType = 'FOOD' | 'DRINK';

export interface ApiCategory {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  type: MenuType;
  itemCount: number;
}

export interface ApiMenuItem {
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
  imageUrl?: string;
  imageThumbUrl?: string;
}

export interface ApiPond {
  id: string;
  type: 'LEISURE' | 'COMPETITION';
  name_zh: string;
  name_en: string;
  name_th: string;
  description_zh?: string;
  description_en?: string;
  description_th?: string;
  price: number;
  priceUnit: 'SLOT' | 'DAY';
  minParticipants?: number | null;
  maxSpots: number;
}

export interface ApiSpot {
  id: string;
  number: number;
  available: boolean;
  slotAvailability?: Record<string, boolean>;
}

export interface ApiUser {
  id: string;
  phone: string;
  name: string;
  language: string;
  marketingConsent?: boolean;
}

// ---------- localStorage helpers (user session) ----------

const USER_KEY = 'fp_user';

export function getStoredUser(): ApiUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: ApiUser | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function userHeaders(): Record<string, string> {
  const user = getStoredUser();
  return user ? { 'x-user-id': user.id } : {};
}

// ---------- Core fetch wrapper ----------

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...userHeaders(),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && body.error) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

// ---------- Normalizers ----------

function normalizeCategory(raw: any): ApiCategory {
  return {
    id: raw.id,
    name_zh: raw.name_zh,
    name_en: raw.name_en,
    name_th: raw.name_th,
    type: raw.type,
    itemCount: raw._count?.items ?? 0,
  };
}

function normalizeMenuItem(raw: any): ApiMenuItem {
  return {
    id: raw.id,
    catId: raw.categoryId,
    name_zh: raw.name_zh,
    name_en: raw.name_en,
    name_th: raw.name_th,
    description_zh: raw.description_zh ?? undefined,
    description_en: raw.description_en ?? undefined,
    description_th: raw.description_th ?? undefined,
    price: raw.price,
    spice: raw.spiceLevel ?? 0,
    popular: !!raw.isPopular,
    veg: !!raw.isVegetarian,
    type: raw.category?.type ?? raw.type,
    imageUrl: raw.imageUrl ?? undefined,
    imageThumbUrl: raw.imageThumbUrl ?? undefined,
  };
}

function normalizePond(raw: any): ApiPond {
  return {
    id: raw.id,
    type: raw.type,
    name_zh: raw.name_zh,
    name_en: raw.name_en,
    name_th: raw.name_th,
    description_zh: raw.description_zh ?? undefined,
    description_en: raw.description_en ?? undefined,
    description_th: raw.description_th ?? undefined,
    price: raw.price,
    priceUnit: raw.priceUnit,
    minParticipants: raw.minParticipants,
    maxSpots: raw.maxSpots,
  };
}

// ---------- Menu ----------

export async function fetchCategories(type?: MenuType): Promise<ApiCategory[]> {
  const qs = type ? `?type=${type}` : '';
  const raw = await request<any[]>(`/api/menu/categories${qs}`);
  return raw.map(normalizeCategory);
}

export async function fetchMenuItems(params?: {
  categoryId?: string;
  popular?: boolean;
}): Promise<ApiMenuItem[]> {
  const qs = new URLSearchParams();
  if (params?.categoryId) qs.set('categoryId', params.categoryId);
  if (params?.popular) qs.set('popular', 'true');
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const raw = await request<any[]>(`/api/menu/items${query}`);
  return raw.map(normalizeMenuItem);
}

// ---------- Ponds ----------

export async function fetchPonds(): Promise<ApiPond[]> {
  const raw = await request<any[]>(`/api/ponds`);
  return raw.map(normalizePond);
}

export async function fetchPondSpots(
  pondId: string,
  date: string,
): Promise<{ pond: ApiPond; spots: ApiSpot[] }> {
  const raw = await request<any>(
    `/api/ponds/${pondId}/spots?date=${encodeURIComponent(date)}`,
  );
  return {
    pond: normalizePond(raw.pond),
    spots: (raw.spots || []).map((s: any) => ({
      id: s.id,
      number: s.number,
      available: s.available,
      slotAvailability: s.slotAvailability,
    })),
  };
}

// ---------- Bookings ----------

export interface CreateBookingInput {
  pondId: string;
  spotId?: string;
  date: string;
  timeSlot?: string;
  participantCount?: number;
  groupName?: string;
  customerName: string;
  customerPhone: string;
  userId?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<any> {
  return request<any>(`/api/bookings`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchBookings(params: {
  userId?: string;
  phone?: string;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', params.userId);
  if (params.phone) qs.set('phone', params.phone);
  return request<any[]>(`/api/bookings?${qs.toString()}`);
}

// ---------- Orders ----------

export type OrderTypeValue = 'DINE_IN' | 'TAKEAWAY';

export interface CreateOrderInput {
  userId?: string;
  customerName: string;
  customerPhone: string;
  items: { menuItemId: string; quantity: number; note?: string }[];
  bookingId?: string;
  note?: string;
  orderType?: OrderTypeValue;
  tableCode?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<any> {
  return request<any>(`/api/orders`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchOrders(params: {
  userId?: string;
  phone?: string;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', params.userId);
  if (params.phone) qs.set('phone', params.phone);
  return request<any[]>(`/api/orders?${qs.toString()}`);
}

// ---------- Auth (user) ----------

export async function loginUser(phone: string): Promise<ApiUser> {
  return request<ApiUser>(`/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function registerUser(input: {
  phone: string;
  name: string;
  language?: string;
}): Promise<ApiUser> {
  return request<ApiUser>(`/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchMe(): Promise<ApiUser> {
  return request<ApiUser>(`/api/auth/me`);
}

export async function updateMe(input: Partial<ApiUser>): Promise<ApiUser> {
  return request<ApiUser>(`/api/auth/me`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

// ---------- Payment ----------

export async function createPayment(input: {
  orderId: string;
  amount: number;
  method?: string;
}): Promise<{
  paymentId: string;
  qrString: string;
  amount: number;
  status: string;
  merchantName: string;
  maskedPromptPayId: string;
  expiresAt: string | null;
}> {
  return request<any>('/api/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getPayment(paymentId: string): Promise<{
  paymentId: string;
  status: string;
  amount: number;
  qrString: string;
  maskedPromptPayId: string;
  expiresAt: string | null;
  paidAt: string | null;
  order: any;
}> {
  return request<any>(`/api/payments/${paymentId}`);
}

export async function confirmPayment(
  paymentId: string,
  action: 'user_confirm' | 'admin_confirm' | 'admin_reject',
): Promise<{ status: string }> {
  return request<any>(`/api/payments/${paymentId}`, {
    method: 'PUT',
    body: JSON.stringify({ action }),
  });
}

// ---------- Admin ----------

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ id: string; username: string; role: string }> {
  return request(`/api/admin/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchAdminStats(): Promise<any> {
  return request<any>(`/api/admin/stats`);
}

export async function fetchAdminBookings(params?: {
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<any[]>(`/api/admin/bookings${query}`);
}

export async function fetchAdminTransactions(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<any>(`/api/admin/transactions${query}`);
}

export async function fetchAdminOrders(params?: {
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<any[]>(`/api/admin/orders${query}`);
}

/**
 * Admin — rebind an order's dining table.
 * Pass a table code to attach/move, or null to detach (order becomes takeaway).
 */
export async function updateAdminOrderTable(
  orderId: string,
  tableCode: string | null,
): Promise<any> {
  return request<any>(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ tableCode }),
  });
}

// ---------- Booking status (admin) ----------

export async function updateBookingStatus(
  id: string,
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED',
): Promise<any> {
  return request<any>(`/api/bookings/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ---------- Menu admin (categories) ----------

export async function fetchAdminCategories(type?: 'FOOD' | 'DRINK'): Promise<any[]> {
  const qs = type ? `?type=${type}` : '';
  const raw = await request<any[]>(`/api/admin/menu/categories${qs}`);
  return raw.map((c) => ({ ...c, itemCount: c._count?.items ?? 0 }));
}

export async function createCategory(input: {
  name_zh: string;
  name_en: string;
  name_th: string;
  type: 'FOOD' | 'DRINK';
}): Promise<any> {
  return request<any>(`/api/admin/menu/categories`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCategory(
  id: string,
  input: {
    name_zh?: string;
    name_en?: string;
    name_th?: string;
    type?: 'FOOD' | 'DRINK';
  },
): Promise<any> {
  return request<any>(`/api/admin/menu/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteCategory(id: string): Promise<any> {
  return request<any>(`/api/admin/menu/categories/${id}`, {
    method: 'DELETE',
  });
}

// ---------- Menu admin (items) ----------

export async function fetchAdminMenuItems(params?: {
  categoryId?: string;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.categoryId) qs.set('categoryId', params.categoryId);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const raw = await request<any[]>(`/api/admin/menu/items${query}`);
  return raw.map((i) => ({
    id: i.id,
    catId: i.categoryId,
    name_zh: i.name_zh,
    name_en: i.name_en,
    name_th: i.name_th,
    price: i.price,
    spice: i.spiceLevel ?? 0,
    popular: !!i.isPopular,
    veg: !!i.isVegetarian,
    type: i.category?.type ?? i.type,
    description_zh: i.description_zh ?? undefined,
    description_en: i.description_en ?? undefined,
    description_th: i.description_th ?? undefined,
    imageUrl: i.imageUrl ?? undefined,
    imageThumbUrl: i.imageThumbUrl ?? undefined,
    isActive: i.isActive,
  }));
}

export async function createMenuItem(input: {
  categoryId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  price: number;
  spiceLevel?: number;
  isPopular?: boolean;
  isVegetarian?: boolean;
  description_zh?: string;
  description_en?: string;
  description_th?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
}): Promise<any> {
  return request<any>(`/api/admin/menu/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateMenuItem(
  id: string,
  input: {
    categoryId?: string;
    name_zh?: string;
    name_en?: string;
    name_th?: string;
    price?: number;
    spiceLevel?: number;
    isPopular?: boolean;
    isVegetarian?: boolean;
    description_zh?: string;
    description_en?: string;
    description_th?: string;
    imageUrl?: string;
    imageThumbUrl?: string;
  },
): Promise<any> {
  return request<any>(`/api/admin/menu/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteMenuItem(id: string): Promise<any> {
  return request<any>(`/api/admin/menu/items/${id}`, {
    method: 'DELETE',
  });
}

// ---------- Dining Tables (餐桌二维码点餐) ----------

export type TableArea = 'HUT' | 'CAFE';

export interface ApiTable {
  id: string;
  code: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  area: TableArea;
  isActive: boolean;
  orderCount?: number;
}

export interface CreateTableInput {
  code: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  area: TableArea;
}

/** Public — validate a scanned table code (used by the /t/[code] landing page). */
export async function getTableByCode(code: string): Promise<ApiTable> {
  return request<ApiTable>(`/api/tables?code=${encodeURIComponent(code)}`);
}

/** Public — list all active tables. */
export async function fetchTables(): Promise<ApiTable[]> {
  return request<ApiTable[]>(`/api/tables`);
}

/** Admin — list every table including deactivated ones. */
export async function fetchAdminTables(): Promise<any[]> {
  const raw = await request<any[]>(`/api/admin/tables`);
  return raw.map((t) => ({
    id: t.id,
    code: t.code,
    name_zh: t.name_zh,
    name_en: t.name_en,
    name_th: t.name_th,
    area: t.area,
    isActive: t.isActive,
    orderCount: t._count?.orders ?? 0,
  }));
}

export async function createTable(input: CreateTableInput): Promise<any> {
  return request<any>(`/api/admin/tables`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTable(
  id: string,
  input: Partial<CreateTableInput> & { isActive?: boolean },
): Promise<any> {
  return request<any>(`/api/admin/tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteTable(id: string): Promise<any> {
  return request<any>(`/api/admin/tables/${id}`, {
    method: 'DELETE',
  });
}

/** Build the public ordering URL encoded in each table's QR code. */
export function tableOrderUrl(code: string, baseUrl?: string): string {
  const base =
    baseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/t/${code}`;
}
