import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data: item, error } = await supabase
      .from("MenuItem")
      .select("*, category:MenuCategory(*)")
      .eq("id", id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error: any) {
    console.error("Get menu item error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get menu item" },
      { status: 500 },
    );
  }
}
