/**
 * P1 语言一致性回归 —— 日报文案三语 + 标点
 *
 * 用法：npx tsx scripts/verify-p1-lang.ts
 *
 * 断言（en / th 正文里不得出现中文汉字或中文全角标点）：
 *  - 标题、星期、空单日、取消/拒单、目标毛利率、鱼塘客流
 *  - 中文版仍必须是全角括号（不能为了国际化把中文也改成半角）
 */
import { composeDailyReportText, demoReportPayload, reportLabels } from '../src/lib/daily-report';

const CJK = /[\u4e00-\u9fff]/;
const FULLWIDTH = /[（）｜：，、]/;

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const payload = demoReportPayload();
// 额外造一条「有取消单」的场景，确保取消行也被翻译
const withCancel = {
  ...payload,
  overview: { ...payload.overview, cancelledOrders: 3 },
};

for (const loc of ['zh', 'en', 'th'] as const) {
  console.log(`\n[${loc}]`);
  const text = composeDailyReportText(withCancel, loc);
  console.log(text.split('\n').slice(0, 6).map((l) => '    ' + l).join('\n'));

  if (loc === 'zh') {
    check('中文版含全角括号', text.includes('（'));
    check('中文版含中文撤单说明', text.includes('取消/拒单 3 单'));
  } else {
    check('无汉字', !CJK.test(text), text.match(CJK) ? `首个命中：${text.match(CJK)}` : '');
    check('无中文全角标点', !FULLWIDTH.test(text));
    check('撤销行已本地化', loc === 'en' ? text.includes('Cancelled') : text.includes('ยกเลิก'));
    check('星期已本地化', loc === 'en' ? /\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)/.test(text) : /\(วัน/.test(text));
  }
}

// 空单日 + 休息日（周一）也要走对语言
console.log('\n[empty-day]');
const empty = {
  ...payload,
  overview: {
    ...payload.overview,
    orderCount: 0,
    bookingCount: 0,
    totalRevenue: 0,
    ordersRevenue: 0,
  } as typeof payload.overview,
};
for (const loc of ['en', 'th'] as const) {
  const text = composeDailyReportText(empty, loc, { closed: { closed: true, reason: 'monday' } });
  console.log(`  [${loc}] ${text.split('\n').slice(0, 3).join(' / ')}`);
  check(`${loc} 空单日无汉字`, !CJK.test(text));
}

// 推送提示（无 token / 无接收人）也要跟语言
console.log('\n[hints]');
for (const loc of ['en', 'th'] as const) {
  const L = reportLabels(loc);
  check(`${loc} noTokenHint 无汉字`, !CJK.test(L.noTokenHint));
  check(`${loc} noTargetsHint 无汉字`, !CJK.test(L.noTargetsHint));
}

console.log(failed === 0 ? '\n✅ P1 日报语言回归通过' : `\n❌ ${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
