/**
 * 菜单大类（对应 Prisma enum MenuType）的单一事实来源。
 *
 * 三处地方必须保持一致：Prisma schema 的 `enum MenuType`、后台菜单页的
 * 大类页签、前台菜单页的大类页签。以前这些值是各写各的字符串字面量，
 * 加一个类目就得满仓库找——所以集中到这里。
 */
export const MENU_TYPES = ['FOOD', 'DRINK', 'TOOL'] as const;

export type MenuTypeValue = (typeof MENU_TYPES)[number];

/** 页签图标 */
export const MENU_TYPE_EMOJI: Record<MenuTypeValue, string> = {
  FOOD: '🍽️',
  DRINK: '🥤',
  TOOL: '🎣',
};

/** 翻译键后缀：menu.food / menu.drinks / menu.tools，admin.foodType / admin.drinkType / admin.toolType
 *  注意：键名保留 tools/toolType 不变，只有显示文案是「钓具」——改键名会波及全站引用。 */
export const MENU_TYPE_LABEL_KEY: Record<MenuTypeValue, string> = {
  FOOD: 'menu.food',
  DRINK: 'menu.drinks',
  TOOL: 'menu.tools',
};

export const MENU_TYPE_ADMIN_LABEL_KEY: Record<MenuTypeValue, string> = {
  FOOD: 'admin.foodType',
  DRINK: 'admin.drinkType',
  TOOL: 'admin.toolType',
};

export function isMenuType(value: unknown): value is MenuTypeValue {
  return typeof value === 'string' && (MENU_TYPES as readonly string[]).includes(value);
}
