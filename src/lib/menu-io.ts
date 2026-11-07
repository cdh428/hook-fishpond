import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { translateText } from "@/lib/translate";
import { type MenuTypeValue } from "@/lib/menu-types";
import type { TicketLocale } from "@/lib/ticket-locale";

/* ------------------------------------------------------------------ */
/* 语言上下文                                                          */
/* ------------------------------------------------------------------ */

/**
 * 菜单导入导出的文案出口。
 *
 * ⚠️ 这里**不写任何中文字面量** —— 列名、枚举值、校验错误、变更描述
 * 一律走 `messages/*.json` 的 `menuIo.*`，否则 en/th 页面上传/下载
 * 看到的就是中文。规则见 `docs/playbooks/language-consistency.md`。
 */
export type MenuIoTranslator = (key: string, values?: any) => string;

export interface MenuIoContext {
  locale: TicketLocale;
  t: MenuIoTranslator;
}

/* ------------------------------------------------------------------ */
/* Column definition                                                   */
/* ------------------------------------------------------------------ */

type ColumnKey =
  | "category"
  | "menuType"
  | "name_zh"
  | "name_en"
  | "name_th"
  | "description_zh"
  | "description_en"
  | "description_th"
  | "price"
  | "spiceLevel"
  | "isPopular"
  | "isVegetarian"
  | "isActive"
  | "stockType"
  | "dailyLimit"
  | "costPrice"
  | "targetMargin"
  | "action";

/**
 * 列定义 —— **三语表头的唯一真源**。
 *
 * 导入时三种语言的表头都认（用户在泰文页下载的模板，用英文页上传也能导入）；
 * 导出时按当前页面语言写表头。
 */
export const MENU_COLUMNS: {
  key: ColumnKey;
  required: boolean;
  header: Record<TicketLocale, string>;
}[] = [
  { key: "category", required: true, header: { zh: "分类", en: "Category", th: "หมวดหมู่" } },
  { key: "menuType", required: false, header: { zh: "大类", en: "Type", th: "ประเภท" } },
  { key: "name_zh", required: true, header: { zh: "名称(中文)", en: "Name (ZH)", th: "ชื่อ (ZH)" } },
  { key: "name_en", required: false, header: { zh: "名称(英文)", en: "Name (EN)", th: "ชื่อ (EN)" } },
  { key: "name_th", required: false, header: { zh: "名称(ไทย)", en: "Name (TH)", th: "ชื่อ (TH)" } },
  {
    key: "description_zh",
    required: false,
    header: { zh: "描述(中文)", en: "Description (ZH)", th: "คำอธิบาย (ZH)" },
  },
  {
    key: "description_en",
    required: false,
    header: { zh: "描述(英文)", en: "Description (EN)", th: "คำอธิบาย (EN)" },
  },
  {
    key: "description_th",
    required: false,
    header: { zh: "描述(ไทย)", en: "Description (TH)", th: "คำอธิบาย (TH)" },
  },
  { key: "price", required: true, header: { zh: "价格(THB)", en: "Price (THB)", th: "ราคา (THB)" } },
  { key: "spiceLevel", required: false, header: { zh: "辣度", en: "Spice level", th: "ความเผ็ด" } },
  { key: "isPopular", required: false, header: { zh: "招牌", en: "Signature", th: "เมนูแนะนำ" } },
  { key: "isVegetarian", required: false, header: { zh: "素食", en: "Vegetarian", th: "มังสวิรัติ" } },
  { key: "isActive", required: false, header: { zh: "在售", en: "On sale", th: "เปิดขาย" } },
  { key: "stockType", required: false, header: { zh: "库存类型", en: "Stock type", th: "ประเภทสต็อก" } },
  { key: "dailyLimit", required: false, header: { zh: "每日限量", en: "Daily limit", th: "จำกัดต่อวัน" } },
  { key: "costPrice", required: false, header: { zh: "成本价", en: "Cost price", th: "ราคาทุน" } },
  {
    key: "targetMargin",
    required: false,
    header: { zh: "目标毛利率(%)", en: "Target margin (%)", th: "กำไรเป้าหมาย (%)" },
  },
  { key: "action", required: false, header: { zh: "操作", en: "Action", th: "การดำเนินการ" } },
];

/** 表头归一化：全角括号 → 半角、去空白、小写。三语表头都用它建索引。 */
function normHeader(raw: string): string {
  return String(raw ?? "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 归一化表头 → 列 key（三语通用）。模块级构建一次。 */
const HEADER_INDEX: Map<string, ColumnKey> = (() => {
  const m = new Map<string, ColumnKey>();
  for (const col of MENU_COLUMNS) {
    for (const loc of ["zh", "en", "th"] as TicketLocale[]) {
      m.set(normHeader(col.header[loc]), col.key);
    }
  }
  // 历史别名（老模板可能用过这些写法）
  m.set(normHeader("菜品(中)"), "name_zh");
  m.set(normHeader("菜品(英)"), "name_en");
  m.set(normHeader("菜品(泰)"), "name_th");
  m.set(normHeader("名称"), "name_zh");
  m.set(normHeader("name"), "name_zh");
  return m;
})();

function headerOf(key: ColumnKey, locale: TicketLocale): string {
  return MENU_COLUMNS.find((c) => c.key === key)!.header[locale];
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ImportAction = "ADD" | "UPDATE" | "DELETE" | "ERROR";

export interface MenuImportRow {
  rowNumber: number; // 1-based spreadsheet row (header = 1)
  action: ImportAction;
  category: string; // category name_zh as given in the sheet
  menuType?: MenuTypeValue;
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
  stockType?: "NONE" | "MADE" | "PURCHASED";
  dailyLimit?: number | null;
  costPrice?: number | null;
  targetMargin?: number | null;
  autoTranslated: string[];
  changes: string[];
  error?: string;
}

export type TranslateMode = "translate" | "keep";

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

interface CatRecord {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  type?: string;
  sortOrder: number;
  items: MenuItemRecord[];
}

interface MenuItemRecord {
  id: string;
  categoryId: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  description_zh: string | null;
  description_en: string | null;
  description_th: string | null;
  price: number;
  spiceLevel: number;
  isPopular: boolean;
  isVegetarian: boolean;
  isActive: boolean;
  stockType: string;
  dailyLimit: number | null;
  costPrice: number | null;
  targetMargin: number | null;
  categoryId_ref?: string;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function fmtPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ⚠️ 参数必须容忍 undefined：上传的表里若少了一整列（如删掉「招牌」「素食」
// 「在售」），raw[key] 就是 undefined —— 以前这里直接 v.trim()，会抛
// "Cannot read properties of undefined (reading 'trim')"，
// 让「删掉一列再导入」变成看不懂的内部错误。
function parseBool(v: string | null | undefined): boolean | undefined {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "") return undefined;
  if (["是", "true", "1", "y", "yes", "ใช่", "ใช่ ", "มี"].includes(s)) return true;
  if (["否", "false", "0", "n", "no", "ไม่", "ไม่ใช่", "ไม่มี"].includes(s)) return false;
  return undefined;
}

/** Pick the first non-empty source among zh/en/th and its language. */
function pickSource(
  zh: string,
  en: string,
  th: string,
): { text: string; lang: "zh" | "en" | "th" } | null {
  if (zh && zh.trim()) return { text: zh.trim(), lang: "zh" };
  if (en && en.trim()) return { text: en.trim(), lang: "en" };
  if (th && th.trim()) return { text: th.trim(), lang: "th" };
  return null;
}

/** RFC-4180 CSV quoting. */
export function toCsv(rows: (string | number)[][]): string {
  const escape = (val: string | number): string => {
    const s = val === undefined || val === null ? "" : String(val);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  return rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

export function dateStamp(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // skip
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function xlsxToRows(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("no sheet");
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) arr.push("");
      else if (typeof v === "object" && "text" in (v as any)) arr.push(String((v as any).text ?? ""));
      else if (typeof v === "object" && "result" in (v as any)) arr.push(String((v as any).result ?? ""));
      else arr.push(String(v));
    });
    rows.push(arr);
  });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

export async function buildPreview(
  buffer: Buffer,
  filename: string,
  mode: TranslateMode,
  ctx: MenuIoContext,
): Promise<MenuImportPreview> {
  const { t, locale } = ctx;

  let sheetRows: string[][];
  try {
    if (filename.toLowerCase().endsWith(".csv")) {
      const text = buffer.toString("utf8");
      sheetRows = parseCsv(text);
    } else {
      sheetRows = await xlsxToRows(buffer);
    }
  } catch (e: any) {
    throw new Error(
      t("menuIo.errFileBroken", { msg: e?.message || t("menuIo.errUnknown") }),
    );
  }

  if (!sheetRows.length) {
    throw new Error(t("menuIo.errFileEmpty"));
  }

  // --- header row + mapping（三语表头都认）---
  const headerRow = sheetRows[0];
  const keyForCol: (ColumnKey | null)[] = headerRow.map((h) => {
    return HEADER_INDEX.get(normHeader(String(h ?? ""))) ?? null;
  });

  // required columns must be present
  const missing = MENU_COLUMNS.filter(
    (c) => c.required && !keyForCol.includes(c.key),
  ).map((c) => headerOf(c.key, locale));
  if (missing.length) {
    throw new Error(
      t("menuIo.errMissingColumns", {
        cols: missing.join(locale === "zh" ? "、" : ", "),
      }),
    );
  }

  // --- load DB state once ---
  const categories = (await prisma.menuCategory.findMany({
    include: { items: true },
  })) as unknown as CatRecord[];

  const catByName = new Map<string, CatRecord>();
  const catById = new Map<string, CatRecord>();
  const itemByKey = new Map<string, MenuItemRecord>();
  let maxCatSort = 0;
  for (const c of categories) {
    // 三语名都进索引：用户可能下载英文模板、编辑后在中文页上传，
    // 只认 name_zh 会匹配失败并凭空造出一个重复分类。
    for (const nm of [c.name_zh, c.name_en, c.name_th]) {
      const k = (nm ?? "").trim();
      if (k) catByName.set(k, c);
    }
    catById.set(c.id, c);
    if (c.sortOrder > maxCatSort) maxCatSort = c.sortOrder;
    for (const it of c.items) {
      itemByKey.set(`${c.name_zh.trim()}|${it.name_zh.trim()}`, it as MenuItemRecord);
    }
  }

  const outRows: MenuImportRow[] = [];
  const newCategoriesSet = new Set<string>();

  for (let r = 1; r < sheetRows.length; r++) {
    const raw: Record<string, string> = {};
    keyForCol.forEach((key, ci) => {
      if (!key) return;
      const cell = sheetRows[r][ci];
      raw[key] = cell === undefined || cell === null ? "" : String(cell).trim();
    });

    // skip completely empty rows (e.g. trailing blank rows)
    const allEmpty = Object.values(raw).every((v) => v === "");
    if (allEmpty) continue;

    const category = raw.category || "";
    const name_zh = raw.name_zh || "";
    // mutable name/description fields (so translation can fill them)
    let name_en = raw.name_en || "";
    let name_th = raw.name_th || "";
    let description_zh = raw.description_zh || "";
    let description_en = raw.description_en || "";
    let description_th = raw.description_th || "";

    const errorList: string[] = [];
    let price: number | undefined;
    let spiceLevel: number | undefined;
    let isPopular: boolean | undefined;
    let isVegetarian: boolean | undefined;
    let isActive: boolean | undefined;
    let deleteOp = false;

    // --- row-level validation ---
    if (!category || !name_zh) {
      errorList.push(t("menuIo.errNeedName"));
    }

    const priceRaw = (raw.price ?? "").trim();
    if (priceRaw === "") {
      errorList.push(t("menuIo.errBadPrice"));
    } else {
      // Tolerate a currency symbol, thousands separators and spaces — but do
      // NOT silently turn garbage (e.g. "abc") into 0: stripping every
      // non-numeric char left "" which Number() reads as 0.
      const cleaned = priceRaw.replace(/[,\s฿]/g, "");
      const p = Number(cleaned);
      if (cleaned === "" || !Number.isFinite(p) || p < 0) {
        errorList.push(t("menuIo.errBadPrice"));
      } else {
        price = p;
      }
    }

    const spiceRaw = raw.spiceLevel ?? "";
    if (spiceRaw !== "") {
      const s = Number(spiceRaw);
      if (!Number.isInteger(s) || s < 0 || s > 3) {
        errorList.push(t("menuIo.errBadSpice"));
      } else {
        spiceLevel = s;
      }
    }

    const op = (raw.action ?? "").trim();
    if (op) {
      const opLower = op.toLowerCase();
      // 删除的写法：中文「删除」、英文 delete、泰文 ลบ
      if (
        op === "删除" ||
        op === "ลบ" ||
        opLower === "delete" ||
        opLower === "del"
      ) {
        deleteOp = true;
      } else {
        errorList.push(t("menuIo.errBadAction"));
      }
    }

    isPopular = parseBool(raw.isPopular);
    isVegetarian = parseBool(raw.isVegetarian);
    isActive = parseBool(raw.isActive);

    // --- 大类（只在"新建分类"时生效；已存在的分类不会被改）---
    let menuType: MenuTypeValue | undefined;
    const menuTypeRaw = (raw.menuType ?? "").trim();
    if (menuTypeRaw !== "") {
      const norm = menuTypeRaw.toLowerCase();
      if (["美食", "食品", "food", "อาหาร"].includes(norm)) menuType = "FOOD";
      else if (["饮品", "饮料", "drink", "drinks", "เครื่องดื่ม"].includes(norm))
        menuType = "DRINK";
      else if (
        ["钓具", "工具", "用具", "tackle", "tool", "tools", "อุปกรณ์ตกปลา", "อุปกรณ์"].includes(norm)
      )
        menuType = "TOOL";
      else errorList.push(t("menuIo.errBadMenuType"));
    }

    // --- stock columns ---
    let stockType: "NONE" | "MADE" | "PURCHASED" | undefined;
    const stockTypeRaw = (raw.stockType ?? "").trim();
    if (stockTypeRaw !== "") {
      const normStock = stockTypeRaw.toLowerCase();
      if (["自制", "made", "ทำเอง"].includes(normStock)) {
        stockType = "MADE";
      } else if (
        ["外购", "purchased", "ซื้อมา", "purchase"].includes(normStock)
      ) {
        stockType = "PURCHASED";
      } else if (
        ["不管理", "none", "not tracked", "not_tracked", "ไม่จัดการ", "ไม่"].includes(normStock)
      ) {
        stockType = "NONE";
      } else {
        errorList.push(t("menuIo.errBadStockType"));
      }
    }

    let dailyLimit: number | null | undefined;
    const dailyLimitRaw = (raw.dailyLimit ?? "").trim();
    if (dailyLimitRaw !== "") {
      const n = Number(dailyLimitRaw);
      if (!Number.isInteger(n) || n < 0) {
        errorList.push(t("menuIo.errBadDailyLimit"));
      } else {
        dailyLimit = n;
      }
    }

    // --- cost / margin columns（成本价用于算毛利；目标毛利率表格里填百分数） ---
    let costPrice: number | null | undefined;
    const costRaw = (raw.costPrice ?? "").trim();
    if (costRaw !== "") {
      const cleaned = costRaw.replace(/[,\s฿]/g, "");
      const n = Number(cleaned);
      if (cleaned === "" || !Number.isFinite(n) || n < 0) {
        errorList.push(t("menuIo.errBadCost"));
      } else {
        costPrice = n;
      }
    }

    let targetMargin: number | null | undefined;
    const marginRaw = (raw.targetMargin ?? "").trim();
    if (marginRaw !== "") {
      const cleaned = marginRaw.replace(/[%\s]/g, "");
      const n = Number(cleaned);
      if (cleaned === "" || !Number.isFinite(n) || n < 0 || n > 100) {
        errorList.push(t("menuIo.errBadMargin"));
      } else {
        targetMargin = n / 100;
      }
    }

    // base action（分类列可能写的是英文/泰文名，先归一到 name_zh 再查菜品）
    const categoryRecord = catByName.get(category.trim());
    const matchCatKey = categoryRecord?.name_zh.trim() ?? category.trim();
    const matchedItem = itemByKey.get(`${matchCatKey}|${name_zh.trim()}`);
    let action: ImportAction;
    if (errorList.length) {
      action = "ERROR";
    } else if (deleteOp) {
      if (matchedItem) {
        action = "DELETE";
      } else {
        // Marking a row for deletion that doesn't exist must never silently
        // CREATE it — surface it as a skipped row instead.
        action = "ERROR";
        errorList.push(t("menuIo.errDeleteNotFound"));
      }
    } else if (matchedItem) {
      action = "UPDATE";
    } else {
      action = "ADD";
    }

    const categoryId = categoryRecord?.id;

    // newCategories: ADD rows whose category is not in the DB
    if (action !== "ERROR" && !categoryRecord && category.trim()) {
      newCategoriesSet.add(category.trim());
    }

    const autoTranslated: string[] = [];
    const changes: string[] = [];
    let errorMsg: string | undefined;

    const valYes = t("menuIo.valYes");
    const valNo = t("menuIo.valNo");
    const stockLabel = (v: string | null | undefined) => {
      if (v === "MADE") return t("menuIo.valStockMade");
      if (v === "PURCHASED") return t("menuIo.valStockPurchased");
      return t("menuIo.valStockNone");
    };
    const boolLabel = (b: boolean) => (b ? valYes : valNo);

    // --- translation ---
    if (mode === "translate" && action !== "ERROR") {
      // Names group
      const nameSource = pickSource(name_zh, name_en, name_th);
      if (nameSource) {
        const targets: { field: "name_en" | "name_th"; lang: "en" | "th" }[] = [
          { field: "name_en", lang: "en" },
          { field: "name_th", lang: "th" },
        ];
        for (const tg of targets) {
          if (tg.lang === nameSource.lang) continue;
          const current = tg.field === "name_en" ? name_en : name_th;
          if (!current) {
            const res = await translateText(nameSource.text, nameSource.lang, tg.lang);
            if (res) {
              if (tg.field === "name_en") name_en = res;
              else name_th = res;
              autoTranslated.push(tg.field);
            }
          }
        }
      }

      // Descriptions group (only if at least one description is non-empty)
      const anyDesc = Boolean(description_zh || description_en || description_th);
      if (anyDesc) {
        const descSource = pickSource(description_zh, description_en, description_th);
        if (descSource) {
          const targets: { field: "description_en" | "description_th"; lang: "en" | "th" }[] = [
            { field: "description_en", lang: "en" },
            { field: "description_th", lang: "th" },
          ];
          for (const tg of targets) {
            if (tg.lang === descSource.lang) continue;
            const current = tg.field === "description_en" ? description_en : description_th;
            if (!current) {
              const res = await translateText(descSource.text, descSource.lang, tg.lang);
              if (res) {
                if (tg.field === "description_en") description_en = res;
                else description_th = res;
                autoTranslated.push(tg.field);
              }
            }
          }
        }
      }

      // Translation failure handling
      if (action === "ADD") {
        if (!name_en || !name_th) {
          action = "ERROR";
          errorList.push(t("menuIo.errNoOtherLang"));
        }
      } else if (action === "UPDATE") {
        // leave the field blank; note it in changes
        if (!name_en) changes.push(t("menuIo.warnTransEn"));
        if (!name_th) changes.push(t("menuIo.warnTransTh"));
      }
    }

    // --- UPDATE diff (after translation) ---
    if (action === "UPDATE" && matchedItem) {
      if (price !== undefined && price !== matchedItem.price) {
        changes.push(
          t("menuIo.diffPrice", { from: fmtPrice(matchedItem.price), to: fmtPrice(price) }),
        );
      }
      if (name_zh && name_zh !== matchedItem.name_zh) {
        changes.push(t("menuIo.diffNameZh", { from: matchedItem.name_zh, to: name_zh }));
      }
      if (name_en && name_en !== matchedItem.name_en) {
        changes.push(t("menuIo.diffNameEn", { from: matchedItem.name_en, to: name_en }));
      }
      if (name_th && name_th !== matchedItem.name_th) {
        changes.push(t("menuIo.diffNameTh", { from: matchedItem.name_th, to: name_th }));
      }
      if (description_zh && description_zh !== (matchedItem.description_zh ?? "")) {
        changes.push(t("menuIo.diffDescZh"));
      }
      if (description_en && description_en !== (matchedItem.description_en ?? "")) {
        changes.push(t("menuIo.diffDescEn"));
      }
      if (description_th && description_th !== (matchedItem.description_th ?? "")) {
        changes.push(t("menuIo.diffDescTh"));
      }
      if (spiceLevel !== undefined && spiceLevel !== matchedItem.spiceLevel) {
        changes.push(t("menuIo.diffSpice", { from: matchedItem.spiceLevel, to: spiceLevel }));
      }
      if (isPopular !== undefined && isPopular !== matchedItem.isPopular) {
        changes.push(
          t("menuIo.diffPopular", {
            from: boolLabel(matchedItem.isPopular),
            to: boolLabel(isPopular),
          }),
        );
      }
      if (isVegetarian !== undefined && isVegetarian !== matchedItem.isVegetarian) {
        changes.push(
          t("menuIo.diffVegetarian", {
            from: boolLabel(matchedItem.isVegetarian),
            to: boolLabel(isVegetarian),
          }),
        );
      }
      if (isActive !== undefined && isActive !== matchedItem.isActive) {
        changes.push(
          t("menuIo.diffActive", {
            from: boolLabel(matchedItem.isActive),
            to: boolLabel(isActive),
          }),
        );
      }
      if (stockType !== undefined && stockType !== matchedItem.stockType) {
        changes.push(
          t("menuIo.diffStockType", {
            from: stockLabel(matchedItem.stockType),
            to: stockLabel(stockType),
          }),
        );
      }
      if (dailyLimit !== undefined && dailyLimit !== (matchedItem.dailyLimit ?? null)) {
        changes.push(t("menuIo.diffDailyLimit", { value: dailyLimit }));
      }
      if (
        costPrice !== undefined &&
        costPrice !== null &&
        costPrice !== (matchedItem.costPrice ?? null)
      ) {
        changes.push(
          t("menuIo.diffCostPrice", {
            from:
              matchedItem.costPrice == null
                ? t("menuIo.notSet")
                : "฿" + fmtPrice(matchedItem.costPrice),
            to: "฿" + fmtPrice(costPrice),
          }),
        );
      }
      if (
        targetMargin !== undefined &&
        targetMargin !== null &&
        targetMargin !== (matchedItem.targetMargin ?? null)
      ) {
        changes.push(
          t("menuIo.diffTargetMargin", {
            from:
              matchedItem.targetMargin == null
                ? t("menuIo.isDefault")
                : Math.round(matchedItem.targetMargin * 100) + "%",
            to: Math.round(targetMargin * 100) + "%",
          }),
        );
      }
      const catName = catById.get(matchedItem.categoryId)?.name_zh;
      if (catName && category && category !== catName) {
        changes.push(t("menuIo.diffCategory", { from: catName, to: category }));
      }
    }

    if (errorList.length) {
      errorMsg = errorList[0];
    }

    const row: MenuImportRow = {
      rowNumber: r + 1, // header is spreadsheet row 1
      action,
      category,
      menuType,
      categoryId,
      itemId: matchedItem?.id,
      name_zh,
      name_en,
      name_th,
      description_zh: description_zh || undefined,
      description_en: description_en || undefined,
      description_th: description_th || undefined,
      price,
      spiceLevel,
      isPopular,
      isVegetarian,
      isActive,
      stockType,
      dailyLimit,
      costPrice,
      targetMargin,
      autoTranslated,
      changes,
      error: errorMsg,
    };
    outRows.push(row);
  }

  const summary = {
    total: outRows.length,
    add: outRows.filter((r) => r.action === "ADD").length,
    update: outRows.filter((r) => r.action === "UPDATE").length,
    delete: outRows.filter((r) => r.action === "DELETE").length,
    error: outRows.filter((r) => r.action === "ERROR").length,
    translated: outRows.filter((r) => r.autoTranslated.length > 0).length,
  };

  return { summary, rows: outRows, newCategories: Array.from(newCategoriesSet) };
}

/* ------------------------------------------------------------------ */
/* Export / template rows                                              */
/* ------------------------------------------------------------------ */

export function buildExportRows(
  items: ({
    category: {
      name_zh: string;
      name_en?: string | null;
      name_th?: string | null;
      type?: string;
    };
  } & Record<string, any>)[],
  ctx: MenuIoContext,
): (string | number)[][] {
  const { t, locale } = ctx;
  const valYes = t("menuIo.valYes");
  const valNo = t("menuIo.valNo");

  // 分类名也按当前语言输出 —— 分类表本来就有三语字段，导出中文名会让
  // 英文/泰文用户看不懂。导入端已能识别三语分类名，可以原样导回。
  const catName = (c: any): string => {
    if (!c) return "";
    if (locale === "en") return c.name_en || c.name_zh || "";
    if (locale === "th") return c.name_th || c.name_zh || "";
    return c.name_zh || c.name_en || "";
  };

  const rows: (string | number)[][] = [];
  rows.push(MENU_COLUMNS.map((c) => headerOf(c.key, locale)));
  for (const item of items) {
    const line: (string | number)[] = [];
    for (const col of MENU_COLUMNS) {
      switch (col.key) {
        case "category":
          line.push(catName(item.category));
          break;
        case "menuType": {
          const ty = item.category?.type;
          line.push(
            ty === "DRINK"
              ? t("menuIo.valTypeDrink")
              : ty === "TOOL"
                ? t("menuIo.valTypeTool")
                : t("menuIo.valTypeFood"),
          );
          break;
        }
        case "name_zh":
          line.push(item.name_zh ?? "");
          break;
        case "name_en":
          line.push(item.name_en ?? "");
          break;
        case "name_th":
          line.push(item.name_th ?? "");
          break;
        case "description_zh":
          line.push(item.description_zh ?? "");
          break;
        case "description_en":
          line.push(item.description_en ?? "");
          break;
        case "description_th":
          line.push(item.description_th ?? "");
          break;
        case "price":
          line.push(item.price ?? 0);
          break;
        case "spiceLevel":
          line.push(item.spiceLevel ?? 0);
          break;
        case "isPopular":
          line.push(item.isPopular ? valYes : valNo);
          break;
        case "isVegetarian":
          line.push(item.isVegetarian ? valYes : valNo);
          break;
        case "isActive":
          line.push(item.isActive ? valYes : valNo);
          break;
        case "stockType":
          line.push(
            item.stockType === "MADE"
              ? t("menuIo.valStockMade")
              : item.stockType === "PURCHASED"
                ? t("menuIo.valStockPurchased")
                : t("menuIo.valStockNone"),
          );
          break;
        case "dailyLimit":
          line.push(item.dailyLimit ?? "");
          break;
        case "costPrice":
          line.push(item.costPrice ?? "");
          break;
        case "targetMargin":
          line.push(
            item.targetMargin == null ? "" : Math.round(item.targetMargin * 100),
          );
          break;
        case "action":
          line.push("");
          break;
        default:
          line.push("");
      }
    }
    rows.push(line);
  }
  return rows;
}

export function buildTemplateRows(ctx: MenuIoContext): (string | number)[][] {
  const { t, locale } = ctx;
  const rows: (string | number)[][] = [];
  rows.push(MENU_COLUMNS.map((c) => headerOf(c.key, locale)));

  // 示例行按当前语言给，让用户照着改
  const sample =
    locale === "th"
      ? {
          cat: "อาหารจานเดียว",
          type: t("menuIo.valTypeFood"),
          zh: "泰式打抛饭",
          en: "Pad Krapow Rice",
          th: "ข้าวผัดกะเพรา",
          descZh: "香辣下饭",
          descEn: "Spicy basil rice",
          descTh: "ข้าวผัดกะเพรากับไข่ดาว",
        }
      : locale === "en"
        ? {
            cat: "Main",
            type: t("menuIo.valTypeFood"),
            zh: "泰式打抛饭",
            en: "Pad Krapow Rice",
            th: "ข้าวผัดกะเพรา",
            descZh: "香辣下饭",
            descEn: "Spicy basil rice",
            descTh: "ข้าวผัดกะเพรากับไข่ดาว",
          }
        : {
            cat: "主食",
            type: t("menuIo.valTypeFood"),
            zh: "泰式打抛饭",
            en: "Pad Krapow Rice",
            th: "ข้าวผัดกะเพรา",
            descZh: "香辣下饭",
            descEn: "Spicy basil rice",
            descTh: "ข้าวผัดกะเพรากับไข่ดาว",
          };

  rows.push([
    sample.cat,
    sample.type,
    sample.zh,
    sample.en,
    sample.th,
    sample.descZh,
    sample.descEn,
    sample.descTh,
    80,
    1,
    t("menuIo.valYes"),
    t("menuIo.valNo"),
    t("menuIo.valYes"),
    "",
    "",
    26,
    60,
    "",
  ]);
  return rows;
}
