import { NextResponse } from "next/server";

/**
 * 下载类接口（Excel / CSV）失败时返回的错误页。
 *
 * 为什么不是 JSON：这些请求是浏览器**导航**（`<a href>` / `window.location`），
 * 返回 JSON 会让用户看到 `{"error":"导出失败"}` 这种原文页，既看不懂也没有出口。
 * 这里给一个最小 HTML，文案由调用方按当前语言传入。
 */
export function downloadErrorPage(
  message: string,
  labels: { back: string; title: string },
): NextResponse {
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(labels.title)}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:#fafafa;color:#171717}
  .box{max-width:30rem;padding:2rem;text-align:center}
  .t{font-size:1.125rem;font-weight:600;margin-bottom:.75rem}
  .m{font-size:.9375rem;color:#525252;line-height:1.6;margin-bottom:1.5rem;word-break:break-word}
  a{display:inline-block;padding:.625rem 1.25rem;border-radius:.75rem;background:#15803d;color:#fff;
    text-decoration:none;font-size:.875rem;font-weight:600}
</style></head>
<body><div class="box">
  <div class="t">${esc(labels.title)}</div>
  <div class="m">${esc(message)}</div>
  <a href="javascript:history.back()">${esc(labels.back)}</a>
</div></body></html>`;
  return new NextResponse(html, {
    status: 500,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
