import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  signAdminSession,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_OPTIONS,
} from "@/lib/auth";
import { rateLimit, rateLimitReset, clientIp } from "@/lib/rate-limit";

/**
 * 管理员登录。
 *
 * 加固点（2026-09-26）：
 *  - 会话改成 **HMAC 签名 token**（原来是明文 adminId，见 lib/auth.ts 注释）
 *  - cookie 带 `secure`（生产环境生效）
 *  - **限流**，两个维度分开定阈值（理由见下）
 *  - 「用户名不存在」和「口令错误」返回同一答案，避免枚举账号
 *
 * 阈值为什么不一样：
 *  - **按 IP 放宽**（20 次 / 15 分钟）。场馆里所有收银机通常走同一个出口 IP，
 *    店员手误几次就锁 15 分钟是不能接受的运营事故。
 *  - **按用户名收紧**（10 次 / 15 分钟）。针对**某一个账号**连续试口令才是爆破特征，
 *    这里收紧能真正限制攻击者；正常店员不会在 15 分钟内把同一个账号打错 10 次。
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_USER = 10;

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const ipKey = `admin-login:ip:${ip}`;

    const ipLimit = rateLimit(ipKey, MAX_PER_IP, WINDOW_MS);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
        },
      );
    }

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing required fields: username, password" },
        { status: 400 },
      );
    }

    const userKey = `admin-login:user:${String(username).toLowerCase()}`;
    const userLimit = rateLimit(userKey, MAX_PER_USER, WINDOW_MS);
    if (!userLimit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(userLimit.retryAfterSeconds) },
        },
      );
    }

    const admin = await prisma.adminUser.findUnique({
      where: { username },
    });

    const valid =
      !!admin && admin.isActive && (await bcrypt.compare(password, admin.password));

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

    response.cookies.set(
      ADMIN_COOKIE_NAME,
      signAdminSession(admin.id),
      ADMIN_COOKIE_OPTIONS,
    );

    // 登录成功清掉 IP 维度的失败计数（避免正常用户被自己之前的失败拖累）
    rateLimitReset(ipKey);

    return response;
  } catch (error: any) {
    console.error("Admin login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
