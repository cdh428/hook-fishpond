/**
 * 收银机语音播报（浏览器 Web Speech API · speechSynthesis）
 *
 * 用法：在「任何线上新增订单 → 收银台自动出票」时调用，
 * 先播泰语再播中文（泰语在收银机上是主语言，中文给中籍员工听）。
 *
 * ⚠️ 只在**收银机浏览器**出声（手机/顾客端不调用本函数）。
 * 语音靠浏览器本地 TTS，零联网、零依赖。若设备无 TTS 引擎则静默跳过，
 * 绝不阻塞打印主流程。
 */

export interface SpeakOpts {
  /** 订单号，如 FP-20261018-003 */
  orderNumber: string;
  /** 桌号/茅草屋号，如 A01；外带单传空串 */
  tableCode?: string;
  /** 本次是「新单」还是「追加菜品」（决定播报词） */
  kind?: 'new' | 'added';
}

let thVoice: SpeechSynthesisVoice | null = null;
let zhVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (!voicesLoaded) {
    try {
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
  }
  const list = window.speechSynthesis.getVoices();
  return list.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.toLowerCase())) || null;
}

/** 播报一句（泰语→中文，泰语先）。无 TTS 引擎时静默返回。 */
export function announceOrder(opts: SpeakOpts): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const table = opts.tableCode || '';
  const th =
    opts.kind === 'added'
      ? `เพิ่มรายการใน ${opts.orderNumber}${table ? ` โตะ ${table}` : ''}`
      : `ออเดอร์ใหม ${opts.orderNumber}${table ? ` โตะ ${table}` : ''}`;
  const zh =
    opts.kind === 'added'
      ? `订单 ${opts.orderNumber}${table ? ` 桌 ${table}` : ''} 已加菜`
      : `新订单 ${opts.orderNumber}${table ? ` 桌 ${table}` : ''}`;

  const thV = thVoice || pickVoice('th');
  const zhV = zhVoice || pickVoice('zh');

  try {
    window.speechSynthesis.cancel();
    const s1 = new SpeechSynthesisUtterance(th);
    s1.lang = 'th-TH';
    s1.rate = 0.95;
    s1.pitch = 1;
    if (thV) s1.voice = thV;
    s1.onend = () => {
      const s2 = new SpeechSynthesisUtterance(zh);
      s2.lang = 'zh-CN';
      s2.rate = 1;
      s2.pitch = 1;
      if (zhV) s2.voice = zhV;
      window.speechSynthesis.speak(s2);
    };
    window.speechSynthesis.speak(s1);
  } catch {
    /* TTS 不可用 → 静默，不阻塞打印 */
  }
}

/** 预加载语音列表（部分浏览器 voices 异步就绪）。幂等。 */
export function primeVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || voicesLoaded) return;
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      thVoice = pickVoice('th');
      zhVoice = pickVoice('zh');
    };
    window.speechSynthesis.getVoices();
    voicesLoaded = true;
  } catch {
    /* ignore */
  }
}
