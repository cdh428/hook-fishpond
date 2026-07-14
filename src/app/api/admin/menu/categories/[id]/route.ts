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
    const { name_zh, name_en, name_th, type, imageUrl, sortOrder, isActive } = body;

    const category = await prisma.menuCategory.update({
      where: { id },
      data: {
        ...(name_zh !== undefined && { name_zh }),
        ...(name_en !== undefined && { name_en }),
        ...(name_th !== undefined && { name_th }),
        ...(type !== undefined && { type: type as "FOOD" | "DRINK" }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
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
    const itemCount = await prisma.menuItem.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      // Soft delete — just deactivate
      await prisma.menuCategory.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "Category deactivated (has items)", deactivated: true });
    }

    await prisma.menuCategory.delete({ where: { id } });
    return NextResponse.json({ message: "Category deleted" });
  } catch (error: any) {
    console.error("Delete category error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete category" },
      { status: 500 },
    );
  }
}
