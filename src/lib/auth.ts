import { NextRequest } from "next/server";
import { supabase } from "./supabase-server";

/**
 * Simple header-based user auth.
 * Client sends `x-user-id` header (set after login/register).
 * Returns the User record or null.
 */
export async function getUserFromRequest(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return null;

  const { data, error } = await supabase
    .from("User")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Simple cookie-based admin auth.
 * After admin login we set `admin-session` cookie containing the admin user id.
 * Returns the AdminUser record or null.
 */
export async function getAdminFromRequest(request: NextRequest) {
  const adminId = request.cookies.get("admin-session")?.value;
  if (!adminId) return null;

  const { data, error } = await supabase
    .from("AdminUser")
    .select("*")
    .eq("id", adminId)
    .single();

  if (error || !data) return null;
  return data;
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
