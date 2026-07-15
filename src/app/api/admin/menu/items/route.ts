import { NextRequest, NextResponse } from "next/server";
import { supabase, genId } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    } = body;

    if (!categoryId || !name_zh || !name_en || !name_th || price === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: categoryId, name_zh, name_en, name_th, price" },
        { status: 400 },
      );
    }

    const { data: item, error } = await supabase
      .from("MenuItem")
      .insert({
        id: genId(),
        categoryId,
        name_zh,
        name_en,
        name_th,
        description_zh: description_zh || null,
        description_en: description_en || null,
        description_th: description_th || null,
        price,
        imageUrl: imageUrl || null,
        isPopular: isPopular || false,
        isVegetarian: isVegetarian || false,
        spiceLevel: spiceLevel || 0,
        sortOrder: sortOrder || 0,
      })
      .select("*, category:MenuCategory(*)")
      .single();

    if (error) throw error;

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create menu item" },
      { status: 500 },
    );
  }
}
