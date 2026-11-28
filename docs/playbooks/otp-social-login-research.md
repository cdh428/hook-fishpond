# 手机号 OTP 登录/绑定 · 调研报告

> 2026-11-29 整理。方案 A CIAM 架构（见 gotchas §4.7）下，给手机号登录补 OTP 验证 + 多社媒绑定。
> 约束：泰国本地用户为主、移动优先、三语（zh/en/th）、<1 万用户、测试期免费优先。

## 决策记录

| 项 | 决策 |
|---|---|
| OTP 有效期 | **5 分钟** |
| SMS 网关（测试期） | **Plivo**（送 $10–25、免绑卡、Verify 免次费） |
| SMS 网关（量大迁） | **eXSender**（泰国三运营商直连，~$0.003/条，送达 99.9%） |
| UI 方案 | **方案 A**（上下堆叠 + OR 分隔线，贴合现有 `/profile` 弹窗） |
| 登录顺序 | 手机号 OTP 主推，LINE 次之（泰国非 LINE 用户用 OTP） |

---

## 一、泰国 SMS 网关（免费 / 可先测试）

| 排名 | 平台 | 免费额度 | 泰国单价 | 绑卡 | 送达率 | 测试适配 |
|---|---|---|---|---|---|---|
| 🥇 | **Plivo** | **$10–25 信用金** | $0.027–0.031 | ❌ | 聚合 ~95% | ✅ 最划算，Verify 免次费，Node SDK |
| 🥈 | **Twilio** | 100 SMS + 40 Verify | $0.0305 | ❌ | 聚合 ~95% | ✅ 文档最好，试用限制多 |
| 🥉 | **Vonage** | ~$2 | ~$0.03 | ❌ | 聚合 ~94% | 上手最快，额度偏少 |
| 4 | Telnyx | $10 | 美国最低 | 需验证号码 | 私网高 | ⚠️ 需先确认泰国覆盖 |
| 5 | Sinch | $2 | 不透明 | ❌ | ~95% | ⚠️ 试用限制太多 |
| 6 | Bird/MessageBird | 无 SMS 免费 | $0.0275 | 需充值 | 聚合 | ❌ 无免费额度 |
| 上线 | **eXSender**（泰国直连） | 按送达计费 | ฿0.10 (~$0.003) | 低门槛 | 99.9% 直连 | 量大最便宜，Node SDK |

**泰国市场注意点**：
- Sender ID 注册（2025 年 8 月 NBTC 新规）：3–11 位字母数字发件人 ID 须预注册，否则被拦截/覆盖。测试期用纯数字发件号码可绕开，正式上线要注册品牌 Sender ID。
- 号码格式：泰国 10 位（09/06/08 开头），去掉前导 0 加 66 → `+66812345678`（E.164 存库用）。

**结论**：
- **测试阶段 → Plivo**（免绑卡、覆盖泰国 AIS/TrueMove/dtac、Verify 不额外收费）
- **量大上线 → eXSender**（直连三运营商、单价便宜约 90%、有 Node SDK、代办 Sender ID）

---

## 二、UI 方案（手机号 OTP 登录/绑定）

### 方案 A：上下堆叠 + OR 分隔线 ⭐ 推荐

**布局**：手机号输入（主推 OTP）→ 获取验证码 → OR 分隔 → LINE 登录（次之）。
OTP 输入页：6 位分格 + 倒计时重发 + 验证按钮 + 错误提示。

**优点**：与现有 `/profile` 登录弹窗结构几乎一致，改动最小，零新增组件，三语友好。
**缺点**：LINE/OTP 主次靠视觉层级调。

**贴合度**：★★★★★

### 方案 B：分步向导（手机号 → OTP 两步 + 国家码选择器）

**优点**：适合有海外泰国人用户、流程清晰。
**缺点**：多一次点击；若泰国用户 99% 无需国家码选择器，与方案 A 几乎相同。

**贴合度**：★★★★☆

### 方案 C：底部弹窗（Bottom Sheet，移动端最优）

**优点**：不离开当前页，登录完直接订位，移动端拇指友好。
**缺点**：需引入底部弹窗组件（vaul / shadcn/ui Sheet），独立 UI 重构。

**贴合度**：★★★★★（移动体验最佳，但成本高）

**结论**：**方案 A**（改动最小、风格零冲突）。方案 C 可作为后期移动体验升级。

---

## 三、OTP 输入框技术细节

**6 位分格（主流做法）**：
- 用成熟库 **input-otp**（React 24M 周下载）或 shadcn/ui InputOTP
- 一个真实 input 承载所有交互，6 个格子是镜像 → 支持 SMS 自动填充、粘贴、密码管理器

**关键 HTML 属性**（调研反复强调）：
```html
<input type="text"            <!-- 不要 number，004281 会转成 4281 -->
       inputmode="numeric"    <!-- 手机弹数字键盘 -->
       autocomplete="one-time-code"  <!-- iOS/Android 自动填充 -->
       maxlength="6" />
```

**倒计时**：用时间戳计算（`target - Date.now()` + `requestAnimationFrame`），
不用 setInterval 递减（切后台卡住）。前端 disabled，服务端也限流（防滥用）。

**错误三态**（不要混为一谈）：
- 验证码错误可重试："不正确，还剩 N 次机会"（不清空输入框）
- 已过期："已过期，请重新发送"（显示重发按钮）
- 尝试过多："请 30 分钟后再试"（锁定输入框）

---

## 四、多社媒绑定账号合并（P2 核心）

**风险**：同一个人被识别成两个 User，历史订单散在两账号。

**安全解法**：`User.id` 永不改变（稳定锚点），所有身份走 `SocialAccount` 关联表。

**合并策略**（二选一）：
- **策略 1（推荐）**：手机号强匹配自动合并——OTP 登录的手机号匹配到 `User.phone` 时自动绑到该 User。体验最好，泰国手机号复用率低、风险可控。
- **策略 2**：登录后提示用户确认合并。最安全但多一步操作。

**合并规则**（显式触发 + 审计日志）：
1. 把 merge User 的 Booking/Order/SocialAccount.userId → 改成 keep User.id
2. 删除 merge User（或标记 deleted）
3. 记审计日志（谁、何时、合并哪两个号）

---

## 五、实施清单

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P2** | profile 弹窗改两步：手机号 → OTP 分格输入；多身份关联逻辑；账号合并（策略 1） | 手机号 OTP UI + 绑定 |
| **P3** | Plivo Node SDK 接入；OTP 生成/校验/限流；provider 接口实现 `otp.ts` | SMS 网关可切换 |

**新增依赖**：`input-otp`（OTP 分格）、Plivo SDK
**三语 key**：`authOtp.*`（phoneLogin / getOtp / otpTitle / resendIn / or / continueWithLine / error* 等）

---

## 来源

- Plivo 泰国价（分运营商）：https://www.plivo.com/sms/pricing/th
- Twilio 泰国价：https://www.twilio.com/sms/pricing/th
- eXSender 泰国：https://exsender.co/th
- 泰国 NBTC / Sender ID 规则：https://smsboosting.com/zh-TW/sms-gateway-thailand
- input-otp（React OTP 库）：https://input-otp.rodz.dev/
- shadcn/ui InputOTP：https://ui.shadcn.com/docs/components/input-otp
