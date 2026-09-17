import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * Admin — resolve the current session from the `admin-session` cookie.
 * Used by the admin layout to decide between the login gate and the shell,
 * so a single login persists across every admin sub-page.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: admin.id,
    username: admin.username,
    role: admin.role,
  });
}
