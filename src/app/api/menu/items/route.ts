import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const popular = searchParams.get("popular");

    if (popular === "true") {
      const { data: items, error } = await supabase
        .from("MenuItem")
        .select("*, category:MenuCategory(*)")
        .eq("isPopular", true)
        .eq("isActive", true)
        .order("sortOrder", { ascending: true });

      if (error) throw error;
      return NextResponse.json(items || []);
    }

    let query = supabase
      .from("MenuItem")
      .select("*, category:MenuCategory(*)")
      .eq("isActive", true)
      .order("sortOrder", { ascending: true });

    if (categoryId) {
      query = query.eq("categoryId", categoryId);
    }

    const { data: items, error } = await query;

    if (error) throw error;

    return NextResponse.json(items || []);
  } catch (error: any) {
    console.error("List menu items error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list menu items" },
      { status: 500 },
    );
  }
}
