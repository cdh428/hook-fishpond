import { randomUUID } from "crypto";
import { signRaw, verifyRaw } from "./auth";

/**
 * LINE Login（OIDC）—— 顾客身份通道（方案②，见 docs/archive/otp-line-login-oa-plan.html）
 * ============================================================
 *
 * 流程：start（302 到 LINE 授权页）→ 用户授权（bot_prompt=aggressive 顺带引导加官方账号好友）
 *      → callback 带 code → 服务端 code 换 access token → userinfo 拿 sub(LINE userId)
 *      → 建/找 User → 下发顾客 HMAC 会话 cookie。
 *
 * 用 userinfo 端点而不是本地解析 id_token：省掉 JWT 验签（LINE 的 RS256 公钥轮换），
 * token 是我们用 secret 换来的、走 HTTPS，安全性足够。
 *
 * state：HMAC 签名的短时 cookie（复用 admin 会话的签名机制），防 CSRF；
 * callback 必须带回同一个 state，验签 + 10 分钟过期。
 */

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const USERINFO_URL = "https://api.line.me/oauth2/v2.1/userinfo";
/** state 有效期（秒）：授权页停留一般几十秒，10 分钟足够宽裕 */
const STATE_TTL_SECONDS = 10 * 60;
export const LINE_STATE_COOKIE = "hf-line-state";

export interface LineLoginConfig {
  channelId: string;
  channelSecret: string;
  /** 绝对地址，如 https://www.hookfishpond.com */
  baseUrl: string;
}

export function lineLoginConfig(): LineLoginConfig | null {
  const channelId = (process.env.LINE_LOGIN_CHANNEL_ID || "").trim();
  const channelSecret = (process.env.LINE_LOGIN_CHANNEL_SECRET || "").trim();
  if (!channelId || !channelSecret) return null;
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.hookfishpond.com"
  ).replace(/\/+$/, "");
  return { channelId, channelSecret, baseUrl };
}

/** 授权页地址（bot_prompt=aggressive：授权时顺带引导加 @300bsham 好友） */
export function buildAuthorizeUrl(cfg: LineLoginConfig, state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.channelId,
    redirect_uri: `${cfg.baseUrl}/api/auth/line/callback`,
    state,
    scope: "profile openid",
    bot_prompt: "aggressive",
  });
  return `${AUTHORIZE_URL}?${q.toString()}`;
}

/**
 * 生成 state 并签名：`<base64url({n,iat,language})>.<hmac>`（复用会话密钥）。
 * state 不携带任何身份，只防伪造与重放 + 记住发起语言；时效在 verifyState 里判。
 */
export function issueState(language: string): { token: string; maxAge: number } {
  const payload = Buffer.from(
    JSON.stringify({ n: randomUUID(), iat: Date.now(), language }),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { token: `${payload}.${signRaw(payload)}`, maxAge: STATE_TTL_SECONDS };
}

/** 验 state（签名 + 时效） */
export function verifyState(token: string | undefined | null): boolean {
  if (!token || !token.includes(".")) return false;
  const idx = token.lastIndexOf(".");
  const payload = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  if (!payload || !mac) return false;
  if (!verifyRaw(payload, mac)) return false;
  try {
    const raw = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const data = JSON.parse(raw) as { iat?: number };
    if (typeof data.iat !== "number") return false;
    return Date.now() - data.iat <= STATE_TTL_SECONDS * 1000;
  } catch {
    return false;
  }
}

export interface LineProfile {
  /** LINE userId（`U` 开头 32 位十六进制） */
  sub: string;
  name?: string;
  picture?: string;
}

/** code 换 access token（规范要求 application/x-www-form-urlencoded） */
export async function exchangeCode(
  cfg: LineLoginConfig,
  code: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${cfg.baseUrl}/api/auth/line/callback`,
        client_id: cfg.channelId,
        client_secret: cfg.channelSecret,
      }),
    });
  } catch (e: any) {
    return { ok: false, error: `network: ${e?.message || e}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `token ${res.status}: ${text.slice(0, 200)}` };
  }
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  if (!json?.access_token) return { ok: false, error: "no access_token" };
  return { ok: true, accessToken: json.access_token };
}

/** access token → LINE userId / 昵称 */
export async function fetchProfile(
  accessToken: string,
): Promise<{ ok: true; profile: LineProfile } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e: any) {
    return { ok: false, error: `network: ${e?.message || e}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `userinfo ${res.status}: ${text.slice(0, 200)}` };
  }
  const json = (await res.json().catch(() => null)) as {
    sub?: string;
    name?: string;
    picture?: string;
  } | null;
  if (!json?.sub) return { ok: false, error: "userinfo missing sub" };
  return {
    ok: true,
    profile: { sub: json.sub, name: json.name, picture: json.picture },
  };
}
