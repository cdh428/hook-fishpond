import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_OPTIONS } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: "Logged out" });
  // 用与登录时完全一致的选项清 cookie（含 path / secure），否则某些浏览器删不干净
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    ...ADMIN_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
