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
  thanks: string;
  poweredBy?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note?: string | null;
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
    font-family: 'Noto Sans Thai','Noto Sans SC','Sarabun',-apple-system,'Segoe UI',sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .ticket { width: 80mm; padding: 3mm 4mm 6mm; }
  .center { text-align: center; }
  .brand { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
  .brand-sub { font-size: 10px; margin-top: 1px; }
  .doc-type {
    margin: 6px 0 4px; padding: 3px 0;
    border-top: 1.5px dashed #000; border-bottom: 1.5px dashed #000;
    font-size: 13px; font-weight: 700; letter-spacing: 1px;
  }
  .dashed { border-top: 1px dashed #000; margin: 5px 0; }
  .solid { border-top: 1px solid #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; line-height: 1.5; }
  .row .k { color: #000; }
  .row .v { text-align: right; font-weight: 600; }
  .order-no { font-size: 22px; font-weight: 800; letter-spacing: 1px; line-height: 1.15; }
  .meta { font-size: 11px; line-height: 1.55; }
  .items { margin-top: 4px; }
  .item { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; line-height: 1.5; }
  .item .n { flex: 1 1 auto; word-break: break-word; }
  .item .q { flex: 0 0 auto; font-weight: 700; }
  .item-note { font-size: 10px; padding-left: 6px; }
  .big .item { font-size: 15px; line-height: 1.7; }
  .big .item .n { font-weight: 700; }
  .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; }
  .grand { font-size: 19px; font-weight: 800; }
  .qr { text-align: center; margin: 6px 0 2px; }
  .qr img { width: 46mm; height: 46mm; image-rendering: pixelated; }
  .qr-cap { font-size: 11px; font-weight: 700; margin-top: 2px; }
  .qr-amt { font-size: 16px; font-weight: 800; }
  .foot { text-align: center; font-size: 10px; margin-top: 8px; line-height: 1.6; }
  .warn { font-size: 10px; }
  .stamp {
    margin: 6px 0 2px; text-align: center;
    font-size: 15px; font-weight: 800; letter-spacing: 2px;
    border: 2px solid #000; padding: 3px 0;
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
        order.customerName
          ? `<div class="row"><span class="k">${esc(labels.customer)}</span><span class="v">${esc(order.customerName)}</span></div>`
          : ''
      }
      <div class="row"><span class="k">${esc(labels.settlementMode)}</span><span class="v">${esc(
        order.settlementMode === 'PREPAID' ? labels.prepaid : labels.postpaid,
      )}</span></div>
    </div>`;
}

function itemsBlock(order: ReceiptOrder, labels: PrintLabels, withPrices: boolean): string {
  return `
    <div class="dashed"></div>
    <div class="items">
      ${order.items
        .map(
          (it) => `
        <div class="item">
          <span class="n">${esc(it.name)}</span>
          <span class="q">× ${esc(it.quantity)}</span>
          ${withPrices ? `<span class="q" style="min-width:16mm;text-align:right">${esc(money(it.totalPrice))}</span>` : ''}
        </div>
        ${it.note ? `<div class="item-note">※ ${esc(it.note)}</div>` : ''}`,
        )
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
