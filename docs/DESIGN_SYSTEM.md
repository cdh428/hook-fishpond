# Hook Fishpond 全新设计系统

> 基于竞品分析（FishingBooker / Jurassic Mountain / Bo Sang / 小红鱼）+ 现有设计痛点分析
> 配色方案A「湖水清新 Alpine Lake」为主

---

## 一、配色方案（Lake Teal 湖水青）

### 主色 Primary（深湖青蓝 — 品牌/导航/标题）
| Token | Hex | 用途 |
|-------|-----|------|
| primary-50 | #ECFBFC | 选中态背景/标签底 |
| primary-100 | #CFF5F7 | hover背景 |
| primary-200 | #9EEBEE | 边框/分隔 |
| primary-300 | #5FD9DD | 装饰图标 |
| primary-400 | #2BBFC6 | 次按钮 |
| primary-500 | #1FA6A8 | 链接/图标 |
| primary-600 | #178A8C | 深湖蓝绿 |
| primary-700 | #155E75 | **主品牌色**（导航/标题）|
| primary-800 | #0F4A5C | 暗色模式背景 |
| primary-900 | #0A3747 | 暗色模式卡片 |
| primary-950 | #05222B | 近黑 |

### 强调色 Accent（暖琥珀金 — CTA/价格/通知）
| Token | Hex | 用途 |
|-------|-----|------|
| accent-50 | #FFFBEB | 提示背景 |
| accent-100 | #FEF3C7 | 浅金 |
| accent-400 | #FBBF24 | 通知红点 |
| accent-500 | #F59E0B | **主CTA色**（预约/下单/支付）|
| accent-600 | #D97706 | hover |

### 中性色 Neutral（冷调灰蓝）
| Token | Hex | 用途 |
|-------|-----|------|
| neutral-50 | #F8FAFC | 页面底色 |
| neutral-100 | #F1F5F9 | 卡片次级背景 |
| neutral-200 | #E2E8F0 | 边框 |
| neutral-400 | #94A3B8 | 占位符/禁用 |
| neutral-500 | #64748B | 次要文字 |
| neutral-700 | #334155 | 正文 |
| neutral-900 | #0F172A | 主标题 |

### 语义功能色
- 成功: success-600 #16A34A
- 警告: warning-500 #F59E0B（复用accent）
- 错误: error-600 #DC2626

### 语义角色色
- 文字主: #0E2A47 / 次: #64748B / 三: #94A3B8 / 反白: #FFFFFF
- 背景页: #EAF6F5 / 卡片: #FFFFFF / 次级: #F1F8F8
- 边框默认: #E2E8F0 / 聚焦: #1FA6A8

---

## 二、字体系统

### 字体族
- 西文: "Inter", system-ui, sans-serif
- 中文: "Noto Sans SC", "Inter", sans-serif
- 泰文: "Sarabun", "Noto Sans Thai", "Inter", sans-serif

### 字号层级（含泰文行高优化）
| Token | 字号 | 行高(中/英) | 行高(泰文) | 字重 | 用途 |
|-------|------|------------|-----------|------|------|
| display | 30px | 1.2 | 1.33 | 700 | Hero主标题 |
| h1 | 24px | 1.25 | 1.42 | 700 | 页面标题 |
| h2 | 20px | 1.3 | 1.5 | 600 | 区块标题 |
| h3 | 18px | 1.33 | 1.56 | 600 | 卡片标题 |
| body | 16px | 1.5 | 1.625 | 400 | 正文 |
| body-sm | 14px | 1.43 | 1.57 | 400 | 辅助文字 |
| caption | 12px | 1.33 | 1.5 | 500 | 标签/时间 |

### 泰文专项
```css
[lang="th"] { font-family: var(--font-th); line-height: 1.6; }
[lang="th"] button, [lang="th"] input { padding-top: 0.625rem; padding-bottom: 0.625rem; }
```

---

## 三、布局参数
- 容器: max-w-lg (512px) 居中
- Header: h-14 (56px) sticky
- BottomNav: h-16 (64px) fixed
- 水平内边距: px-4 (16px)
- 底部避让: pb-20

### 圆角
- sm: 8px (标签) / md: 12px (按钮) / lg: 16px (卡片) / xl: 24px (弹窗)

### 阴影层级
- xs/sm: 轻微 / md: 卡片 / lg: 重点卡片 / xl: 弹窗
- brand: 0 4px 14px rgba(21,94,117,0.25) / cta: 0 4px 14px rgba(245,158,11,0.35)

---

## 四、组件规范

### 卡片（4级层次）
1. **Hero卡片**: rounded-xl overflow-hidden shadow-lg + 图片 + 渐变遮罩
2. **特性卡片**: bg-white rounded-xl shadow-md border p-4 + 图标容器 h-14 w-14
3. **列表卡片**: bg-white rounded-xl shadow-sm p-3 + flex items-center gap-3
4. **内联卡片**: bg-neutral-50 rounded-lg p-3 无阴影

### 按钮（5种）
1. **主CTA**: bg-accent-500 text-white rounded-xl shadow-cta hover:bg-accent-600
2. **品牌按钮**: bg-primary-700 text-white rounded-xl shadow-brand hover:bg-primary-800
3. **次级按钮**: bg-white text-primary-700 border hover:bg-primary-50
4. **幽灵按钮**: text-primary-700 hover:bg-primary-50
5. **图标按钮**: h-9 w-9 rounded-full bg-primary-50 hover:bg-primary-100

### 导航
- **Header**: bg-primary-700 text-white sticky backdrop-blur
- **BottomNav**: bg-white/95 backdrop-blur, 5Tab, 激活态text-primary-700 + accent指示条

### 状态徽章
- PENDING: warning-100/700 | PAID: primary-100/700
- PREPARING: accent-100/700 | READY: success-100/700 | CANCELLED: error-100/700

---

## 五、Tailwind CSS 4 Token (globals.css)

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-zh: "Noto Sans SC", "Inter", sans-serif;
  --font-th: "Sarabun", "Noto Sans Thai", "Inter", sans-serif;
  --font-display: "Inter", "Noto Sans SC", "Sarabun", sans-serif;

  --color-primary-50: #ECFBFC;
  --color-primary-100: #CFF5F7;
  --color-primary-200: #9EEBEE;
  --color-primary-300: #5FD9DD;
  --color-primary-400: #2BBFC6;
  --color-primary-500: #1FA6A8;
  --color-primary-600: #178A8C;
  --color-primary-700: #155E75;
  --color-primary-800: #0F4A5C;
  --color-primary-900: #0A3747;
  --color-primary-950: #05222B;

  --color-accent-50: #FFFBEB;
  --color-accent-100: #FEF3C7;
  --color-accent-200: #FDE68A;
  --color-accent-300: #FCD34D;
  --color-accent-400: #FBBF24;
  --color-accent-500: #F59E0B;
  --color-accent-600: #D97706;
  --color-accent-700: #B45309;
  --color-accent-800: #92400E;
  --color-accent-900: #78350F;

  --color-neutral-50: #F8FAFC;
  --color-neutral-100: #F1F5F9;
  --color-neutral-200: #E2E8F0;
  --color-neutral-300: #CBD5E1;
  --color-neutral-400: #94A3B8;
  --color-neutral-500: #64748B;
  --color-neutral-600: #475569;
  --color-neutral-700: #334155;
  --color-neutral-800: #1E293B;
  --color-neutral-900: #0F172A;
  --color-neutral-950: #020617;

  --color-success-50: #F0FDF4;
  --color-success-100: #DCFCE7;
  --color-success-500: #22C55E;
  --color-success-600: #16A34A;
  --color-success-700: #15803D;

  --color-warning-50: #FFFBEB;
  --color-warning-100: #FEF3C7;
  --color-warning-500: #F59E0B;
  --color-warning-600: #D97706;

  --color-error-50: #FEF2F2;
  --color-error-100: #FEE2E2;
  --color-error-500: #EF4444;
  --color-error-600: #DC2626;
  --color-error-700: #B91C1C;

  --shadow-brand: 0 4px 14px 0 rgba(21, 94, 117, 0.25);
  --shadow-cta: 0 4px 14px 0 rgba(245, 158, 11, 0.35);
}

[lang="th"] { font-family: var(--font-th); line-height: 1.6; }
[lang="th"] button, [lang="th"] input, [lang="th"] textarea {
  padding-top: 0.625rem; padding-bottom: 0.625rem;
}

@keyframes fade-in-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes bounce-cart { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
```

---

## 六、页面改版方案

### 首页: Hero实景图 + 快捷入口 + 今日推荐 + 特色介绍
### 预约: 步骤指示器 + 区域卡片 + 日期滚动 + grid-cols-6钓位 + 粘性CTA
### 菜单: 分类Pill + 大图卡片 + 右下角浮动购物车
### 饮料: 2列网格 + 内联数量步进器 + 浮动购物车
### 购物车: 左滑删除 + 价格明细 + 卡片式支付选择 + 粘性CTA
### 订单: 筛选Tab + 状态时间线 + 空状态 + 再来一单
### 管理: 数据可视化 + 完整CRUD + 三语后台

---

*设计系统由 fishpond-redesign 团队设计师创建 · 2026-07-09*
