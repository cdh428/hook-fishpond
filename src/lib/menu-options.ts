/**
 * 菜品选项（规格 / 面型 / 加料）核心逻辑 —— 纯函数，前后端共用。
 *
 * 本文件**不得**引入 prisma 或任何 node 专属依赖：
 * 顾客端选项面板与后台编辑器都要直接 import 它。
 * 需要读库的部分放在 `menu-options-server.ts`。
 *
 * ## 三条口径
 *  1. 选项只改「单价」，不改「库存口径」——扣库存永远按菜品自身数量。
 *  2. 加价在**服务端**重算，前端传来的价格一律不信任。
 *  3. 下单时把选项的**三语名称与加价快照**存进订单行；
 *     选项日后改名或删除，历史订单仍如实还原。
 */

export type OptionSelectionTypeValue = 'SINGLE' | 'MULTI';

export interface OptionPublic {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  priceDelta: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface OptionGroupPublic {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  selectionType: OptionSelectionTypeValue;
  isRequired: boolean;
  maxSelect: number | null;
  sortOrder: number;
  options: OptionPublic[];
}

/** 订单行里保存的选项快照（一条 = 勾中的一个选项） */
export interface OrderLineOption {
  groupId: string;
  groupName_zh: string;
  groupName_en: string;
  groupName_th: string;
  optionId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  priceDelta: number;
}

/** 后台提交的选项组结构（新建时 id 可缺省） */
export interface OptionGroupInput {
  id?: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  selectionType: OptionSelectionTypeValue;
  isRequired: boolean;
  maxSelect: number | null;
  sortOrder?: number;
  isActive?: boolean;
  options: {
    id?: string;
    name_zh: string;
    name_en: string;
    name_th: string;
    priceDelta: number;
    isDefault: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }[];
}

// ---------------------------------------------------------------- 行匹配键

/**
 * 行匹配键 = menuItemId + '|' + 升序 optionId 列表。
 *
 * 后台改单必须靠它区分「同菜品不同规格」的独立行，
 * 只按 menuItemId 匹配会把「加大蛋面」和「标准米粉」当成同一行。
 */
export function makeOptionKey(menuItemId: string, optionIds: string[] = []): string {
  return `${menuItemId}|${[...optionIds].sort().join(',')}`;
}

/** 历史数据 optionKey 为 NULL，一律视为「无选项行」 */
export function normalizeOptionKey(
  optionKey: string | null | undefined,
  menuItemId: string,
): string {
  return optionKey && optionKey.length > 0 ? optionKey : makeOptionKey(menuItemId, []);
}

/** 该行是否带选项（用于界面判断要不要展开显示规格） */
export function hasOptions(
  line: { options?: unknown; optionKey?: string | null; menuItemId?: string } | null | undefined,
): boolean {
  if (!line) return false;
  if (Array.isArray(line.options) && line.options.length > 0) return true;
  const key = line.optionKey;
  if (!key || !line.menuItemId) return false;
  return key !== makeOptionKey(line.menuItemId, []);
}

// ---------------------------------------------------------------- 校验与快照

export type OptionValidationError =
  | 'UNKNOWN_OPTION'
  | 'REQUIRED_MISSING'
  | 'TOO_MANY'
  | 'SINGLE_ONLY';

export interface OptionValidationResult {
  ok: boolean;
  error?: OptionValidationError;
  /** 出错的选项组名（用于给顾客/管理员看人话） */
  groupName?: string;
  /** 加价合计 */
  delta: number;
  /** 勾选的 optionId（含自动补上的默认项，升序） */
  optionIds: string[];
  /** 订单行快照 */
  snapshot: OrderLineOption[];
}

const activeGroups = (groups: OptionGroupPublic[] | undefined | null) =>
  (groups ?? [])
    .filter((g) => g && (g as any).isActive !== false && Array.isArray(g.options))
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

/**
 * 校验顾客提交的选项，并生成订单行快照。
 *
 * 必选组没勾时会**自动补上默认项**（顾客端正常不会走到这里，
 * 但后台改单 / 老客户端调用时能少一次报错）。
 */
export function validateOptionSelection(
  groups: OptionGroupPublic[] | undefined | null,
  selectedIds: string[] | undefined | null,
): OptionValidationResult {
  const gs = activeGroups(groups);
  const index = new Map<string, { group: OptionGroupPublic; option: OptionPublic }>();
  for (const g of gs) {
    for (const o of g.options) {
      if ((o as any).isActive === false) continue;
      index.set(o.id, { group: g, option: o });
    }
  }

  const requested: string[] = [];
  for (const id of selectedIds ?? []) {
    if (typeof id !== 'string' || id.length === 0) continue;
    if (!index.has(id)) {
      return { ok: false, error: 'UNKNOWN_OPTION', delta: 0, optionIds: [], snapshot: [] };
    }
    if (!requested.includes(id)) requested.push(id);
  }

  const chosen: { group: OptionGroupPublic; option: OptionPublic }[] = [];
  const perGroup = new Map<string, string[]>();

  for (const g of gs) {
    const ids = requested.filter((id) => index.get(id)!.group.id === g.id);
    let take = ids;

    if (take.length === 0 && g.isRequired) {
      const fallback = g.options.find((o) => o.isDefault && (o as any).isActive !== false);
      if (!fallback) {
        return {
          ok: false,
          error: 'REQUIRED_MISSING',
          groupName: g.name_zh,
          delta: 0,
          optionIds: [],
          snapshot: [],
        };
      }
      take = [fallback.id];
    }

    if (take.length > 1 && g.selectionType === 'SINGLE') {
      return {
        ok: false,
        error: 'SINGLE_ONLY',
        groupName: g.name_zh,
        delta: 0,
        optionIds: [],
        snapshot: [],
      };
    }
    if (g.maxSelect != null && take.length > g.maxSelect) {
      return {
        ok: false,
        error: 'TOO_MANY',
        groupName: g.name_zh,
        delta: 0,
        optionIds: [],
        snapshot: [],
      };
    }

    perGroup.set(g.id, take);
    for (const id of take) chosen.push({ group: g, option: index.get(id)!.option });
  }

  const delta = round2(chosen.reduce((s, c) => s + (Number(c.option.priceDelta) || 0), 0));

  const snapshot: OrderLineOption[] = chosen.map((c) => ({
    groupId: c.group.id,
    groupName_zh: c.group.name_zh,
    groupName_en: c.group.name_en,
    groupName_th: c.group.name_th,
    optionId: c.option.id,
    name_zh: c.option.name_zh,
    name_en: c.option.name_en,
    name_th: c.option.name_th,
    priceDelta: Number(c.option.priceDelta) || 0,
  }));

  const optionIds = chosen
    .map((c) => c.option.id)
    .sort((a, b) => a.localeCompare(b));

  return { ok: true, delta, optionIds, snapshot };
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 快照加价合计 */
export function optionDeltaTotal(snapshot: OrderLineOption[] | null | undefined): number {
  return round2((snapshot ?? []).reduce((s, o) => s + (Number(o.priceDelta) || 0), 0));
}

// ---------------------------------------------------------------- 展示

const pick = <T extends Record<string, any>>(row: T, locale: string, field: string) => {
  if (!row) return '';
  if (locale === 'en') return row[`${field}_en`] || row[`${field}_zh`] || '';
  if (locale === 'th') return row[`${field}_th`] || row[`${field}_zh`] || '';
  return row[`${field}_zh`] || row[`${field}_en`] || '';
};

export const optionName = (o: OrderLineOption, locale: string) => pick(o, locale, 'name');
export const optionGroupName = (o: OrderLineOption, locale: string) => pick(o, locale, 'groupName');

/**
 * 把订单行选项渲染成一行行可读文本，例如：
 *   ['份量：加大 (+฿10)', '面型：蛋面', '加料：加煎蛋 (+฿10)']
 * 小票、订单详情、后台改单都用它，保证三处口径一致。
 */
export function formatLineOptions(
  snapshot: OrderLineOption[] | null | undefined,
  locale: string,
  money: (n: number) => string = (n) => `฿${n}`,
): string[] {
  const list = snapshot ?? [];
  if (list.length === 0) return [];

  const byGroup = new Map<string, { name: string; items: OrderLineOption[] }>();
  for (const o of list) {
    const g: { name: string; items: OrderLineOption[] } = byGroup.get(o.groupId) ?? {
      name: optionGroupName(o, locale),
      items: [],
    };
    g.items.push(o);
    byGroup.set(o.groupId, g);
  }

  const out: string[] = [];
  for (const { name, items } of byGroup.values()) {
    const parts = items.map((o) => {
      const d = Number(o.priceDelta) || 0;
      return d !== 0
        ? `${optionName(o, locale)} (${d > 0 ? '+' : '−'}${money(Math.abs(d))})`
        : optionName(o, locale);
    });
    out.push(name ? `${name}: ${parts.join(' / ')}` : parts.join(' / '));
  }
  return out;
}

/** 不含组长前缀的紧凑写法（小票后厨单用，省纸） */
export function formatLineOptionsCompact(
  snapshot: OrderLineOption[] | null | undefined,
  locale: string,
): string[] {
  return (snapshot ?? []).map((o) => {
    const d = Number(o.priceDelta) || 0;
    const n = optionName(o, locale);
    return d !== 0 ? `${n} ${d > 0 ? '+' : '−'}${Math.abs(d)}฿` : n;
  });
}

// ---------------------------------------------------------------- 常用模板

export interface OptionTemplateOption {
  name_zh: string;
  name_en: string;
  name_th: string;
  priceDelta: number;
  isDefault?: boolean;
}

export interface OptionTemplate {
  key: string;
  icon: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  selectionType: OptionSelectionTypeValue;
  isRequired: boolean;
  maxSelect: number | null;
  /** 建议用在哪些分类（仅作后台提示，不强制） */
  hint_zh: string;
  options: OptionTemplateOption[];
}

/**
 * 内置选项模板 —— 后台「套用模板」用，避免每个菜从零敲一遍。
 * 加价都是可改的初始值；份量/加料的价目各店不同，套用后自行调整。
 */
export const OPTION_TEMPLATES: OptionTemplate[] = [
  {
    key: 'portion',
    icon: '🍜',
    name_zh: '份量',
    name_en: 'Portion',
    name_th: 'ขนาด',
    selectionType: 'SINGLE',
    isRequired: true,
    maxSelect: 1,
    hint_zh: '粉面饭类必备',
    options: [
      { name_zh: '标准', name_en: 'Standard', name_th: 'ปกติ', priceDelta: 0, isDefault: true },
      { name_zh: '加大', name_en: 'Large', name_th: 'พิเศษ', priceDelta: 10 },
      { name_zh: '小份', name_en: 'Small', name_th: 'เล็ก', priceDelta: -10 },
    ],
  },
  {
    key: 'noodle',
    icon: '🥢',
    name_zh: '面型',
    name_en: 'Noodle type',
    name_th: 'ชนิดเส้น',
    selectionType: 'SINGLE',
    isRequired: true,
    maxSelect: 1,
    hint_zh: '汤面粉面专用',
    options: [
      { name_zh: '蛋面', name_en: 'Egg noodle', name_th: 'บะหมี่ไข่', priceDelta: 0, isDefault: true },
      { name_zh: '米粉', name_en: 'Rice noodle', name_th: 'เส้นเล็ก', priceDelta: 0 },
      { name_zh: '河粉', name_en: 'Flat noodle', name_th: 'เส้นใหญ่', priceDelta: 0 },
      { name_zh: '黄面', name_en: 'Yellow noodle', name_th: 'บะหมี่เหลือง', priceDelta: 0 },
      { name_zh: '方便面', name_en: 'Instant noodle', name_th: 'มาม่า', priceDelta: 0 },
      { name_zh: '粉丝', name_en: 'Glass noodle', name_th: 'วุ้นเส้น', priceDelta: 0 },
    ],
  },
  {
    key: 'addon-noodle',
    icon: '🥚',
    name_zh: '加料',
    name_en: 'Add-ons',
    name_th: 'เพิ่ม topping',
    selectionType: 'MULTI',
    isRequired: false,
    maxSelect: null,
    hint_zh: '粉面饭类可选加料',
    options: [
      { name_zh: '加煎蛋', name_en: 'Fried egg', name_th: 'ไข่ดาว', priceDelta: 10 },
      { name_zh: '荷包蛋', name_en: 'Poached egg', name_th: 'ไข่ต้มยางมะตูม', priceDelta: 10 },
      { name_zh: '加肉片', name_en: 'Extra pork', name_th: 'เพิ่มหมู', priceDelta: 20 },
      { name_zh: '加鱼丸', name_en: 'Extra fish ball', name_th: 'เพิ่มลูกชิ้นปลา', priceDelta: 20 },
      { name_zh: '加蔬菜', name_en: 'Extra vegetables', name_th: 'เพิ่มผัก', priceDelta: 10 },
      { name_zh: '加饭', name_en: 'Extra rice', name_th: 'เพิ่มข้าว', priceDelta: 10 },
    ],
  },
  {
    key: 'spice',
    icon: '🌶️',
    name_zh: '辣度',
    name_en: 'Spice level',
    name_th: 'ระดับความเผ็ด',
    selectionType: 'SINGLE',
    isRequired: true,
    maxSelect: 1,
    hint_zh: '辣菜 / 泰式菜共用',
    options: [
      { name_zh: '不辣', name_en: 'Not spicy', name_th: 'ไม่เผ็ด', priceDelta: 0 },
      { name_zh: '微辣', name_en: 'Mild', name_th: 'เผ็ดน้อย', priceDelta: 0 },
      { name_zh: '中辣（原味）', name_en: 'Medium (house)', name_th: 'เผ็ดกลาง', priceDelta: 0, isDefault: true },
      { name_zh: '特辣', name_en: 'Thai spicy', name_th: 'เผ็ดมาก', priceDelta: 0 },
    ],
  },
  {
    key: 'ice',
    icon: '🧊',
    name_zh: '冰量',
    name_en: 'Ice',
    name_th: 'น้ำแข็ง',
    selectionType: 'SINGLE',
    isRequired: true,
    maxSelect: 1,
    hint_zh: '冷饮 / 啤酒',
    options: [
      { name_zh: '正常冰', name_en: 'Regular ice', name_th: 'น้ำแข็งปกติ', priceDelta: 0, isDefault: true },
      { name_zh: '少冰', name_en: 'Less ice', name_th: 'น้ำแข็งน้อย', priceDelta: 0 },
      { name_zh: '去冰', name_en: 'No ice', name_th: 'ไม่ใส่น้ำแข็ง', priceDelta: 0 },
      { name_zh: '热饮', name_en: 'Hot', name_th: 'ร้อน', priceDelta: 0 },
    ],
  },
  {
    key: 'sweet',
    icon: '🍯',
    name_zh: '甜度',
    name_en: 'Sweetness',
    name_th: 'ระดับความหวาน',
    selectionType: 'SINGLE',
    isRequired: false,
    maxSelect: 1,
    hint_zh: '咖啡 / 茶 / 果汁',
    options: [
      { name_zh: '正常糖', name_en: 'Regular', name_th: 'หวานปกติ', priceDelta: 0, isDefault: true },
      { name_zh: '半糖', name_en: 'Half sugar', name_th: 'หวานครึ่ง', priceDelta: 0 },
      { name_zh: '少糖', name_en: 'Less sugar', name_th: 'หวานน้อย', priceDelta: 0 },
      { name_zh: '无糖', name_en: 'No sugar', name_th: 'ไม่หวาน', priceDelta: 0 },
    ],
  },
  {
    key: 'serveware',
    icon: '🍽️',
    name_zh: '餐具 / 打包',
    name_en: 'Utensils & packing',
    name_th: 'อุปกรณ์ / ใส่กล่อง',
    selectionType: 'SINGLE',
    isRequired: false,
    maxSelect: 1,
    hint_zh: '外带单建议加上',
    options: [
      { name_zh: '堂食餐具', name_en: 'Dine-in utensils', name_th: 'ทานที่ร้าน', priceDelta: 0, isDefault: true },
      { name_zh: '打包盒', name_en: 'Takeaway box', name_th: 'ใส่กล่อง', priceDelta: 0 },
      { name_zh: '分装', name_en: 'Pack separately', name_th: 'แยกกล่อง', priceDelta: 0 },
      { name_zh: '不需要餐具', name_en: 'No utensils', name_th: 'ไม่ต้องใช้อุปกรณ์', priceDelta: 0 },
    ],
  },
];

export function findTemplate(key: string): OptionTemplate | undefined {
  return OPTION_TEMPLATES.find((t) => t.key === key);
}

/** 根据菜品所属分类名，猜一组推荐模板（后台新建菜品时预勾） */
export function suggestTemplateKeys(categoryName: string): string[] {
  const n = categoryName || '';
  if (/面|粉|汤|饭|noodle|rice|soup/i.test(n)) return ['portion', 'noodle', 'addon-noodle'];
  if (/饮|茶|果汁|水|drink|tea|juice/i.test(n)) return ['ice', 'sweet'];
  if (/啤酒|酒|beer|wine/i.test(n)) return ['ice'];
  if (/烧烤|炸|grill|fry/i.test(n)) return ['spice'];
  return [];
}

// ---------------------------------------------------------------- 备注快捷标签

/**
 * 特别需求快捷标签 —— 顾客点一下就进备注，也可以自己打字。
 * 这些是**纯前端常量**，不入库；目的只是让顾客少打字、后厨读得懂。
 */
export const QUICK_NOTES: { zh: string; en: string; th: string }[] = [
  { zh: '不要香菜', en: 'No coriander', th: 'ไม่ใส่ผักชี' },
  { zh: '不要葱', en: 'No spring onion', th: 'ไม่ใส่ต้นหอม' },
  { zh: '不要蒜', en: 'No garlic', th: 'ไม่ใส่กระเทียม' },
  { zh: '少盐', en: 'Less salt', th: 'ลดเค็ม' },
  { zh: '少油', en: 'Less oil', th: 'ลดน้ำมัน' },
  { zh: '不放味精', en: 'No MSG', th: 'ไม่ใส่ผงชูรส' },
  { zh: '不要辣', en: 'Not spicy', th: 'ไม่เผ็ด' },
  { zh: '分开放', en: 'Separate containers', th: 'แยกกล่อง' },
];

export function quickNoteLabel(note: { zh: string; en: string; th: string }, locale: string): string {
  if (locale === 'en') return note.en;
  if (locale === 'th') return note.th;
  return note.zh;
}

/** 把已选标签与手打文字合成最终备注（去重、限长） */
export function composeNote(chips: string[], typed: string): string {
  const parts: string[] = [];
  for (const c of chips) {
    const v = c.trim();
    if (v && !parts.includes(v)) parts.push(v);
  }
  const manual = (typed || '').trim();
  if (manual) parts.push(manual);
  return parts.join('；').slice(0, 200);
}
