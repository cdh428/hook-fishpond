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

服务只监听 `127.0.0.1`（局域网访问不到），无鉴权，只接受「要打印的内容」。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活 + 目标清单 + 服务版本 |
| GET | `/printers` | 目标清单 + 本机所有 COM 口 |
| POST | `/print` | 打印 |

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
| `打不开串口 COM8` | 蓝牙断了 / 端口被别的程序占 | 重新配对蓝牙；检查「蓝牙与其他设备 → 更多蓝牙选项 → COM 端口」 |
| 蓝牙发了但不出纸 | 打印机休眠、没纸、或数据太小没触发 | 先用 `--selftest` 打一张大的试试 |
| 泰文变方框 | 走了驱动而不是光栅 | 确认用的是本服务的 `/print`，不要走系统打印对话框 |
| `POS80` 任务卡住不动 | 打印机被标「脱机使用」 | 控制面板 → 设备和打印机 → 右键 POS80 → 取消「脱机使用打印机」 |
| 网页探测不到桥但服务在跑 | Chrome Private Network Access 预检被拒 | 本服务已回 `Access-Control-Allow-Private-Network: true`，若仍失败检查浏览器版本 |

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
