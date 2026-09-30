> **这是权威版本。** 项目里的同名 skill 只保留触发入口，正文以本文件为准。
> 更新日期：2026-09-30

# Hook Fishpond · 视频制作与发布标准流程

## 什么时候用

- 用户要求制作宣传/促销视频（社媒用）
- 需要添加片尾定格（logo + 联络信息）
- 需要合并多个视频片段
- 需要导出适合 FB/IG/TikTok 的竖屏视频

---

## 技术栈

| 工具 | 用途 | 路径 |
|------|------|------|
| **Remotion** | 程序化视频生成（React + TypeScript） | `fishpond-*/` 项目 |
| **FFmpeg** | 视频合并、转码、音频处理 | 系统已安装（`ffmpeg -version`） |
| **ffprobe** | 视频信息检测 | 随 FFmpeg 安装 |

---

## 标准流程（四步）

### 第一步：创建 Remotion 项目

```bash
# 在项目根目录创建
cd "C:/Users/dnlct/WorkBuddy/hook-fishpond"
mkdir -p fishpond-<name>/src
cd fishpond-<name>
npm init -y
npm install remotion @remotion/cli
```

**最小项目结构**：
```
fishpond-<name>/
├── src/
│   ├── index.tsx          # 入口（registerRoot）
│   ├── Root.tsx           # Composition 注册
│   └── Video.tsx          # 主组件
├── public/
│   └── assets/            # 图片素材
├── package.json
└── tsconfig.json
```

**`src/index.tsx`**：
```tsx
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';
registerRoot(() => <RemotionRoot />);
```

**`src/Root.tsx`**：
```tsx
import { Composition } from 'remotion';
import { MyVideo } from './Video';
export const RemotionRoot = () => (
  <Composition
    id="MyVideo"
    component={MyVideo}
    durationInFrames={450}  // 15秒 @ 30fps
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{}}
  />
);
```

---

### 第二步：编写视频组件

**关键 Remotion API**：
```tsx
import { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Sequence } from 'remotion';
import { Img, staticFile } from 'remotion';

// 淡入淡出
const opacity = interpolate(frame, [start, end], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

// 弹跳缩放
const scale = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });

// 多场景时间线
<AbsoluteFill>
  <Sequence from={0} durationInFrames={90}>
    <Scene1 />
  </Sequence>
  <Sequence from={90} durationInFrames={150}>
    <Scene2 />
  </Sequence>
</AbsoluteFill>
```

**泰语字体支持**：
```tsx
// 不需要 loadFont（Remotion 4.x 自动处理）
style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif" }}
```

---

### 第三步：渲染视频

```bash
cd fishpond-<name>

# 打包（首次较慢，后续有缓存）
npx remotion bundle src/index.tsx dist

# 渲染
npx remotion render MyVideo output.mp4
```

**常见错误处理**：
| 错误 | 原因 | 解法 |
|------|------|------|
| `Expected ">" but found "/"` | `.ts` 文件含 JSX | 改名为 `.tsx` |
| `Component is not a function` | `<Comp />` 直接传 | 改为 `() => <Comp />` |
| `Module has no exported member Img` | 从 `@remotion/player` 导入 | 改为从 `remotion` 导入 |

---

### 第四步：合并视频（FFmpeg）

**场景**：原始视频 + 片尾定格 → 最终视频

```bash
# 合并两段视频，保留第一段音频
ffmpeg -i video1.mp4 -i video2.mp4 \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -map "0:a" \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output.mp4
```

**验证音频**：
```bash
ffprobe -v error -show_streams output.mp4 | grep codec_type
# 应输出：codec_type=video 和 codec_type=audio
```

**只合视频（无音频需求）**：
```bash
ffmpeg -i video1.mp4 -i video2.mp4 \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 output.mp4
```

---

## 联络信息规范

**固定格式**（不要随意添加/删除）：
```
LINE: @300bsham
Facebook: Hookhappyness
🌐 hookfishpond.com
```

⚠️ **不加地址**（地址待确认，不在视频中出现）

---

## 视频发布

### 方法一：网站首页展示

1. 复制视频到 `public/media/`
2. 在 `src/lib/media.ts` 添加配置：
```tsx
export const FLOOD_PROMO = {
  src: '/media/bangkok-fishpond-final.mp4',
  w: 768,
  h: 1344,
  duration: 18,
} as const;
```
3. 创建组件并在首页引用
4. 更新三语 i18n

### 方法二：LINE 广播

```bash
node scripts/social/line-broadcast.mjs \
  --text "🎣 曼谷淹水？鱼塘照常开！https://hookfishpond.com/th"
```

⚠️ 需配置 `LINE_CHANNEL_ACCESS_TOKEN`（目前未配置）

### 方法三：Facebook/Instagram

```bash
node scripts/social/fb-ig-post.mjs \
  --image-url https://hookfishpond.com/media/bangkok-fishpond-final.mp4 \
  --caption "🎣 Bangkok Flood? Our pond is fine!"
```

⚠️ 需配置 `META_PAGE_TOKEN`、`FB_PAGE_ID`、`IG_USER_ID`（目前未配置）

### 方法四：手动发布

1. 下载 `public/media/bangkok-fishpond-final.mp4`
2. 通过 LINE/Facebook/Instagram 应用直接上传

---

## 推送前检查

```bash
# 1. i18n 检查
node scripts/check-i18n.mjs

# 2. 类型检查
npx tsc --noEmit

# 3. 构建
CODEBUDDY_SAFE_DELETE_ENABLED=0 npx next build

# 4. 推送
git add public/media/<video>.mp4 src/components/home/VideoComponent.tsx messages/*.json
git commit -m "feat(video): <描述>"
git push origin main
```

---

## 踩过的坑

| 坑 | 教训 |
|----|------|
| FFmpeg 合并时忽略音频（`a=0`） | 必须用 `-map "0:a"` 保留原始音频 |
| 泰语配音中有中文字符 | `check:i18n` 会报串味，必须全部替换为泰语 |
| `.ts` 文件写 JSX | 必须用 `.tsx` 扩展名 |
| `registerRoot(<Comp />)` | 必须写 `registerRoot(() => <Comp />)` |
| git 推送失败因 lock 文件 | 先 `rm -f .git/index.lock` |
| 视频文件太大进 git | `.gitignore` 已排除 `*.mp4`，用 `git add -f` 强制添加 |
| Vercel 部署超时 | 15-18秒视频约 15MB，部署需 2-3 分钟，耐心等待 |

---

## 相关文件

- `fishpond-end-card/` — 片尾定格 Remotion 项目
- `fishpond-flood-ad/` — 洪水促销视频 Remotion 项目
- `scripts/social/line-broadcast.mjs` — LINE 广播脚本
- `scripts/social/fb-ig-post.mjs` — FB/IG 发帖脚本
- `docs/playbooks/push-checklist.md` — 推送前检查清单
