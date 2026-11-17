import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  buildAuthorizeUrl,
  issueState,
  lineLoginConfig,
  LINE_STATE_COOKIE,
} from "@/lib/line-login";
import { CUSTOMER_COOKIE_NAME } from "@/lib/auth";

/**
 * GET /api/auth/line/start?locale=zh|en|th
 *
 * LINE Login 入口：302 到 LINE 授权页。bot_prompt=aggressive 让用户在授权时
 * 顺带被引导加官方账号 @300bsham 好友（登录+加好友一步完成，方案④的价值并入②）。
 *
 * locale 记进 state cookie（签名），callback 成功后跳回对应语言的页面。
 * 未配置 channel 时 302 回登录页并带 ?lineError=notConfigured，前端出本地化提示。
 */
export async function GET(request: NextRequest) {
  const cfg = lineLoginConfig();
  const url = new URL(request.url);
  const locale = ["zh", "en", "th"].includes(url.searchParams.get("locale") || "")
    ? (url.searchParams.get("locale") as string)
    : "zh";
  const back = `${url.origin}/${locale}/profile`;

  if (!cfg) {
    return NextResponse.redirect(`${back}?lineError=notConfigured`);
  }

  // 登录入口也限流（挡脚本批量撞）
  const ip = clientIp(request);
  const limit = rateLimit(`line-start:ip:${ip}`, 20, 5 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.redirect(`${back}?lineError=tooMany`);
  }

  const state = issueState(locale);
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, state.token));
  res.cookies.set(LINE_STATE_COOKIE, state.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: state.maxAge,
    path: "/",
  });
  // 清掉可能存在的旧会话，避免「换账号登录」时旧 cookie 干扰判断
  res.cookies.delete(CUSTOMER_COOKIE_NAME);
  return res;
}
