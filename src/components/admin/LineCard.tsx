'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchLineTargets, type LineConfigStatus, type LineTargetRow } from '@/lib/api-client';
import { LINE_OA } from '@/lib/site';

/**
 * 后台首页的「LINE OA」信息卡。
 *
 * 数据来源是**已有的** `/api/admin/line`（原为「日报推送」页写的），
 * 不新增接口、不新增表 —— 这里只把「账号是谁 / 能不能推 / 推给谁」摊在
 * 登录后第一屏，免得每次都要点进「报表 → 日报推送」才知道 token 有没有掉。
 *
 * 三块信息：
 *   1. 账号身份（Basic ID + 加好友链接）—— 店里核对外发资料时要用；
 *   2. 推送凭据状态（token / secret / cron）—— 掉了立刻看出来；
 *   3. 接收人数量 —— 为 0 说明没人绑定，日报发不出去。
 *
 * 接口失败（未登录 / 未配置）时整卡静默隐藏，不在首页刷红报错。
 */
export default function LineCard() {
  const t = useTranslations('admin.lineCard');
  const [config, setConfig] = useState<LineConfigStatus | null>(null);
  const [targets, setTargets] = useState<LineTargetRow[]>([]);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchLineTargets();
        if (cancelled) return;
        setConfig(res.configured);
        setTargets(res.targets ?? []);
      } catch {
        /* 未配置 / 未授权：不渲染状态行 */
      } finally {
        if (!cancelled) setSeen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!seen) return null;

  const activeTargets = targets.filter((x) => x.isActive);
  const credsOn = config
    ? [config.hasToken, config.hasSecret, config.cronSecret].filter(Boolean).length
    : 0;

  return (
    <div className="mb-6 rounded-xl bg-white p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-neutral-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#06C755]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                fill="#fff"
                d="M12 3.2c-5.2 0-9.4 3.4-9.4 7.6 0 3.8 3.3 6.9 7.8 7.5.3.06.7.2.8.45.08.23.05.58.03.81l-.13.8c-.04.23-.19.9.79.49 1-.42 5.4-3.19 7.37-5.46 1.36-1.5 2.14-3.03 2.14-4.59 0-4.2-4.2-7.6-9.4-7.6Z"
              />
            </svg>
          </span>
          {t('title')}
        </h3>
        <a
          href={LINE_OA.addFriendUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg bg-[#06C755]/10 px-3 py-1.5 text-xs font-medium text-[#06C755] hover:bg-[#06C755]/20"
        >
          {t('addFriend')}
        </a>
      </div>

      {/* 账号身份 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
        <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700">
          {LINE_OA.id}
        </code>
        <span>·</span>
        <a
          href={LINE_OA.managerUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary-700 underline-offset-2 hover:underline"
        >
          {t('openManager')}
        </a>
      </div>

      {/* 推送状态 */}
      {config && (
        <div className="grid grid-cols-2 gap-2">
          <div
            className={`rounded-lg px-3 py-2 ${
              credsOn === 3 ? 'bg-success-50' : 'bg-warning-100'
            }`}
          >
            <p className="text-[11px] text-neutral-500">{t('credentials')}</p>
            <p
              className={`mt-0.5 text-sm font-bold ${
                credsOn === 3 ? 'text-success-600' : 'text-warning-600'
              }`}
            >
              {credsOn === 3 ? t('ready') : `${credsOn}/3`}
            </p>
          </div>
          <div
            className={`rounded-lg px-3 py-2 ${
              activeTargets.length > 0 ? 'bg-primary-50' : 'bg-neutral-100'
            }`}
          >
            <p className="text-[11px] text-neutral-500">{t('recipients')}</p>
            <p
              className={`mt-0.5 text-sm font-bold ${
                activeTargets.length > 0 ? 'text-primary-700' : 'text-neutral-500'
              }`}
            >
              {activeTargets.length}
            </p>
          </div>
        </div>
      )}

      {/* 没配置 / 没接收人时给一句可执行的下一步 */}
      {config && (credsOn < 3 || activeTargets.length === 0) && (
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
          {activeTargets.length === 0 ? t('noRecipientHint') : t('credentialHint')}
        </p>
      )}
    </div>
  );
}
