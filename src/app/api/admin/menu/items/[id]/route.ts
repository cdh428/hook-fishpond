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
      isPopular,
      isVegetarian,
      spiceLevel,
      sortOrder,
      isActive,
    } = body;

    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(categoryId !== undefined && { categoryId }),
        ...(name_zh !== undefined && { name_zh }),
        ...(name_en !== undefined && { name_en }),
        ...(name_th !== undefined && { name_th }),
        ...(description_zh !== undefined && { description_zh }),
        ...(description_en !== undefined && { description_en }),
        ...(description_th !== undefined && { description_th }),
        ...(price !== undefined && { price }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isPopular !== undefined && { isPopular }),
        ...(isVegetarian !== undefined && { isVegetarian }),
        ...(spiceLevel !== undefined && { spiceLevel }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { category: true },
    });

    return NextResponse.json(item);
  } catch (error: any) {
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

    // Check if item has been ordered
    const orderItemCount = await prisma.orderItem.count({
      where: { menuItemId: id },
    });

    if (orderItemCount > 0) {
      // Soft delete
      await prisma.menuItem.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "Item deactivated (has order history)", deactivated: true });
    }

    await prisma.menuItem.delete({ where: { id } });
    return NextResponse.json({ message: "Item deleted" });
  } catch (error: any) {
    console.error("Delete menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete menu item" },
      { status: 500 },
    );
  }
}
