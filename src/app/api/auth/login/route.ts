import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: "Missing required field: phone" },
        { status: 400 },
      );
    }

    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: "User not found. Please register first." },
        { status: 404 },
      );
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: error.message || "Login failed" },
      { status: 500 },
    );
  }
}
