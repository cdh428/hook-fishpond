/**
 * 站点图片 / 影片资源清单（唯一真相）。
 *
 * 成品由 `scripts/_media-derive.py` 导出到 `public/media/`，
 * 每张图片都是**同名 `.jpg` + `.webp` 双份**，页面统一用 `<picture>` 让浏览器自己选。
 *
 * ⚠️ 在这里加一条之前，先确认 `public/media/` 里真的有对应的 `.jpg` 与 `.webp`：
 *    少一个文件，页面上就是一块白。素材总清单见 `public/media/manifest.json`。
 * ⚠️ 客户隐私：所有出镜人物的成品在导出时**已经**做过处理（徽标盖脸 / 第三方品牌模糊），
 *    这里引用的是已处理版本，不要再拿原片替换。
 */

export type Photo = {
  /** 文件名，不含扩展名 */
  base: string;
  /** 原始像素宽（写进 width/height，避免图片加载时页面跳动） */
  w: number;
  /** 原始像素高 */
  h: number;
};

const p = (base: string, w: number, h: number): Photo => ({ base, w, h });

export const photoUrl = (photo: Photo, ext: 'jpg' | 'webp' = 'jpg') =>
  `/media/${photo.base}.${ext}`;

/** 首屏轮播：同一个场景的桌面 16:9 与手机 4:5 两套裁切，**必须成对** */
export type HeroSlide = { key: string; desktop: Photo; mobile: Photo };

export const HERO_SLIDES: HeroSlide[] = [
  {
    key: 's1',
    desktop: p('hero-01-sunset', 1920, 1080),
    mobile: p('hero-m-sunset', 900, 1125),
  },
  {
    key: 's2',
    desktop: p('hero-02-evening', 1920, 1080),
    mobile: p('hero-m-evening', 900, 1125),
  },
  {
    key: 's3',
    desktop: p('hero-03-catch', 1920, 1080),
    mobile: p('hero-m-catch', 900, 1125),
  },
  {
    key: 's4',
    desktop: p('hero-04-moon', 1920, 1080),
    mobile: p('hero-m-moon', 900, 1125),
  },
];

/** 宣传小影片：18.6 秒、无声、循环。横竖两版各一套镜头的顺序都不同 */
export const PROMO = {
  wide: {
    src: '/media/promo-16x9.mp4',
    poster: p('promo-16x9-poster', 1920, 1080),
    w: 1920,
    h: 1080,
  },
  tall: {
    src: '/media/promo-9x16.mp4',
    poster: p('promo-9x16-poster', 1080, 1920),
    w: 1080,
    h: 1920,
  },
} as const;

/**
 * 「可带鱼回家」区块的主图（双手举鱼 · 塘边）。
 *
 * 用**方形裁切版**而不是竖版 `catch-01-holdfish`：竖版裁成横幅会把鱼身拦腰截断，
 * 方形版按 5:4 摆放刚好整条鱼都在画面里，同时**把画面右上角的头部裁掉**
 * （原片本来就看不到脸，只拍到后脑，这样连后脑也不出现）。
 */
export const CATCH_PHOTO = p('catch-sq-holdfish', 1080, 1080);

/** 规则页「渔获可带走」区段的配图：钓到 → 称重（手上没有逐鱼种实拍，用流程照代替） */
export const CATCH_ILLUSTRATIONS: Photo[] = [
  p('catch-sq-holdfish', 1080, 1080),
  p('catch-sq-scale', 1080, 1080),
];

/** 首页「美食」照片墙 */
export const FOOD_WALL: Photo[] = [
  p('food-sq-grilledfish', 1080, 1080),
  p('food-sq-bbq', 1080, 1080),
  p('food-03-skewers', 1000, 1250),
  p('food-04-window', 1000, 1250),
  p('food-01-grilledfish', 1400, 933),
  p('food-02-bbq', 1000, 1250),
];

/** 首页「环境与设施」照片墙 */
export const PLACE_WALL: Photo[] = [
  p('place-sq-dining', 1080, 1080),
  p('place-sq-walkway', 1080, 1080),
  p('place-05-pondview', 1400, 933),
  p('place-04-rodwall', 1400, 933),
  p('place-06-nightpath', 1400, 933),
  p('place-08-bluehour', 1400, 933),
];

/**
 * 开塘故事：12 步完整时间线（2026-02-25 荒地 → 现在）。
 * 日期写死在这里，每一步的标题与说明在 messages 的 `about.stepN` / `about.stepNText`。
 */
export const STORY: { date: string; photo: Photo }[] = [
  { date: '2026-02-25', photo: p('story-01-dayone', 1400, 933) },
  { date: '2026-03-04', photo: p('story-02-excavator', 1400, 933) },
  { date: '2026-03-20', photo: p('story-03-pondbase', 1400, 933) },
  { date: '2026-03-29', photo: p('story-04-embank', 1400, 933) },
  { date: '2026-04-07', photo: p('story-05-frame', 1400, 933) },
  { date: '2026-04-22', photo: p('story-06-roof', 1400, 933) },
  { date: '2026-05-08', photo: p('story-07-building', 1400, 933) },
  { date: '2026-06-24', photo: p('story-08-firstlight', 1400, 933) },
  { date: '2026-07-09', photo: p('story-09-lights', 1400, 933) },
  { date: '2026-08-21', photo: p('story-10-scale', 1400, 933) },
  { date: '2026-08-29', photo: p('story-11-dining', 1400, 933) },
  { date: '2026-08-31', photo: p('story-12-now', 1400, 933) },
];

/** 品牌徽标（已抠成透明圆形，白底/深色底都干净） */
export const LOGO = {
  png256: '/media/brand-logo-256.png',
  png640: '/media/brand-logo-640.png',
} as const;
