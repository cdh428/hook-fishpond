# WorkBuddy 连接 GitHub + Vercel 指南

## 当前问题
- `git push` 在 WorkBuddy 沙箱中无法交互式认证（弹出 GitHub 登录窗口）
- Vercel 部署依赖 git push → GitHub → Vercel 自动部署链路
- API 端点返回 500（PrismaPg 缺 SSL 配置，已修复但未推送）

---

## 方案 1：GitHub PAT + gh CLI（推荐，最快）

### 第 1 步：创建 GitHub Personal Access Token (PAT)

1. 打开 https://github.com/settings/tokens?type=actions
2. 点击 **Generate new token (classic)**
3. 勾选权限：
   - ✅ `repo`（完整仓库访问 — push、PR、分支管理）
   - ✅ `workflow`（触发 GitHub Actions）
   - ✅ `read:org`（读取组织信息，可选）
4. 点击 **Generate token**
5. **复制 token**（只显示一次！格式：`ghp_xxxxxxxxxxxx`）

### 第 2 步：在 WorkBuddy 中配置

把 token 发给 AI（在对话中直接粘贴），AI 会执行以下配置：

```bash
# 1. 配置 git credential helper 使用 PAT
cd D:/Github/hook-fishpond
git remote set-url origin https://<PAT>@github.com/cdh428/hook-fishpond.git

# 2. 安装 GitHub CLI
npm install -g gh  # 或者直接下载安装

# 3. 配置 gh CLI 认证
echo "<PAT>" | gh auth login --with-token

# 4. 推送代码
git push

# 5. 验证连接
gh repo view cdh428/hook-fishpond
```

### 之后 AI 可以自动做的：
- ✅ `git push`（无需交互认证）
- ✅ 创建/管理 PR (`gh pr create`, `gh pr merge`)
- ✅ 查看 CI 状态 (`gh run list`, `gh run view`)
- ✅ 管理 Issues
- ✅ 查看 Vercel 部署状态（通过 GitHub commit webhook）

---

## 方案 2：GitHub MCP Server（功能更强）

GitHub 官方 MCP server，提供 20+ 工具集（repo/PR/issues/actions 等）。

### 配置方式

把以下内容写入 `~/.workbuddy/mcp.json`：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_你的Token"
      }
    }
  }
}
```

然后：
1. 打开 WorkBuddy Desktop → 右上角 **Connector 管理**
2. 找到 `github` MCP → 点击 **Trust**
3. 认证完成后，AI 可以直接调用 GitHub MCP 工具

### GitHub MCP 提供的工具：
- `create_issue`, `update_issue`, `search_issues`
- `create_pull_request`, `update_pull_request`, `list_prs`
- `push_files`（直接通过 API 推送文件，不需要 git！）
- `search_repositories`, `get_file_contents`
- `list_commits`, `create_branch`
- `manage_projects`, `manage_actions`

---

## 方案 3：Vercel CLI + Token（部署用）

Vercel MCP 目前只支持特定客户端（Claude/Cursor/VS Code），WorkBuddy 不在列表中。所以用 Vercel CLI + Token 更实用。

### 第 1 步：创建 Vercel API Token

1. 打开 https://vercel.com/account/tokens
2. 点击 **Create Token**
3. 名称：`WorkBuddy Deploy`
4. Scope：**Full Account**
5. **复制 token**（格式：`xxxxxxxxxxxxxxxxxxxxxxxx`）

### 第 2 步：在 WorkBuddy 中使用

把 token 发给 AI，AI 执行：

```bash
# 安装 Vercel CLI（已在隔离环境中安装）
# 验证 token
vercel whoami --token <VERCEL_TOKEN>

# 直接部署（不需要 git push！）
cd D:/Github/hook-fishpond
vercel deploy --prod --token <VERCEL_TOKEN> --yes

# 设置环境变量
vercel env add DATABASE_URL production --token <VERCEL_TOKEN>
# 然后输入值：postgresql://postgres:Fishpond%402026@db.ehsmsjmmccliysxnkgpv.supabase.co:6543/postgres

vercel env add DIRECT_URL production --token <VERCEL_TOKEN>
# 输入值：postgresql://postgres:Fishpond%402026@db.ehsmsjmmccliysxnkgpv.supabase.co:5432/postgres

vercel env add NEXT_PUBLIC_BASE_URL production --token <VERCEL_TOKEN>
# 输入值：https://hook-fishpond-xi15.vercel.app

# 重新部署（使环境变量生效）
vercel deploy --prod --token <VERCEL_TOKEN> --yes
```

### 之后 AI 可以自动做的：
- ✅ 直接部署代码到 Vercel（不需要 git push）
- ✅ 设置/更新环境变量
- ✅ 查看部署日志
- ✅ 管理域名
- ✅ 回滚部署

---

## 方案 4：Vercel MCP Server（未来选项）

Vercel 官方 MCP 在 `https://mcp.vercel.com`，但目前只支持 Claude/Cursor/VS Code 等客户端。

如果未来 WorkBuddy 被加入 Vercel 支持列表，配置方式：

```json
{
  "mcpServers": {
    "vercel": {
      "url": "https://mcp.vercel.com"
    }
  }
}
```

通过 OAuth 认证后可用的工具：
- 搜索 Vercel 文档
- 列出/管理项目
- 查看部署详情和日志
- 管理域名和 DNS

**当前不可用** — 等 Vercel 官方支持 WorkBuddy 后启用。

---

## 推荐组合

| 用途 | 推荐方案 | 需要你做的 |
|------|----------|-----------|
| **代码推送 + PR** | 方案 1（GitHub PAT）或方案 2（GitHub MCP） | 创建 GitHub Token 发给我 |
| **部署到 Vercel** | 方案 3（Vercel CLI + Token） | 创建 Vercel Token 发给我 |
| **日常维护** | 1 + 3 组合 | 两个 Token 都发给我 |

最快路径：**创建两个 Token → 发给 AI → AI 配置好 → 自动完成所有开发和维护**

---

## 安全提醒

- ⚠️ Token 权限只勾选需要的最小范围（repo + workflow）
- ⚠️ Token 不要公开分享，只在 WorkBuddy 对话中发给 AI
- ⚠️ 建议设置 Token 过期时间（90 天）
- ⚠️ AI 会将 Token 存储在 git remote URL 或环境变量中，属于本地配置
- ⚠️ 如果担心安全，可以在 GitHub 设置中随时删除/重新生成 Token
