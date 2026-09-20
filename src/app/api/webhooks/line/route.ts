import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyLineSignature,
  replyLineText,
  lineChannelSecret,
} from "@/lib/line";

/**
 * LINE Messaging API Webhook
 *
 * 作用：把「谁给官方账号发过消息」自动登记成日报接收人，
 * 免去手工去 LINE Developers 抄 userId 的麻烦。
 *
 * 绑定步骤（老板侧）：
 *   1. 用个人 LINE 扫码加自己的官方账号为好友
 *   2. 给它发任意一句话（例如「绑定」）
 *   3. 这里收到事件 → 写入 LineTarget → 回一句「✅ 绑定成功」
 *
 * 安全：必须配置 LINE_CHANNEL_SECRET，用 x-line-signature 验签，
 * 验签失败一律 403（防止伪造请求把陌生人的 ID 塞进来）。
 */

export const dynamic = "force-dynamic";

interface LineSource {
  type?: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

interface LineEvent {
  type?: string;
  replyToken?: string;
  source?: LineSource;
  message?: { type?: string; text?: string };
}

function resolveTarget(source: LineSource | undefined): {
  targetId: string;
  targetType: "USER" | "GROUP" | "ROOM";
} | null {
  if (!source) return null;
  if (source.groupId) return { targetId: source.groupId, targetType: "GROUP" };
  if (source.roomId) return { targetId: source.roomId, targetType: "ROOM" };
  if (source.userId) return { targetId: source.userId, targetType: "USER" };
  return null;
}

async function fetchDisplayName(
  targetId: string,
): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  const isUser = targetId.startsWith("U");
  const url = isUser
    ? `https://api.line.me/v2/bot/profile/${targetId}`
    : `https://api.line.me/v2/bot/group/${targetId}/summary`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const name = (json.displayName || json.groupName) as string | undefined;
    return name ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!lineChannelSecret()) {
    // 未配置密钥 → 无法验签，拒绝处理（否则任何人都能伪造绑定）
    return NextResponse.json(
      { error: "LINE_CHANNEL_SECRET is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-line-signature");
  if (!verifyLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let events: LineEvent[] = [];
  try {
    const parsed = JSON.parse(rawBody) as { events?: LineEvent[] };
    events = parsed.events ?? [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const handled: string[] = [];

  for (const ev of events) {
    const target = resolveTarget(ev.source);
    if (!target) continue;

    try {
      const displayName = await fetchDisplayName(target.targetId);
      const existing = await prisma.lineTarget.findUnique({
        where: { targetId: target.targetId },
      });
      await prisma.lineTarget.upsert({
        where: { targetId: target.targetId },
        create: {
          targetId: target.targetId,
          targetType: target.targetType,
          displayName,
        },
        update: {
          displayName: displayName ?? existing?.displayName ?? null,
          isActive: true,
        },
      });
      handled.push(target.targetId);
    } catch {
      // 绑定失败不影响 webhook 返回 200，否则 LINE 会一直重推
    }

    if (ev.replyToken) {
      const label =
        target.targetType === "USER"
          ? "绑定成功"
          : target.targetType === "GROUP"
            ? "本群绑定成功"
            : "本聊天绑定成功";
      await replyLineText(
        ev.replyToken,
        `✅ ${label}\n每天营业结束会自动把当天经营日报发到这里。\n\n（如需解绑，请在后台「报表 → LINE 日报」中移除）`,
      );
    }
  }

  return NextResponse.json({ ok: true, bound: handled.length });
}

/** LINE 后台「Verify」按钮会发一个空的 POST，返回 200 即通过 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(lineChannelSecret()),
  });
}
