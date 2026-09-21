import { NextRequest } from "next/server";
import type { AdminUser } from "@prisma/client";
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

/**
 * Require **super admin** — for destructive / book-correcting operations.
 *
 * 会计上「能改余额、能删分录」的操作属于账套维护，必须与日常收银分开授权：
 * 普通 MANAGER 可以进货、盘点、看报表，但**不能**作废/删除分录、不能重算账面。
 * 这些一律走这里 —— 唯一的超级管理员（seed: admin / SUPER_ADMIN）才能做。
 *
 * 返回值区分三种情况，方便路由给出准确的 403 文案：
 *  - { admin }       校验通过
 *  - { reason: 'UNAUTHENTICATED' } 没登录
 *  - { reason: 'FORBIDDEN' }       登录了但不是超级管理员
 */
export type SuperAdminResult =
  | { admin: AdminUser; reason: null }
  | { admin: null; reason: "UNAUTHENTICATED" | "FORBIDDEN" };

export async function requireSuperAdmin(
  request: NextRequest,
): Promise<SuperAdminResult> {
  const admin = await requireAdmin(request);
  if (!admin) return { admin: null, reason: "UNAUTHENTICATED" };
  if (admin.role !== "SUPER_ADMIN") return { admin: null, reason: "FORBIDDEN" };
  return { admin, reason: null };
}

/** 超级管理员默认用户名（seed 里的那份）；用于前端提示与兜底判断 */
export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";
