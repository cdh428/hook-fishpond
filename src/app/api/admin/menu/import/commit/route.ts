import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { MenuImportRow } from "@/lib/menu-io";

type Skipped = { rowNumber: number; name: string; reason: string };

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      rows?: MenuImportRow[];
      autoCreateCategories?: boolean;
    };

    const rows = body.rows;
    const autoCreateCategories = body.autoCreateCategories === true;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "缺少有效的行数据" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const added: string[] = [];
      const updated: string[] = [];
      const deleted: string[] = [];
      const skipped: Skipped[] = [];

      // Load current DB state.
      const categories = await tx.menuCategory.findMany({
        include: { items: true },
      });
      const catByName = new Map<string, (typeof categories)[number]>();
      const catById = new Map<string, (typeof categories)[number]>();
      let maxCatSort = 0;
      for (const c of categories) {
        catByName.set(c.name_zh.trim(), c);
        catById.set(c.id, c);
        if (c.sortOrder > maxCatSort) maxCatSort = c.sortOrder;
      }

      // Optionally create missing categories referenced by ADD rows.
      if (autoCreateCategories) {
        const needed = new Set<string>();
        for (const r of rows) {
          if (r.action !== "ADD") continue;
          const cat = (r.category || "").trim();
          if (cat && !catByName.has(cat)) needed.add(cat);
        }
        let sort = maxCatSort + 1;
        for (const name of needed) {
          const created = await tx.menuCategory.create({
            data: {
              name_zh: name,
              name_en: name,
              name_th: name,
              type: "FOOD",
              sortOrder: sort++,
            },
          });
          catByName.set(name, created as any);
          catById.set(created.id, created as any);
        }
      }

      // Continuing sortOrder for newly added items.
      const maxSortAgg = await tx.menuItem.aggregate({ _max: { sortOrder: true } });
      let nextSort = (maxSortAgg._max.sortOrder ?? 0) + 1;

      for (const r of rows) {
        if (r.action === "ERROR") continue;

        const cat = (r.category || "").trim();
        const category = catByName.get(cat);

        if (r.action === "ADD") {
          if (!category) {
            skipped.push({
              rowNumber: r.rowNumber,
              name: r.name_zh,
              reason: "分类不存在",
            });
            continue;
          }
          const created = await tx.menuItem.create({
            data: {
              categoryId: category.id,
              name_zh: r.name_zh,
              name_en: r.name_en || r.name_zh,
              name_th: r.name_th || r.name_zh,
              description_zh: r.description_zh || null,
              description_en: r.description_en || null,
              description_th: r.description_th || null,
              price: r.price ?? 0,
              spiceLevel: r.spiceLevel ?? 0,
              isPopular: r.isPopular ?? false,
              isVegetarian: r.isVegetarian ?? false,
              isActive: r.isActive ?? true,
              sortOrder: nextSort++,
            },
          });
          added.push(created.id);
        } else if (r.action === "UPDATE") {
          if (!r.itemId) {
            skipped.push({
              rowNumber: r.rowNumber,
              name: r.name_zh,
              reason: "未找到对应菜品",
            });
            continue;
          }
          const data: Record<string, unknown> = {};
          if (r.price !== undefined) data.price = r.price;
          if (r.name_zh) data.name_zh = r.name_zh;
          if (r.name_en) data.name_en = r.name_en;
          if (r.name_th) data.name_th = r.name_th;
          if (r.description_zh) data.description_zh = r.description_zh;
          if (r.description_en) data.description_en = r.description_en;
          if (r.description_th) data.description_th = r.description_th;
          if (r.spiceLevel !== undefined) data.spiceLevel = r.spiceLevel;
          if (r.isPopular !== undefined) data.isPopular = r.isPopular;
          if (r.isVegetarian !== undefined) data.isVegetarian = r.isVegetarian;
          if (r.isActive !== undefined) data.isActive = r.isActive;
          if (category) data.categoryId = category.id;

          const upd = await tx.menuItem.update({
            where: { id: r.itemId },
            data,
          });
          updated.push(upd.id);
        } else if (r.action === "DELETE") {
          if (!r.itemId) {
            skipped.push({
              rowNumber: r.rowNumber,
              name: r.name_zh,
              reason: "未找到对应菜品",
            });
            continue;
          }
          const item = await tx.menuItem.findUnique({
            where: { id: r.itemId },
            include: { orderItems: true },
          });
          if (!item) {
            skipped.push({
              rowNumber: r.rowNumber,
              name: r.name_zh,
              reason: "未找到对应菜品",
            });
            continue;
          }
          if (item.orderItems.length > 0) {
            skipped.push({
              rowNumber: r.rowNumber,
              name: r.name_zh,
              reason: "该菜品存在历史订单，未删除（可改为下架）",
            });
            continue;
          }
          await tx.menuItem.delete({ where: { id: r.itemId } });
          deleted.push(r.itemId);
        }
      }

      return { added, updated, deleted, skipped };
    });

    return NextResponse.json({
      ok: true,
      added: result.added.length,
      updated: result.updated.length,
      deleted: result.deleted.length,
      skipped: result.skipped,
    });
  } catch (error: any) {
    console.error("Menu import commit error:", error);
    return NextResponse.json(
      { error: error?.message || "导入失败" },
      { status: 500 },
    );
  }
}
