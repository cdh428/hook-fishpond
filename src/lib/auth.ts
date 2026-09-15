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

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    return user;
  } catch {
    return null;
  }
}

/**
 * Simple cookie-based admin auth.
 * After admin login we set `admin-session` cookie containing the admin user id.
 * Returns the AdminUser record or null.
 */
export async function getAdminFromRequest(request: NextRequest) {
  const adminId = request.cookies.get("admin-session")?.value;
  if (!adminId) return null;

  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
    });
    return admin;
  } catch {
    return null;
  }
}

/**
 * Require admin — returns the admin or null.
 * Usage: const admin = await requireAdmin(request); if (!admin) return 401;
 */
export async function requireAdmin(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin || !admin.isActive) {
    return null;
  }
  return admin;
}
