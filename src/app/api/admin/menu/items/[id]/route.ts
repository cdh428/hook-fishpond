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
    if (isPopular !== undefined) updateData.isPopular = isPopular;
    if (isVegetarian !== undefined) updateData.isVegetarian = isVegetarian;
    if (spiceLevel !== undefined) updateData.spiceLevel = spiceLevel;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const { data: item, error } = await supabase
      .from("MenuItem")
      .update(updateData)
      .eq("id", id)
      .select("*, category:MenuCategory(*)")
      .single();

    if (error) throw error;

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
    const { count: orderItemCount } = await supabase
      .from("OrderItem")
      .select("*", { count: "exact", head: true })
      .eq("menuItemId", id);

    if (orderItemCount && orderItemCount > 0) {
      // Soft delete
      await supabase
        .from("MenuItem")
        .update({ isActive: false })
        .eq("id", id);
      return NextResponse.json({ message: "Item deactivated (has order history)", deactivated: true });
    }

    const { error } = await supabase
      .from("MenuItem")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ message: "Item deleted" });
  } catch (error: any) {
    console.error("Delete menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete menu item" },
      { status: 500 },
    );
  }
}
