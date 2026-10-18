/**
 * 80mm 热敏小票打印库 —— 零安装（架构 A：浏览器打印）。
 *
 * 原理：把票据渲染到一张隐藏 iframe 里，只打印该 iframe。
 *  - 不会把整个页面带进打印任务（不受站点布局干扰）；
 *  - 不弹新窗口，不会被浏览器拦截；
 *  - 收银机用 `chrome.exe --kiosk-printing` 启动时，点一下即静默出纸。
 *
 * 三张票：
 *  - KITCHEN_TICKET 后厨出票（不带价格，菜品放大，方便备餐）
 *  - BILL           预结算单（带价格 + 渔获 + 折扣 + 收款二维码）
 *  - RECEIPT        收款收据（已收款，作为结清凭证）
 *
 * 文案全部由调用方传入（来自 next-intl），本库不带任何硬编码文案，
 * 以避免三语内容漂移。
 */

export interface PrintLabels {
  brand: string;
  brandSub?: string;
  kitchenTicket: string;
  bill: string;
  receipt: string;
  orderNo: string;
  table: string;
  takeaway: string;
  dineIn: string;
  customer: string;
  time: string;
  item: string;
  qty: string;
  amount: string;
  subtotal: string;
  fishCharge: string;
  fishWeight: string;
  discount: string;
  total: string;
  note: string;
  status: string;
  settlementMode: string;
  prepaid: string;
  postpaid: string;
  scanToPay: string;
  paidAt: string;
  /** 外带取餐时间行的标签 */
  pickupAt?: string;
  thanks: string;
  poweredBy?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note?: string | null;
  /** 该行的规格 / 面型 / 加料（已本地化，如「份量: 加大 (+฿10)」） */
  optionLines?: string[];
}

export interface ReceiptOrder {
  orderNumber: string;
  createdAt: string | Date;
  tableName?: string | null;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  customerName?: string | null;
  settlementMode: 'PREPAID' | 'POSTPAID';
  status: string;
  items: ReceiptItem[];
  subtotal: number;
  fishWeightKg: number;
  fishCharge: number;
  discountAmount: number;
  discountNote?: string | null;
  totalPrice: number;
  note?: string | null;
  /** 外带取餐时间（后端厨据此排单） */
  pickupAt?: string | Date | null;
}

/** HTML 转义，避免菜名里的 < > & 破坏小票结构 */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const money = (n: number) => `฿${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US')}`;

function fmtTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    width: 80mm;
    background: #fff; color: #000;
    font-family: 'Leelawadee UI', 'Noto Sans Thai', 'Noto Sans SC', 'Sarabun', -apple-system, 'Segoe UI', sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* 黄金安全宽度锁定 70mm (点阵 400px)，饱满且绝不超出 420 纸边，底部留足 1 行空白切纸 */
  .ticket { width: 70mm; margin: 0 auto; padding: 2mm 1mm 6mm; }
  .center { text-align: center; }
  .brand { font-size: 18px; font-weight: 700; letter-spacing: .5px; }
  .brand-sub { font-size: 12px; margin-top: 1px; }
  .doc-type {
    margin: 6px 0 4px; padding: 3px 0;
    border-top: 2px dashed #000; border-bottom: 2px dashed #000;
    font-size: 16px; font-weight: 800; letter-spacing: 1px;
  }
  .dashed { border-top: 1.5px dashed #000; margin: 5px 0; }
  .solid { border-top: 2px solid #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; font-size: 13px; line-height: 1.6; }
  .row .k { color: #000; }
  .row .v { text-align: right; font-weight: 600; }
  .order-no { font-size: 28px; font-weight: 900; letter-spacing: 1px; line-height: 1.15; }
  .meta { font-size: 13px; line-height: 1.6; }
  .items { margin-top: 4px; }
  .item { display: flex; justify-content: space-between; gap: 6px; line-height: 1.4; margin-top: 4px; }
  .item .n { flex: 1 1 auto; word-break: break-word; }
  .item-th { font-size: 16px; font-weight: 800; color: #000; line-height: 1.35; }
  .item-zh { font-size: 12px; color: #444; line-height: 1.3; margin-top: 1px; padding-left: 2px; }
  .item .q { flex: 0 0 auto; font-weight: 800; padding-right: 1mm; font-size: 15px; }
  .item-note { font-size: 12px; padding-left: 6px; line-height: 1.5; color: #333; }
  /* 后厨单泰文大字与规格放大 */
  .big .item { margin-top: 6px; }
  .big .item-th { font-size: 20px; font-weight: 900; line-height: 1.4; }
  .big .item-zh { font-size: 14px; font-weight: 500; color: #333; margin-top: 2px; }
  .big .item .q { font-size: 22px; font-weight: 900; }
  .big .item-note { font-size: 15px; font-weight: 700; line-height: 1.6; padding-left: 8px; }
  .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; }
  .grand { font-size: 23px; font-weight: 900; }
  .qr { text-align: center; margin: 6px 0 2px; }
  .qr img { width: 48mm; height: 48mm; image-rendering: pixelated; }
  .qr-cap { font-size: 12px; font-weight: 700; margin-top: 2px; }
  .qr-amt { font-size: 18px; font-weight: 800; }
  .foot { text-align: center; font-size: 12px; margin-top: 8px; line-height: 1.6; }
  .warn { font-size: 11px; }
  .stamp {
    margin: 6px auto 2px; text-align: center; width: 90px;
    font-size: 18px; font-weight: 900; letter-spacing: 2px;
    border: 2px solid #000; padding: 2px 0;
  }
`;

function shell(title: string, inner: string, labels: PrintLabels): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS}</style></head><body><div class="ticket">${inner}</div></body></html>`;
}

function header(docType: string, labels: PrintLabels): string {
  return `
    <div class="center">
      <div class="brand">${esc(labels.brand)}</div>
      ${labels.brandSub ? `<div class="brand-sub">${esc(labels.brandSub)}</div>` : ''}
      <div class="doc-type">${esc(docType)}</div>
    </div>`;
}

function orderMeta(order: ReceiptOrder, labels: PrintLabels): string {
  const seat =
    order.orderType === 'TAKEAWAY'
      ? labels.takeaway
      : order.tableName || labels.dineIn;
  return `
    <div class="center"><div class="order-no">${esc(order.orderNumber)}</div></div>
    <div class="dashed"></div>
    <div class="meta">
      <div class="row"><span class="k">${esc(labels.table)}</span><span class="v">${esc(seat)}</span></div>
      <div class="row"><span class="k">${esc(labels.time)}</span><span class="v">${esc(fmtTime(order.createdAt))}</span></div>
      ${
        order.pickupAt
          ? `<div class="row"><span class="k">${esc(labels.pickupAt || labels.time)}</span><span class="v">${esc(fmtTime(order.pickupAt))}</span></div>`
          : ''
      }
      ${
        order.customerName
          ? `<div class="row"><span class="k">${esc(labels.customer)}</span><span class="v">${esc(order.customerName)}</span></div>`
          : ''
      }
      <div class="row"><span class="k">${esc(labels.settlementMode)}</span><span class="v">${esc(
        order.settlementMode === 'PREPAID' ? labels.prepaid : labels.postpaid,
      )}</span></div>
    </div>`;
}

/** 智能拆分泰中双语名称，支持 "泰文 (中文)"、"泰文 / 中文" */
function splitBilingual(raw: string): { th: string; zh: string } {
  const str = (raw || '').trim();
  const m1 = str.match(/^(.+?)\s*[\(（](.+?)[\)）]$/);
  if (m1) return { th: m1[1].trim(), zh: m1[2].trim() };
  const m2 = str.match(/^(.+?)\s*[\/／]\s*(.+)$/);
  if (m2) return { th: m2[1].trim(), zh: m2[2].trim() };
  return { th: str, zh: '' };
}

/**
 * 菜品行：泰中双语分行打印 ——
 * 第一行（主位）：泰文大字加粗，右侧挂数量与金额；
 * 第二行（辅助）：中文菜名小字跟随；
 * 第三行：规格 / 备注选项。
 */
function itemsBlock(order: ReceiptOrder, labels: PrintLabels, withPrices: boolean): string {
  return `
    <div class="dashed"></div>
    <div class="items">
      ${order.items
        .map((it) => {
          const opts = Array.isArray(it.optionLines) ? it.optionLines : [];
          const { th, zh } = splitBilingual(it.name);
          return `
        <div class="item">
          <span class="n item-th">${esc(th)}</span>
          <span class="q">× ${esc(it.quantity)}</span>
          ${withPrices ? `<span class="q" style="min-width:16mm;text-align:right">${esc(money(it.totalPrice))}</span>` : ''}
        </div>
        ${zh ? `<div class="item-zh">${esc(zh)}</div>` : ''}
        ${opts.map((o) => `<div class="item-note">› ${esc(o)}</div>`).join('')}
        ${it.note ? `<div class="item-note">※ ${esc(it.note)}</div>` : ''}`;
        })
        .join('')}
    </div>`;
}

/** 后厨出票：不带价格，菜品放大，方便备餐核对 */
export function buildKitchenTicketHtml(order: ReceiptOrder, labels: PrintLabels): string {
  const inner = `
    ${header(labels.kitchenTicket, labels)}
    ${orderMeta(order, labels)}
    <div class="big">${itemsBlock({ ...order, items: order.items }, labels, false)}</div>
    ${
      order.note
        ? `<div class="dashed"></div><div class="meta"><b>${esc(labels.note)}:</b> ${esc(order.note)}</div>`
        : ''
    }
    <div class="solid"></div>
    <div class="foot">${esc(labels.kitchenTicket)} · ${esc(order.orderNumber)}</div>`;
  return shell(order.orderNumber, inner, labels);
}

/** 预结算单（顾客看着付钱）：菜品 + 渔获 + 折扣 + 应付 + 收款二维码 */
export function buildBillHtml(
  order: ReceiptOrder,
  opts: { qrDataUrl?: string | null; amountText?: string | null; labels: PrintLabels },
): string {
  const { labels, qrDataUrl } = opts;
  const inner = `
    ${header(labels.bill, labels)}
    ${orderMeta(order, labels)}
    ${itemsBlock(order, labels, true)}
    <div class="solid"></div>
    <div class="row"><span class="k">${esc(labels.subtotal)}</span><span class="v">${esc(money(order.subtotal))}</span></div>
    ${
      order.fishCharge > 0 || order.fishWeightKg > 0
        ? `<div class="row"><span class="k">${esc(labels.fishCharge)}${
            order.fishWeightKg > 0 ? ` (${esc(order.fishWeightKg)} kg)` : ''
          }</span><span class="v">${esc(money(order.fishCharge))}</span></div>`
        : ''
    }
    ${
      order.discountAmount > 0
        ? `<div class="row"><span class="k">${esc(labels.discount)}${
            order.discountNote ? ` (${esc(order.discountNote)})` : ''
          }</span><span class="v">−${esc(money(order.discountAmount))}</span></div>`
        : ''
    }
    <div class="solid"></div>
    <div class="total-row"><span>${esc(labels.total)}</span><span class="grand">${esc(money(order.totalPrice))}</span></div>
    ${
      qrDataUrl
        ? `<div class="dashed"></div>
           <div class="qr">
             <img src="${qrDataUrl}" alt="PromptPay" />
             <div class="qr-cap">${esc(labels.scanToPay)}</div>
             <div class="qr-amt">${esc(opts.amountText || money(order.totalPrice))}</div>
           </div>`
        : ''
    }
    <div class="dashed"></div>
    <div class="foot">${esc(labels.thanks)}<br/>${esc(order.orderNumber)}</div>`;
  return shell(order.orderNumber, inner, labels);
}

/** 收款收据（结清凭证） */
export function buildReceiptHtml(
  order: ReceiptOrder,
  opts: { labels: PrintLabels; paidAtText?: string | null },
): string {
  const { labels } = opts;
  const inner = `
    ${header(labels.receipt, labels)}
    <div class="stamp">PAID</div>
    ${orderMeta(order, labels)}
    ${itemsBlock(order, labels, true)}
    <div class="solid"></div>
    <div class="row"><span class="k">${esc(labels.subtotal)}</span><span class="v">${esc(money(order.subtotal))}</span></div>
    ${
      order.fishCharge > 0 || order.fishWeightKg > 0
        ? `<div class="row"><span class="k">${esc(labels.fishCharge)}${
            order.fishWeightKg > 0 ? ` (${esc(order.fishWeightKg)} kg)` : ''
          }</span><span class="v">${esc(money(order.fishCharge))}</span></div>`
        : ''
    }
    ${
      order.discountAmount > 0
        ? `<div class="row"><span class="k">${esc(labels.discount)}</span><span class="v">−${esc(money(order.discountAmount))}</span></div>`
        : ''
    }
    <div class="solid"></div>
    <div class="total-row"><span>${esc(labels.total)}</span><span class="grand">${esc(money(order.totalPrice))}</span></div>
    <div class="dashed"></div>
    <div class="row"><span class="k">${esc(labels.paidAt)}</span><span class="v">${esc(
      opts.paidAtText || fmtTime(new Date()),
    )}</span></div>
    <div class="dashed"></div>
    <div class="foot">${esc(labels.thanks)}<br/>${esc(order.orderNumber)}</div>`;
  return shell(order.orderNumber, inner, labels);
}

/**
 * 打印一段完整 HTML（隐藏 iframe 方案）。
 * 返回 Promise 在打印调用发起后 resolve —— 打印任务由浏览器接管，无法得到"是否真出纸"。
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve();

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve();
      }, 1200);
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      cleanup();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const win = iframe.contentWindow!;
    const fire = () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* 打印被拒绝也不阻塞业务 */
      }
      cleanup();
    };

    // 等图片（二维码）解码完成再打印，避免小票上二维码空白
    const imgs = Array.from(doc.images || []);
    if (imgs.length === 0) {
      window.setTimeout(fire, 60);
    } else {
      let pending = imgs.length;
      const done = () => {
        pending -= 1;
        if (pending <= 0) window.setTimeout(fire, 60);
      };
      imgs.forEach((img) => {
        if (img.complete) done();
        else {
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        }
      });
      // 兜底：最多等 1.5s
      window.setTimeout(fire, 1500);
    }
  });
}

/** 生成 PromptPay 二维码的 data URL（浏览器端） */
export async function makeQrDataUrl(payload: string): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(payload, {
    width: 420,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}
