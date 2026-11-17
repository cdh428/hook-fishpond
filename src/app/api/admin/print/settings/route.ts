import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { requestLocale, serverT } from "@/lib/server-t";

/**
 * 打印偏好 —— 存数据库，收银机/手机共用。
 *
 * 2026-11-17 简化：只保留纸宽 + 水平偏移两个设置项。
 * 蓝牙/通道偏好/切纸模式已随硬件更新移除（现在只走 POS80 一台 USB 热敏机）。
 *
 * leftShiftMm 存这里，前端每次打印把它作为请求参数发给桥，
 * 桥按请求值渲染图像（覆盖 config.json 里的默认值）。
 */

const SETTING_KEY = "print.preferences";

export interface PrintPreferences {
  /** 纸宽（mm）：80 标准 / 50 窄 */
  paperWidth: "50" | "80";
  /** 打印内容水平偏移（mm）。正数往左，负数往右，用于校正热敏机物理左边距。 */
  leftShiftMm: number;
}

export const DEFAULT_PREFERENCES: PrintPreferences = {
  paperWidth: "80",
  leftShiftMm: 10,
};

function normalize(raw: unknown): PrintPreferences {
  const o = (raw ?? {}) as Record<string, unknown>;
  const paper =
    o.paperWidth === "50" || o.paperWidth === "80" ? o.paperWidth : DEFAULT_PREFERENCES.paperWidth;
  const shift = Number(o.leftShiftMm);
  return {
    paperWidth: paper,
    leftShiftMm: Number.isFinite(shift)
      ? Math.min(20, Math.max(-20, Math.round(shift)))
      : DEFAULT_PREFERENCES.leftShiftMm,
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    const t = await serverT(requestLocale({ request }));
    return NextResponse.json({ error: t("apiErr.unauthorized") }, { status: 401 });
  }

  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    const prefs = row ? normalize(JSON.parse(row.value)) : DEFAULT_PREFERENCES;
    return NextResponse.json({ preferences: prefs });
  } catch {
    // 表还没建时不要让设置页整个崩掉，回默认值
    return NextResponse.json({ preferences: DEFAULT_PREFERENCES });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  const t = await serverT(requestLocale({ request }));
  if (!admin) return NextResponse.json({ error: t("apiErr.unauthorized") }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("apiErr.badJson") }, { status: 400 });
  }

  const prefs = normalize((body as Record<string, unknown>)?.preferences ?? body);
  const value = JSON.stringify(prefs);

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  });

  return NextResponse.json({ ok: true, preferences: prefs });
}
