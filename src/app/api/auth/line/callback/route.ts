import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_COOKIE_OPTIONS,
  signCustomerSession,
} from "@/lib/auth";
import {
  exchangeCode,
  fetchProfile,
  lineLoginConfig,
  LINE_STATE_COOKIE,
  verifyState,
} from "@/lib/line-login";

/**
 * GET /api/auth/line/callback?code=...&state=...
 *
 * LINE 回跳：验 state → code 换 token → userinfo 拿 LINE userId →
 * 按 lineUserId 建/找 User → 下发顾客 HMAC 会话 cookie → 跳回 profile 页。
 *
 * 错误一律 302 回 `/{locale}/profile?lineError=<code>`，前端按码出本地化提示；
 * 不渲染 HTML 错误页（这里跳的是浏览器，回页面最自然）。
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const stateCookie = request.cookies.get(LINE_STATE_COOKIE)?.value;

  // state cookie 里存着发起时的 locale；验签失败就拿不到了，退回 zh
  let locale = "zh";
  try {
    if (stateCookie?.includes(".")) {
      const raw = Buffer.from(
        stateCookie.slice(0, stateCookie.lastIndexOf(".")).replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
      const l = JSON.parse(raw)?.language;
      if (["zh", "en", "th"].includes(l)) locale = l;
    }
  } catch {
    /* locale 解析失败不阻塞，回 zh */
  }
  const back = (err: string) =>
    NextResponse.redirect(`${url.origin}/${locale}/profile?lineError=${err}`);

  const cfg = lineLoginConfig();
  if (!cfg) return back("notConfigured");
  if (!code || !verifyState(stateCookie)) {
    return back(state && !stateCookie ? "expired" : "invalidState");
  }
  // 防重放：state 一次性
  if (state !== stateCookie) return back("invalidState");

  const token = await exchangeCode(cfg, code);
  if (!token.ok) {
    console.error("[line-login] exchange:", token.error);
    return back("tokenFailed");
  }

  const profile = await fetchProfile(token.accessToken);
  if (!profile.ok) {
    console.error("[line-login] userinfo:", profile.error);
    return back("profileFailed");
  }

  // 按 LINE userId 建/找（幂等登录）。LINE 注册没有手机号 → phone=null、name 用昵称或兜底
  let user;
  try {
    user = await prisma.user.upsert({
      where: { lineUserId: profile.profile.sub },
      create: {
        lineUserId: profile.profile.sub,
        name: profile.profile.name?.slice(0, 60) || "LINE 用户",
        language: locale,
      },
      update: { language: locale },
    });
  } catch (e: any) {
    console.error("[line-login] upsert user:", e?.message || e);
    return back("serverError");
  }

  const res = NextResponse.redirect(`${url.origin}/${locale}/profile?lineLogin=1`);
  res.cookies.set(CUSTOMER_COOKIE_NAME, signCustomerSession(user.id), CUSTOMER_COOKIE_OPTIONS);
  res.cookies.delete(LINE_STATE_COOKIE);
  return res;
}
