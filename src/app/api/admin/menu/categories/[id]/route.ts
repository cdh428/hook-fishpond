import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
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

    const updateData: Record<string, any> = {};
    const { name_zh, name_en, name_th, type, imageUrl, sortOrder, isActive } = body;

    if (name_zh !== undefined) updateData.name_zh = name_zh;
    if (name_en !== undefined) updateData.name_en = name_en;
    if (name_th !== undefined) updateData.name_th = name_th;
    if (type !== undefined) updateData.type = type;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const { data: category, error } = await supabase
      .from("MenuCategory")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

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
    const { count: itemCount } = await supabase
      .from("MenuItem")
      .select("*", { count: "exact", head: true })
      .eq("categoryId", id);

    if (itemCount && itemCount > 0) {
      // Soft delete — just deactivate
      await supabase
        .from("MenuCategory")
        .update({ isActive: false })
        .eq("id", id);
      return NextResponse.json({ message: "Category deactivated (has items)", deactivated: true });
    }

    const { error } = await supabase
      .from("MenuCategory")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ message: "Category deleted" });
  } catch (error: any) {
    console.error("Delete category error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete category" },
      { status: 500 },
    );
  }
}
