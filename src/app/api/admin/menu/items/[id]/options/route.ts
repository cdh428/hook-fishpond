import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import { loadOptionGroups, optionGroupsInclude } from "@/lib/menu-options-server";
import type { OptionGroupInput } from "@/lib/menu-options";

export const maxDuration = 60;

/**
 * 菜品选项组 —— 读 / 整体替换
 *
 * GET  /api/admin/menu/items/[id]/options   → { item, groups }
 * PUT  /api/admin/menu/items/[id]/options   → { groups: OptionGroupInput[] }
 *
 * PUT 采用「整体替换」语义：请求里没带的组会被删除（选项随组级联删除）。
 * 这样后台编辑器只需提交最终状态，不用维护增量 diff，少一整类同步 bug。
 *
 * 三语名缺英文/泰文时回退成中文名 —— 店里常有还没翻译完的新菜，
 * 但**不允许**三个都空（那样菜单上会出现没有名字的选项）。
 */

function normalizeGroupInput(raw: any, index: number) {
  const name_zh = String(raw?.name_zh ?? "").trim();
  if (!name_zh) return null;

  const selectionType = raw?.selectionType === "MULTI" ? "MULTI" : "SINGLE";
  const options = (Array.isArray(raw?.options) ? raw.options : [])
    .map((o: any) => {
      const ozh = String(o?.name_zh ?? "").trim();
      if (!ozh) return null;
      return {
        name_zh: ozh,
        name_en: String(o?.name_en ?? "").trim() || ozh,
        name_th: String(o?.name_th ?? "").trim() || ozh,
        priceDelta: Number(o?.priceDelta) || 0,
        isDefault: !!o?.isDefault,
        sortOrder: 0,
        isActive: true,
      };
    })
    .filter(Boolean) as {
    name_zh: string;
    name_en: string;
    name_th: string;
    priceDelta: number;
    isDefault: boolean;
    sortOrder: number;
    isActive: boolean;
  }[];

  if (options.length === 0) return null;

  // 单选组只允许有一个默认项
  if (selectionType === "SINGLE") {
    let seen = false;
    for (const o of options) {
      if (o.isDefault) {
        if (seen) o.isDefault = false;
        seen = true;
      }
    }
  }

  options.forEach((o, i) => {
    o.sortOrder = i;
  });

  const maxSelect =
    selectionType === "SINGLE"
      ? 1
      : raw?.maxSelect == null || raw.maxSelect === ""
        ? null
        : Math.max(1, Math.floor(Number(raw.maxSelect) || 1));

  return {
    id: typeof raw?.id === "string" && raw.id.length > 0 ? raw.id : undefined,
    name_zh,
    name_en: String(raw?.name_en ?? "").trim() || name_zh,
    name_th: String(raw?.name_th ?? "").trim() || name_zh,
    selectionType,
    isRequired: !!raw?.isRequired,
    maxSelect,
    sortOrder: index,
    isActive: true,
    options,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const item = await prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, name_zh: true, name_en: true, name_th: true, price: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const groups = await loadOptionGroups(prisma, id);
    return NextResponse.json({ item, groups });
  } catch (error: any) {
    console.error("Load item options error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load options" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const rawGroups: any[] = Array.isArray(body?.groups) ? body.groups : [];

    const item = await prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, name_zh: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // 空名 / 空选项的组直接丢弃，而不是报错 —— 后台边填边存很常见
    const groups = rawGroups
      .map((g, i) => normalizeGroupInput(g, i))
      .filter(Boolean) as NonNullable<ReturnType<typeof normalizeGroupInput>>[];

    const keptIds = groups.map((g) => g.id).filter(Boolean) as string[];

    await runTx(async (tx) => {
      // 1) 删掉本次没提交的组（选项随组级联删除）
      await tx.menuItemOptionGroup.deleteMany({
        where: { menuItemId: id, id: { notIn: keptIds.length > 0 ? keptIds : ["__none__"] } },
      });

      // 2) 逐组 upsert
      for (const g of groups) {
        let groupId = g.id;

        if (groupId) {
          const exists = await tx.menuItemOptionGroup.findFirst({
            where: { id: groupId, menuItemId: id },
            select: { id: true },
          });
          if (!exists) groupId = undefined;
        }

        if (groupId) {
          await tx.menuItemOptionGroup.update({
            where: { id: groupId },
            data: {
              name_zh: g.name_zh,
              name_en: g.name_en,
              name_th: g.name_th,
              selectionType: g.selectionType as any,
              isRequired: g.isRequired,
              maxSelect: g.maxSelect,
              sortOrder: g.sortOrder,
              isActive: true,
            },
          });
          // 选项整体重建：数量少、无外部引用，比逐条 diff 更不容易出错
          await tx.menuItemOption.deleteMany({ where: { groupId } });
          await tx.menuItemOption.createMany({
            data: g.options.map((o) => ({ ...o, groupId: groupId! })),
          });
        } else {
          await tx.menuItemOptionGroup.create({
            data: {
              menuItemId: id,
              name_zh: g.name_zh,
              name_en: g.name_en,
              name_th: g.name_th,
              selectionType: g.selectionType as any,
              isRequired: g.isRequired,
              maxSelect: g.maxSelect,
              sortOrder: g.sortOrder,
              isActive: true,
              options: { create: g.options },
            },
          });
        }
      }
    });

    const fresh = await prisma.menuItemOptionGroup.findMany({
      where: { menuItemId: id },
      orderBy: { sortOrder: "asc" },
      include: optionGroupsInclude.include,
    });

    return NextResponse.json({ ok: true, groups: fresh });
  } catch (error: any) {
    console.error("Save item options error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save options" },
      { status: 500 },
    );
  }
}
