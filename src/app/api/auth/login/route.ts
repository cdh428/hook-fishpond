import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * 顾客「登录」。
 *
 * ⚠️ 现状如实说明：本接口**不验证手机号归属** —— 只要号码存在就返回该用户记录。
 * 这是「手机号即身份」的设计，不是疏忽。真正的修法是给顾客上 OTP（短信验证码）。
 * 本次（2026-09-26）只做了两件**不改变流程**的加固：
 *  1. 入参规范化 + 长度约束（挡住垃圾串，也让「号存不存在」的试探变贵）
 *  2. 限流：同 IP 5 分钟 20 次 —— 挡住批量枚举手机号
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 20;

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const limit = rateLimit(`user-login:ip:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
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
    if (!phone.ok) {
      return NextResponse.json(
        { error: "Invalid phone number", code: phone.reason },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { phone: phone.value },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found. Please register first." },
        { status: 404 },
      );
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
