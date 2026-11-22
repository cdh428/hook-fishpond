/**
 * 网页端打印代理
 * ==============
 *
 * 收银机上「点一下就出纸」，不弹系统打印对话框。
 *
 * 打印一律走本地打印桥（`tools/print-bridge`，监听 `127.0.0.1:17777`）：
 * 桥把 HTML 渲染成 1-bit 位图后经 Windows GDI 驱动送到 POS80 热敏机。
 * 手机/平板在同一 Wi-Fi 下把「打印服务地址」填成收银机的局域网 IP 也能用。
 *
 * 配置分层（2026-11-17 简化）：
 *   · 纸宽 + 水平偏移 → 存**数据库**，收银机/手机共用同一份
 *   · 打印桥地址 / 鉴权 Key → 存本机 localStorage（本来就跟设备相关）
 */

export type PrintPurpose = 'kitchen' | 'bill' | 'receipt';

/** 纸宽：50mm 或 80mm（决定打印点宽与 CSS 渲染宽度） */
export type PaperWidthMm = '50' | '80';

export interface PrintPreferences {
  /** 纸宽（mm）。80mm 默认。50mm 用于较窄的小票机。 */
  paperWidth: PaperWidthMm;
  /**
   * 打印内容水平偏移（mm）。正数往左，负数往右。
   * 用于校正热敏打印机驱动常有的物理左边距。
   */
  leftShiftMm: number;
}

export const DEFAULT_PREFERENCES: PrintPreferences = {
  paperWidth: '80',
  leftShiftMm: 10,
};

/** 纸宽 → 输出点宽（203dpi 热敏机）。80mm=576 点，50mm=384 点。 */
export function paperWidthToDots(mm: PaperWidthMm): number {
  return mm === '50' ? 384 : 576;
}

export interface BridgeTarget {
  /** 显示名，如 `POS80` */
  name: string;
  /** 实际投递目标：Windows 队列是打印机名 */
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
  chrome: boolean;
  /** 桥所在机器的局域网地址，手机填地址时照抄 */
  lanUrls?: string[];
}

export interface PrintOutcome {
  /** 实际走通的通道 */
  via: 'bridge';
  /** 走桥时的目标（打印机名） */
  target?: string;
  /** 目标显示名 */
  targetLabel?: string;
  /** 失败原因，便于界面提示 */
  fallbackReason?: 'bridge-offline' | 'no-target' | 'bridge-error';
  error?: string;
  ms?: number;
}

/**
 * 默认打印桥地址 = POS80 收银机的 Tailscale HTTPS 域名。
 *
 * 为什么必须是 https：管理后台是 https 页面，浏览器**禁止** https 页面 fetch
 * http:// 地址（混合内容拦截，且静默失败——报出来只是「桥离线」）。
 * 127.0.0.1/localhost 有豁免；100.85.92.120 这类 http 地址会被直接拦。
 *
 * 域名来自 Tailscale MagicDNS（收银机跑 `tailscale serve --bg --https=443
 * http://127.0.0.1:17777` 后生效）。IP 漂移不影响它。
 */
const DEFAULT_BRIDGE_URL = 'https://desktop-h9c31c4.tailf74d0b.ts.net';

/** 探测候选（按序尝试，跳过会被浏览器拦的）：
 *  - https 页面下 http://100.85… 会被混合内容拦 → 跳过
 *  - http://127.0.0.1 任何页面都放行（浏览器视为可信源）→ 桥就在本机时兜底 */
const FALLBACK_BRIDGE_URLS = ['http://127.0.0.1:17777'];

const LS_BRIDGE_URL = 'hf.print.bridgeUrl';
const LS_BRIDGE_KEY = 'hf.print.bridgeKey';
const LS_PREFS_CACHE = 'hf.print.prefs.cache';

/** 混合内容：https 页面 fetch 明文 http 地址（非本机），浏览器必拦 */
export function isMixedContentBlocked(url: string): boolean {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return false;
  try {
    const u = new URL(url, window.location.origin);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname;
    return h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]';
  } catch {
    return false;
  }
}

/** 最近一次 probeBridge 失败的原因，供设置页给出精准提示 */
export type BridgeOfflineReason = 'mixed-content' | 'unreachable' | null;
let lastProbeReason: BridgeOfflineReason = null;

export function getLastProbeReason(): BridgeOfflineReason {
  return lastProbeReason;
}

export function getBridgeKey(): string {
  return (safeLocalStorage()?.getItem(LS_BRIDGE_KEY) || '').trim();
}

export function setBridgeKey(key: string): void {
  safeLocalStorage()?.setItem(LS_BRIDGE_KEY, key.trim());
}

/** 远端（数据库）配置的本地缓存，避免每次打印都多一次网络往返 */
let prefsCache: PrintPreferences | null = null;

/** 探测超时要短：桥在就在，不在就立刻回退，别让收银员干等 */
const PROBE_TIMEOUT_MS = 1800;
/** 打印超时要长：给桥渲染和驱动出纸留足时间 */
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
  return (safeLocalStorage()?.getItem(LS_BRIDGE_URL) || '').trim() || DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url: string): void {
  safeLocalStorage()?.setItem(LS_BRIDGE_URL, url.trim());
  healthCache = null;
}

/** 目标标识：串口用端口号，Windows 队列用打印机名 */
export function targetId(t: BridgeTarget): string {
  return t.kind === 'serial' ? t.port : t.name;
}

function normalizePrefs(raw: unknown): PrintPreferences {
  const o = (raw ?? {}) as Record<string, unknown>;
  const paper =
    o.paperWidth === '50' || o.paperWidth === '80' ? o.paperWidth : DEFAULT_PREFERENCES.paperWidth;
  const shift = Number(o.leftShiftMm);
  return {
    paperWidth: paper,
    leftShiftMm: Number.isFinite(shift)
      ? Math.min(20, Math.max(-20, Math.round(shift)))
      : DEFAULT_PREFERENCES.leftShiftMm,
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
 * 从服务端拉取偏好（收银机/手机共用同一份）。
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

async function fetchHealth(url: string): Promise<BridgeHealth | null> {
  try {
    const res = await fetchWithTimeout(
      `${url}/health`,
      { method: 'GET', cache: 'no-store', mode: 'cors' },
      PROBE_TIMEOUT_MS,
    );
    if (res.ok) {
      const j = (await res.json()) as BridgeHealth;
      if (j?.ok && j.service === 'hook-fishpond-print-bridge') return j;
    }
  } catch {
    /* 探测失败 */
  }
  return null;
}

/**
 * 探测打印桥。返回 `null` 表示不可用（没启动 / 被浏览器拦 / 网络不通）。
 * `force` 为真时忽略缓存。
 *
 * 失败原因记在 `lastProbeReason`（getLastProbeReason() 取）：
 *   · mixed-content —— https 页面试图访问明文 http 桥（浏览器拦截）
 *   · unreachable   —— 发得出请求但桥不应答
 *
 * 历史问题（已由候选链解决）：
 *   2026-11-17  桥机 IP 漂移 → 存的旧地址失效，误报「未启动」→ 自愈回退
 *   2026-11-22  换成 https 域名后不再依赖 IP；127.0.0.1 仅作同机兜底
 */
export async function probeBridge(force = false): Promise<BridgeHealth | null> {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  if (!force && healthCache && now - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.health;
  }

  // 候选链：当前存的地址 → 默认（Tailscale HTTPS）→ 本机。跳过必被浏览器拦的。
  const seen = new Set<string>();
  const candidates = [getBridgeUrl(), DEFAULT_BRIDGE_URL, ...FALLBACK_BRIDGE_URLS].filter((u) => {
    const key = u.replace(/\/+$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let health: BridgeHealth | null = null;
  let sawBlocked = false;
  for (const url of candidates) {
    if (isMixedContentBlocked(url)) {
      sawBlocked = true;
      continue; // fetch 都不会发出去，别浪费时间
    }
    health = await fetchHealth(url);
    if (health) {
      if (url !== getBridgeUrl()) setBridgeUrl(url); // 自愈：把可用地址存回去
      break;
    }
  }

  lastProbeReason = health ? null : sawBlocked ? 'mixed-content' : 'unreachable';
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
 * 挑一个实际打印目标。
 *
 * 现在只有一台 POS80（Windows USB 队列），逻辑简化为：
 *   1. 桥声明的默认目标
 *   2. 任意热敏票据机（winspool 优先）
 *   3. 任意打印机
 */
export function pickAutoTarget(health: BridgeHealth): string {
  const declared = health.defaultPrinter
    ? health.targets.find((t) => targetId(t) === health.defaultPrinter)
    : undefined;
  if (declared) return targetId(declared);

  const thermal = health.targets.filter((t) => t.isThermal);
  const winspoolThermal = thermal.find((t) => t.kind === 'winspool');
  if (winspoolThermal) return targetId(winspoolThermal);

  if (thermal.length) return targetId(thermal[0]);
  if (health.targets.length) return targetId(health.targets[0]);
  return '';
}

export async function printViaBridge(
  html: string,
  target: string,
  opts?: { copies?: number; cut?: boolean; width?: number; paperWidthMm?: number; leftShiftMm?: number },
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
          ...(opts?.width ? { width: opts.width } : {}),
          ...(opts?.paperWidthMm ? { paperWidthMm: opts.paperWidthMm } : {}),
          ...(opts?.leftShiftMm != null ? { leftShiftMm: opts.leftShiftMm } : {}),
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
 * 统一打印入口：**一律走打印桥**。
 * 桥不可用/失败时直接返回失败结果，由调用方提示「打印服务不可用」。
 */
export async function submitPrint(
  html: string,
  _purpose: PrintPurpose,
  opts?: { copies?: number; cut?: boolean },
): Promise<PrintOutcome> {
  const started = Date.now();

  const health = await probeBridge();
  if (!health) {
    return {
      via: 'bridge',
      fallbackReason: 'bridge-offline',
      error: '打印桥未启动（127.0.0.1:17777）',
      ms: Date.now() - started,
    };
  }

  // 偏好从服务端拿（收银机/手机共用）；拿不到就用本地缓存
  const prefs = await loadPreferences();
  const target = pickAutoTarget(health);
  if (!target) {
    return {
      via: 'bridge',
      fallbackReason: 'no-target',
      error: '未指定可用的打印目标',
      ms: Date.now() - started,
    };
  }

  const r = await printViaBridge(html, target, {
    copies: opts?.copies ?? 1,
    cut: opts?.cut,
    width: paperWidthToDots(prefs.paperWidth),
    paperWidthMm: Number(prefs.paperWidth) || 80,
    leftShiftMm: prefs.leftShiftMm,
  });

  if (r.ok) {
    return {
      via: 'bridge',
      target,
      targetLabel: health.targets.find((t) => targetId(t) === target)?.name,
      ms: r.ms ?? Date.now() - started,
    };
  }

  // 桥在但打印失败：不静默吞掉，返回失败结果，调用方提示「打印失败」。
  return {
    via: 'bridge',
    target,
    fallbackReason: 'bridge-error',
    error: r.error || '打印桥返回失败',
    ms: Date.now() - started,
  };
}

/** 给界面用的一句话结果描述 */
type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

export function describeOutcome(o: PrintOutcome, t: TranslateFn): string {
  switch (o.fallbackReason) {
    case 'bridge-offline':
      return t('printAgent.bridgeOffline');
    case 'no-target':
      return t('printAgent.noTarget');
    case 'bridge-error':
      return t('printAgent.bridgeError', { error: o.error || '' });
  }
  return t('printAgent.sentTo', { target: o.targetLabel || o.target || '' });
}
