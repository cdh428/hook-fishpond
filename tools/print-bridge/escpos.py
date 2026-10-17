#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ESC/POS 原始指令构造 + Windows 打印机直发。

为什么不用 Windows 打印驱动渲染？
  热敏打印机的内置字库只有 ASCII + 少量代码页，**没有泰文字形**。
  走 GDI 驱动打印泰文会出方框/乱码。所以这里统一把票据渲染成
  位图（光栅），再用 ESC/POS 的 GS v 0 指令把点阵直接推给打印机 ——
  这样泰文、中文、图标、二维码全部都能正常打出来。
"""

from __future__ import annotations

import re
import time
from typing import Any

ESC = b"\x1b"
GS = b"\x1d"

# 蓝牙串口（SPP）端口名形如 COM8
SERIAL_RE = re.compile(r"^COM\d+$", re.IGNORECASE)
# 蓝牙 SPP 服务的 GUID（Serial Port Profile）
BT_SPP_GUID = "{00001101-0000-1000-8000-00805F9B34FB}"

# 反相查找表：PIL 的 mode "1" 里 1=白、0=黑；ESC/POS 里 1=打点(黑)。
_INVERT = bytes.maketrans(bytes(range(256)), bytes(255 - b for b in range(256)))


class EscPosError(RuntimeError):
    pass


def build_raster_job(img1, *, cut: bool = True, feed_lines: int = 4, init: bool = True,
                     cut_mode: str = "full") -> bytes:
    """
    把 Pillow 的 1-bit 图像（mode "1"）转成 ESC/POS 光栅打印作业。

    img1: PIL.Image，mode 必须是 "1"，宽度必须是 8 的倍数。
    feed_lines: 切纸前走纸行数（一行约 4mm）。走够了内容才会完全脱离切刀口。
    cut_mode: 见 CUT_MODES；默认 "full"（全切，兼容性最好）。
    """
    if img1.mode != "1":
        raise EscPosError(f'图像必须是 1-bit（mode "1"），当前是 {img1.mode!r}')

    width, height = img1.size
    if width <= 0 or height <= 0:
        raise EscPosError("图像尺寸非法")
    if width % 8 != 0:
        raise EscPosError(f"图像宽度必须是 8 的倍数，当前 {width}")

    bytes_per_row = width // 8
    if bytes_per_row > 0xFFFF:
        raise EscPosError("图像宽度超出 ESC/POS 光栅上限")
    if height > 0xFFFF:
        raise EscPosError(f"图像高度 {height} 超出 ESC/POS 光栅上限（65535 点），请分页打印")

    # PIL 的 tobytes() 对 mode "1" 就是「每行按 8 像素打包成一个字节、高位在左」，
    # 与 ESC/POS GS v 0 的数据布局完全一致（宽度是 8 的倍数时无行填充）。
    raw = img1.tobytes()
    expected = bytes_per_row * height
    if len(raw) != expected:
        raise EscPosError(f"位图数据长度异常：{len(raw)} != {expected}")
    raw = raw.translate(_INVERT)

    out = bytearray()
    if init:
        out += ESC + b"@"  # ESC @ 初始化
    out += GS + b"v" + b"0" + b"\x00"  # GS v 0 —— 光栅位图，m=0 普通模式
    out += bytes((bytes_per_row & 0xFF, (bytes_per_row >> 8) & 0xFF))
    out += bytes((height & 0xFF, (height >> 8) & 0xFF))
    out += raw
    # 走纸：feed_lines 行（一行约 4mm）。热敏机必须把内容完全推出切刀口才能切干净。
    out += b"\n" * max(0, feed_lines)
    if cut:
        out += build_cut(cut_mode)
    return bytes(out)


# --------------------------------------------------------------------------- #
# 切纸
# --------------------------------------------------------------------------- #
#
# 切纸指令有几个变体，不同机型支持度不同 —— 这就是「打完不切、一直吐长纸」的根因：
#
#   GS V 0   /  GS V 48   m=0  全切（整刀），最通用
#   GS V 1   /  GS V 49   m=1  半切（留一点连着，方便撕），需机型支持
#   GS V 65  n                 进纸 n 点后【全切】  ← n 单位是「点」，不是行
#   GS V 66  n                 进纸 n 点后【半切】  ← 同上
#
# 注意 GS V 65/66 里的 n 是**点（dot）**，一行点阵通常只有几十点高，
# 所以传 n=66 几乎等于「立即切」，起不到留边作用；
# 而如果机型不认 66 这个子命令，就会被整条忽略 → 完全不切。
#
# 所以默认改成最通用的 `GS V 0`（全切），走纸交给调用方的 feed_lines。

CUT_MODES = {
    "full": b"\x1d\x56\x00",        # GS V 0 —— 全切（默认，兼容性最好）
    "partial": b"\x1d\x56\x01",     # GS V 1 —— 半切（留一点）
    "full-feed": b"\x1d\x56\x41\x10",   # GS V 65 16 —— 进 16 点后全切
    "partial-feed": b"\x1d\x56\x42\x10",  # GS V 66 16 —— 进 16 点后半切
    "none": b"",
}


def build_cut(mode: str = "full") -> bytes:
    """返回切纸指令字节。未知模式退回全切，避免「静默不切」。"""
    return CUT_MODES.get((mode or "full").strip().lower(), CUT_MODES["full"])


# --------------------------------------------------------------------------- #
# Windows 直发
# --------------------------------------------------------------------------- #

def _load_win32print():
    try:
        import win32print  # type: ignore
    except ImportError as exc:  # pragma: no cover - 依赖缺失时给出人话
        raise EscPosError(
            "缺少 pywin32（win32print）。请先安装：pip install pywin32"
        ) from exc
    return win32print


def send_raw(printer_name: str, data: bytes, *, job_name: str = "Hook Fishpond") -> None:
    """把原始字节直接塞进指定打印机的队列（RAW 数据类型，不经驱动渲染）。"""
    if not printer_name:
        raise EscPosError("未指定打印机名称")
    if not data:
        raise EscPosError("打印数据为空")

    win32print = _load_win32print()
    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, (job_name, None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, data)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


# --------------------------------------------------------------------------- #
# 蓝牙串口（SPP）直发
# --------------------------------------------------------------------------- #
#
# 为什么蓝牙打印要走串口而不是打印机队列？
#   蓝牙小票机（如 GLPrinter）在 Windows 上通常**不会**被装成打印机，
#   它只暴露一个「Standard Serial over Bluetooth link」的虚拟串口
#   （配对后由 SPP 服务自动创建，形如 COM8）。
#   往这个串口写 ESC/POS 原始字节，等价于 USB 机走 RAW 队列 ——
#   完全绕开驱动，稳定、免装驱动。

def _decode_bt_name(raw: Any) -> str:
    """
    解码 BTHPORT 里的设备名。

    绝大多数设备写的是 UTF-16LE，但**部分小票机（如 GLPrinter）直接写单字节**，
    所以必须先判断再解码，否则会解出一串乱码汉字。
    """
    if not isinstance(raw, (bytes, bytearray)):
        return str(raw or "").strip()
    b = bytes(raw).rstrip(b"\x00")
    if not b:
        return ""
    # UTF-16LE 特征：偶数长度，且奇数位全是 0
    if len(b) % 2 == 0 and all(b[i] == 0 for i in range(1, len(b), 2)):
        return b.decode("utf-16-le", "ignore").strip()
    try:
        return b.decode("utf-8").strip()
    except UnicodeDecodeError:
        return b.decode("latin-1", "ignore").strip()


def _load_win32file():
    try:
        import win32file
        import win32con
    except ImportError as exc:  # pragma: no cover
        raise EscPosError("缺少 pywin32（win32file）。请先安装：pip install pywin32") from exc
    return win32file, win32con


def list_serial_targets() -> list[dict[str, Any]]:
    """
    枚举本机蓝牙串口（SPP），并把 COM 口映射回蓝牙设备名。

    Windows 侧信息分散在注册表两处，这里只用标准库 winreg 读取，避免引入依赖：
      * BTHENUM\\{SPP-GUID}\\<实例>\\Device Parameters → PortName 值（如 "COM8"）
        实例名里带设备 MAC（末 12 位十六进制）
      * BTHPORT\\Parameters\\Devices\\<mac>\\Name → UTF-16LE 的设备名
    """
    import winreg

    out: list[dict[str, Any]] = []

    # 1) MAC -> 蓝牙设备名
    names: dict[str, str] = {}
    try:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices",
        ) as root:
            idx = 0
            while True:
                try:
                    sub = winreg.EnumKey(root, idx)
                except OSError:
                    break
                idx += 1
                try:
                    with winreg.OpenKey(root, sub) as dev:
                        raw, _ = winreg.QueryValueEx(dev, "Name")
                        names[sub.lower()] = _decode_bt_name(raw)
                except OSError:
                    continue
    except OSError:
        pass

    # 2) SPP 实例 -> 端口号
    #
    # 注册表结构是三层：Enum\BTHENUM\<设备键>\<实例>\Device Parameters
    # 其中「设备键」会带后缀，常见三种：
    #   {SPP-GUID}_LOCALMFG&0000   —— 通用/无身份
    #   {SPP-GUID}_LOCALMFG&0002   —— 已配对设备（有 MAC，打印机通常在这里）
    #   {SPP-GUID}_VID&xxxx_PID&xxxx
    # 所以不能写死某一种后缀，必须遍历 BTHENUM 下所有以 SPP GUID 开头的键。
    try:
        base = r"SYSTEM\CurrentControlSet\Enum\BTHENUM"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base) as root:
            i = 0
            while True:
                try:
                    dev_key = winreg.EnumKey(root, i)
                except OSError:
                    break
                i += 1
                if not dev_key.lower().startswith(BT_SPP_GUID.lower()):
                    continue
                try:
                    with winreg.OpenKey(root, dev_key) as dev:
                        j = 0
                        while True:
                            try:
                                inst = winreg.EnumKey(dev, j)
                            except OSError:
                                break
                            j += 1
                            port = ""
                            try:
                                with winreg.OpenKey(dev, rf"{inst}\Device Parameters") as dp:
                                    port, _ = winreg.QueryValueEx(dp, "PortName")
                            except OSError:
                                continue
                            if not port:
                                continue
                            # 实例名形如 7&3528DEA4&0&AB0AA2B508F3_C00000000 —— 取 MAC 段
                            mac = ""
                            seg = inst.rsplit("&", 1)[-1].split("_")[0]
                            if re.fullmatch(r"[0-9A-Fa-f]{12}", seg):
                                mac = seg.lower()
                            dev_name = names.get(mac) or ""
                            # 蓝牙耳机/键鼠也会开出 SPP 口，这里排除掉，
                            # 免得设置页里混进一堆「打印机」干扰选择。
                            if dev_name and any(h in dev_name.lower() for h in _NON_PRINTER_HINTS):
                                continue
                            label = f"{dev_name} ({port})" if dev_name else f"未识别蓝牙设备 ({port})"
                            out.append({
                                "name": label,
                                "port": port,               # ← 实际投递目标
                                "kind": "serial",
                                "isBluetooth": True,
                                "isDefault": False,
                                "isThermal": bool(dev_name),   # 有名字的才当作候选小票机
                                "driver": f"Bluetooth SPP → {port}",
                                "mac": mac.upper() if mac else "",
                            })
                except OSError:
                    continue
    except OSError:
        pass

    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for t in out:
        if t["port"].upper() in seen:
            continue
        seen.add(t["port"].upper())
        uniq.append(t)
    uniq.sort(key=lambda t: t["port"])
    return uniq


def send_serial(port: str, data: bytes, *, baudrate: int = 9600, warmup: float = 0.8) -> None:
    """
    把原始字节写进蓝牙串口。

    三个要点：
      * 蓝牙小票机大多有省电休眠，刚打开链路时写入会丢包 —— 先 warmup 等链路稳定；
      * SPP 的缓冲很小，一次性 WriteFile 大块光栅数据会溢出 —— 分块写入并轻微限速；
      * **ComTimeouts**：不设超时的话，蓝牙断链时 WriteFile 会一直阻塞（界面表现为
        「点了打印没反应」），这里设成写超时 15s / 读超时 2s。
    """
    if not port:
        raise EscPosError("未指定串口（如 COM8）")
    if not data:
        raise EscPosError("打印数据为空")
    win32file, win32con = _load_win32file()

    path = f"\\\\.\\{port}"
    try:
        handle = win32file.CreateFile(
            path,
            win32con.GENERIC_READ | win32con.GENERIC_WRITE,
            0,                      # 独占打开，避免两个进程同时写
            None,
            win32con.OPEN_EXISTING,
            0,
            None,
        )
    except Exception as exc:
        raise EscPosError(
            f"打不开串口 {port}：{exc}。\n"
            f"请依次确认：① 打印机已开机；② Windows「蓝牙和其他设备」里 GLPrinter 显示为已连接；"
            f"③ 没有别的程序（打印机工具/串口助手）占着 {port}。"
        ) from exc

    try:
        # 通讯超时：写 15s（一整张票据），读 2s
        try:
            from pywintypes import Timeout
            win32file.SetCommTimeouts(handle, (
                0xFFFFFFFF, 0,     # ReadIntervalTimeout, ReadTotalTimeoutMultiplier
                2000,              # ReadTotalTimeoutConstant (ms)
                0,                 # WriteTotalTimeoutMultiplier
                15000,             # WriteTotalTimeoutConstant (ms)
            ))
        except Exception:
            pass  # 老版本 pywin32 不支持就算了，不能因此打不了

        dcb = win32file.GetCommState(handle)
        dcb.BaudRate = int(baudrate)
        dcb.ByteSize = 8
        dcb.Parity = win32con.NOPARITY
        dcb.StopBits = win32con.ONESTOPBIT
        dcb.fBinary = True
        dcb.fParity = False
        dcb.fOutxCtsFlow = False
        dcb.fOutxDsrFlow = False
        dcb.fDtrControl = win32con.DTR_CONTROL_ENABLE
        dcb.fDsrSensitivity = False
        dcb.fOutX = False
        dcb.fInX = False
        dcb.fRtsControl = win32con.RTS_CONTROL_ENABLE
        dcb.fAbortOnError = False
        win32file.SetCommState(handle, dcb)
        win32file.PurgeComm(handle, win32file.PURGE_TXCLEAR | win32file.PURGE_RXCLEAR)

        if warmup > 0:
            # 先发一次初始化指令唤醒打印机，等它从休眠里起来
            win32file.WriteFile(handle, ESC + b"@")
            time.sleep(warmup)

        CHUNK = 1024
        for off in range(0, len(data), CHUNK):
            win32file.WriteFile(handle, data[off:off + CHUNK])
            time.sleep(0.004)       # 轻微限速，防止 SPP 缓冲溢出
        time.sleep(0.3)             # 等最后一批真的出队
    except Exception as exc:
        raise EscPosError(f"写入串口 {port} 失败：{exc}") from exc
    finally:
        try:
            win32file.CloseHandle(handle)
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# 统一投递（打印机名 / COM 口）
# --------------------------------------------------------------------------- #

def is_serial_target(target: str) -> bool:
    return bool(SERIAL_RE.match((target or "").strip()))


def send(target: str, data: bytes, *, job_name: str = "Hook Fishpond",
         baudrate: int = 9600) -> str:
    """按目标形态自动选择通道：`COM8` 走蓝牙串口，其余走 Windows 打印队列。"""
    t = (target or "").strip()
    if is_serial_target(t):
        send_serial(t, data, baudrate=baudrate)
        return "serial"
    send_raw(t, data, job_name=job_name)
    return "winspool"


def target_exists(target: str) -> bool:
    t = (target or "").strip()
    if not t:
        return False
    if is_serial_target(t):
        return any(x["port"].upper() == t.upper() for x in list_serial_targets())
    return printer_exists(t)


# --------------------------------------------------------------------------- #
# 打印机枚举
# --------------------------------------------------------------------------- #

# 按名字猜是不是票据/热敏打印机：有助在设置页里把 POS80 排在前面
_THERMAL_HINTS = ("pos", "thermal", "receipt", "glprinter", "glprint", "xp-", "tm-", "rp", "zjy", "sep-")

# 蓝牙耳机/键鼠/音箱也会暴露 SPP 串口，这些要从「打印目标」里剔除
_NON_PRINTER_HINTS = (
    "freebuds", "airpods", "buds", "headphone", "headset", "earbud",
    "speaker", "soundbar", "mouse", "keyboard", "avrcp", "mx master",
    "xm-", "hands-free", "a2dp",
)


def list_printers() -> list[dict[str, Any]]:
    win32print = _load_win32print()
    default = ""
    try:
        default = win32print.GetDefaultPrinter() or ""
    except Exception:
        default = ""

    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    out: list[dict[str, Any]] = []
    for entry in win32print.EnumPrinters(flags, None, 2):
        name = entry.get("pPrinterName") or ""
        if not name:
            continue
        info: dict[str, Any] = {
            "name": name,
            "port": entry.get("pPortName") or "",
            "driver": entry.get("pDriverName") or "",
            "isDefault": name == default,
            "isThermal": any(h in name.lower() for h in _THERMAL_HINTS),
        }
        out.append(info)

    out.sort(key=lambda p: (not p["isThermal"], not p["isDefault"], p["name"].lower()))
    return out


def printer_exists(name: str) -> bool:
    try:
        return any(p["name"] == name for p in list_printers())
    except Exception:
        return False


def annotate_shared_device(targets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    标注「同一台打印机被两条通道发现」的情况。

    典型场景：小票机既能 USB 直连（Windows 队列 `POS80`），又能蓝牙 SPP
    （`GLPrinter → COM8`）。对使用者来说这**是一台机**，不该当成两个设备分别去
    配置。

    自动判断只认一条可靠线索：**蓝牙串口的 MAC 与某台 Windows 队列的端口信息里
    出现的 MAC 相同**。名字/驱动都不算 —— 实测 `Microsoft IPP Class Driver`
    会被三台不同打印机共用，按驱动归组会把完全无关的机器合并。

    所以这里只做「MAC 完全一致」的归组；`POS80 ↔ GLPrinter` 这种名字完全
    不同的绑定，交给用户在设置页手动指定（存数据库，两端通用）。
    """
    def norm_mac(s: Any) -> str:
        m = re.sub(r"[^0-9a-f]", "", str(s or "").lower())
        return m if len(m) == 12 and m != "0" * 12 else ""

    for t in targets:
        t["deviceGroup"] = ""
        t["isPrimary"] = False
        t["_mac"] = norm_mac(t.get("mac"))

    groups: dict[str, list[dict[str, Any]]] = {}
    for t in targets:
        if t["_mac"]:
            groups.setdefault(t["_mac"], []).append(t)

    for members in groups.values():
        if len(members) < 2:
            continue
        label = min((m.get("name", "") for m in members), key=len)
        for m in members:
            m["deviceGroup"] = label
        # 同组里让 Windows 队列当主通道：USB 更稳，不受蓝牙休眠/断链影响
        primary = next((m for m in members if m.get("kind") == "winspool"), members[0])
        primary["isPrimary"] = True

    for t in targets:
        t.pop("_mac", None)
    return targets


def list_targets() -> list[dict[str, Any]]:
    """打印目标全集 = Windows 打印队列 + 蓝牙串口（SPP）。热敏机排前面。"""
    items: list[dict[str, Any]] = []
    try:
        for p in list_printers():
            items.append({**p, "kind": "winspool"})
    except Exception:
        pass
    try:
        items.extend(list_serial_targets())
    except Exception:
        pass
    items.sort(key=lambda p: (not p.get("isThermal"), not p.get("isDefault"), p.get("name", "").lower()))
    return annotate_shared_device(items)


def list_serial_ports_only() -> list[str]:
    """本机所有 COM 口（含非蓝牙），供设置页做「手填端口」下拉。"""
    import winreg
    ports: set[str] = set()
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DEVICEMAP\SERIALCOMM") as k:
            idx = 0
            while True:
                try:
                    _, val, _ = winreg.EnumValue(k, idx)
                except OSError:
                    break
                idx += 1
                if isinstance(val, str) and SERIAL_RE.match(val):
                    ports.add(val.upper())
    except OSError:
        pass
    return sorted(ports, key=lambda s: int(s[3:]))
