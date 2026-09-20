import type {
  OptionGroupPublic,
  OptionGroupInput,
  OrderLineOption,
} from './menu-options';

/**
 * Shared frontend API client.
 * Wraps fetch(), injects the `x-user-id` header (from localStorage) for
 * user-scoped routes, and normalizes DB field names into the shapes the
 * frontend components expect.
 *
 * All functions run in the browser ('use client' components).
 */

// ---------- Types returned to the frontend ----------

// 菜单大类：美食 / 饮品 / 工具（用具类商品）
export type MenuType = 'FOOD' | 'DRINK' | 'TOOL';

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
  /** 规格 / 面型 / 加料 等选项组；无选项的菜品为空数组 */
  optionGroups?: OptionGroupPublic[];
  /** 库存视图（公开菜单接口附带） */
  stock?: {
    soldOut: boolean;
    remaining: number | null;
    stockType: 'NONE' | 'MADE' | 'PURCHASED';
  };
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
    optionGroups: Array.isArray(raw.optionGroups) ? raw.optionGroups : [],
    stock: raw.stock ?? undefined,
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
export type SettlementModeValue = 'PREPAID' | 'POSTPAID';
export type DiscountTypeValue = 'NONE' | 'PERCENT' | 'AMOUNT';

export interface CreateOrderInput {
  userId?: string;
  customerName: string;
  customerPhone: string;
  items: {
    menuItemId: string;
    quantity: number;
    /** 勾选的选项 id（份量 / 面型 / 加料…）；服务端据此重算单价 */
    optionIds?: string[];
    /** 该行的特别需求（少葱、面硬一点…） */
    note?: string;
  }[];
  bookingId?: string;
  note?: string;
  orderType?: OrderTypeValue;
  tableCode?: string;
  /** 结算方式：立即付款 / 最后结算 */
  settlementMode?: SettlementModeValue;
  /** 外带指定的取餐时间（ISO 字符串） */
  pickupAt?: string;
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

/** 公开：读取单个订单（顾客下单成功页 / 订单详情） */
export async function fetchOrder(orderId: string): Promise<any> {
  return request<any>(`/api/orders/${orderId}`);
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<any> {
  return request<any>(`/api/orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
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

export interface AdminOrderSummary {
  open: number;
  awaitingCount: number;
  awaitingAmount: number;
  unsettledPrepaid: number;
}

export async function fetchAdminOrders(params?: {
  status?: string;
  scope?: 'open' | 'awaiting' | 'today';
  startDate?: string;
  endDate?: string;
}): Promise<{ orders: any[]; summary: AdminOrderSummary }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const raw = await request<any>(`/api/admin/orders${query}`);
  if (Array.isArray(raw)) {
    return { orders: raw, summary: { open: 0, awaitingCount: 0, awaitingAmount: 0, unsettledPrepaid: 0 } };
  }
  return {
    orders: raw?.orders ?? [],
    summary: raw?.summary ?? { open: 0, awaitingCount: 0, awaitingAmount: 0, unsettledPrepaid: 0 },
  };
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

/** Admin — 后厨状态流转（PREPARING / READY / SERVED） */
export async function updateAdminOrderStatus(
  orderId: string,
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED',
): Promise<any> {
  return request<any>(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'status', status }),
  });
}

/**
 * Admin — 改单：传入改后的完整菜品行；减量会自动把库存加回去。
 *
 * 每一行必须能唯一定位到「菜品 + 规格」：
 *  - 已有行：带 `optionKey`（从订单行原样回传），只改数量时服务端沿用原单价
 *  - 新增行：不带 `optionKey`，但必须带 `optionIds`，由服务端按选项解析单价
 *  - `quantity: 0` 表示删行（预占释放、已扣减部分回补库存）
 */
export async function updateAdminOrderItems(
  orderId: string,
  items: {
    menuItemId: string;
    quantity: number;
    optionKey?: string;
    optionIds?: string[];
    note?: string;
  }[],
): Promise<{ order: any; restored: number }> {
  return request<any>(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'items', items }),
  });
}

/** Admin — 折扣 / 改价。超出店员额度时服务端返回 403 + code=NEEDS_ADMIN */
export async function applyAdminOrderDiscount(
  orderId: string,
  input: {
    discountType: DiscountTypeValue;
    discountValue: number;
    note?: string;
    adminPassword?: string;
  },
): Promise<any> {
  return request<any>(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'discount', ...input }),
  });
}

/** Admin — 取消订单（释放预占 / 回补已扣库存） */
export async function cancelAdminOrder(orderId: string): Promise<any> {
  return request<any>(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'cancel' }),
  });
}

/** Admin — 录入渔获称重（前 1kg 免费，超出 60฿/kg） */
export async function addOrderWeighing(
  orderId: string,
  input: { weightKg: number; note?: string },
): Promise<any> {
  return request<any>(`/api/admin/orders/${orderId}/weigh`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Admin — 撤销一次称重 */
export async function deleteOrderWeighing(
  orderId: string,
  weighingId: string,
): Promise<any> {
  return request<any>(
    `/api/admin/orders/${orderId}/weigh?weighingId=${encodeURIComponent(weighingId)}`,
    { method: 'DELETE' },
  );
}

export interface SettleResult {
  order: any;
  status?: string;
  totals?: {
    subtotal: number;
    fishWeightKg: number;
    fishCharge: number;
    gross: number;
    discountAmount: number;
    totalPrice: number;
  };
  paymentId?: string;
  qrString?: string | null;
  amount?: number;
  merchantName?: string;
  maskedPromptPayId?: string;
  expiresAt?: string;
}

/**
 * Admin — 结算收款。
 *  action: "create" 生成/刷新收款单（返回二维码）｜"confirm" 顾客已付款｜"mark-paid" 直接记已收款
 *  method: "CASH" | "PROMPTPAY"
 */
export async function settleAdminOrder(
  orderId: string,
  input: { action?: 'create' | 'confirm' | 'mark-paid'; method?: 'CASH' | 'PROMPTPAY' },
): Promise<SettleResult> {
  return request<SettleResult>(`/api/admin/orders/${orderId}/settle`, {
    method: 'POST',
    body: JSON.stringify(input),
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

export async function fetchAdminCategories(type?: MenuType): Promise<any[]> {
  const qs = type ? `?type=${type}` : '';
  const raw = await request<any[]>(`/api/admin/menu/categories${qs}`);
  return raw.map((c) => ({ ...c, itemCount: c._count?.items ?? 0 }));
}

export async function createCategory(input: {
  name_zh: string;
  name_en: string;
  name_th: string;
  type: MenuType;
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
    type?: MenuType;
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

/**
 * 批量把菜品移动到另一个分类（可跨大类：美食 / 饮品 / 工具）。
 * 服务端走一条 updateMany，一次往返——避免逐个 PUT 在远端 Neon 上累积延迟。
 */
export async function moveMenuItems(
  ids: string[],
  categoryId: string,
): Promise<{ moved: number; categoryId: string; type: MenuType }> {
  return request<{ moved: number; categoryId: string; type: MenuType }>(
    `/api/admin/menu/items/move`,
    { method: 'POST', body: JSON.stringify({ ids, categoryId }) },
  );
}

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
  /** 数量账余额（只读，由过账引擎维护） */
  stockQty: number | null;
  /** 金额账余额（只读，由过账引擎维护） */
  stockValue: number | null;
  /** 移动加权平均成本 */
  avgCost: number | null;
  lowStockAlert: number | null;
  soldOut: boolean;
  view: StockView;
}

export type StockDocType =
  | 'PURCHASE_RECEIPT'
  | 'STOCK_TAKE'
  | 'ORDER'
  | 'MANUAL'
  | 'OPENING';

export interface StockMovement {
  id: string;
  type: 'PURCHASE' | 'SALE' | 'CANCEL' | 'MANUAL' | 'WASTE';
  quantity: number;
  unitCost: number | null;
  amount: number | null;
  balanceAfter: number | null;
  docType: StockDocType | null;
  docId: string | null;
  reversalOf: string | null;
  /** 该分录是否已被红字冲销 */
  reversed: boolean;
  note: string | null;
  orderId: string | null;
  adminName: string | null;
  createdAt: string;
}

/** 账实核对（余额 ≡ 分录汇总） */
export interface StockLedgerInfo {
  entryCount: number;
  /** 分录汇总数量 */
  qty: number;
  /** 分录汇总金额 */
  value: number;
  /** 账面数量余额 */
  bookQty: number;
  /** 账面金额余额 */
  bookValue: number;
  qtyDiff: number;
  valueDiff: number;
  ok: boolean;
}

export interface AdminStockSummary {
  soldOut: number;
  lowStock: number;
  normal: number;
  total: number;
  /** 外购类存货的金额账合计 */
  stockValueTotal: number;
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
  ledger: StockLedgerInfo;
}> {
  return request<{
    item: AdminStockItem;
    movements: StockMovement[];
    ledger: StockLedgerInfo;
  }>(`/api/admin/stock/${itemId}`);
}

/** 红字冲销某条手工分录（调整 / 损耗 / 期初） */
export async function reverseStockMovement(
  itemId: string,
  movementId: string,
  note?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/stock/${itemId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'reverse', movementId, note }),
  });
}

// ---------- 进货单（Purchase Receipt）----------

export interface PurchaseReceiptLine {
  id?: string;
  menuItemId: string;
  name_zh?: string;
  name_en?: string;
  name_th?: string;
  qty: number;
  unitCost: number;
  amount: number;
}

export interface PurchaseReceipt {
  id: string;
  code: string;
  supplier: string | null;
  docDate: string;
  totalAmount: number;
  note: string | null;
  adminName: string | null;
  reversedAt: string | null;
  createdAt: string;
  lines: PurchaseReceiptLine[];
}

export async function fetchPurchaseReceipts(): Promise<{
  receipts: PurchaseReceipt[];
}> {
  return request<{ receipts: PurchaseReceipt[] }>(
    `/api/admin/stock/receipts`,
  );
}

export async function createPurchaseReceipt(input: {
  lines: { menuItemId: string; qty: number; unitCost?: number | null }[];
  supplier?: string | null;
  docDate?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; id: string; code: string; totalAmount: number }> {
  return request<{ ok: boolean; id: string; code: string; totalAmount: number }>(
    `/api/admin/stock/receipts`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchPurchaseReceipt(id: string): Promise<{
  receipt: PurchaseReceipt;
  movements: (StockMovement & { name_zh: string })[];
}> {
  return request<{
    receipt: PurchaseReceipt;
    movements: (StockMovement & { name_zh: string })[];
  }>(`/api/admin/stock/receipts/${id}`);
}

export async function reversePurchaseReceipt(
  id: string,
  note?: string,
): Promise<{ ok: boolean; code: string; reversedLines: number }> {
  return request<{ ok: boolean; code: string; reversedLines: number }>(
    `/api/admin/stock/receipts/${id}`,
    { method: 'POST', body: JSON.stringify({ action: 'reverse', note }) },
  );
}

// ---------- 盘点单（Stock Take）----------

export interface StockTakeLine {
  id?: string;
  menuItemId: string;
  name_zh?: string;
  name_en?: string;
  name_th?: string;
  bookQty: number;
  actualQty: number;
  diff: number;
}

export interface StockTake {
  id: string;
  code: string;
  note: string | null;
  adminName: string | null;
  createdAt: string;
  lines: StockTakeLine[];
}

export async function fetchStockTakes(): Promise<{ takes: StockTake[] }> {
  return request<{ takes: StockTake[] }>(`/api/admin/stock/stock-takes`);
}

export async function createStockTake(input: {
  lines: { menuItemId: string; actualQty: number }[];
  note?: string | null;
}): Promise<{ ok: boolean; id: string; code: string; lines: StockTakeLine[] }> {
  return request<{
    ok: boolean;
    id: string;
    code: string;
    lines: StockTakeLine[];
  }>(`/api/admin/stock/stock-takes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------- 账实核对 ----------

export interface ReconcileRow {
  itemId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  bookQty: number;
  ledgerQty: number;
  qtyDiff: number;
  bookValue: number;
  ledgerValue: number;
  valueDiff: number;
  avgCost: number;
  entryCount: number;
  ok: boolean;
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  summary: {
    total: number;
    mismatch: number;
    ok: number;
    bookValue: number;
    ledgerValue: number;
  };
}

export async function fetchStockReconcile(): Promise<ReconcileResult> {
  return request<ReconcileResult>(`/api/admin/stock/reconcile`);
}

export async function recalcStock(itemIds?: string[]): Promise<{
  ok: boolean;
  redone: { itemId: string; name_zh: string; fromQty: number; toQty: number }[];
  opened: { itemId: string; name_zh: string; qty: number; avgCost: number }[];
}> {
  return request<{
    ok: boolean;
    redone: { itemId: string; name_zh: string; fromQty: number; toQty: number }[];
    opened: { itemId: string; name_zh: string; qty: number; avgCost: number }[];
  }>(`/api/admin/stock/reconcile`, {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
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
): Promise<{ ok: boolean; stockQty: number | null; stockValue: number | null; avgCost: number | null }> {
  return request<{ ok: boolean; stockQty: number | null; stockValue: number | null; avgCost: number | null }>(
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
): Promise<{ ok: boolean; stockQty: number | null; stockValue: number | null; avgCost: number | null }> {
  return request<{ ok: boolean; stockQty: number | null; stockValue: number | null; avgCost: number | null }>(
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
): Promise<{ ok: boolean; stockQty: number | null; stockValue: number | null; avgCost: number | null }> {
  return request<{ ok: boolean; stockQty: number | null; stockValue: number | null; avgCost: number | null }>(
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
  /** 渔获费合计（已含在 orderRevenue 内） */
  fishRevenue: number;
  /** 渔获总重 kg */
  fishWeightKg: number;
  /** 折扣合计（正数=已减免） */
  discountTotal: number;
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

// ---------- LINE 日报 ----------

export interface LineTargetRow {
  id: string;
  targetId: string;
  targetType: 'USER' | 'GROUP' | 'ROOM';
  displayName: string | null;
  note: string | null;
  isActive: boolean;
  boundAt: string;
  lastSentAt: string | null;
}

export interface LineConfigStatus {
  hasToken: boolean;
  hasSecret: boolean;
  cronSecret: boolean;
}

export interface LineSendOutcome {
  ok: boolean;
  reason?: 'no_token' | 'no_targets';
  message?: string;
  demo: boolean;
  locale: string;
  date: string;
  total: number;
  sent: number;
  failed: number;
  results: {
    targetId: string;
    displayName: string | null;
    ok: boolean;
    status: number;
    detail: string;
  }[];
  preview: string;
}

export async function fetchLineTargets(): Promise<{
  configured: LineConfigStatus;
  targets: LineTargetRow[];
}> {
  return request<{ configured: LineConfigStatus; targets: LineTargetRow[] }>(
    '/api/admin/line',
  );
}

export async function sendLineReport(opts: {
  mode: 'demo' | 'real';
  locale?: 'zh' | 'th' | 'en';
}): Promise<LineSendOutcome> {
  return request<LineSendOutcome>('/api/admin/line', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function unbindLineTarget(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/line?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ---------- 菜品选项（规格 / 面型 / 加料） ----------

export interface ItemOptionsResponse {
  item: {
    id: string;
    name_zh: string;
    name_en: string;
    name_th: string;
    price: number;
  };
  groups: OptionGroupPublic[];
}

/** 后台 — 读取某菜品的选项组 */
export async function fetchItemOptions(itemId: string): Promise<ItemOptionsResponse> {
  return request<ItemOptionsResponse>(`/api/admin/menu/items/${itemId}/options`);
}

/** 后台 — 整体替换某菜品的选项组（未提交的组会被删除） */
export async function saveItemOptions(
  itemId: string,
  groups: OptionGroupInput[],
): Promise<{ ok: boolean; groups: OptionGroupPublic[] }> {
  return request<{ ok: boolean; groups: OptionGroupPublic[] }>(
    `/api/admin/menu/items/${itemId}/options`,
    { method: 'PUT', body: JSON.stringify({ groups }) },
  );
}

/** 后台 — 批量套用选项模板 */
export async function applyOptionTemplate(input: {
  itemIds: string[];
  templateKeys: string[];
  mode?: 'add' | 'replace';
}): Promise<{ ok: boolean; mode: string; items: number; created: number; skipped: number }> {
  return request<{ ok: boolean; mode: string; items: number; created: number; skipped: number }>(
    '/api/admin/menu/options/template',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

// ---------- 本桌账单（堂食后付：顾客看自己这桌点了多少） ----------

export interface TableBillItem {
  id: string;
  menuItemId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  options: OrderLineOption[] | null;
  note: string | null;
}

export interface TableBillOrder {
  id: string;
  orderNumber: string;
  status: string;
  settlementMode: SettlementModeValue;
  createdAt: string;
  pickupAt: string | null;
  subtotal: number;
  fishWeightKg: number;
  fishCharge: number;
  discountAmount: number;
  totalPrice: number;
  note: string | null;
  items: TableBillItem[];
}

export interface TableBill {
  table: {
    id: string;
    code: string;
    name_zh: string;
    name_en: string;
    name_th: string;
    area: string;
  };
  summary: {
    orderCount: number;
    itemCount: number;
    itemSubtotal: number;
    payable: number;
    unsettled: boolean;
  };
  orders: TableBillOrder[];
}

/** 本桌账单；桌号无效或网络异常时返回 null（不打断点餐） */
export async function fetchTableBill(code: string): Promise<TableBill | null> {
  try {
    return await request<TableBill>(`/api/orders/table/${encodeURIComponent(code)}`);
  } catch {
    return null;
  }
}

// ---------- 呼叫服务员 ----------

export type ServiceCallTypeValue = 'ASSISTANCE' | 'WATER' | 'TISSUE' | 'BILL';
export type ServiceCallStatusValue = 'PENDING' | 'ACKNOWLEDGED' | 'DONE';

export interface ServiceCallRow {
  id: string;
  tableId: string | null;
  tableCode: string;
  type: ServiceCallTypeValue;
  status: ServiceCallStatusValue;
  note: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

export async function createServiceCall(input: {
  tableCode: string;
  type?: ServiceCallTypeValue;
  note?: string;
}): Promise<{ call: ServiceCallRow; deduped: boolean }> {
  return request<{ call: ServiceCallRow; deduped: boolean }>('/api/service-calls', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchTableServiceCalls(
  tableCode: string,
): Promise<{ calls: ServiceCallRow[] }> {
  return request<{ calls: ServiceCallRow[] }>(
    `/api/service-calls?tableCode=${encodeURIComponent(tableCode)}`,
  );
}

export async function fetchAdminServiceCalls(): Promise<{
  pending: ServiceCallRow[];
  recent: ServiceCallRow[];
  pendingCount: number;
}> {
  return request<{
    pending: ServiceCallRow[];
    recent: ServiceCallRow[];
    pendingCount: number;
  }>('/api/admin/service-calls');
}

export async function updateServiceCall(
  id: string,
  status: ServiceCallStatusValue,
): Promise<{ ok: boolean; call: ServiceCallRow }> {
  return request<{ ok: boolean; call: ServiceCallRow }>('/api/admin/service-calls', {
    method: 'PATCH',
    body: JSON.stringify({ id, status }),
  });
}
