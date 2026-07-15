import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function GET() {
  try {
    // Fetch active ponds
    const { data: ponds, error } = await supabase
      .from("Pond")
      .select("*")
      .eq("isActive", true)
      .order("price", { ascending: true });

    if (error) throw error;

    // Fetch active spots count per pond
    const { data: spots } = await supabase
      .from("Spot")
      .select("pondId")
      .eq("isActive", true);

    const spotCountMap = new Map<string, number>();
    if (spots) {
      for (const s of spots) {
        spotCountMap.set(s.pondId, (spotCountMap.get(s.pondId) || 0) + 1);
      }
    }

    const result = (ponds || []).map((pond) => ({
      ...pond,
      _count: { spots: spotCountMap.get(pond.id) || 0 },
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("List ponds error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list ponds" },
      { status: 500 },
    );
  }
}
