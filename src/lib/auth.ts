import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import type { AdminUser } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Simple header-based user auth.
 * Client sends `x-user-id` header (set after login/register).
 * Returns the User record or null.
 *
 * ⚠️ 这不是鉴权，只是识别：`x-user-id` 是客户端自己填的，任何知道 cuid 的人都能冒充。
 * 之所以暂时保留，是因为顾客端目前没有可用的第二因素（没有 OTP 通道）。
 * 已知限制见 `docs/` 安全说明与项目记忆「安全待办」。
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

// ─────────────────────────────────────────────────────────────
// 管理员会话：HMAC 签名 token
// ─────────────────────────────────────────────────────────────
//
// ⚠️ 2026-09-26 加固。旧实现把 `AdminUser.id` 明文塞进 cookie ——
// 只要这个 id 泄漏过一次（接口回显 / 日志 / 截图），别人写进 cookie 就是永久管理员，
// 而且不可撤销。现在改成 HMAC 签名 + 自带签发时间：
//   - 改写 payload 会验签失败
//   - 超过 TTL 自动失效（即使 cookie 还在）
//   - 换掉 ADMIN_SESSION_SECRET 即可一次性踢掉所有会话

const ADMIN_COOKIE = "admin-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

/**
 * 签名密钥。
 * 优先 `ADMIN_SESSION_SECRET`；没配时退回 `DATABASE_URL`
 * （它本来就存在于所有环境且是服务端机密，比硬编码常量安全得多）。
 * 换了密钥 → 所有管理员需要重新登录，这是预期行为。
 */
function sessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL;
  if (!s) {
    // 本地无 env 时的兜底，仅用于让开发环境跑起来
    return "hook-fishpond-dev-only-secret";
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", sessionSecret()).update(payload).digest());
}

/** 生成管理员会话 token：`<base64url({id,iat,nonce})>.<hmac>` */
export function signAdminSession(adminId: string): string {
  const payload = b64url(
    JSON.stringify({ id: adminId, iat: Date.now(), n: randomUUID() }),
  );
  return `${payload}.${sign(payload)}`;
}

/** 验签并取出 adminId；失败或过期返回 null */
export function verifyAdminSession(token: string | undefined | null): string | null {
  if (!token || !token.includes(".")) return null;
  const idx = token.lastIndexOf(".");
  const payload = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  if (!payload || !mac) return null;

  const expected = sign(payload);
  // 长度不等时 timingSafeEqual 会抛，先挡掉
  if (expected.length !== mac.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;

  try {
    const raw = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const data = JSON.parse(raw) as { id?: string; iat?: number };
    if (!data.id || typeof data.iat !== "number") return null;
    if (Date.now() - data.iat > SESSION_TTL_SECONDS * 1000) return null;
    return data.id;
  } catch {
    return null;
  }
}

/** 写入会话 cookie 的选项（单一真相，登录/续期都用它） */
export const ADMIN_COOKIE_NAME = ADMIN_COOKIE;
export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_SECONDS,
  path: "/",
};

/**
 * Cookie-based admin auth.
 * Returns the AdminUser record or null.
 */
export async function getAdminFromRequest(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  const adminId = verifyAdminSession(token);
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
