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

export interface AdminSession {
  id: string;
  username: string;
  role: string;
}

/**
 * Admin — resolve the current session from the `admin-session` cookie.
 * Throws (401) when not logged in, so callers use try/catch as an auth check.
 */
export async function fetchAdminMe(): Promise<AdminSession> {
  return request<AdminSession>(`/api/admin/auth/me`);
}

/** Admin — clear the session cookie. */
export async function adminLogout(): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/admin/auth/logout`, {
    method: 'POST',
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
  stockType?: 'NONE' | 'MADE' | 'PURCHASED';
  dailyLimit?: number | null;
  stockQty?: number | null;
  lowStockAlert?: number | null;
  costPrice?: number | null;
  targetMargin?: number | null;
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
    stockType?: 'NONE' | 'MADE' | 'PURCHASED';
    dailyLimit?: number | null;
    stockQty?: number | null;
    lowStockAlert?: number | null;
    costPrice?: number | null;
    targetMargin?: number | null;
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

// ---------- Closed days (休息日 / 法定假日) ----------

export interface ApiClosedDay {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  reason_zh?: string;
  reason_en?: string;
  reason_th?: string;
}

export interface ClosedDaysResponse {
  /** Monday is always closed — this is a hard-coded rule. */
  mondayClosed: boolean;
  days: ApiClosedDay[];
}

/**
 * Public — list every closed day (statutory holidays) for a year.
 * Used by the booking page (to disable dates), the table landing page and
 * the admin rest-days tab. `year` defaults to the current year server-side.
 */
export async function fetchClosedDays(year?: number): Promise<ClosedDaysResponse> {
  const qs = year ? `?year=${year}` : '';
  return request<ClosedDaysResponse>(`/api/closed-days${qs}`);
}

/** Admin — add a statutory holiday. */
export async function createClosedDay(input: {
  date: string;
  reason_zh?: string;
  reason_en?: string;
  reason_th?: string;
}): Promise<ApiClosedDay> {
  return request<ApiClosedDay>(`/api/admin/closed-days`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Admin — remove a statutory holiday. */
export async function deleteClosedDay(id: string): Promise<any> {
  return request<any>(`/api/admin/closed-days/${id}`, {
    method: 'DELETE',
  });
}

// ---------- Menu bulk import / export (admin) ----------

export type MenuImportAction = 'ADD' | 'UPDATE' | 'DELETE' | 'ERROR';

export interface MenuImportRow {
  rowNumber: number;
  action: MenuImportAction;
  category: string;
  categoryId?: string;
  itemId?: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  description_zh?: string;
  description_en?: string;
  description_th?: string;
  price?: number;
  spiceLevel?: number;
  isPopular?: boolean;
  isVegetarian?: boolean;
  isActive?: boolean;
  autoTranslated: string[];
  changes: string[];
  error?: string;
}

export interface MenuImportPreview {
  summary: {
    total: number;
    add: number;
    update: number;
    delete: number;
    error: number;
    translated: number;
  };
  rows: MenuImportRow[];
  newCategories: string[];
}

export interface MenuImportResult {
  ok: boolean;
  added: number;
  updated: number;
  deleted: number;
  skipped: { rowNumber: number; name: string; reason: string }[];
}

/** Build the export download URL (file download — no JSON parsing). */
export function menuExportUrl(format: 'xlsx' | 'csv' = 'xlsx'): string {
  return `/api/admin/menu/export?format=${format}`;
}

/** Build the blank template download URL (file download — no JSON parsing). */
export function menuTemplateUrl(format: 'xlsx' | 'csv' = 'xlsx'): string {
  return `/api/admin/menu/template?format=${format}`;
}

/**
 * Upload a menu file and receive a preview (nothing is written yet).
 * Uses a raw fetch with FormData — must NOT set Content-Type manually so the
 * browser can attach the multipart boundary. Does not use the `request()`
 * helper because that forces `application/json`.
 */
export async function importMenuPreview(
  file: File,
  mode: 'translate' | 'keep',
): Promise<MenuImportPreview> {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);

  const res = await fetch('/api/admin/menu/import', {
    method: 'POST',
    body: form,
  });

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }

  return body as MenuImportPreview;
}

/** Commit the validated preview rows to the server. */
export async function commitMenuImport(input: {
  rows: MenuImportRow[];
  autoCreateCategories: boolean;
}): Promise<MenuImportResult> {
  return request<MenuImportResult>(`/api/admin/menu/import/commit`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------- Inventory / Stock (库存管理) ----------

export interface StockView {
  stockType: 'NONE' | 'MADE' | 'PURCHASED';
  soldOut: boolean;
  remaining: number | null;
  dailyLimit?: number | null;
  lowStockAlert?: number | null;
  lowStock: boolean;
}

export interface AdminStockItem {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  categoryName: string;
  price: number;
  costPrice: number | null;
  imageThumbUrl: string | null;
  stockType: 'NONE' | 'MADE' | 'PURCHASED';
  dailyLimit: number | null;
  stockQty: number | null;
  lowStockAlert: number | null;
  soldOut: boolean;
  view: StockView;
}

export interface StockMovement {
  id: string;
  type: 'PURCHASE' | 'SALE' | 'CANCEL' | 'MANUAL' | 'WASTE';
  quantity: number;
  note: string | null;
  orderId: string | null;
  adminName: string | null;
  createdAt: string;
}

export interface AdminStockSummary {
  soldOut: number;
  lowStock: number;
  normal: number;
  total: number;
}

export async function fetchAdminStock(): Promise<{
  items: AdminStockItem[];
  summary: AdminStockSummary;
}> {
  return request<{ items: AdminStockItem[]; summary: AdminStockSummary }>(
    `/api/admin/stock`,
  );
}

export async function fetchStockItem(itemId: string): Promise<{
  item: AdminStockItem;
  movements: StockMovement[];
}> {
  return request<{ item: AdminStockItem; movements: StockMovement[] }>(
    `/api/admin/stock/${itemId}`,
  );
}

export async function updateStockSettings(
  itemId: string,
  patch: {
    stockType?: string;
    dailyLimit?: number | null;
    lowStockAlert?: number | null;
    costPrice?: number | null;
    soldOut?: boolean;
  },
): Promise<{ item: AdminStockItem }> {
  return request<{ item: AdminStockItem }>(`/api/admin/stock/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function postStockPurchase(
  itemId: string,
  input: { quantity: number; unitCost?: number; note?: string },
): Promise<{ ok: boolean; stockQty: number | null }> {
  return request<{ ok: boolean; stockQty: number | null }>(
    `/api/admin/stock/${itemId}/purchase`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function postStockAdjust(
  itemId: string,
  input: { quantity: number; note?: string },
): Promise<{ ok: boolean; stockQty: number | null }> {
  return request<{ ok: boolean; stockQty: number | null }>(
    `/api/admin/stock/${itemId}/adjust`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function postStockWaste(
  itemId: string,
  input: { quantity: number; note?: string },
): Promise<{ ok: boolean; stockQty: number | null }> {
  return request<{ ok: boolean; stockQty: number | null }>(
    `/api/admin/stock/${itemId}/waste`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export async function postStockSoldOut(
  itemId: string,
  soldOut: boolean,
): Promise<{ ok: boolean; soldOut: boolean }> {
  return request<{ ok: boolean; soldOut: boolean }>(
    `/api/admin/stock/${itemId}/soldout`,
    {
      method: 'POST',
      body: JSON.stringify({ soldOut }),
    },
  );
}

// ---------- Reports (销售报表 / 菜品成本毛利) ----------

export type ReportRange = 'today' | 'week' | 'month' | 'custom';
export type TrendGrain = 'day' | 'week' | 'month';

export interface ReportPeriodRevenue {
  orderRevenue: number;
  bookingRevenue: number;
  totalRevenue: number;
  orderCount: number;
  bookingCount: number;
  cancelledOrders: number;
  avgTicket: number;
  coveredRevenue: number;
  cogs: number;
  grossProfit: number;
  marginRate: number | null;
  wasteCost: number;
  itemsSold: number;
}

export interface ReportOverview extends ReportPeriodRevenue {
  itemsWithoutCost: number;
  prev: ReportPeriodRevenue;
  deltas: {
    totalRevenue: number | null;
    orderRevenue: number | null;
    bookingRevenue: number | null;
    grossProfit: number | null;
    orderCount: number | null;
    marginRate: number | null;
  };
  period: {
    range: ReportRange;
    fromDate: string;
    toDate: string;
    days: number;
    grain: TrendGrain;
    targetMargin: number;
  };
}

export interface ReportTrendPoint {
  key: string;
  orderRevenue: number;
  bookingRevenue: number;
  revenue: number;
  profit: number;
  orders: number;
}

export interface ReportItemStat {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  category: string;
  price: number;
  costPrice: number | null;
  targetMargin: number | null;
  effectiveTarget: number;
  qty: number;
  revenue: number;
  profit: number | null;
  marginRate: number | null;
  belowTarget: boolean;
  stockType: 'NONE' | 'MADE' | 'PURCHASED';
}

export interface ReportStructure {
  hourly: { hour: number; orders: number }[];
  payments: { method: string; count: number; amount: number }[];
  ordersWithoutPayment: number;
  ponds: {
    type: string;
    name_zh: string;
    name_en: string;
    name_th: string;
    bookings: number;
    revenue: number;
    participants: number;
  }[];
  orderTypes: { type: string; orders: number; revenue: number }[];
  tables: { code: string; name: string; orders: number }[];
}

export interface ReportPayload {
  overview: ReportOverview;
  trend: ReportTrendPoint[];
  topItems: ReportItemStat[];
  margins: ReportItemStat[];
  structure: ReportStructure;
}

export async function fetchAdminReport(params: {
  range?: ReportRange;
  from?: string;
  to?: string;
  grain?: TrendGrain;
}): Promise<ReportPayload> {
  const qs = new URLSearchParams();
  qs.set('range', params.range || 'today');
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.grain) qs.set('grain', params.grain);
  return request<ReportPayload>(`/api/admin/reports?${qs.toString()}`);
}

export function reportExportUrl(params: {
  format?: 'xlsx' | 'csv';
  range?: ReportRange;
  from?: string;
  to?: string;
  grain?: TrendGrain;
  content?: string[];
  sheet?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set('format', params.format || 'xlsx');
  qs.set('range', params.range || 'today');
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.grain) qs.set('grain', params.grain);
  if (params.content?.length) qs.set('content', params.content.join(','));
  if (params.sheet) qs.set('sheet', params.sheet);
  return `/api/admin/reports/export?${qs.toString()}`;
}
