/**
 * 自动出单器（收银台侧）
 * ======================
 * 挂在后台订单页：每当「新订单」出现在列表里（服务端标记 `autoPrintFired === false`），
 * 收银台这台机器**立刻自动打一次**：
 *   1. 客户票（buildBillHtml，带价格 + 桌号续点单 QR）
 *   2. 后厨票（buildKitchenTicketHtml，不带 QR）
 *   3. 泰+中双语语音播报（收银机喇叭）
 * 打完立刻调 `markOrderAutoPrinted` 把服务端标记置 true。
 *
 * 去重铁律（用户明确要求「只打一次，之后只靠手动」）：
 *   - **服务端持久化**：靠 `Order.autoPrintFired` 字段，不是浏览器 sessionStorage。
 *     标签页关了 / 换台收银机 / 刷新，同一张新单都**不会**再自动出纸。
 *   - **新订单打一次**：`autoPrintFired === false` → 自动打 + 置位。
 *   - **之后不再自动打**：加菜、改菜、改折扣……`autoPrintFired` 已是 true，
 *     一律不触发，要再打只能手动按「打印」键。
 *
 * ⚠️ 自动出单是「增强」不是「依赖」：打印/语音/置位任何一步失败都**不能**阻塞后台订单页，
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
import { toReceiptOrder } from '@/lib/order-view';
import { tableOrderUrl, markOrderAutoPrinted } from '@/lib/api-client';
import { announceOrder } from '@/lib/speech';

export interface AutoPrintDeps {
  /** 当前订单列表（后台订单页过滤后的列表） */
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
 * 扫描 orders，只对「服务端还没自动出过单」的新订单（`autoPrintFired === false`）
 * 打一次并立刻置位；已置位的单（含加菜后）一律不动。
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

    // 只挑「未自动出过单 + 未结清 + 未取消」的单 —— 服务端标记 + 状态是去重凭证。
    // 已结清（SETTLED）走结清流程、已取消（CANCELLED）作废，都不该再自动出票。
    const toPrint = orders.filter(
      (o: any) =>
        o &&
        !o.autoPrintFired &&
        o.status !== 'CANCELLED' &&
        o.status !== 'SETTLED',
    );
    if (toPrint.length === 0) return;

    busyRef.current = true;

    (async () => {
      const qrUrlFn = buildTableUrl || ((c: string) => tableOrderUrl(c));
      for (const order of toPrint) {
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
          await submitPrint(billHtml, 'bill');

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
            kind: 'new',
          });

          // ④ 立刻置服务端标记：同一张单从此不再自动打（加菜后也靠手动）
          try {
            await markOrderAutoPrinted(order.id);
          } catch {
            /* 置位失败也不阻断：下轮轮询会再看到 false 再试一次（最终一致） */
          }

          onEvent?.(`已出票 ${receipt.orderNumber}`);
        } catch {
          /* 打印/播报任一失败静默吞掉，绝不阻塞后台订单页 */
        }
      }
    })().finally(() => {
      busyRef.current = false;
    });
  }, [orders, locale, labels, buildTableUrl, enabled, onEvent]);
}
