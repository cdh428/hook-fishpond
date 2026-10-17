import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * 打印偏好 —— 存在数据库，手机和电脑共用同一份。
 *
 * 为什么不用 localStorage：设置原先按设备各存各的，手机存 `COM8`、收银机存
 * `POS80`，两边永远对不上。现在改成「按单据角色存偏好」，与具体机器解耦：
 *
 *   kitchen / bill / receipt → "usb" | "bluetooth" | "auto"
 *
 * 实际投递时由本机打印桥决定走哪条通道 —— 手机连的是哪台收银机的桥，
 * 就按那台机器的通道发；偏好只是「优先用哪条」。
 *
 * 例外：如果某台机器的目标就是不可用的（比如被指到已断开的 COM 口），
 * 桥自己会报错，前端再自动改投同机另一条通道。
 */

const SETTING_KEY = "print.preferences";

export type ChannelPreference = "usb" | "bluetooth" | "auto";

export interface PrintPreferences {
  kitchen: ChannelPreference;
  bill: ChannelPreference;
  receipt: ChannelPreference;
  /** 纸张切法：full 全切 / partial 半切（留一点连着）/ full-feed 全切+多走纸 */
  cutMode: "full" | "partial" | "full-feed" | "partial-feed";
  /** 切纸前走纸行数，切在字上就调大 */
  feedLines: number;
}

export const DEFAULT_PREFERENCES: PrintPreferences = {
  kitchen: "usb",
  bill: "usb",
  receipt: "usb",
  cutMode: "full",
  feedLines: 6,
};

const VALID_CHANNEL: ChannelPreference[] = ["usb", "bluetooth", "auto"];
const VALID_CUT = ["full", "partial", "full-feed", "partial-feed"] as const;

function normalize(raw: unknown): PrintPreferences {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ch = (v: unknown): ChannelPreference =>
    VALID_CHANNEL.includes(v as ChannelPreference) ? (v as ChannelPreference) : "usb";
  const cut = VALID_CUT.includes(o.cutMode as never)
    ? (o.cutMode as PrintPreferences["cutMode"])
    : DEFAULT_PREFERENCES.cutMode;
  const feed = Number(o.feedLines);
  return {
    kitchen: ch(o.kitchen),
    bill: ch(o.bill),
    receipt: ch(o.receipt),
    cutMode: cut,
    feedLines: Number.isFinite(feed) ? Math.min(12, Math.max(0, Math.round(feed))) : DEFAULT_PREFERENCES.feedLines,
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

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
  if (!admin) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
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
