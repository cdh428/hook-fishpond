/**
 * 自动出单器（收银台侧）
 * ======================
 * 挂在后台订单页：每当收银台看到「新订单」或「既有单被修改（加菜/改菜/改折扣）」，
 * 就在**收银机这台机器**上自动打一次：
 *   1. 客户票（buildBillHtml，带价格 + 桌号续点单 QR）
 *   2. 后厨票（buildKitchenTicketHtml，不带 QR）
 *   3. 泰+中双语语音播报（收银机喇叭）
 *
 * ⚠️ 自动出单是「增强」不是「依赖」：打印/语音/置位任何一步失败都**不能**阻塞后台订单页，
 * 所有副作用都包在 try/catch 里静默吞掉。
 *
 * 去重铁律（用户明确要求「只打一次，之后别的地方不用打印」）：
 *   - **本机去重**：靠 sessionStorage 里的「订单 id → 菜品指纹」。同一张单、同样菜品只打一次；
 *     追加了新菜 / 改了数量 / 改了折扣 → 指纹变了 → 再打一次。
 *   - **刷新不重复**：sessionStorage 跨刷新保留，同一标签页内不会重打。
 *   - **只在本机生效**：打印/播报只发生在收银机浏览器（本 hook），顾客端 / 其他页面不自动出单。
 *
 * 防重打护栏（踩过：页面关闭一夜再打开，把历史上一批未出票的单全翻出来重打）：
 *   - 记录本机页面「开始值守」的时刻；只对「值守之后有变动」的单自动出票。
 *   - 新单（createdAt≈updatedAt≈现在）会触发；加菜/改菜（updatedAt 更新）会触发；
 *   - 历史旧单（createdAt/updatedAt 都早于值守时刻）即使 printState 为空也不重打。
 *
 * 打印/语音是否真的到纸：
 *   - `submitPrint` 走桥成功（via==='bridge'）= 已投递给 POS80 打印机；
 *   - via==='browser' 是回退到浏览器打印对话框——自动出单场景没人会去点，等于没打，算失败。
 *     失败时置服务端 FAILED，订单卡片挂「未打印」，等店员手动补打。
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
import { toReceiptOrder } from '@/lib/order-view';
import { tableOrderUrl, markOrderAutoPrinted } from '@/lib/api-client';
import { announceOrder } from '@/lib/speech';

/** 把一条订单的菜品算成「指纹」：同单加菜/改菜/改折扣才会变，用来判断要不要再打 */
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
  /** 当前订单列表（后台订单页过滤后的列表） */
  orders: any[];
  locale: string;
  labels: PrintLabels;
  /** 桌号 → 续点单 URL 生成器（默认走 tableOrderUrl） */
  buildTableUrl?: (code: string) => string;
  /** 出票后回调（可塞 toast） */
  onEvent?: (msg: string) => void;
}

/**
 * 扫描 orders，找出「需要出票」的：
 *  - 新订单（sessionStorage 没见过这个 id）→ kind='new'
 *  - 既有订单但菜品指纹变了（追加/改菜/改折扣）→ kind='added'
 * 只对堂食单（有桌号）打客户票（带桌号 QR）；外带单也打但不带桌号 QR。
 */
export function useAutoPrinter({
  orders,
  locale,
  labels,
  buildTableUrl,
  onEvent,
}: AutoPrintDeps): void {
  const busyRef = useRef(false);
  // 本机页面「开始值守」的时刻。只有这之后**有变动**的单才自动出票 ——
  // 否则页面关闭一夜再打开，会把历史上一批未出票的单全翻出来重打。
  // 踩过：14 张未结单全是未出票，一开页面就是 28 张纸。
  const watchFromRef = useRef<number | null>(null);
  /** 刷新页面时留 2 分钟缓冲：刚下单就刷新也不会漏打。 */
  const GRACE_MS = 2 * 60 * 1000;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (busyRef.current) return; // 一次只处理一批，避免并发重复打

    if (watchFromRef.current === null) {
      watchFromRef.current = Date.now() - GRACE_MS;
    }
    const from = watchFromRef.current;

    // 订单「最近变动时刻」：创建或更新取较晚者。加菜/改菜/改折扣都会刷新 updatedAt。
    const lastActivity = (o: any): number =>
      Math.max(
        new Date(o.createdAt || 0).getTime(),
        new Date(o.updatedAt || 0).getTime(),
      );

    busyRef.current = true;

    (async () => {
      try {
        const seen = loadSeen();
        const toPrint: { order: any; kind: 'new' | 'added' }[] = [];

        for (const o of orders) {
          if (!o || o.status === 'CANCELLED' || o.status === 'SETTLED') continue;
          const act = lastActivity(o);
          if (!Number.isFinite(act)) continue;
          // 防重打护栏：只对「值守之后有变动」的单出票，历史旧单不动。
          if (act < from) continue;

          const fp = itemsFingerprint(o);
          const prev = seen[o.id];
          if (prev === undefined) {
            // 全新订单 → 出票
            toPrint.push({ order: o, kind: 'new' });
          } else if (prev !== fp) {
            // 既有订单、菜品变了（追加/改菜/改折扣）→ 再出一张
            toPrint.push({ order: o, kind: 'added' });
          }
        }
        if (toPrint.length === 0) return;

        const qrUrlFn = buildTableUrl || ((c: string) => tableOrderUrl(c));

        for (const { order, kind } of toPrint) {
          try {
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
            const billOut = await submitPrint(billHtml, 'bill', { noFallback: true });
            const billOk = sentOk(billOut);

            // ② 后厨票：不带 QR（后厨只需看菜品）；客户票失败就不再打后厨票
            let kitchenOk = false;
            if (billOk) {
              const kitchenHtml = buildKitchenTicketHtml(
                receipt,
                labels,
                labels.kitchenCopy1 || '【ครัว】',
              );
              const kOut = await submitPrint(kitchenHtml, 'kitchen', { noFallback: true });
              kitchenOk = sentOk(kOut);
            }

            // ③ 语音播报：只在新单/加菜**成功出纸**后播，避免「响了但没票」让店员空手找单
            if (billOk && kitchenOk) {
              announceOrder({
                orderNumber: receipt.orderNumber,
                tableCode: tableCode || undefined,
                kind,
              });
            }

            // 记下指纹，避免下次再打（本机去重凭证）
            const next = loadSeen();
            next[order.id] = itemsFingerprint(order);
            saveSeen(next);

            // ④ 回写服务端状态：PRINTED=已出纸（「已打印」角标 / 报表可读）；
            //    FAILED=桥不可用或回退浏览器（无人点击等于没打），挂「未打印」等人工补打。
            try {
              await markOrderAutoPrinted(order.id, {
                state: billOk && kitchenOk ? 'PRINTED' : 'FAILED',
                error:
                  billOk && kitchenOk
                    ? undefined
                    : failText(billOk ? null : billOut) || '打印桥不可用',
              });
            } catch {
              /* 回写失败：本机指纹已挡住重复，服务端下次仍视为未处理，可接受 */
            }

            onEvent?.(
              billOk && kitchenOk
                ? t_autoPrinted(receipt.orderNumber, kind)
                : t_printFailed(receipt.orderNumber),
            );
          } catch {
            /* 打印/播报任一失败静默吞掉，绝不阻塞后台订单页 */
          }
        }
      } finally {
        busyRef.current = false;
      }
    })();
  }, [orders, locale, labels, buildTableUrl, onEvent]);
}

/** 出票成功的提示语 */
function t_autoPrinted(orderNumber: string, kind: 'new' | 'added'): string {
  return kind === 'added'
    ? `已出票 ${orderNumber}（加菜）`
    : `已出票 ${orderNumber}（新单）`;
}

/** 出票失败的提示语 —— 必须显眼，店员得知道去手动补打 */
function t_printFailed(orderNumber: string): string {
  return `⚠️ ${orderNumber} 未打印成功，请手动补打`;
}

/**
 * 「真的打到纸上了」的判定。
 * submitPrint 的语义是：走桥成功 = 已投递给打印机（via==='bridge'）；
 * via==='browser' 代表**回退到浏览器弹打印对话框**——那是「等人点确认」，
 * 自动出单场景下没人会去点，等于没打。所以浏览器回退一律算失败。
 * （例外：用户主动把打印模式设成 browser，那是另一套手动流程，不走本自动器。）
 */
function sentOk(o: { via: 'bridge' | 'browser' } | null | undefined): boolean {
  return o?.via === 'bridge';
}

/** 把失败原因翻成一句店员看得懂的话 */
function failText(o: { via: 'bridge' | 'browser'; fallbackReason?: string; error?: string } | null | undefined): string {
  if (!o) return '打印桥无响应';
  if (o.fallbackReason === 'bridge-offline') return '打印桥未启动（127.0.0.1:17777）';
  if (o.fallbackReason === 'no-target') return '找不到 POS80 打印机';
  if (o.fallbackReason === 'bt-offline') return '蓝牙打印机离线';
  if (o.fallbackReason === 'bridge-error') return `打印桥报错：${o.error || ''}`.slice(0, 120);
  return o.error || '打印失败';
}
