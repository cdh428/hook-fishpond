# Meta 系统用户配置手册（Hook Fishpond · Hookhappyness）

> 更新日期：2026-10-07
> 适用 `C:\Users\dnlct\WorkBuddy\hook-fishpond`
> 关联：`scripts/social/fb-ig-post.mjs` · `scripts/publish/push-media.mjs` · `docs/playbooks/social-tokens-setup.md`

---

## 1. 背景与目标

**目标**：让 AI agent 以**独立的、永不过期的**身份发布 Facebook 主页 / Instagram 内容，
不依赖你个人账号的 token（那要 ~50 天续一次），也**不需要**把 AI 加为"人类页面管理员"（Meta 不允许）。

**为什么用系统用户**：

| 方案 | 身份 | 续期 | 合规性 | 备注 |
|---|---|---|---|---|
| ❌ 个人 user token 换 60 天主页令牌 | 以"你"的名义操作 | 每 ~50 天手动续 | 灰色地带（个人 token 做自动化违反 Meta 条款） | 现在 `social-tokens-setup.md` 里写的老方案 |
| ✅ **系统用户 + 永不过期令牌** | agent 独立身份 | **永不过期**（除非删系统用户或改权限） | ✅ 官方推荐路径 | 本手册 |

> ⚠️ **能不能"把 AI 加为 FB 管理员"？不能。**
> 页面角色（Admin/Editor）只能是**真人**，Meta 没有给"app/agent 成为页面管理员"的 API。
> 系统用户是**等价能力**（能发内容、能读 insights），只是走"非人类资产管理员"这条路。

---

## 2. 前置条件

- ✅ 一个 Meta 账号（你本人，有 Facebook）
- ✅ 能进 `business.facebook.com`
- ✅ `Hookhappyness` 主页（`61591042746753`）可访问
- 如要做 Instagram：该 IG 是**专业账号**（商家/创作者）且**已绑定 `Hookhappyness` 主页**

---

## 3. 操作步骤（全在 Meta 网页上，约 15 分钟）

### 3.1 把 `Hookhappyness` 主页接入 Business Manager

1. 打开 `https://business.facebook.com/`
2. 左侧 **工具（Tools） → 商务管理平台设置（Business Settings）**
3. **用户（Users） → 商务管理平台资产（Biz Manager Assets） → 主页（Pages）**
4. 若 `Hookhappyness` 不在列表：点 **+ 添加（Add） → 认领主页（Claim a Page）→ 搜名字 → 认领**
   （认领需要你有该主页的管理权限；若你是 owner 直接认领）
5. 确认 `Hookhappyness` 已出现在"已连接主页"列表里

### 3.2 建 Meta Developer 应用

1. 打开 `https://developers.facebook.com/`
2. **My Apps → Create App**
3. 类型选 **Business**（不是 Consumer！Consumer 拿不到发帖权限）
4. 名称：`hook-fishpond-social-bot`（随便起，能识别即可）
5. 进 App Dashboard → 左侧 **Products（产品）** → 添加：
   - **Facebook Login for Business**
   - **Instagram Graph API**（仅当你要做 IG）
6. 记下 App 的 **App ID**（App Settings → Basic），**App Secret** 暂不需要（系统用户令牌自动绑定）

### 3.3 建系统用户（核心步骤）

1. 回到 Business Settings → **用户（Users） → 系统用户（System users）**
2. 点 **添加（Add）→ 添加系统用户（Add System User）**
3. 命名：`hook-fishpond-bot`（方便日后审计"谁发的帖"）
4. 角色：
   - 若 BM 里有其他真人系统用户 / 真人管理员，选 **Standard Access** 给 `Standard` 角色
   - 若你是 BM 唯一管理员，选 **Admin Access** 给 **Admin** 角色
5. **分配资产**（关键！）：
   - 在系统用户详情页 → **资产（Assets） → 主页（Pages） → 添加主页（Add Pages）**
   - 选 `Hookhappyness`
   - 资产权限勾上 **内容（Content）**（发贴必需）；做 IG 也勾 **内容**
   - 如需读 insights，加 **洞察（Insights）**
6. **生成令牌**：
   - 系统用户详情页 → **访问令牌（Access Tokens） → 生成新令牌（Generate New Token）**
   - 选应用：`hook-fishpond-social-bot`
   - 勾权限：
     - FB 发帖：`pages_read_engagement` / `pages_manage_posts`
     - 读主页列表：`pages_show_list`
     - 做 IG：`instagram_basic` / `instagram_content_publish`（可选 `instagram_manage_comments`）
   - 点 **生成（Generate）** → 弹窗里会出现 `PAGE_ID`（应该 = `61591042746753`）和 `PAGE_TOKEN`
   - **复制这两个值**，只填进 `.env.local`，**绝不进 git / 仓库 / 聊天记录**

> ⚠️ **这个令牌永不过期**。唯一失效条件：删系统用户 / 移除资产分配 / 改权限。
> 因此**必须**把上面两个值填进 `.env.local` 后立刻 `--dry-run` 验证一次，通了就收工。

### 3.4 回填 `.env.local`（只在本机）

```
# ---- Meta 系统用户（2026-10-07 改）----
# 值只放本机，不进 git
META_PAGE_TOKEN="<PAGE_TOKEN 复制到这>"
FB_PAGE_ID="61591042746753"
IG_USER_ID=""              # 暂留空，等做 IG 时再填
```

> 旧方案里的 `META_PAGE_TOKEN`（60 天用户令牌）**作废**，被系统用户令牌取代。
> `.env.local` 里的 `META_PAGE_TOKEN` 改填系统用户令牌即可，键名不变，脚本无感。

---

## 4. 验证（本机跑，不真发）

### 4.1 验证令牌有效 + 有发帖权限

```bash
# 1) 确认令牌活着（返回 200 = 活）
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  "https://graph.facebook.com/v23.0/me?access_token=<META_PAGE_TOKEN>"

# 2) 确认能看到 Hookhappyness 主页（应含 61591042746753）
curl -s "https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token&access_token=<META_PAGE_TOKEN>" \
  | grep -o '"id":"61591042746753"'

# 3) 确认有发帖权限（permissions 里应有 pages_manage_posts）
curl -s "https://graph.facebook.com/v23.0/61591042746753/permissions?access_token=<META_PAGE_TOKEN>" \
  | grep -o '"pages_manage_posts"'
```

> ⚠️ **不要**把上面命令里的 `<META_PAGE_TOKEN>` 真打出来；令牌只在 `.env.local` 里，
> 用 `node -e "console.log(process.env.META_PAGE_TOKEN?.slice(0,8)+'…')"` 做存在性检查即可。

### 4.2 验证脚本 dry-run 能跑

```bash
cd C:/Users/dnlct/WorkBuddy/hook-fishpond
# 预演（不真发），应打印"将执行 POST /61591042746753/photos"而不是"missing token"
node scripts/social/fb-ig-post.mjs \
  --image-url https://hookfishpond.com/media/hero-01-sunset.jpg \
  --caption "dry-run test" --fb-only --dry-run
```

### 4.3 首次真发（可选，确认全链路）

```bash
node scripts/social/fb-ig-post.mjs \
  --image-url https://hookfishpond.com/media/hero-01-sunset.jpg \
  --caption "首次系统用户发帖测试" --fb-only
# 成功输出：[FB] ✅ 已发布 photo id=...
```

---

## 5. 常见问题

| 现象 | 原因 / 解法 |
|---|---|
| 系统用户生成令牌时报"App 未添加 FB Login for Business 产品" | 回 App Dashboard 把两个产品都加上，等 1 分钟重新生成 |
| `GET /me/accounts` 返回空 | 系统用户的"资产分配"没勾主页，回 3.3 第 5 步补 |
| 有 `pages_read_engagement` 但没 `pages_manage_posts` | 生成令牌时漏勾，重新生成一次（旧的删掉） |
| 主页不在 BM 里 | 回 3.1 认领；若你是 owner 直接认领，若是非 owner 需先被加为主页管理角色 |
| IG 容器报 `instagram_content_publish` 权限不足 | IG 必须切专业账号 + 绑 FB 主页 + 资产权限勾内容，三步都要 |
| 想撤销系统用户 | BM → Users → System users → 选该用户 → 移除资产分配 → 删除用户（旧令牌立即失效） |

---

## 6. 审计与交接

- **谁发的帖**：FB 后台「主页洞察 → 活动」里看发帖主体；系统用户发帖会标 `hook-fishpond-bot`
- **令牌轮换**：若怀疑令牌泄漏，去 BM 把该系统用户的所有 token 一键 revoke，重新生成一个填 `.env.local`
- **交接 / 换人**：系统用户挂在 BM 里，**不绑定真人账号**；真人离职不影响。若需交接，只需把新令牌重新填进 `.env.local`
- **备份与 CI**：`.env.local` 已 gitignore；若将来把发帖挂进 GitHub Actions，把 `META_PAGE_TOKEN` 建成 Actions Secret（不要建到仓库文件里）

---

## 7. 与现有脚本的衔接

- `scripts/social/fb-ig-post.mjs`：**键名不变**（`META_PAGE_TOKEN` / `FB_PAGE_ID` / `IG_USER_ID`），
  系统用户令牌直接填进去即可，脚本无感升级。
- `scripts/publish/push-media.mjs`：同上，读的是同一组环境变量。
- `docs/playbooks/social-tokens-setup.md` 里"60 天换主页令牌"那段**作废**，以本手册为准。
- `docs/CREDENTIALS.md` §3 的 `META_PAGE_TOKEN` 条目描述更新为"系统用户令牌（永不过期）"。

---

## 8. 完成清单

- [ ] `Hookhappyness` 已接入 BM（3.1）
- [ ] Meta App `hook-fishpond-social-bot` 建好，含 FB Login for Business + IG Graph API（3.2）
- [ ] 系统用户 `hook-fishpond-bot` 建好，角色/资产/权限分配完成（3.3）
- [ ] 生成永不过期令牌，`META_PAGE_TOKEN` 已填进本机 `.env.local`（3.4）
- [ ] 三组 curl 验证全绿（4.1）
- [ ] `fb-ig-post.mjs --dry-run` 打印出"将执行 POST /61591042746753/photos"（4.2）
- [ ] （可选）首次真发成功（4.3）
