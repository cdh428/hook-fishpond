/**
 * 菜品选项 —— 服务端解析（唯一可信的计价入口）。
 *
 * 前端传来的任何价格都不采信；只认 menuItemId + optionIds，
 * 由这里读出菜品价与选项加价，算出单价与总价。
 */

import { Prisma } from "@prisma/client";
import {
  OptionGroupPublic,
  OrderLineOption,
  makeOptionKey,
  round2,
  validateOptionSelection,
} from "./menu-options";

/** 只带出启用中的选项组与选项，按 sortOrder 排好 */
export const optionGroupsInclude = {
  where: { isActive: true },
  orderBy: { sortOrder: "asc" as const },
  include: {
    options: {
      where: { isActive: true },
      orderBy: { sortOrder: "asc" as const },
    },
  },
};

type RawGroup = {
  id: string;
  name_zh: string;
  name_en: string;
  name_th: string;
  selectionType: string;
  isRequired: boolean;
  maxSelect: number | null;
  sortOrder: number;
  isActive: boolean;
  options: {
    id: string;
    name_zh: string;
    name_en: string;
    name_th: string;
    priceDelta: number;
    isDefault: boolean;
    sortOrder: number;
    isActive: boolean;
  }[];
};

export function toPublicGroups(rows: RawGroup[] | null | undefined): OptionGroupPublic[] {
  return (rows ?? []).map((g) => ({
    id: g.id,
    name_zh: g.name_zh,
    name_en: g.name_en,
    name_th: g.name_th,
    selectionType: g.selectionType === "MULTI" ? "MULTI" : "SINGLE",
    isRequired: !!g.isRequired,
    maxSelect: g.maxSelect ?? null,
    sortOrder: g.sortOrder ?? 0,
    options: (g.options ?? []).map((o) => ({
      id: o.id,
      name_zh: o.name_zh,
      name_en: o.name_en,
      name_th: o.name_th,
      priceDelta: Number(o.priceDelta) || 0,
      isDefault: !!o.isDefault,
      sortOrder: o.sortOrder ?? 0,
    })),
  }));
}

/** 选项不合规（路由转 400，带人话说明） */
export class OptionError extends Error {
  constructor(
    public readonly code:
      | "ITEM_NOT_FOUND"
      | "UNKNOWN_OPTION"
      | "REQUIRED_MISSING"
      | "TOO_MANY"
      | "SINGLE_ONLY"
      | "BAD_QUANTITY",
    public readonly itemName?: string,
    public readonly groupName?: string,
  ) {
    super(`Option error: ${code}`);
    this.name = "OptionError";
  }

  /** 给顾客/店员看的中文说明（三语页面由前端按 code 覆写） */
  get humanMessage(): string {
    switch (this.code) {
      case "ITEM_NOT_FOUND":
        return `菜品不存在：${this.itemName ?? ""}`;
      case "UNKNOWN_OPTION":
        return `${this.itemName ?? "菜品"} 的选项已变更，请重新选择`;
      case "REQUIRED_MISSING":
        return `${this.itemName ?? "菜品"} 必须选择「${this.groupName ?? "规格"}」`;
      case "TOO_MANY":
        return `${this.itemName ?? "菜品"} 的「${this.groupName ?? "选项"}」选多了`;
      case "SINGLE_ONLY":
        return `${this.itemName ?? "菜品"} 的「${this.groupName ?? "选项"}」只能选一个`;
      case "BAD_QUANTITY":
        return `数量不合法：${this.itemName ?? ""}`;
      default:
        return "选项不合法";
    }
  }
}

export interface IncomingLine {
  menuItemId: string;
  quantity: number;
  optionIds?: string[] | null;
  note?: string | null;
}

export interface ResolvedLine {
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  options: OrderLineOption[] | null;
  optionKey: string;
  note: string | null;
}

/**
 * 把顾客/后台传来的行解析成可直接写库的订单行。
 *
 * 一次 findMany 取回所有菜品与选项组，避免 N+1；
 * 任何校验失败即抛 OptionError，由调用方整体回滚。
 */
export async function resolveOrderLines(
  tx: Prisma.TransactionClient,
  incoming: IncomingLine[],
): Promise<{ lines: ResolvedLine[]; subtotal: number }> {
  const ids = [...new Set(incoming.map((l) => String(l.menuItemId)))];
  const items = await tx.menuItem.findMany({
    where: { id: { in: ids } },
    include: { optionGroups: optionGroupsInclude },
  });
  const itemMap = new Map(items.map((m) => [m.id, m]));

  const lines: ResolvedLine[] = [];
  let subtotal = 0;

  for (const raw of incoming) {
    const item = itemMap.get(String(raw.menuItemId));
    if (!item) throw new OptionError("ITEM_NOT_FOUND", String(raw.menuItemId));

    const quantity = Math.floor(Number(raw.quantity) || 0);
    if (quantity <= 0) throw new OptionError("BAD_QUANTITY", item.name_zh);

    const groups = toPublicGroups(item.optionGroups as unknown as RawGroup[]);
    const check = validateOptionSelection(groups, raw.optionIds ?? []);
    if (!check.ok) {
      throw new OptionError(
        (check.error ?? "UNKNOWN_OPTION") as any,
        item.name_zh,
        check.groupName,
      );
    }

    // 服务端重算单价：菜品价 + 选项加价。前端传什么都不看。
    const unitPrice = round2(Number(item.price) + check.delta);
    const totalPrice = round2(unitPrice * quantity);
    subtotal = round2(subtotal + totalPrice);

    const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : "";

    lines.push({
      menuItemId: item.id,
      quantity,
      unitPrice,
      totalPrice,
      options: check.snapshot.length > 0 ? check.snapshot : null,
      optionKey: makeOptionKey(item.id, check.optionIds),
      note: note.length > 0 ? note : null,
    });
  }

  return { lines, subtotal };
}

/** 把若干菜品 id 的选项组一次性取回（后台编辑器用） */
export async function loadOptionGroups(
  client: Prisma.TransactionClient | typeof import("./prisma").prisma,
  menuItemId: string,
): Promise<OptionGroupPublic[]> {
  const rows = await (client as any).menuItemOptionGroup.findMany({
    where: { menuItemId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { options: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  return toPublicGroups(rows as RawGroup[]);
}
