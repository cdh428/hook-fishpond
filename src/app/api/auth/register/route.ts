import { NextRequest, NextResponse } from "next/server";
import { supabase, genId } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const { phone, name, language } = await request.json();

    if (!phone || !name) {
      return NextResponse.json(
        { error: "Missing required fields: phone, name" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from("User")
      .select("*")
      .eq("phone", phone)
      .single();

    if (existing) {
      return NextResponse.json(existing);
    }

    const { data: user, error } = await supabase
      .from("User")
      .insert({
        id: genId(),
        phone,
        name,
        language: language || "zh",
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: error.message || "Registration failed" },
      { status: 500 },
    );
  }
}
