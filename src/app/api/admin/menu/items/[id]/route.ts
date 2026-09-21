import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      categoryId,
      name_zh,
      name_en,
      name_th,
      description_zh,
      description_en,
      description_th,
      price,
      imageUrl,
      imageThumbUrl,
      isPopular,
      isVegetarian,
      spiceLevel,
      sortOrder,
      isActive,
      stockType,
      dailyLimit,
      lowStockAlert,
      costPrice,
      targetMargin,
    } = body;

    const updateData: Record<string, any> = {};
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (name_zh !== undefined) updateData.name_zh = name_zh;
    if (name_en !== undefined) updateData.name_en = name_en;
    if (name_th !== undefined) updateData.name_th = name_th;
    if (description_zh !== undefined) updateData.description_zh = description_zh;
    if (description_en !== undefined) updateData.description_en = description_en;
    if (description_th !== undefined) updateData.description_th = description_th;
    if (price !== undefined) updateData.price = price;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (imageThumbUrl !== undefined) updateData.imageThumbUrl = imageThumbUrl;
    if (isPopular !== undefined) updateData.isPopular = isPopular;
    if (isVegetarian !== undefined) updateData.isVegetarian = isVegetarian;
    if (spiceLevel !== undefined) updateData.spiceLevel = spiceLevel;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (stockType !== undefined) updateData.stockType = stockType;
    if (dailyLimit !== undefined)
      updateData.dailyLimit =
        typeof dailyLimit === "number" ? dailyLimit : dailyLimit ? Number(dailyLimit) : null;
    if (lowStockAlert !== undefined)
      updateData.lowStockAlert =
        typeof lowStockAlert === "number"
          ? lowStockAlert
          : lowStockAlert
            ? Number(lowStockAlert)
            : null;
    if (costPrice !== undefined)
      updateData.costPrice =
        typeof costPrice === "number" ? costPrice : costPrice ? Number(costPrice) : null;
    if (targetMargin !== undefined)
      updateData.targetMargin =
        targetMargin === null || targetMargin === ""
          ? null
          : Number.isFinite(Number(targetMargin))
            ? Number(targetMargin)
            : null;

    // ⚠️ **绝不在菜单编辑里写库存余额**。
    // 以前这里会 updateData.stockQty = <表单值>（绝对赋值、且不进台账），
    // 于是「改个价格」或「用旧表单保存」都会把入库/销售的结果覆盖掉。
    // 现在只保留一件事：首次切到「外购」时把两本账初始化，避免 NULL 口径混乱。
    if (stockType === "PURCHASED") {
      const cur = await prisma.menuItem.findUnique({
        where: { id },
        select: {
          stockType: true,
          stockQty: true,
          stockValue: true,
          avgCost: true,
          costPrice: true,
        },
      });
      if (!cur) {
        return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
      }
      // 首次切到「外购」，**或**虽是外购但账面仍是 NULL，都要归位。
      // 只判断「类型是否变化」的后果：已然是外购、但 stockQty 是迁移期遗留的 NULL 时，
      // 无论保存多少次都修不好 → 前台按 (stockQty ?? 0) 判成 0 可用量 → 永远显示售罄。
      if (cur.stockType !== "PURCHASED" || cur.stockQty === null) {
        updateData.stockQty = cur.stockQty ?? 0;
        updateData.stockValue = cur.stockValue ?? 0;
        updateData.avgCost =
          updateData.costPrice ?? cur.avgCost ?? cur.costPrice ?? 0;
      }
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    return NextResponse.json(item);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    console.error("Update menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update menu item" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // 有订单记录 / 库存分录 / 单据明细的菜品都不再物理删除 ——
    // 会计上「有账的东西不能消失」，一律改为下架（软删除）。
    // 注意：盘点差异为 0 的明细只留单据行、不产生分录，所以单据明细也要一起看。
    const [orderItemCount, movementCount, receiptLineCount, takeLineCount] =
      await Promise.all([
        prisma.orderItem.count({ where: { menuItemId: id } }),
        prisma.stockMovement.count({ where: { itemId: id } }),
        prisma.purchaseReceiptLine.count({ where: { menuItemId: id } }),
        prisma.stockTakeLine.count({ where: { menuItemId: id } }),
      ]);

    if (
      orderItemCount > 0 ||
      movementCount > 0 ||
      receiptLineCount > 0 ||
      takeLineCount > 0
    ) {
      await prisma.menuItem.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        message: "Item deactivated (has history)",
        deactivated: true,
      });
    }

    await prisma.menuItem.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Item deleted" });
  } catch (error: any) {
    console.error("Delete menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete menu item" },
      { status: 500 },
    );
  }
}
