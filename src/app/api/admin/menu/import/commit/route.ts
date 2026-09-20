import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/tx";
import { requireAdmin } from "@/lib/auth";
import type { MenuImportRow } from "@/lib/menu-io";
import type { MenuTypeValue } from "@/lib/menu-types";

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

    const result = await runTx(async (tx) => {
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
      // 新分类归到哪个页签，由那一行的「大类」决定（留空则美食）。
      if (autoCreateCategories) {
        const needed = new Map<string, MenuTypeValue>();
        for (const r of rows) {
          if (r.action !== "ADD") continue;
          const cat = (r.category || "").trim();
          if (cat && !catByName.has(cat) && !needed.has(cat)) {
            needed.set(cat, r.menuType ?? "FOOD");
          }
        }
        let sort = maxCatSort + 1;
        for (const [name, catType] of needed) {
          const created = await tx.menuCategory.create({
            data: {
              name_zh: name,
              name_en: name,
              name_th: name,
              type: catType,
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
              stockType: r.stockType ?? "NONE",
              dailyLimit: r.dailyLimit ?? null,
              costPrice: r.costPrice ?? null,
              targetMargin: r.targetMargin ?? null,
              // 与菜单表单同口径：切到「外购」时初始化两本账，之后由过账引擎维护
              stockQty: (r.stockType ?? "NONE") === "PURCHASED" ? 0 : null,
              stockValue: (r.stockType ?? "NONE") === "PURCHASED" ? 0 : null,
              avgCost:
                (r.stockType ?? "NONE") === "PURCHASED" ? (r.costPrice ?? 0) : null,
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
          // 只在行内确实带值时写库存**配置**，避免部分导入把已有设置清空。
          // ⚠️ stockQty / stockValue / avgCost 一律不写 ——
          // 库存余额只能由过账引擎（src/lib/stock-ledger.ts）维护。
          if (r.stockType !== undefined) data.stockType = r.stockType;
          if (r.dailyLimit !== undefined) data.dailyLimit = r.dailyLimit;
          if (r.costPrice !== undefined) data.costPrice = r.costPrice;
          if (r.targetMargin !== undefined) data.targetMargin = r.targetMargin;
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
