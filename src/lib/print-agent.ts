/**
 * 网页端打印代理
 * ==============
 *
 * 目标：在收银机上做到「点一下就出纸」，不弹系统打印对话框。
 *
 * 两条路：
 *   1. 本地打印桥（`tools/print-bridge`）—— 探测得到就走它，能按目标静默打印，
 *      支持 USB 打印机（`POS80`）和蓝牙小票机（GLPrinter，走 SPP 串口 `COM8`）。
 *      **手机/平板也能用**：桥默认监听 0.0.0.0，手机在同一 Wi-Fi 下把「打印服务
 *      地址」填成电脑的局域网 IP 即可（桥的 /health 里会回报自己的 lanUrls）。
 *   2. 浏览器打印 —— 探测不到桥（比如员工在店外打开）就自动回退到
 *      `window.print()`，弹系统对话框让人手选打印机。功能不中断。
 *
 * 注意：**手机不能直接连这台蓝牙打印机**。GLPrinter 是经典蓝牙 SPP
 * （服务 UUID 00001101），而 Web Bluetooth 只支持 BLE（低功耗）设备，iPhone 的
 * Safari 更是完全不支持。所以手机也必须经过打印桥转发，不能指望网页直连。
 *
 * 配置分层：
 *   · 通道偏好（usb / bluetooth / auto）+ 切纸参数 → 存**数据库**，手机与收银机共用
 *   · 打印桥地址 → 存本机 localStorage（它本来就是「这台设备怎么找到桥」，不该共用）
 */

import { printHtml } from '@/lib/print-receipt';

export type PrintPurpose = 'kitchen' | 'bill' | 'receipt';
export type PrintMode = 'bridge' | 'browser';

/** 通道偏好：不是具体端口号，因此手机/电脑可以共用同一份配置 */
export type ChannelPreference = 'usb' | 'bluetooth' | 'auto';
export type CutMode = 'full' | 'partial' | 'full-feed' | 'partial-feed';

export interface PrintPreferences {
  kitchen: ChannelPreference;
  bill: ChannelPreference;
  receipt: ChannelPreference;
  cutMode: CutMode;
  feedLines: number;
}

export const DEFAULT_PREFERENCES: PrintPreferences = {
  kitchen: 'usb',
  bill: 'usb',
  receipt: 'usb',
  cutMode: 'full',
  feedLines: 6,
};

export interface BridgeTarget {
  /** 显示名，如 `GLPrinter (COM8)` */
  name: string;
  /** 实际投递目标：Windows 队列是打印机名；蓝牙串口是 `COM8` */
  port: string;
  kind: 'winspool' | 'serial';
  isBluetooth?: boolean;
  isDefault?: boolean;
  isThermal?: boolean;
  driver?: string;
  mac?: string;
  /** 桥自动判定的「同一台机」组名（仅 MAC 完全一致时才会归组） */
  deviceGroup?: string;
  isPrimary?: boolean;
}

export interface BridgeHealth {
  ok: boolean;
  service: string;
  version: string;
  defaultPrinter: string;
  widthDots: number;
  printerCount: number;
  targets: BridgeTarget[];
  serialPorts?: string[];
  chrome: boolean;
  /** 桥所在机器的局域网地址，手机填地址时照抄 */
  lanUrls?: string[];
  cutMode?: string;
  feedLines?: number;
}

export interface PrintOutcome {
  /** 实际走通的通道 */
  via: 'bridge' | 'browser';
  /** 走桥时的目标（打印机名或 COM 口） */
  target?: string;
  /** 目标显示名 */
  targetLabel?: string;
  /** 回退到浏览器时的原因，便于界面提示 */
  fallbackReason?: 'mode-browser' | 'bridge-offline' | 'no-target' | 'bridge-error' | 'bt-offline';
  error?: string;
  ms?: number;
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:17777';

const LS_BRIDGE_URL = 'hf.print.bridgeUrl';
const LS_BRIDGE_KEY = 'hf.print.bridgeKey';
const LS_PREFS_CACHE = 'hf.print.prefs.cache';

export function getBridgeKey(): string {
  const ls = safeLocalStorage();
  return (ls?.getItem(LS_BRIDGE_KEY) || '').trim();
}

export function setBridgeKey(key: string): void {
  safeLocalStorage()?.setItem(LS_BRIDGE_KEY, key.trim());
}

/** 远端（数据库）配置的本地缓存，避免每次打印都多一次网络往返 */
let prefsCache: PrintPreferences | null = null;

/** 探测超时要短：桥在就在，不在就立刻回退，别让收银员干等 */
const PROBE_TIMEOUT_MS = 1800;
/** 打印超时要长：蓝牙只有十几 KB/s，一张预结单要 10 秒左右 */
const PRINT_TIMEOUT_MS = 120000;
/** 探测结果缓存，避免每次打印都多一次往返 */
const HEALTH_TTL_MS = 15000;

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- #
// 配置读写
// --------------------------------------------------------------------------- #

export function getBridgeUrl(): string {
  const ls = safeLocalStorage();
  return (ls?.getItem(LS_BRIDGE_URL) || '').trim() || DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url: string): void {
  safeLocalStorage()?.setItem(LS_BRIDGE_URL, url.trim());
  healthCache = null;
}

export function getPrintMode(): PrintMode {
  const v = safeLocalStorage()?.getItem('hf.print.mode');
  return v === 'browser' ? 'browser' : 'bridge';
}

export function setPrintMode(mode: PrintMode): void {
  safeLocalStorage()?.setItem('hf.print.mode', mode);
}

/** 目标标识：串口用端口号，Windows 队列用打印机名 */
export function targetId(t: BridgeTarget): string {
  return t.kind === 'serial' ? t.port : t.name;
}

function normalizePrefs(raw: unknown): PrintPreferences {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ch = (v: unknown): ChannelPreference =>
    v === 'usb' || v === 'bluetooth' || v === 'auto' ? v : DEFAULT_PREFERENCES.kitchen;
  const cut: CutMode =
    o.cutMode === 'partial' || o.cutMode === 'full-feed' || o.cutMode === 'partial-feed'
      ? (o.cutMode as CutMode)
      : 'full';
  const feed = Number(o.feedLines);
  return {
    kitchen: ch(o.kitchen),
    bill: ch(o.bill),
    receipt: ch(o.receipt),
    cutMode: cut,
    feedLines: Number.isFinite(feed) ? Math.min(12, Math.max(0, Math.round(feed))) : 6,
  };
}

/** 同步取当前偏好（优先远端缓存，其次 localStorage 兜底） */
export function getPreferences(): PrintPreferences {
  if (prefsCache) return prefsCache;
  const raw = safeLocalStorage()?.getItem(LS_PREFS_CACHE);
  if (raw) {
    try {
      prefsCache = normalizePrefs(JSON.parse(raw));
      return prefsCache;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_PREFERENCES;
}

export function setPreferences(prefs: PrintPreferences): void {
  prefsCache = prefs;
  safeLocalStorage()?.setItem(LS_PREFS_CACHE, JSON.stringify(prefs));
}

/**
 * 从服务端拉取偏好（手机与收银机共用同一份）。
 * 拉不到就沿用本地缓存 —— 打印不能因为后台短暂不可用而停摆。
 */
export async function loadPreferences(force = false): Promise<PrintPreferences> {
  if (prefsCache && !force) return prefsCache;
  try {
    const res = await fetch('/api/admin/print/settings', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      const prefs = normalizePrefs(j?.preferences);
      setPreferences(prefs);
      return prefs;
    }
  } catch {
    /* 离线：用缓存 */
  }
  return getPreferences();
}

/** 保存到服务端；成功后同步刷新本地缓存 */
export async function savePreferences(prefs: PrintPreferences): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/print/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: prefs }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error || `HTTP ${res.status}` };
    const saved = normalizePrefs(j?.preferences ?? prefs);
    setPreferences(saved);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --------------------------------------------------------------------------- #
// 探测
// --------------------------------------------------------------------------- #

let healthCache: { at: number; health: BridgeHealth | null } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 探测本地桥。返回 `null` 表示不可用（没启动 / 被浏览器拦 / 网络不通）。
 * `force` 为真时忽略缓存。
 */
export async function probeBridge(force = false): Promise<BridgeHealth | null> {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  if (!force && healthCache && now - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.health;
  }

  let health: BridgeHealth | null = null;
  try {
    const res = await fetchWithTimeout(
      `${getBridgeUrl()}/health`,
      { method: 'GET', cache: 'no-store', mode: 'cors' },
      PROBE_TIMEOUT_MS,
    );
    if (res.ok) {
      const j = (await res.json()) as BridgeHealth;
      if (j?.ok && j.service === 'hook-fishpond-print-bridge') health = j;
    }
  } catch {
    health = null;
  }
  healthCache = { at: now, health };
  return health;
}

export function clearBridgeCache(): void {
  healthCache = null;
}

/** 列出桥上所有可打印目标（桥不可用返回空数组） */
export async function fetchBridgeTargets(): Promise<BridgeTarget[]> {
  const health = await probeBridge(true);
  return health?.targets ?? [];
}

// --------------------------------------------------------------------------- #
// 打印
// --------------------------------------------------------------------------- #

/**
 * 按「通道偏好」挑一个实际目标。
 *
 * 偏好是 `usb` / `bluetooth` / `auto`，跨设备通用 —— 因为存的是**通道类型**，
 * 不是端口号。同一份配置拿到手机上、拿到另一台收银机上都能用。
 *
 * 优先级：
 *   1. 桥自己声明的默认目标（= 这台机器配置的默认打印机）
 *   2. 偏好通道里的热敏票据机
 *   3. 任意热敏票据机
 *   4. 任意打印机
 *
 * 通道不可用（比如偏好了蓝牙但蓝牙没连、没有 COM 口）时自动降级到另一条，
 * 而不是直接报错 —— 收银台不能因为「今天蓝牙没开」就整晚打不出单。
 */
export function pickAutoTarget(
  health: BridgeHealth,
  purpose: PrintPurpose,
  prefs: PrintPreferences = getPreferences(),
): string {
  const want = prefs[purpose] ?? 'usb';
  const thermal = health.targets.filter((t) => t.isThermal);

  const byChannel = (ch: ChannelPreference) => {
    if (ch === 'usb') return thermal.find((t) => t.kind === 'winspool');
    if (ch === 'bluetooth') return thermal.find((t) => t.kind === 'serial');
    // auto：票据机里优先 USB（更稳），没有再蓝牙
    return thermal.find((t) => t.kind === 'winspool') || thermal.find((t) => t.kind === 'serial');
  };

  if (want !== 'auto') {
    const hit = byChannel(want);
    if (hit) return targetId(hit);
  }

  // 偏好通道没有可用目标 → 看桥声明的默认，再退到任意票据机
  const declared = health.defaultPrinter
    ? health.targets.find((t) => targetId(t) === health.defaultPrinter)
    : undefined;
  if (declared) return targetId(declared);

  if (thermal.length) return targetId(thermal[0]);
  if (health.targets.length) return targetId(health.targets[0]);
  return '';
}

export async function printViaBridge(
  html: string,
  target: string,
  opts?: { copies?: number; cut?: boolean; feedLines?: number; cutMode?: string },
): Promise<{ ok: boolean; width?: number; height?: number; bytes?: number; ms?: number; transport?: string; error?: string }> {
  try {
    const key = getBridgeKey();
    const res = await fetchWithTimeout(
      `${getBridgeUrl()}/print`,
      {
        method: 'POST',
        cache: 'no-store',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'X-Print-Key': key } : {}),
        },
        body: JSON.stringify({
          printer: target,
          html,
          copies: opts?.copies ?? 1,
          cut: opts?.cut ?? true,
          ...(opts?.feedLines != null ? { feedLines: opts.feedLines } : {}),
          ...(opts?.cutMode ? { cutMode: opts.cutMode } : {}),
        }),
      },
      PRINT_TIMEOUT_MS,
    );
    const j = await res.json().catch(() => ({}));
    if (res.ok && j?.ok) {
      return { ok: true, width: j.width, height: j.height, bytes: j.bytes, ms: j.ms, transport: j.transport };
    }
    return { ok: false, error: j?.error || `桥返回 HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    healthCache = null; // 出错后让下次重新探测
    return { ok: false, error: msg };
  }
}

/**
 * 统一打印入口：能走桥就走桥（静默出纸），否则回退浏览器对话框。
 *
 * 调用方只需关心「要打什么」，不用管走哪条路。
 */
export async function submitPrint(
  html: string,
  purpose: PrintPurpose,
  opts?: { copies?: number; feedLines?: number; cutMode?: string; cut?: boolean },
): Promise<PrintOutcome> {
  const started = Date.now();

  if (getPrintMode() === 'browser') {
    await printHtml(html);
    return { via: 'browser', fallbackReason: 'mode-browser', ms: Date.now() - started };
  }

  const health = await probeBridge();
  if (!health) {
    await printHtml(html);
    return { via: 'browser', fallbackReason: 'bridge-offline', ms: Date.now() - started };
  }

  // 偏好从服务端拿（手机与收银机共用）；拿不到就用本地缓存
  const prefs = await loadPreferences();
  const target = pickAutoTarget(health, purpose, prefs);
  if (!target) {
    await printHtml(html);
    return { via: 'browser', fallbackReason: 'no-target', ms: Date.now() - started };
  }

  const cutOpts = {
    copies: opts?.copies ?? 1,
    cut: opts?.cut,
    cutMode: opts?.cutMode ?? prefs.cutMode,
    feedLines: opts?.feedLines ?? prefs.feedLines,
  };
  const r = await printViaBridge(html, target, cutOpts);
  if (r.ok) {
    return {
      via: 'bridge',
      target,
      targetLabel: health.targets.find((t) => targetId(t) === target)?.name,
      ms: r.ms ?? Date.now() - started,
    };
  }

  // 蓝牙目标失败（打印机关机 / 断链 / 被占用）→ 先自动改投同机的 USB 票据机，
  // 别让店员在收银台干等一张出不来的单子。
  // 只在「失败目标是蓝牙」且「存在别的热敏票据机」时才降级，
  // 避免 USB 机故障时来回重试。
  const failedIsBt = health.targets.find((t) => targetId(t) === target)?.kind === 'serial';
  if (failedIsBt) {
    const fallback = health.targets.find(
      (t) => t.kind === 'winspool' && t.isThermal && targetId(t) !== target,
    );
    if (fallback) {
      const fb = await printViaBridge(html, targetId(fallback), cutOpts);
      if (fb.ok) {
        return {
          via: 'bridge',
          target: targetId(fallback),
          targetLabel: fallback.name,
          fallbackReason: 'bt-offline',
          error: r.error,
          ms: Date.now() - started,
        };
      }
    }
  }

  // 桥在但打印失败：不能静默吞掉，回退对话框让店员有机会手选，同时把错误带回去
  await printHtml(html);
  return {
    via: 'browser',
    target,
    fallbackReason: 'bridge-error',
    error: r.error,
    ms: Date.now() - started,
  };
}

/** 给界面用的一句话结果描述 */
type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

export function describeOutcome(o: PrintOutcome, t: TranslateFn): string {
  if (o.via === 'bridge') {
    // 蓝牙失败改投了 USB：明确说出来，否则店员会以为蓝牙机在正常工作
    if (o.fallbackReason === 'bt-offline') {
      return t('printAgent.btFallback', { target: o.targetLabel || o.target || '' });
    }
    return t('printAgent.sentTo', { target: o.targetLabel || o.target || '' });
  }
  switch (o.fallbackReason) {
    case 'mode-browser':
      return t('printAgent.browserMode');
    case 'bridge-offline':
      return t('printAgent.bridgeOffline');
    case 'no-target':
      return t('printAgent.noTarget');
    case 'bridge-error':
      return t('printAgent.bridgeError', { error: o.error || '' });
    default:
      return t('printAgent.browserMode');
  }
}
