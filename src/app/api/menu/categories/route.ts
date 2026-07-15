import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // FOOD or DRINK

    let query = supabase
      .from("MenuCategory")
      .select("*")
      .eq("isActive", true)
      .order("sortOrder", { ascending: true });

    if (type) {
      query = query.eq("type", type);
    }

    const { data: categories, error } = await query;

    if (error) throw error;

    // Fetch item counts per category
    const { data: items } = await supabase
      .from("MenuItem")
      .select("categoryId")
      .eq("isActive", true);

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
