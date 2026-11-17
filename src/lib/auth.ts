import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import type { AdminUser, User } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * 顾客身份解析。
 *
 * 优先级：
 *  1. **HMAC 签名 cookie**（LINE Login / 手机号登录后下发，见 `signCustomerSession`）
 *  2. `x-user-id` 请求头 —— **兼容期保留**，2026-11-17 起被 LINE 会话逐步取代：
 *     它是客户端自己填的，任何知道 cuid 的人都能冒充。兼容期结束后删除这条回退。
 */
export async function getUserFromRequest(request: NextRequest) {
  const cookieId = verifyCustomerSession(
    request.cookies.get(CUSTOMER_COOKIE)?.value,
  );
  const userId = cookieId ?? request.headers.get("x-user-id");
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

/** 供其他模块（如 LINE Login state）复用同一把密钥做 HMAC 签名 */
export function signRaw(payload: string): string {
  return sign(payload);
}

/** 与 signRaw 对称的验签（只验签名，不含时效；时效由调用方 payload 里的 iat 自行判断） */
export function verifyRaw(payload: string, mac: string): boolean {
  if (!payload || !mac) return false;
  const expected = sign(payload);
  if (expected.length !== mac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}

/**
 * 会话 payload 统一带 `k`（kind）：`admin` / `cust`。
 * 验签时按期望 kind 校验 —— 拿顾客 token 冒充管理员（或反过来）直接失败。
 * ⚠️ 2026-11-17 起旧的无 `k` token 一律失效（管理员需重新登录一次，TTL 7 天，影响可控）。
 */
type SessionKind = "admin" | "cust";

function signSession(id: string, kind: SessionKind): string {
  const payload = b64url(
    JSON.stringify({ id, iat: Date.now(), n: randomUUID(), k: kind }),
  );
  return `${payload}.${sign(payload)}`;
}

function verifySession(
  token: string | undefined | null,
  kind: SessionKind,
): string | null {
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
    const data = JSON.parse(raw) as {
      id?: string;
      iat?: number;
      k?: string;
    };
    if (!data.id || typeof data.iat !== "number" || data.k !== kind) return null;
    if (Date.now() - data.iat > SESSION_TTL_SECONDS * 1000) return null;
    return data.id;
  } catch {
    return null;
  }
}

/** 生成管理员会话 token：`<base64url({id,iat,nonce,k})>.<hmac>` */
export function signAdminSession(adminId: string): string {
  return signSession(adminId, "admin");
}

/** 验签并取出 adminId；失败、过期或 kind 不符返回 null */
export function verifyAdminSession(token: string | undefined | null): string | null {
  return verifySession(token, "admin");
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

// ─────────────────────────────────────────────────────────────
// 顾客会话：与 admin 同一套 HMAC 机制，kind=cust 隔离
// ─────────────────────────────────────────────────────────────
//
// 2026-11-17 随 LINE Login（方案②）引入。cookie httpOnly，前端拿不到值，
// 改不了 payload；`x-user-id` 回退仅作兼容期，见 getUserFromRequest 注释。

const CUSTOMER_COOKIE = "hf-user-session";

/** 顾客会话 token（LINE 登录 / 手机号登录成功后下发） */
export function signCustomerSession(userId: string): string {
  return signSession(userId, "cust");
}

/** 验顾客会话；失败返回 null */
export function verifyCustomerSession(
  token: string | undefined | null,
): string | null {
  return verifySession(token, "cust");
}

export const CUSTOMER_COOKIE_NAME = CUSTOMER_COOKIE;
export const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_SECONDS,
  path: "/",
};

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
