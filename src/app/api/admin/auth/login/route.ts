import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing required fields: username, password" },
        { status: 400 },
      );
    }

    const { data: admin, error } = await supabase
      .from("AdminUser")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !admin || !admin.isActive) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });

    // Set simple session cookie (httpOnly, 7-day expiry)
    response.cookies.set("admin-session", admin.id, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: error.message || "Login failed" },
      { status: 500 },
    );
  }
}
