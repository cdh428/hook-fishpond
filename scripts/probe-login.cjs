// 只读探针：登录生产 admin，验证本机口令是否与生产同步
// 输出只有 status / cookie 名 / 角色 —— 绝不打印口令
const fs = require('fs');

const t = fs.readFileSync('.workbuddy/secrets/ADMIN_PASS.txt', 'utf8');
const user = (t.match(/^user=(.*)$/m) || [])[1]?.trim();
const pass = (t.match(/^password=(.*)$/m) || [])[1]?.trim();
if (!user || !pass) {
  console.error('ADMIN_PASS.txt 格式异常：需要 user= 与 password= 两行');
  process.exit(1);
}

const BASE = process.env.BASE || 'https://www.hookfishpond.com';

(async () => {
  const r = await fetch(BASE + '/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
    redirect: 'manual',
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const cookieName = setCookie.split('=')[0] || null;
  let role = null;
  try {
    const j = await r.json();
    role = j.role || j.user?.role || null;
  } catch {}
  console.log('base:', BASE);
  console.log('status:', r.status);
  console.log('cookie:', cookieName ? cookieName + ' (set)' : '(none)');
  console.log('role:', role);
  console.log(r.status === 200 ? 'OK: 口令与生产同步' : 'FAIL: 口令与生产不一致，需用户在 Vercel env 或本机 secrets 二选一同步');
})();
