/**
 * 自动出单器（收银台侧）
 * ======================
 * 挂在后台订单页：每当订单列表里出现「新订单」或「追加了菜品的既有单」，
 * 自动在收银台这台机器上：
 *   1. 打印「客户票」（buildBillHtml，带价格 + 桌号续点单 QR）
 *   2. 打印「后厨票」（buildKitchenTicketHtml，不带 QR）
 *   3. 泰+中双语语音播报（收银机喇叭）
 *
 * 设计要点：
 *  - 顾客端（手机）只是下单，**不**负责打印/播报（手机够不到 POS80，也没喇叭）。
 *  - 本 hook 只在收银机浏览器跑；打印走本地打印桥（POS80），桥不在则静默回退浏览器。
 *  - 用「订单 id + 菜品指纹」去重：同一张单、同样菜品只打一次；**追加了新菜**才再打。
 *  - 去重表存 sessionStorage，刷新不重复、跨标签页共享。
 *
 * ⚠️ 自动出单是「增强」不是「依赖」：打印/语音任何一步失败都**不能**阻塞后台订单页，
 * 所有副作用都包在 try/catch 里静默吞掉。
 */
import { useEffect, useRef } from 'react';
import { submitPrint } from '@/lib/print-agent';
import {
  buildBillHtml,
  buildKitchenTicketHtml,
  makeQrDataUrl,
  type PrintLabels,
  type ReceiptOrder,
} from '@/lib/print-receipt';
import { toReceiptOrder } from '@/lib/order-view';import { tableOrderUrl } from '@/lib/api-client';
import { announceOrder } from '@/lib/speech';

/** 把一条订单的菜品算成一个「指纹」：同单加菜/改菜才会变，用来判断要不要再打 */
function itemsFingerprint(order: any): string {
  const lines = (Array.isArray(order.items) ? order.items : [])
    .map((it: any) => {
      const opts = it.options ? JSON.stringify(it.options) : '';
      return `${it.menuItemId}|${it.quantity}|${opts}|${it.note ?? ''}`;
    })
    .join(',');
  return `${lines}#${order.discountType ?? ''}#${order.discountValue ?? ''}`;
}

const SS_KEY = 'hf.autoPrint.seen.v1';

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveSeen(m: Record<string, string>): void {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(m));
  } catch {
    /* 存储不可用就去重失效，宁重复打不丢单 */
  }
}

export interface AutoPrintDeps {
  /** 当前待处理的订单（后台订单页过滤后的列表） */
  orders: any[];
  locale: string;
  labels: PrintLabels;
  /** 桌号 → 续点单 URL 生成器（默认走 tableOrderUrl） */
  buildTableUrl?: (code: string) => string;
  /** 是否启用自动出单（开关，默认开） */
  enabled?: boolean;
  /** 出票后回调（可塞 toast） */
  onEvent?: (msg: string) => void;
}

/**
 * 扫描 orders，找出「需要出票」的：
 *  - 新订单（sessionStorage 没见过这个 id）
 *  - 既有订单但菜品指纹变了（追加了菜）
 * 只对堂食单（有桌号）打客户票（带桌号 QR）；外带单也打但不带桌号 QR。
 */
export function useAutoPrinter({
  orders,
  locale,
  labels,
  buildTableUrl,
  enabled = true,
  onEvent,
}: AutoPrintDeps): void {
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (busyRef.current) return; // 一次只处理一批，避免并发重复打
    busyRef.current = true;

    (async () => {
      try {
        const seen = loadSeen();
        const toPrint: { order: any; kind: 'new' | 'added' }[] = [];

        for (const o of orders) {
          const fp = itemsFingerprint(o);
          const prev = seen[o.id];
          if (prev === undefined) {
            // 全新订单 → 出票
            toPrint.push({ order: o, kind: 'new' });
          } else if (prev !== fp) {
            // 既有订单、菜品变了（追加/改菜）→ 再出一张
            toPrint.push({ order: o, kind: 'added' });
          }
        }
        if (toPrint.length === 0) return;

        const qrUrlFn = buildTableUrl || ((c: string) => tableOrderUrl(c));

        for (const { order, kind } of toPrint) {
          const receipt = toReceiptOrder(order, locale) as ReceiptOrder;
          const tableCode = order.table?.code || '';

          // ① 客户票：带价格 + 桌号续点单 QR（外带单无桌号则不打桌号 QR）
          let billQrTable: string | null = null;
          if (tableCode) {
            try {
              billQrTable = await makeQrDataUrl(qrUrlFn(tableCode));
            } catch {
              billQrTable = null;
            }
          }
          const billHtml = buildBillHtml(receipt, {
            labels,
            qrDataUrl: null, // 预结单不带收款码，只打桌号续点单码
            tableQrDataUrl: billQrTable,
            tableQrLabel: tableCode
              ? labels.scanMoreFood ?? 'Scan to add more items'
              : null,
          });
          const billOutcome = await submitPrint(billHtml, 'bill');

          // ② 后厨票：不带 QR（后厨只需看菜品）
          const kitchenHtml = buildKitchenTicketHtml(
            receipt,
            labels,
            labels.kitchenCopy1 || '【ครัว】',
          );
          await submitPrint(kitchenHtml, 'kitchen');

          // ③ 泰+中双语语音播报（收银机喇叭）
          announceOrder({
            orderNumber: receipt.orderNumber,
            tableCode: tableCode || undefined,
            kind,
          });

          // 记下指纹，避免下次再打
          const next = loadSeen();
          next[order.id] = itemsFingerprint(order);
          saveSeen(next);

          onEvent?.(`已出票 ${receipt.orderNumber}（${kind === 'new' ? '新单' : '加菜'}）`);
        }
      } finally {
        busyRef.current = false;
      }
    })();
  }, [orders, locale, labels, buildTableUrl, enabled, onEvent]);
}
