import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { translateText } from "@/lib/translate";

/* ------------------------------------------------------------------ */
/* Column definition                                                   */
/* ------------------------------------------------------------------ */

export const MENU_COLUMNS: { key: string; header: string; required: boolean }[] = [
  { key: "category", header: "分类", required: true },
  { key: "name_zh", header: "名称(中文)", required: true },
  { key: "name_en", header: "名称(英文)", required: false },
  { key: "name_th", header: "名称(ไทย)", required: false },
  { key: "description_zh", header: "描述(中文)", required: false },
  { key: "description_en", header: "描述(英文)", required: false },
  { key: "description_th", header: "描述(ไทย)", required: false },
  { key: "price", header: "价格(THB)", required: true },
  { key: "spiceLevel", header: "辣度", required: false },
  { key: "isPopular", header: "招牌", required: false },
  { key: "isVegetarian", header: "素食", required: false },
  { key: "isActive", header: "在售", required: false },
  { key: "stockType", header: "库存类型", required: false },
  { key: "dailyLimit", header: "每日限量", required: false },
  { key: "action", header: "操作", required: false },
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ImportAction = "ADD" | "UPDATE" | "DELETE" | "ERROR";

export interface MenuImportRow {
  rowNumber: number; // 1-based spreadsheet row (header = 1)
  action: ImportAction;
  category: string; // category name_zh as given in the sheet
  categoryId?: string; // resolved when the category exists
  itemId?: string; // matched MenuItem id (UPDATE/DELETE)
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
  autoTranslated: string[]; // e.g. ['name_en','name_th']
  changes: string[]; // human-readable diff for UPDATE
  error?: string; // set when action === 'ERROR'
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
  newCategories: string[]; // category names in the sheet but NOT in the DB
}

export type TranslateMode = "translate" | "keep";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function boolZh(b: boolean): string {
  return b ? "是" : "否";
}

function zhStockType(v: string | null | undefined): string {
  if (v === "MADE") return "自制";
  if (v === "PURCHASED") return "外购";
  return "不管理";
}

function fmtPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function parseBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (s === "") return undefined;
  if (["是", "true", "1", "y", "yes"].includes(s)) return true;
  if (["否", "false", "0", "n", "no"].includes(s)) return false;
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
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/* ------------------------------------------------------------------ */
/* CSV / XLSX parsing into a string[][]                                */
/* ------------------------------------------------------------------ */

function parseCsv(text: string): string[][] {
  // strip a leading UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // have we seen any content for the current field

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
        started = true;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        started = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
        started = false;
      } else if (c === "\r") {
        // ignore; handled by \n
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        started = false;
      } else {
        field += c;
        started = true;
      }
    }
  }
  // flush the final field / row
  if (started || row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function xlsxToRows(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // exceljs typings expect a classic Node Buffer; the value is always a real
  // Node Buffer at runtime, so this cast is safe.
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("文件没有工作表");

  const rows: string[][] = [];
  const maxRow = ws.rowCount || 0;
  for (let rn = 1; rn <= maxRow; rn++) {
    const row = ws.getRow(rn);
    const maxCol = row.cellCount || 0;
    const vals: string[] = [];
    for (let cn = 1; cn <= maxCol; cn++) {
      const cell = row.getCell(cn);
      const t = cell.text;
      vals.push(t === undefined || t === null ? "" : String(t));
    }
    rows.push(vals);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* buildPreview                                                        */
/* ------------------------------------------------------------------ */

type CatRecord = {
  id: string;
  name_zh: string;
  sortOrder: number;
  items: { id: string; name_zh: string; categoryId: string }[];
};
type MenuItemRecord = {
  id: string;
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
  categoryId: string;
};

export async function buildPreview(
  buffer: Buffer,
  filename: string,
  mode: TranslateMode,
): Promise<MenuImportPreview> {
  let sheetRows: string[][];
  try {
    if (filename.toLowerCase().endsWith(".csv")) {
      const text = buffer.toString("utf8");
      sheetRows = parseCsv(text);
    } else {
      sheetRows = await xlsxToRows(buffer);
    }
  } catch (e: any) {
    throw new Error("文件无法读取或已损坏：" + (e?.message || "未知错误"));
  }

  if (!sheetRows.length) {
    throw new Error("文件为空");
  }

  // --- header row + mapping ---
  const headerRow = sheetRows[0];
  const keyForCol: (string | null)[] = headerRow.map((h) => {
    const t = String(h ?? "").trim();
    const col = MENU_COLUMNS.find((c) => c.header === t);
    return col ? col.key : null;
  });

  // required columns must be present
  const missing = MENU_COLUMNS.filter(
    (c) => c.required && !keyForCol.includes(c.key),
  ).map((c) => c.header);
  if (missing.length) {
    throw new Error(`缺少必需的列：${missing.join("、")}`);
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
    catByName.set(c.name_zh.trim(), c);
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
      errorList.push("缺少分类或中文名称");
    }

    const priceRaw = (raw.price ?? "").trim();
    if (priceRaw === "") {
      errorList.push("价格不是有效数字");
    } else {
      // Tolerate a currency symbol, thousands separators and spaces — but do
      // NOT silently turn garbage (e.g. "abc") into 0: stripping every
      // non-numeric char left "" which Number() reads as 0.
      const cleaned = priceRaw.replace(/[,\s฿]/g, "");
      const p = Number(cleaned);
      if (cleaned === "" || !Number.isFinite(p) || p < 0) {
        errorList.push("价格不是有效数字");
      } else {
        price = p;
      }
    }

    const spiceRaw = raw.spiceLevel ?? "";
    if (spiceRaw !== "") {
      const s = Number(spiceRaw);
      if (!Number.isInteger(s) || s < 0 || s > 3) {
        errorList.push("辣度应为 0-3 的整数");
      } else {
        spiceLevel = s;
      }
    }

    const op = (raw.action ?? "").trim();
    if (op) {
      if (op === "删除" || op.toLowerCase() === "delete" || op.toUpperCase() === "DELETE") {
        deleteOp = true;
      } else {
        errorList.push("无法识别的操作值");
      }
    }

    isPopular = parseBool(raw.isPopular);
    isVegetarian = parseBool(raw.isVegetarian);
    isActive = parseBool(raw.isActive);

    // --- stock columns ---
    let stockType: "NONE" | "MADE" | "PURCHASED" | undefined;
    const stockTypeRaw = (raw.stockType ?? "").trim();
    if (stockTypeRaw !== "") {
      if (["自制", "made", "MADE", "ทำเอง"].includes(stockTypeRaw)) {
        stockType = "MADE";
      } else if (["外购", "purchased", "PURCHASED", "ซื้อมา"].includes(stockTypeRaw)) {
        stockType = "PURCHASED";
      } else if (["不管理", "none", "ไม่มี"].includes(stockTypeRaw)) {
        stockType = "NONE";
      } else {
        errorList.push("库存类型无法识别");
      }
    }

    let dailyLimit: number | null | undefined;
    const dailyLimitRaw = (raw.dailyLimit ?? "").trim();
    if (dailyLimitRaw !== "") {
      const n = Number(dailyLimitRaw);
      if (!Number.isInteger(n) || n < 0) {
        errorList.push("每日限量应为非负整数");
      } else {
        dailyLimit = n;
      }
    }

    // base action
    const matchedItem = itemByKey.get(`${category.trim()}|${name_zh.trim()}`);
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
        errorList.push("要删除的菜品不存在");
      }
    } else if (matchedItem) {
      action = "UPDATE";
    } else {
      action = "ADD";
    }

    const categoryRecord = catByName.get(category.trim());
    const categoryId = categoryRecord?.id;

    // newCategories: ADD rows whose category is not in the DB
    if (action !== "ERROR" && !categoryRecord && category.trim()) {
      newCategoriesSet.add(category.trim());
    }

    const autoTranslated: string[] = [];
    const changes: string[] = [];
    let errorMsg: string | undefined;

    // --- translation ---
    if (mode === "translate" && action !== "ERROR") {
      // Names group
      const nameSource = pickSource(name_zh, name_en, name_th);
      if (nameSource) {
        const targets: { field: "name_en" | "name_th"; lang: "en" | "th" }[] = [
          { field: "name_en", lang: "en" },
          { field: "name_th", lang: "th" },
        ];
        for (const t of targets) {
          if (t.lang === nameSource.lang) continue;
          const current = t.field === "name_en" ? name_en : name_th;
          if (!current) {
            const res = await translateText(nameSource.text, nameSource.lang, t.lang);
            if (res) {
              if (t.field === "name_en") name_en = res;
              else name_th = res;
              autoTranslated.push(t.field);
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
          for (const t of targets) {
            if (t.lang === descSource.lang) continue;
            const current = t.field === "description_en" ? description_en : description_th;
            if (!current) {
              const res = await translateText(descSource.text, descSource.lang, t.lang);
              if (res) {
                if (t.field === "description_en") description_en = res;
                else description_th = res;
                autoTranslated.push(t.field);
              }
            }
          }
        }
      }

      // Translation failure handling
      if (action === "ADD") {
        if (!name_en || !name_th) {
          action = "ERROR";
          errorList.push("缺少英文或泰文名称，且自动翻译失败");
        }
      } else if (action === "UPDATE") {
        // leave the field blank; note it in changes
        if (!name_en) changes.push("英文名翻译失败，已保留原值");
        if (!name_th) changes.push("泰文名翻译失败，已保留原值");
      }
    }

    // --- UPDATE diff (after translation) ---
    if (action === "UPDATE" && matchedItem) {
      if (price !== undefined && price !== matchedItem.price) {
        changes.push(`价格 ฿${fmtPrice(matchedItem.price)}→฿${fmtPrice(price)}`);
      }
      if (name_zh && name_zh !== matchedItem.name_zh) {
        changes.push(`中文名 ${matchedItem.name_zh}→${name_zh}`);
      }
      if (name_en && name_en !== matchedItem.name_en) {
        changes.push(`英文名 ${matchedItem.name_en}→${name_en}`);
      }
      if (name_th && name_th !== matchedItem.name_th) {
        changes.push(`泰文名 ${matchedItem.name_th}→${name_th}`);
      }
      if (description_zh && description_zh !== (matchedItem.description_zh ?? "")) {
        changes.push(`中文描述 ${matchedItem.description_zh ?? ""}→${description_zh}`);
      }
      if (description_en && description_en !== (matchedItem.description_en ?? "")) {
        changes.push(`英文描述 ${matchedItem.description_en ?? ""}→${description_en}`);
      }
      if (description_th && description_th !== (matchedItem.description_th ?? "")) {
        changes.push(`泰文描述 ${matchedItem.description_th ?? ""}→${description_th}`);
      }
      if (spiceLevel !== undefined && spiceLevel !== matchedItem.spiceLevel) {
        changes.push(`辣度 ${matchedItem.spiceLevel}→${spiceLevel}`);
      }
      if (isPopular !== undefined && isPopular !== matchedItem.isPopular) {
        changes.push(`招牌 ${boolZh(matchedItem.isPopular)}→${boolZh(isPopular)}`);
      }
      if (isVegetarian !== undefined && isVegetarian !== matchedItem.isVegetarian) {
        changes.push(`素食 ${boolZh(matchedItem.isVegetarian)}→${boolZh(isVegetarian)}`);
      }
      if (isActive !== undefined && isActive !== matchedItem.isActive) {
        changes.push(`在售 ${boolZh(matchedItem.isActive)}→${boolZh(isActive)}`);
      }
      if (stockType !== undefined && stockType !== matchedItem.stockType) {
        changes.push(
          `库存类型 ${zhStockType(matchedItem.stockType)}→${zhStockType(stockType)}`,
        );
      }
      if (
        dailyLimit !== undefined &&
        dailyLimit !== (matchedItem.dailyLimit ?? null)
      ) {
        changes.push(`每日限量 ${dailyLimit}`);
      }
      const catName = catById.get(matchedItem.categoryId)?.name_zh;
      if (catName && category && category !== catName) {
        changes.push(`分类 ${catName}→${category}`);
      }
    }

    if (errorList.length) {
      errorMsg = errorList[0];
    }

    const row: MenuImportRow = {
      rowNumber: r + 1, // header is spreadsheet row 1
      action,
      category,
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
  items: ({ category: { name_zh: string } } & Record<string, any>)[],
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push(MENU_COLUMNS.map((c) => c.header));
  for (const item of items) {
    const line: (string | number)[] = [];
    for (const col of MENU_COLUMNS) {
      switch (col.key) {
        case "category":
          line.push(item.category?.name_zh ?? "");
          break;
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
          line.push(item.isPopular ? "是" : "否");
          break;
        case "isVegetarian":
          line.push(item.isVegetarian ? "是" : "否");
          break;
        case "isActive":
          line.push(item.isActive ? "是" : "否");
          break;
        case "stockType":
          line.push(zhStockType(item.stockType));
          break;
        case "dailyLimit":
          line.push(item.dailyLimit ?? "");
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

export function buildTemplateRows(): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push(MENU_COLUMNS.map((c) => c.header));
  rows.push([
    "主食",
    "泰式打抛饭",
    "Pad Krapow Rice",
    "ข้าวผัดกะเพรา",
    "香辣下饭",
    "Spicy basil rice",
    "ข้าวผัดกะเพรา",
    80,
    1,
    "是",
    "否",
    "是",
    "",
    "",
    "",
  ]);
  return rows;
}
