import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * 折扣确认 PIN —— 网站内自设的 6 位数字。
 *
 * 背景：超 10% 折扣需要 admin 授权，但管理员登录密码是 bcrypt 长串，
 * 收银时输入不方便。改为独立 6 位数字 PIN（明文存储）：
 *   - 初始 123456（seed 写入）
 *   - admin 登录后台后可在设置里查看明文、改成自己的 6 位数字
 *   - 下单/改单打折时输入这个 PIN 即可通过校验（见 /api/admin/orders/[id]）
 *
 * 为什么明文：6 位内部 PIN 强度有限，哈希意义不大；且需求明确要求
 * 「admin 进设置页能看到当前值」。存储在本库 AdminUser.discountPin。
 */

const PIN_RE = /^\d{6}$/;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const me = await prisma.adminUser.findUnique({ where: { id: admin.id } });
    // 明文返回给设置页展示（需求明确要求 admin 可见当前值）
    return NextResponse.json({ pin: me?.discountPin ?? null });
  } catch {
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const pin = String((body as Record<string, unknown>)?.pin ?? "").trim();
  if (!PIN_RE.test(pin)) {
    return NextResponse.json({ error: "PIN 必须是 6 位数字" }, { status: 400 });
  }

  try {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { discountPin: pin },
    });
    return NextResponse.json({ ok: true, pin });
  } catch {
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
