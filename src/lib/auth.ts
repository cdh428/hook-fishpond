import { NextRequest } from "next/server";
import { prisma } from "./prisma";

/**
 * Simple header-based user auth.
 * Client sends `x-user-id` header (set after login/register).
 * Returns the User record or null.
 */
export async function getUserFromRequest(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Simple cookie-based admin auth.
 * After admin login we set `admin-session` cookie containing the admin user id.
 * Returns the AdminUser record or null.
 */
export async function getAdminFromRequest(request: NextRequest) {
  const adminId = request.cookies.get("admin-session")?.value;
  if (!adminId) return null;
  return prisma.adminUser.findUnique({ where: { id: adminId } });
}

/**
 * Require admin — returns the admin or a 401 NextResponse.
 * Usage: const admin = await requireAdmin(request); if (admin instanceof NextResponse) return admin;
 */
export async function requireAdmin(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin || !admin.isActive) {
    return null;
  }
  return admin;
}
