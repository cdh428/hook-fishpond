import crypto from 'node:crypto';

/**
 * LINE Messaging API 客户端
 *
 * 背景：LINE Notify 已于 2025-03-31 停服，官方指定替代是走「LINE 官方账号 +
 * Messaging API」。推送需要两样东西：
 *   1. Channel Access Token（长期）→ 调 API 的凭据
 *   2. 接收目标 ID（userId / groupId / roomId）→ 不是官方账号自己的 @ID，
 *      而是「加了该官方账号为好友的人」或「把官方账号拉进去的群」的 ID
 *
 * 目标 ID 由 /api/webhooks/line 自动捕获，无需人工抄写。
 */

const LINE_API = 'https://api.line.me/v2/bot';

export interface LineMessage {
  type: 'text';
  text: string;
}

export interface LineSendResult {
  ok: boolean;
  status: number;
  detail: string;
}

export function lineAccessToken(): string | null {
  const v = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  return v && v.trim() ? v.trim() : null;
}

export function lineChannelSecret(): string | null {
  const v = process.env.LINE_CHANNEL_SECRET;
  return v && v.trim() ? v.trim() : null;
}

/**
 * 校验 LINE webhook 的 x-line-signature。
 * 算法：HMAC-SHA256(channelSecret, rawBody) → base64，与请求头逐字节比较。
 * 未配置 secret 时返回 false（视为不可信，拒绝绑定）。
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = lineChannelSecret();
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function callLine(
  endpoint: 'push' | 'reply',
  body: Record<string, unknown>,
): Promise<LineSendResult> {
  const token = lineAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 0,
      detail:
        'LINE_CHANNEL_ACCESS_TOKEN 未配置（Vercel 环境变量缺失）',
    };
  }

  try {
    const res = await fetch(`${LINE_API}/message/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      detail: text || (res.ok ? 'ok' : 'empty body'),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 主动推送（日报用），to = userId / groupId / roomId */
export function pushLineText(to: string, text: string): Promise<LineSendResult> {
  return callLine('push', { to, messages: [{ type: 'text', text }] });
}

/** 回复（webhook 里的 replyToken，免费且不占推送配额） */
export function replyLineText(
  replyToken: string,
  text: string,
): Promise<LineSendResult> {
  return callLine('reply', {
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

/** LINE 文本消息上限 5000 字符，超出要截断（否则整条被拒） */
export function clampLineText(text: string, limit = 4900): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 20)}\n…（内容过长已截断）`;
}
