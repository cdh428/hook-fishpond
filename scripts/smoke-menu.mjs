// 真实浏览器冒烟：抓 console 报错 / 未捕获异常 / 失败请求，并验证指定菜品是否可下单
// 用法：node scripts/_smoke-menu.mjs [菜品关键字]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/dnlct/WorkBuddy/hook-fishpond/');
const { chromium } = require(
  'C:/Users/dnlct/.workbuddy/binaries/node/versions/22.22.2-6/node_modules/playwright',
);

const KEYWORD = process.argv[2] || '1.25';
const BASE = 'https://www.hookfishpond.com';

// 本机有 http_proxy，Playwright 会读环境变量走代理导致 ERR_SSL_PROTOCOL_ERROR，先清掉
for (const k of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
]) {
  delete process.env[k];
}
const browser = await chromium.launch({
  // 本机 ms-playwright 里只有 1217，指定复用，省一次 150MB 下载
  executablePath:
    process.env.PW_EXEC ||
    'C:/Users/dnlct/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe',
  args: ['--no-proxy-server', '--disable-quic'],
});
const ctx = await browser.newContext({ locale: 'zh-CN' });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedReqs = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
page.on('requestfailed', (r) =>
  failedReqs.push(`${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`),
);

const targets = ['/zh/menu', '/zh', '/zh/booking'];
for (const path of targets) {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  failedReqs.length = 0;
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
  console.log(`\n=== ${path}  HTTP ${res?.status()} ===`);
  console.log(`console.error: ${consoleErrors.length}`);
  consoleErrors.slice(0, 8).forEach((e) => console.log('   [console] ' + e));
  console.log(`uncaught: ${pageErrors.length}`);
  pageErrors.slice(0, 8).forEach((e) => console.log('   [uncaught] ' + e));
  console.log(`failed requests: ${failedReqs.length}`);
  failedReqs.slice(0, 8).forEach((e) => console.log('   [req] ' + e));

  if (path === '/zh/menu') {
    await page.waitForTimeout(2500);
    const cards = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, div[role="button"], li').forEach((el) => {
        const t = (el.textContent || '').trim();
        if (t && t.length < 60) out.push(t.replace(/\s+/g, ' '));
      });
      return out;
    });
    const bodyText = await page.evaluate(() =>
      (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
    );
    require('node:fs').mkdirSync('.workbuddy/shots', { recursive: true });
    await page.screenshot({ path: '.workbuddy/shots/menu.png', fullPage: false });
    await page.screenshot({ path: '.workbuddy/shots/menu-full.png', fullPage: true });
    require('node:fs').writeFileSync('.workbuddy/shots/menu-text.txt', bodyText);
    console.log('-- body text len: ' + bodyText.length);

    // 切到「饮品」tab，验证可乐
    try {
      const drinkBtn = page.locator('button:has-text("饮品"), a:has-text("饮品")').first();
      await drinkBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: '.workbuddy/shots/menu-drink.png', fullPage: true });
      const drinkText = await page.evaluate(() =>
        (document.body.innerText || '').replace(/\s+/g, ' '),
      );
      require('node:fs').writeFileSync('.workbuddy/shots/menu-drink-text.txt', drinkText);
      console.log('-- drink tab text len: ' + drinkText.length);

      // 再点「饮料」子类，列出全部软饮
      const subBtn = page.locator('button:has-text("饮料")').first();
      await subBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '.workbuddy/shots/menu-drink-all.png', fullPage: true });
      const allText = await page.evaluate(() =>
        (document.body.innerText || '').replace(/\s+/g, ' '),
      );
      require('node:fs').writeFileSync(
        '.workbuddy/shots/menu-drink-all-text.txt',
        allText,
      );
      console.log('-- drink>饮料 sub tab text len: ' + allText.length);
    } catch (e) {
      console.log('-- drink tab click failed: ' + String(e).slice(0, 120));
    }
  }
}

await browser.close();
