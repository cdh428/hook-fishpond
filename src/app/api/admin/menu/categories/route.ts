import { NextRequest, NextResponse } from "next/server";
import { supabase, genId } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    let query = supabase
      .from("MenuCategory")
      .select("*")
      .order("sortOrder", { ascending: true });

    if (type) {
      query = query.eq("type", type);
    }

    const { data: categories, error } = await query;

    if (error) throw error;

    // Fetch item counts per category (all items, not just active)
    const { data: items } = await supabase
      .from("MenuItem")
      .select("categoryId");

    const countMap = new Map<string, number>();
    if (items) {
      for (const item of items) {
        countMap.set(item.categoryId, (countMap.get(item.categoryId) || 0) + 1);
      }
    }

    const result = (categories || []).map((cat) => ({
      ...cat,
      _count: { items: countMap.get(cat.id) || 0 },
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("List categories error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list categories" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name_zh, name_en, name_th, type, imageUrl, sortOrder } = body;

    if (!name_zh || !name_en || !name_th || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name_zh, name_en, name_th, type" },
        { status: 400 },
      );
    }

    const { data: category, error } = await supabase
      .from("MenuCategory")
      .insert({
        id: genId(),
        name_zh,
        name_en,
        name_th,
        type: type as "FOOD" | "DRINK",
        imageUrl: imageUrl || null,
        sortOrder: sortOrder || 0,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create category" },
      { status: 500 },
    );
  }
}
