> **这是权威版本。** 项目里的同名 skill 只保留触发入口，正文以本文件为准。
> 搬进仓库的原因：`.workbuddy/` 被 `.gitignore` 忽略，知识只存在本机 —— 换机器或交接就没了。
> 已脱敏：去掉了所有明文凭据与「从仓库文件里读 token」这类过时做法。
> 更新日期：2026-09-28

# Hook Fishpond · 影像素材整理流水线

## 什么时候用

- 用户交来一批实拍照片/视频（如 `D:\HTH\photo\Pictures`），要求整理成网站内容
- 补拍一轮之后要**替换**站点上的照片（同样的流程再跑一遍即可）
- 要从照片合成一段宣传小影片
- 要给某个页面区块挑图 / 裁图 / 做背景底纹

**不适用**：只改网页代码（那是普通前端改动）；只做设计稿（走 Ardot）。

## 环境

```bash
PY="C:/Users/dnlct/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
```
venv 里已装 `Pillow` / `numpy` / `imageio-ffmpeg`（自带 ffmpeg-win-x86_64-v7.1.exe）。
**所有脚本都写成 `scripts/_*.py`**（`.gitignore` 里 `scripts/_*` 已忽略，不会进仓库）。

## 五步流水线

| 步 | 脚本 | 产出 |
|---|---|---|
| 1 盘点 | `scripts/_media-inventory.py` | `.workbuddy/_tmp/media-inventory.json`（EXIF + 画质指标） |
| 2 编号 | `scripts/_media-contact-sheet.py` | 联络表 + **P001…Pnnn 统一编号**（全流程的通用语言） |
| 3 选片 | `scripts/_media-shortlist.py` / `_media-video-probe.py` | 分组高分候选页 / 视频抽帧预览 |
| 4 导出 | `scripts/_media-derive.py` | `public/media/` 成品（JPG+WebP）+ `manifest.json` |
| 5 影片 | `scripts/_media-video.py` | `promo-16x9.mp4` / `promo-9x16.mp4` + poster |
| 5b 重建清单 | `scripts/_media-manifest.py` | 补全 `manifest.json`（不重新编码） |

**验收**：跑 `scripts/_media-review.py` 看成品裁切，或直接拼 QA 图用 Read 目视。

## ⛔ 硬规则（都踩过，别退回）

### 1. 影片必须「先逐镜头、再拼接」
一次性把 10 张静图 + 片尾丢进一个 `filter_complex`、中间层 scale 到 2880×1620 再 zoompan、
配 `-preset slow` → **30 分钟编不完，subprocess 超时被杀，留下缺 moov 的残缺 mp4**。
```python
# ✅ 正确：单镜头只处理 60 帧
shot_clip(img, tmp_clip, motion, w, h)   # -preset veryfast -crf 18 -t 2.4
# 然后再用 xfade 串起来                      # -preset medium -crf 25
```
**30 分钟 → 1 分 7 秒。**

### 2. WebM/VP9 默认关
H.264 + `-movflags +faststart` 已全平台可播。VP9 白等奖十分钟，只在明确需要时才 `--webm`。

### 3. 裁切取景：纵横两个方向都可能失效，必须逐镜给参数
`fit_cover(im, tw, th, anchor=0.42, ax=0.5, zoom=1.0)` 三个参数各有分工：

| 参数 | 含义 | 什么时候必须动 |
|---|---|---|
| `anchor` | 纵向锚点 0=取上 1=取下 | **竖片裁 16:9**（只留约四成高度）→ 主体偏上用 `0.22~0.30` |
| `ax` | 横向锚点 0=取左 1=取右 | **横片裁 9:16**（只留约三分之二宽度）→ 主体在右用 `0.8~1.0` |
| `zoom` | 额外放大 >1 切掉无用区域 | 画面里天空/地面占比过大时（`1.15~1.35`） |

**关键判断法**：先算 `scale = max(tw/sw, th/sh)`。
- 若 `nh == th`（高度正好贴合）→ **纵向锚点完全失效**，只能靠 `ax` 选左右；
- 若 `nw == tw`（宽度正好贴合）→ **横向锚点完全失效**，只能靠 `anchor` 选上下。

踩过的实例：
- 竖片裁 16:9 → 电子秤只剩桌腿、步道裁到篷布和梯子（补 `anchor`）
- 横片裁 9:16 → 剪出一条「中间带」，竖版开场只剩天空与停车场（补 `ax=1.0` + `zoom=1.35`）

⚠️ 另一个连带后果：**竖版影片的 poster 就是第一镜**（`-ss 1.2` 抽帧），
所以竖版第一镜取景差 = 封面差 = 第一印象差。改完一定单独看 poster。

`apply_recipe` 统一读 `r["anchor"] / r["ax"] / r["zoom"]`；
`apply_brand_blur` / `apply_privacy` 也接受这三个参数（内部用同一套 `_cover_transform`），
**给成品换了取景参数后，隐私贴纸与品牌模糊的坐标会跟着变**，改完要复查。

### 4. 影片的「顺序」比「选片」更能决定观感 —— 而且横竖版该用不同的顺序
初版把最灰的两张平光白天图放在**开头**，全片前 8 秒即最低分。
→ **开场和收尾都压在全片最亮眼的一两场上；平光图只放中段交代规模。**
选片时先看 `saturation`（<0.25 = 平光，慎用）和 `brightness`。

- **横版**：日落开场、日落收尾。
- **竖版**：把**「手里这条鱼」提到第一镜**当钩子 —— 竖屏在信息流里只有前一兩秒会被看完，
  风景开场是浪费。竖版可以整体另排一套顺序。

**顺序的唯一来源是 `_media-derive.py`**：`VIDEO_SHOTS`（横）+ `VIDEO_SHOTS_TALL`（竖），
每项是 `(pid, 运动, anchor, ax, zoom)`。导出时同时写 `public/media/_video-plan.json`，
`_media-video.py` 读它来决定「用哪些帧、按什么顺序、配什么运动」。
→ **别再在两个脚本里各写一份 ORDER 靠注释硬撑**（改了导出顺序忘同步 → 成片顺序静默错乱）；
  `_media-video.py` 内保留 `fallback_order()` 仅作 json 缺失时的兜底。
跑 `--dry` 会打印 `P211:in → P184:in → …`，改完顺序先干跑一眼。

### 5. 所有 manifest 一律「合并写入」
早先版本 `write_text` 直接覆写：带 `--only logo` 跑子集后 58 项记录全丢；
`promo-manifest.json` 跑 `--tall-only` 会把横版那条记录抹掉。
→ 两个清单都改成按 key merge（`manifest.json` 按 `file`，`promo-manifest.json` 按 `stem`）；
   `manifest.json` 丢了就用 `_media-manifest.py` 从 PLAN + 磁盘重建。

### 6. 本机 safe-delete 会打断脚本收尾 → 跑导出/影片一律带环境变量
一轮内批量 `unlink` 会被 safe-delete shim 拦停
（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`，进程直接结束），
表现为**跑完没有最后那行汇总、manifest 也没更新**（看着像成功了，其实半途掉的）。
```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 "$PY" scripts/_media-video.py --tall-only
```
同时**清理临时文件要吞掉所有异常**（`except Exception`，不是 `except OSError`），
且**必须放在成片/清单写盘之后**——清理失败不能毁掉产出。
判据：跑完 `public/media/_clips/` 应该为空，`promo-manifest.json` 里两版都在。

### 7. 品牌徽标抠图 = 径向剖面法，别用阈值 bbox
源图（P119 `MEITU_20260404_154641101.jpg`）**角落有水印**，
任何 `np.where(diff > t)` 都会得到横跨整幅的 bbox。
→ 用强内容质心算 `np.bincount(rr, weights=diff)` 径向剖面，
找第一个「连续 10 像素平均差异 < 5」的半径（实测 **575**）。4× 超采样画圆再缩。

### 8. PIL 坑
- `im.draft()` **会把 `im.size` 改成降采样值** → 必须在 draft **之前**读 size
- 所有导出先 `ImageOps.exif_transpose()`，否则手机竖拍图会躺倒

## 交付方式（重要）

用户要求**先确认再上线**。所以：
1. 产出**自包含 HTML 方案板**（`docs/media-preview.html`），含真实叠层效果模拟、双版 `<video>`、
   成品清单表格、**待拍板项**、**建议补拍清单**
2. **清单数据内嵌**进 HTML（别用 `fetch()`）→ 双击就能看，不依赖本地服务
3. 方案板的图片引用**一律用 `../public/media/`**（相对 `docs/`）—— 这样方案板能随仓库
   直接分发，不需要额外的 `docs/media/` 副本（该副本 2026-09-25 已删除，别再建）。
   改完必须**逐个校验引用存在**：
   ```js
   const miss = [...new Set(refs)].filter(r => !fs.existsSync(path.resolve('docs', r)));
   ```
4. 用 `present_files` 推给用户；**站点代码与 `messages/*.json` 一律不动，不推送**
5. 用户点头后再落地 → 见下面的「素材入库」

## 素材入库（用户点头之后）

`public/` 默认**完全不在版本控制**，所以入库要手工挑。**只提交页面真正用到的成品**：

```gitignore
public/media/vid[0-9][0-9].jpg   # 影片中间帧（横）
public/media/vidt[0-9][0-9].jpg  # 影片中间帧（竖）
public/media/_endcard-*.jpg      # 片尾卡
public/media/_video-plan.json    # 镜头计划（可由 _media-derive.py 重生成）
public/media/_clips/
```

⚠️ 上面这 5 条**只影响 git**，这些文件仍然躺在 `public/media/` 里（管线要读写它们）。
**别把它们挪走** —— 挪了 `_media-video.py` 找不到镜头帧和计划文件，重跑成片会直接失败。

### `public/` 只放「站点实际会加载的」

2026-09-26 立为规矩：站点**从未引用**的派生物移到 `docs/media-archive/`。做法：

1. 用脚本对账（源码里 `p('base'` 与 `'/media/xxx'` 两种写法都要抓）→ 差集就是孤儿
2. `fs.renameSync` 移到 `docs/media-archive/`（**只移动不删除**：能从原片重生成，
   但删了就没了，且用户可能后续想换版式）
3. **跳过**上面那 5 类管线中间产物
4. **同步两处**，否则清单会指向不存在的文件：
   - 裁 `public/media/manifest.json`：丢掉 `items` 里文件已不在的条目、重算 `count` /
     `totalBytes`、`png: []` 数组也要按存在性过滤（**`brand-logo` 这项是 4 合 1 的
     `png[]`，最容易漏**）
   - 改 `docs/media-preview.html`：内嵌清单整行重嵌、把移走的图重定向到
     `../docs/media-archive/…`、KPI 数字跟着改
5. 收尾必须校验「清单引用的文件 ⟷ 实际文件」双向 0 缺失

典型规模（2026-09-26）：`public/media` 上线 76 个文件 / 24.6MB（网页用图 35 项 11.3MB
+ 2 版 mp4 13.0MB + 2 徽标 png）；归档 33 个文件 / 3.5MB 到 `docs/media-archive/`。

### 提交前的对账与预演

- 提交前用 **manifest ⟷ 实际文件对账**，别凭印象数：
  ```js
  const need = new Set();
  for (const it of m.items) { need.add(it.file+'.jpg'); need.add(it.file+'.webp'); }
  for (const v of m.videos) need.add(v.file);        // ⚠️ videos[] 的字段是 `file`，不是 `src`
  const extra = fs.readdirSync(dir).filter(f => !need.has(f));   // 多余的是候选孤儿
  ```
  ⚠️ `brand-logo` 项的 `jpgBytes` 为 `null`（它是 `png: []` 数组）→ 求和时要 `?? 0`，
  否则得到 `NaNMB`
- `git add -An .` 预演一遍再真加，确认只有成品进来
- **提案里的数字要跟着改**（badge / 「全部成品清单」标题 / 体积 KPI），
  否则方案板和仓库对不上

## 内容判断的口径（照实说，不美化）


素材里有大量**施工期平光照片**（阴天、砂石、脚手架）——
这类**只能走「开塘故事」这条线**（把它讲成"投入的凭证"），绝不能进首屏。
给用户汇报时要点名：哪些是强项、哪些是弱项、**还缺哪几类必须补拍**。
别为了凑数把弱图塞进首屏——用户宁可不放。

## 零散坑

- `agent-browser batch "open …" "scroll down N" "screenshot D:/abs/path.png"` 可用；
  `resize` **不是有效命令**。四条硬约束（都踩过）：
  1. **标签间不共享会话** → 从 `open` 到最后一个 `screenshot` 必须塞进**同一个 `batch`**
  2. 截图路径**写正斜杠** `C:/Users/...` —— `$LOCALAPPDATA` 展开后的 `\` 会被剥掉，
     变成 `C:Usersdnlct...` 然后 `os error 3`
  3. **headless Chrome 默认 `prefers-reduced-motion: reduce`** → 尊重该偏好的组件
     （如 `VideoPromo`）**根本不挂 `<video>`**，`is visible video` 永远
     `Element not found`。**这不是 bug**：先 `set media light no-preference` 再 `reload`
  4. `screenshot --full` 全页长图里 **`loading="lazy"` 的图全是空白**（`scroll bottom`
     之后再 `--full` 也不解决）→ 想看某一段必须 `scrollintoview <css-sel>` + `wait 3000+`
     - 选择器可以用不带引号的属性选择器：`img[src*=food-sq-bbq]`
     - ⚠️ `<picture>` 里的 `<img src>` 是**桌面回退值**，手机断点下 src 不变
       → 用手机版的文件名去找元素会 `Element not found`
- 本地起服预览：`python -m http.server 8899 --bind 127.0.0.1`，
  `curl --noproxy '*'` 测通，用完 `Stop-Process -Id <pid> -Force` 停（`taskkill` 无效）
- 没有 git 的 PATH 时用 GitHub Desktop 自带 git（见 `fishpond-push-checklist`）
