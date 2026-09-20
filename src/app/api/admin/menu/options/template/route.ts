import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import { findTemplate, OPTION_TEMPLATES } from "@/lib/menu-options";

export const maxDuration = 60;

/**
 * POST /api/admin/menu/items/options/template
 *
 * 批量套用内置选项模板（份量 / 面型 / 加料 / 辣度 / 冰量 / 甜度 / 餐具）。
 *
 * body: { itemIds: string[], templateKeys: string[], mode?: "add" | "replace" }
 *  - add（默认）：只补该菜品还没有的同名组，不动已有配置
 *  - replace：先清空这些菜品的全部选项组再套模板
 *
 * 目的：粉面类九个菜一个个敲「蛋面/米粉/河粉」太痛苦，
 * 勾一批菜点一下模板就齐了；套用后单价与加价仍可逐个微调。
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const itemIds: string[] = Array.isArray(body?.itemIds)
      ? body.itemIds.map((v: any) => String(v)).filter(Boolean)
      : [];
    const keys: string[] = Array.isArray(body?.templateKeys)
      ? body.templateKeys.map((v: any) => String(v))
      : [];
    const mode = body?.mode === "replace" ? "replace" : "add";

    if (itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds[] is required" }, { status: 400 });
    }
    if (itemIds.length > 200) {
      return NextResponse.json({ error: "Too many items (max 200)" }, { status: 400 });
    }

    const templates = keys.map((k) => findTemplate(k)).filter(Boolean);
    if (templates.length === 0) {
      return NextResponse.json(
        {
          error: "Unknown templateKeys",
          available: OPTION_TEMPLATES.map((t) => t.key),
        },
        { status: 400 },
      );
    }

    const items = await prisma.menuItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true },
    });
    const validIds = items.map((i) => i.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No matching items" }, { status: 404 });
    }

    const result = await runTx(async (tx) => {
      if (mode === "replace") {
        await tx.menuItemOptionGroup.deleteMany({
          where: { menuItemId: { in: validIds } },
        });
      }

      const existing = await tx.menuItemOptionGroup.findMany({
        where: { menuItemId: { in: validIds } },
        select: { menuItemId: true, name_zh: true, sortOrder: true },
      });
      const taken = new Set(existing.map((g) => `${g.menuItemId}::${g.name_zh}`));
      const maxSort = new Map<string, number>();
      for (const g of existing) {
        maxSort.set(
          g.menuItemId,
          Math.max(maxSort.get(g.menuItemId) ?? -1, g.sortOrder ?? 0),
        );
      }

      let created = 0;
      let skipped = 0;

      for (const itemId of validIds) {
        let nextSort = (maxSort.get(itemId) ?? -1) + 1;
        for (const tpl of templates) {
          const key = `${itemId}::${tpl!.name_zh}`;
          if (mode === "add" && taken.has(key)) {
            skipped += 1;
            continue;
          }
          await tx.menuItemOptionGroup.create({
            data: {
              menuItemId: itemId,
              name_zh: tpl!.name_zh,
              name_en: tpl!.name_en,
              name_th: tpl!.name_th,
              selectionType: tpl!.selectionType as any,
              isRequired: tpl!.isRequired,
              maxSelect: tpl!.maxSelect,
              sortOrder: nextSort++,
              isActive: true,
              options: {
                create: tpl!.options.map((o, i) => ({
                  name_zh: o.name_zh,
                  name_en: o.name_en,
                  name_th: o.name_th,
                  priceDelta: o.priceDelta,
                  isDefault: !!o.isDefault,
                  sortOrder: i,
                  isActive: true,
                })),
              },
            },
          });
          taken.add(key);
          created += 1;
        }
        maxSort.set(itemId, nextSort - 1);
      }

      return { items: validIds.length, created, skipped };
    });

    return NextResponse.json({ ok: true, mode, ...result });
  } catch (error: any) {
    console.error("Apply option template error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to apply template" },
      { status: 500 },
    );
  }
}
