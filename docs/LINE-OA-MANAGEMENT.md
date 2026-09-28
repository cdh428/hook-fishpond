# LINE OA 管理手册 — HOOK THE HAPPYNESS

> 更新：2026-09-27 · 来源：LINE OA 实操接入（WorkBuddy 会话）
> 关联文档：[otp-line-login-oa-plan.html](./otp-line-login-oa-plan.html)（网站 OTP 登录走 LINE 通道的实施计划）

## 1. 账号资产总览

| 项 | 值 |
|---|---|
| 账号名 | HOOK THE HAPPYNESS（泰文显示：ฮุค เดอะ แฮปปี้เนส） |
| Basic ID | `@300bsham` |
| 好友链接 | https://line.me/R/ti/p/@300bsham |
| 内部 accountId | `1991435505547722`（page.line.biz 的 account-page ID） |
| chat UUID | `Ucbb33fbf15a53d9a120042d40ac26fdc`（chat.line.biz 路径用） |
| 套餐 | ฟรี（Free）· Chat: On |
| 状态消息 | 吃货 ➕ 咖啡控（可随时改） |

## 2. 三端入口（登录后使用）

| 端 | URL | 用途 |
|---|---|---|
| 管理后台 | https://manager.line.biz/account/@300bsham | Home / Insights 数据 / Chats / Business profile / Settings / Broadcast 群发 / Step messages / Auto-responses / AI Chatbot / Rich media |
| 聊天工作台 | https://chat.line.biz/Ucbb33fbf15a53d9a120042d40ac26fdc | 实时收发客人消息 |
| 商务档案编辑 | https://page.line.biz/account-page/1991435505547722/profile | 地址 / 营业时间 / 照片 / 按钮等（改动**自动发布**） |

## 3. 已上线的商务信息（2026-09-27 登记）

- **地址**：
  - 泰文：XM9M+G98 ถนน ไสว ประชาราษฎร์ ตำบล ลาด สวาย อำเภอลำลูกกา ปทุมธานี
  - 英文：12150 XM9M+G98, Sawaipracharaj Rd, Lat Sawai, Lam Luk Ka District, Pathum Thani 12150
  - 字段拆分：Postal `12150` / Province `Pathum Thani` / City `ลำลูกกา` / Address1 泰文街道+乡 / Address2 英文街道
  - 地图红钉已由 LINE 自动定位（Plus Code XM9M+G98 可作为地理编码锚点）
- **营业时间**：周二至周日 09:00–18:00，**周一休**
- **价位标注**：฿101 ~ ฿250 · Parking available · smoking OK
- ⚠️ 网站显示的地址/营业时间应与此保持一致（单一事实来源建议放这里或 messages i18n）

## 4. 与本项目的集成点

1. **OTP 登录通道**（`otp-line-login-oa-plan.html`）：网站用户登录走 LINE OA 下发验证消息，零短信成本 —— 本 OA 就是通道账号。
2. **LINE 好友按钮**：网站页头/页脚/联系区可挂 `https://line.me/R/ti/p/@300bsham`（三语页面通用）。
3. **信息同步**：地址、营业时间在网站 zh/en/th 三语 messages 与 LINE 商务档案之间保持同步；改动以本文档第 3 节为基准。
4. **后台管理界面**：可在 admin 加一张「LINE OA」信息卡（好友数、未读数走 Insights 手动/后续 API）。

## 5. 运维 SOP（浏览器自动化）

### 登录流程（会话过期时才需要）
1. 本机启动真实 Chrome（CDP 9333 端口）：
   ```
   "C:/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9333 --user-data-dir="C:/Users/dnlct/.agent-browser/line-chrome" --no-first-run --no-default-browser-check "https://chat.line.biz/"
   ```
   （启动前剥掉代理环境变量：`env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY`）
2. 生成二维码：`bash ~/.workbuddy/skills/line-oa/scripts/get-qr.sh` → 输出 `line_qr.png`
3. 手机 LINE 扫码 → 输 LINE 密码 → 网页出现 4 位验证码（~2 分钟时效）→ 手机输入 → 完成登录
4. 会话级 Cookie：**浏览器进程不死就不会掉线**；关闭后需重扫

### 日常操作（WorkBuddy 会话内）
- 全部通过 `agent-browser --cdp 9333 <cmd>` 操作，技能：`~/.workbuddy/skills/line-oa/SKILL.md`（含完整命令对照表、坑清单）
- 硬规则速记：
  - agent-browser 输出**禁止接管道**（`| grep`、`$()` 会 SIGTERM），一律重定向文件再读
  - 泰文等 Unicode 输入用 `keyboard inserttext`（CDP 层编码安全），用 n/100 计数器验证
  - 「点击没反应」先查 `document.querySelector('.modal')` —— 多数是弹窗已打开挡住了
  - 府/省份下拉是原生 `<select>`，CLI `select "#provinceName" "Pathum Thani"` 直接用

### 本地依赖
- agent-browser CLI（v0.27+）、真实 Chrome、`line-chrome` 用户数据目录（含登录态）

## 6. 待办

- [ ] Google Business Profile：店铺未被 Google 地图收录，需新建并验证后才会出现在谷歌地图
- [ ] FB/IG Meta API 路线（与 LINE 通道并行）
- [ ] OTP 登录方案落地（见 otp-line-login-oa-plan.html）
- [ ] （可选）LINE Messaging API 接入：申请 Channel token 后可做服务端自动回复，替代浏览器自动化
