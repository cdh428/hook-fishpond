import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * 顾客「注册 / 登录」合一路径。
 *
 * ⚠️ 语义（有意为之，别改成 409）：手机号已存在时**直接返回该用户**，
 * 因为前端只有一个「登录 / 注册」按钮，靠这条幂等路径同时承担登录职责。
 * 代价是**任何人都能用别人的手机号进入别人的账号** —— 这是「手机号即身份」
 * 的必然结果，真正修法只有 OTP（短信验证码）。
 *
 * 本次（2026-09-26）不改变上述语义，只加固：
 *  1. 手机号规范化 + 长度约束
 *  2. 姓名长度约束（避免超长垃圾入库）
 *  3. 限流：同 IP 5 分钟 20 次
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const NAME_MAX = 60;

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const limit = rateLimit(`user-register:ip:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const body = await request.json();
    const phone = normalizePhone(body?.phone);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const language = typeof body?.language === "string" ? body.language : "zh";

    if (!phone.ok) {
      return NextResponse.json(
        { error: "Invalid phone number", code: phone.reason },
        { status: 400 },
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 },
      );
    }
    if (name.length > NAME_MAX) {
      return NextResponse.json(
        { error: "Name is too long" },
        { status: 400 },
      );
    }

    // 幂等：已存在就直接返回（同时承担「登录」职责，见文件头注释）
    const existing = await prisma.user.findUnique({
      where: { phone: phone.value },
    });

    if (existing) {
      return NextResponse.json(existing);
    }

    const user = await prisma.user.create({
      data: {
        phone: phone.value,
        name,
        language,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 },
    );
  }
}
