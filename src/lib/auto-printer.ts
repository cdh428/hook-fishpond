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
  // 本会话已处理过的订单 id。服务端置位可能失败（网络断一下），
  // 单靠 autoPrintFired 会在下一轮轮询里重打一次 —— 这个集合兜住同一台机器内的重复。
  const doneRef = useRef<Set<string>>(new Set());
  // 本机页面「开始值守」的时刻。只有这之后进来的单才自动打 ——
  // 否则页面关闭一夜再打开，会把历史上一批 autoPrintFired=false 的单全翻出来重打。
  // 踩过：14 张未结单全是 false，一开页面就是 28 张纸。
  const watchFromRef = useRef<number | null>(null);
  /** 刷新页面时留 2 分钟缓冲：刚下单就刷新也不会漏打（已有 autoPrintFired 兜底防重复）。 */
  const GRACE_MS = 2 * 60 * 1000;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (busyRef.current) return; // 一次只处理一批，避免并发重复打

    if (watchFromRef.current === null) {
      watchFromRef.current = Date.now() - GRACE_MS;
    }
    const from = watchFromRef.current;

    // 四重凭证：服务端标记 + 状态 + 值守时刻 + 本机已处理集合。
    // 已结清（SETTLED）走结清流程、已取消（CANCELLED）作废，都不该再自动出票。
    const toPrint = orders.filter((o: any) => {
      if (!o || o.autoPrintFired) return false;
      if (doneRef.current.has(o.id)) return false;
      if (o.status === 'CANCELLED' || o.status === 'SETTLED') return false;
      const born = new Date(o.createdAt || 0).getTime();
      if (!Number.isFinite(born)) return false;
      return born >= from;
    });
    if (toPrint.length === 0) return;

    busyRef.current = true;

    (async () => {
      const qrUrlFn = buildTableUrl || ((c: string) => tableOrderUrl(c));
      for (const order of toPrint) {
        // 先占位再打：打印途中若又来一轮轮询，这张单不会被重复挑中
        doneRef.current.add(order.id);
        const receipt = toReceiptOrder(order, locale) as ReceiptOrder;
        const tableCode = order.table?.code || '';

        // 两联必须**都成功**才算出票成功。只打出一联就标已打印的话，
        // 后厨拿不到单、厨房漏菜，比完全没打更难查。
        let billOk = false;
        let kitchenOk = false;
        let failReason = '';

        try {
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
          const billOut = await submitPrint(billHtml, 'bill');
          billOk = sentOk(billOut);
          if (!billOk) failReason = failText(billOut);
        } catch (e: any) {
          failReason = e?.message || '客户票打印异常';
        }

        if (billOk) {
          try {
            // ② 后厨票：不带 QR（后厨只需看菜品）
            const kitchenHtml = buildKitchenTicketHtml(
              receipt,
              labels,
              labels.kitchenCopy1 || '【ครัว】',
            );
            const kOut = await submitPrint(kitchenHtml, 'kitchen');
            kitchenOk = sentOk(kOut);
            if (!kitchenOk) failReason = failText(kOut);
          } catch (e: any) {
            failReason = e?.message || '后厨票打印异常';
          }
        }

        // ③ 语音播报：只在新单**成功出纸**后播，避免「响了但没票」让店员空手找单
        if (billOk && kitchenOk) {
          announceOrder({
            orderNumber: receipt.orderNumber,
            tableCode: tableCode || undefined,
            kind: 'new',
          });
        }

        // ④ 回写服务端状态
        //    PRINTED → 以后刷新/换机器/加菜都不再自动出纸，只显示「已打印」
        //    FAILED  → 不再自动重试（避免每 12 秒把旧单重打一遍），改挂「未打印」等人工补打
        try {
          await markOrderAutoPrinted(order.id, {
            state: billOk && kitchenOk ? 'PRINTED' : 'FAILED',
            error: billOk && kitchenOk ? undefined : failReason || '打印桥不可用',
          });
        } catch {
          /* 回写失败：本机 doneRef 已挡住重复，服务端下次仍会视为未处理，可接受 */
        }

        onEvent?.(
          billOk && kitchenOk
            ? t_autoPrinted(receipt.orderNumber)
            : t_printFailed(receipt.orderNumber),
        );
      }
    })().finally(() => {
      busyRef.current = false;
    });
  }, [orders, locale, labels, buildTableUrl, enabled, onEvent]);
}

/** 出票成功的提示语（保持与旧行为一致，避免引出新的翻译 key） */
function t_autoPrinted(orderNumber: string): string {
  return `已出票 ${orderNumber}`;
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
