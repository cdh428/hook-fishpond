/**
 * 收银机语音播报（浏览器 Web Speech API · speechSynthesis）
 *
 * 用法：在「任何线上新增订单 → 收银台自动出票」时调用，
 * 先播泰语，再播该单语言（默认中文）。
 *
 * 为什么泰语固定第一句：播报对象是**店里的员工**，泰国店里泰籍员工是主体；
 * 第二句给中籍/外籍员工听 —— 语言跟 `Order.locale` 走（见 docs/playbooks/language-consistency.md）。
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
  /**
   * 该单的下单语言（`Order.locale`）。
   *
   * 泰语始终是第一句（员工主体是泰籍），第二句才跟语言走：
   * `en` → 英语，其余（含不传）→ 中文。
   * 不传时行为与历史完全一致（泰语 + 中文），老流程不会出现回归。
   */
  locale?: 'zh' | 'en' | 'th' | null;
}

let thVoice: SpeechSynthesisVoice | null = null;
let zhVoice: SpeechSynthesisVoice | null = null;
let enVoice: SpeechSynthesisVoice | null = null;
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

/** 播报一句（泰语 → 该单语言）。无 TTS 引擎时静默返回。 */
export function announceOrder(opts: SpeakOpts): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  // 首次调用时把语音列表预热一次：Chrome 的 voices 是异步就绪的，
  // 不预热的话第一次播报常常 pickVoice 返回 null，退化成系统默认音色（读泰文会全错）。
  primeVoices();

  const table = opts.tableCode || '';
  const th =
    opts.kind === 'added'
      ? `เพิ่มรายการใน ${opts.orderNumber}${table ? ` โต๊ะ ${table}` : ''}`
      : `ออเดอร์ใหม่ ${opts.orderNumber}${table ? ` โต๊ะ ${table}` : ''}`;
  const zh =
    opts.kind === 'added'
      ? `订单 ${opts.orderNumber}${table ? ` 桌 ${table}` : ''} 已加菜`
      : `新订单 ${opts.orderNumber}${table ? ` 桌 ${table}` : ''}`;
  const en =
    opts.kind === 'added'
      ? `Order ${opts.orderNumber}${table ? ` table ${table}` : ''} updated`
      : `New order ${opts.orderNumber}${table ? ` table ${table}` : ''}`;

  const thV = thVoice || pickVoice('th');

  // 第二句的语言：只有明确是英文单才用英语，其余（含历史调用不传）保持中文
  const secondIsEn = opts.locale === 'en';
  const secondText = secondIsEn ? en : zh;
  const secondLang = secondIsEn ? 'en-US' : 'zh-CN';
  const secondV = secondIsEn
    ? enVoice || pickVoice('en')
    : zhVoice || pickVoice('zh');

  const speakSecond = () => {
    const s2 = new SpeechSynthesisUtterance(secondText);
    s2.lang = secondLang;
    s2.rate = 1;
    s2.pitch = 1;
    if (secondV) s2.voice = secondV;
    window.speechSynthesis.speak(s2);
  };

  try {
    window.speechSynthesis.cancel();

    // ⚠️ 设备没装泰语音色时，用中文/默认音色硬读泰文只会念出一串乱码音，
    // 员工听不懂反而更扰人 → 直接只播第二句。
    if (!thV) {
      speakSecond();
      return;
    }

    const s1 = new SpeechSynthesisUtterance(th);
    s1.lang = 'th-TH';
    s1.rate = 0.95;
    s1.pitch = 1;
    s1.voice = thV;
    // 泰语播完接第二句。onend 在部分浏览器不触发，加兜底定时器。
    let secondDone = false;
    const safeSecond = () => {
      if (secondDone) return;
      secondDone = true;
      speakSecond();
    };
    s1.onend = safeSecond;
    s1.onerror = safeSecond;
    window.speechSynthesis.speak(s1);
    window.setTimeout(safeSecond, 6000);
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
      enVoice = pickVoice('en');
    };
    window.speechSynthesis.getVoices();
    voicesLoaded = true;
  } catch {
    /* ignore */
  }
}
