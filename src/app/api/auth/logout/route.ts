import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_COOKIE_NAME } from "@/lib/auth";

/**
 * POST /api/auth/logout —— 顾客退出：清 LINE 会话 cookie。
 * localStorage 里的显示缓存由前端自己清（AppContext.logout）。
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CUSTOMER_COOKIE_NAME);
  return res;
}
