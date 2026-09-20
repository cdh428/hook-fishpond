import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { isMenuType, MENU_TYPES } from "@/lib/menu-types";

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

    const updateData: Record<string, any> = {};
    const { name_zh, name_en, name_th, type, imageUrl, sortOrder, isActive } = body;

    if (name_zh !== undefined) updateData.name_zh = name_zh;
    if (name_en !== undefined) updateData.name_en = name_en;
    if (name_th !== undefined) updateData.name_th = name_th;
    if (type !== undefined) {
      if (!isMenuType(type)) {
        return NextResponse.json(
          { error: `Invalid type: ${type}. Expected one of ${MENU_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      updateData.type = type;
    }
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const category = await prisma.menuCategory.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(category);
  } catch (error: any) {
    console.error("Update category error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update category" },
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

    // Check if category has items
    const itemCount = await prisma.menuItem.count({
      where: { categoryId: id },
    });

    if (itemCount > 0) {
      // Soft delete — just deactivate
      await prisma.menuCategory.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "Category deactivated (has items)", deactivated: true });
    }

    await prisma.menuCategory.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Category deleted" });
  } catch (error: any) {
    console.error("Delete category error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete category" },
      { status: 500 },
    );
  }
}
