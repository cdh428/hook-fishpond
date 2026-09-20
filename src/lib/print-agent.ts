/**
 * 网页端打印代理
 * ==============
 *
 * 目标：在收银机上做到「点一下就出纸」，不弹系统打印对话框。
 *
 * 两条路：
 *   1. 本地打印桥（`tools/print-bridge`）—— 探测得到就走它，能按目标静默打印，
 *      支持 USB 打印机（`POS80`）和蓝牙小票机（GLPrinter，走 SPP 串口 `COM8`）。
 *   2. 浏览器打印 —— 探测不到桥（比如员工用手机/家里电脑打开）就自动回退到
 *      `window.print()`，弹系统对话框让人手选打印机。功能不中断。
 *
 * 目标选择存在 localStorage，每台收银机各存各的。
 */

import { printHtml } from '@/lib/print-receipt';

export type PrintPurpose = 'kitchen' | 'bill' | 'receipt';
export type PrintMode = 'bridge' | 'browser';

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
}

export interface PrintOutcome {
  /** 实际走通的通道 */
  via: 'bridge' | 'browser';
  /** 走桥时的目标（打印机名或 COM 口） */
  target?: string;
  /** 目标显示名 */
  targetLabel?: string;
  /** 回退到浏览器时的原因，便于界面提示 */
  fallbackReason?: 'mode-browser' | 'bridge-offline' | 'no-target' | 'bridge-error';
  error?: string;
  ms?: number;
}

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:17777';

const LS_BRIDGE_URL = 'hf.print.bridgeUrl';
const LS_MODE = 'hf.print.mode';
const LS_TARGET = (p: PrintPurpose) => `hf.print.target.${p}`;

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
  const v = safeLocalStorage()?.getItem(LS_MODE);
  return v === 'browser' ? 'browser' : 'bridge';
}

export function setPrintMode(mode: PrintMode): void {
  safeLocalStorage()?.setItem(LS_MODE, mode);
}

/** 目标标识：串口用端口号，Windows 队列用打印机名 */
export function targetId(t: BridgeTarget): string {
  return t.kind === 'serial' ? t.port : t.name;
}

export function getTargetFor(purpose: PrintPurpose): string {
  return safeLocalStorage()?.getItem(LS_TARGET(purpose))?.trim() || '';
}

export function setTargetFor(purpose: PrintPurpose, targetIdValue: string): void {
  safeLocalStorage()?.setItem(LS_TARGET(purpose), targetIdValue.trim());
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
 * 自动挑一个合理目标：优先用显式配置的；其次优先热敏票据机；最后用桥的默认。
 *
 * 分工是按「谁在哪台机子上取纸」来的：
 *   · 后厨单 —— 厨房那台（常是蓝牙手持/挂在厨房），所以优先蓝牙机
 *   · 预结单 / 收据 —— 都是收银台打给顾客的，跟着默认票据机走
 * 只要某台机器在设置页里显式指定过，就一律以显式配置为准。
 */
export function pickAutoTarget(health: BridgeHealth, purpose: PrintPurpose): string {
  const saved = getTargetFor(purpose);
  if (saved && health.targets.some((t) => targetId(t) === saved)) return saved;

  const thermal = health.targets.filter((t) => t.isThermal);
  if (thermal.length) {
    if (purpose === 'kitchen') {
      const bt = thermal.find((t) => t.kind === 'serial');
      if (bt) return targetId(bt);
    }
    return targetId(thermal[0]);
  }
  return health.defaultPrinter || '';
}

export async function printViaBridge(
  html: string,
  target: string,
  opts?: { copies?: number; cut?: boolean; feedLines?: number },
): Promise<{ ok: boolean; width?: number; height?: number; bytes?: number; ms?: number; transport?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${getBridgeUrl()}/print`,
      {
        method: 'POST',
        cache: 'no-store',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printer: target,
          html,
          copies: opts?.copies ?? 1,
          cut: opts?.cut ?? true,
          ...(opts?.feedLines != null ? { feedLines: opts.feedLines } : {}),
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
  opts?: { copies?: number },
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

  const target = pickAutoTarget(health, purpose);
  if (!target) {
    await printHtml(html);
    return { via: 'browser', fallbackReason: 'no-target', ms: Date.now() - started };
  }

  const r = await printViaBridge(html, target, { copies: opts?.copies ?? 1 });
  if (r.ok) {
    return {
      via: 'bridge',
      target,
      targetLabel: health.targets.find((t) => targetId(t) === target)?.name,
      ms: r.ms ?? Date.now() - started,
    };
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
