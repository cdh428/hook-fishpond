/**
 * 报表里的「分类名」按语言取。
 *
 * 为什么单独一个小文件、不放在 `lib/reports.ts`：
 * `reports.ts` 里 import 了 Prisma，客户端组件（报表页）一旦直接引用，
 * 整个 Prisma 会被打进浏览器 bundle。这里只保留纯函数，客户端/服务端都能用。
 *
 * 背景：报表 SQL 过去只查 `name_zh`，英文/泰文页面的「分类占比」也全显示中文，
 * 属于语言不一致（docs/playbooks/language-consistency.md）。
 */
export function pickCategory(
  item: {
    category?: string | null;
    category_en?: string | null;
    category_th?: string | null;
  },
  locale: string,
): string {
  if (locale === 'th') return item.category_th || item.category || item.category_en || '';
  if (locale === 'en') return item.category_en || item.category || item.category_th || '';
  return item.category || item.category_en || item.category_th || '';
}
