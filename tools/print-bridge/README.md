# 本地打印桥（Print Bridge）

让网页（包括**线上 HTTPS 页面**）能**静默打印到指定打印机** —— 不弹系统打印对话框。

收银机/前台电脑上跑一个小服务，网页把票据 HTML 发给它，它渲染成位图后用
**ESC/POS 原始指令**直发打印机，80mm 纸宽（576 点）。

---

## 为什么需要它

浏览器 `window.print()` 只能弹系统对话框，**无法按名称指定打印机**，也做不到静默出纸。
收银台上每单都要手选打印机，效率不可接受。

另一个关键点：热敏打印机**内置字库没有泰文字形**，走 GDI 驱动打印泰文会变方框/乱码。
所以这里统一把票据渲染成位图（光栅），再用 `GS v 0` 推点阵 ——
泰文、中文、图标、二维码全部正常。

---

## 两种投递通道

| 通道 | `kind` | 目标写法 | 适用 |
|---|---|---|---|
| Windows 打印队列 | `winspool` | 打印机名，如 `POS80` | USB 小票机（装了驱动） |
| 蓝牙串口 SPP | `serial` | COM 口，如 `COM8` | 蓝牙小票机（**通常没装成打印机**） |

> ⚠️ 蓝牙小票机在 Windows 上一般**不会**出现在「打印机列表」里 —— 配对后系统只给它一个
> 「Standard Serial over Bluetooth link」虚拟串口（SPP）。所以必须支持串口通道，
> 否则蓝牙打印根本无从下手。

---

## 快速开始（收银机）

1. 装依赖（只需一次）：
   ```bat
   pip install pywin32 pillow
   ```

2. 看本机有哪些打印目标：
   ```bat
   python tools\print-bridge\bridge.py --list
   ```
   输出示例：
   ```
   POS80 [默认] [票据机]   打印队列  目标=POS80  驱动/端口=POS80 Driver
   GLPrinter (COM8) [票据机]   蓝牙串口  目标=COM8  驱动/端口=Bluetooth SPP → COM8
   ```

3. 打一张自检页验证链路（会真出纸）：
   ```bat
   python tools\print-bridge\bridge.py --selftest --printer COM8
   ```

4. 启动服务（保持窗口开着）：
   ```bat
   python tools\print-bridge\bridge.py
   ```
   也可以双击 `start-bridge.cmd`。

5. 打开后台 **🖨️ 打印设置**（`/admin/print`）：
   - 确认「本地打印服务 = 在线」
   - 给「后厨单 / 预结单 / 收据」分别选目标
   - 点测试打印

---

## HTTP 接口

服务默认监听 `0.0.0.0`（本机 + 局域网），**无鉴权**，只接受「要打印的内容」。

> ⚠️ 监听 `0.0.0.0` 是为了让同一 Wi-Fi 下的手机/平板也能用这台打印机。
> 这意味着**同一网段的任何设备都能往这台打印机投递内容**。店内网络可信时没问题；
> 如果这台电脑接的是公共 Wi-Fi，请用 `--host 127.0.0.1` 只开本机。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活 + 目标清单 + 服务版本 + `lanUrls`（手机填这个地址）|
| GET | `/printers` | 目标清单 + 本机所有 COM 口 |
| POST | `/print` | 打印 |

**手机怎么连**：桥启动时日志会打出 `手机/其它设备可访问 → http://192.168.x.x:17777`。
在手机浏览器打开后台 → 打印设置 → 「打印服务地址」填这个地址即可。
`/health` 里的 `lanUrls` 也会给同一批地址，设置页可直接点选。

> 手机**不能**绕过桥直连这台蓝牙打印机：GLPrinter 是经典蓝牙 SPP
> （服务 UUID `00001101`），而 Web Bluetooth 只支持 BLE 设备，iPhone 的 Safari
> 更是完全不支持。所有设备都必须经由打印桥转发。

`POST /print` 请求体：

```json
{
  "printer": "COM8",          // Windows 打印机名 或 COM 口
  "html": "<html>…</html>",   // 与 text 二选一
  "width": 576,               // 点宽，默认 576（80mm / 203dpi）
  "copies": 1,
  "cut": true,
  "feedLines": 4
}
```

响应：

```json
{ "ok": true, "printer": "COM8", "transport": "serial",
  "width": 576, "height": 800, "bytes": 57618, "copies": 1, "ms": 6063 }
```

**返回 `ok:true` 只代表字节已发出，不代表打印机真的出纸了**（尤其蓝牙）。

---

## 配置文件

`config.json`（可选，放在本目录）：

```json
{
  "port": 17777,
  "defaultPrinter": "POS80",
  "widthDots": 576,
  "renderScale": 3,
  "bitmapMode": "threshold",
  "threshold": 128,
  "cut": true,
  "feedLines": 4,
  "baudRate": 9600
}
```

---

## 网页端怎么用

`src/lib/print-agent.ts` 是网页侧的唯一入口：

```ts
import { submitPrint, describeOutcome } from '@/lib/print-agent';

const outcome = await submitPrint(html, 'kitchen');   // 'kitchen' | 'bill' | 'receipt'
toast(describeOutcome(outcome, t));
```

- 探测得到桥 → 静默出纸，`via: 'bridge'`
- 探测不到（员工用手机打开、服务没开）→ **自动退回** `window.print()`，`via: 'browser'`

目标选择、打印方式都存在本机 `localStorage`，每台收银机各存各的。

---

## 实测性能

| 通道 | 票据 | 数据量 | 耗时 |
|---|---|---|---|
| 蓝牙 SPP（GLPrinter / COM8） | 后厨单 576×800 | 57 KB | ~6.0 s |
| 蓝牙 SPP（GLPrinter / COM8） | 预结单 576×1312 | 94 KB | ~9.8 s |
| USB（POS80） | 后厨单 | 57 KB | ~1 s |

蓝牙受 SPP 带宽限制（约 16 KB/s），**一张完整预结单要 10 秒左右**。
票据越长越慢；要更快只能减少票据高度或改走 USB / 网口。

---

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `/admin/print` 显示「未启动」 | 服务没跑 / 浏览器拦了跨域 | 先跑 `bridge.py`；确认 `http://127.0.0.1:17777/health` 能打开 |
| **打完不切纸，一直吐出很长的空白纸** | 切纸指令机型不认（旧版用 `GS V 66 n`，部分机型直接忽略，且 n 是「点」不是「行」，起不到留边作用） | 已改为默认 `GS V 0`（全切）+ `feedLines: 6` 走纸。若仍不切，试 `cutMode`：`partial` / `full-feed` / `partial-feed` |
| **切在字上 / 切不断** | 走纸不够，内容还在切刀口里 | 调大 `feedLines`（一行≈4mm，默认 6 ≈ 24mm） |
| `打不开串口 COM8` | 蓝牙断了 / 端口被别的程序占 | 重新配对蓝牙；检查「蓝牙与其他设备 → 更多蓝牙选项 → COM 端口」 |
| **蓝牙机连不上（列表里没有 GLPrinter）** | ① 服务没启动；② 打印机没开机；③ 配对丢了 SPP 端口 | 依次查：服务是否在跑 → 打印机开机 → 「COM 端口」里有无对应 COM 口；用 `bridge.py --list` 确认 |
| 蓝牙发了但不出纸 | 打印机休眠、没纸、或数据太小没触发 | 先用 `--selftest` 打一张大的试试 |
| 泰文变方框 | 走了驱动而不是光栅 | 确认用的是本服务的 `/print`，不要走系统打印对话框 |
| `POS80` 任务卡住不动 | 打印机被标「脱机使用」 | 控制面板 → 设备和打印机 → 右键 POS80 → 取消「脱机使用打印机」 |
| 网页探测不到桥但服务在跑 | Chrome Private Network Access 预检被拒 | 本服务已回 `Access-Control-Allow-Private-Network: true`，若仍失败检查浏览器版本 |

### 蓝牙失败会自动改走 USB

若「后厨单/预结单/收据」指定的是蓝牙目标，而它打不开（关机、断链、端口被占），
网页端会**自动改投本机另一台热敏票据机**（通常是 `POS80`），并提示
「📶 蓝牙打印机未响应，已改走 POS80」——不让店员在收银台干等。

### 开机自启（强烈建议）

服务没启动 = 蓝牙永远连不上。把启动器放进启动文件夹，开机自动静默拉起：

```bat
copy tools\print-bridge\HookFishpond-PrintBridge.vbs.example ^
     "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HookFishpond-PrintBridge.vbs"
```

> ⚠️ 打开 `.vbs.example` 把里面的 `bridgeDir` / `pythonExe` 改成你机器上的实际路径。
> 启动器是幂等的：已在运行就不会重复启动。日志写在 `tools/print-bridge/bridge.log`。

---

## 切纸参数

`config.json` 里：

```json
{
  "cut": true,
  "cutMode": "full",   // full | partial | full-feed | partial-feed | none
  "feedLines": 6       // 切纸前走纸行数（一行≈4mm）
}
```

| cutMode | 指令 | 说明 |
|---|---|---|
| `full`（默认） | `GS V 0` | 全切，兼容性最好 |
| `partial` | `GS V 1` | 半切（留一点连着，方便撕） |
| `full-feed` | `GS V 65 16` | 进 16 点后全切（部分机型支持） |
| `partial-feed` | `GS V 66 16` | 进 16 点后半切（部分机型支持） |
| `none` | — | 不切（配撕纸机型） |

`POST /print` 也可以带 `cutMode` 覆盖单次请求。


---

## 目录

```
tools/print-bridge/
├── bridge.py            HTTP 服务 + CLI（--list / --selftest）
├── escpos.py            ESC/POS 指令构造 + 两种投递通道（winspool / serial）
├── render.py            HTML → 位图（Chrome headless + Pillow 裁白边缩放）
├── selftest_escpos.py   位打包/指令单元测试（不连打印机）
├── start-bridge.cmd     一键启动
└── README.md
```
