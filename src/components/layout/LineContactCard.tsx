'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LINE_OA } from '@/lib/site';

/**
 * 「有疑问？直接找我们」联系卡（开塘故事页底部）。
 *
 * 与右下角悬浮球同源（都取 `LINE_OA`）：悬浮球是**随时可用**的入口，
 * 这张卡是读完故事后的**决策点**入口 —— 客人刚看完六个月的投入，
 * 正是最想问「怎么去 / 多少钱 / 能带鱼走吗」的时候。
 *
 * 「复制 ID」走 clipboard API，失败时静默降级（老浏览器 / 非 https 环境），
 * 按钮下方始终把 `@300bsham` 明文写出来，复制不了也能手输。
 */
export default function LineContactCard() {
  const t = useTranslations('lineContact');
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(LINE_OA.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用 — 页面上有明文 ID，忽略即可 */
    }
  };

  return (
    <div className="mt-6 rounded-2xl bg-[#06C755]/10 p-5 ring-1 ring-[#06C755]/25">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#06C755]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path
              fill="#fff"
              d="M12 3.2c-5.2 0-9.4 3.4-9.4 7.6 0 3.8 3.3 6.9 7.8 7.5.3.06.7.2.8.45.08.23.05.58.03.81l-.13.8c-.04.23-.19.9.79.49 1-.42 5.4-3.19 7.37-5.46 1.36-1.5 2.14-3.03 2.14-4.59 0-4.2-4.2-7.6-9.4-7.6Z"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-neutral-900">{t('title')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            {t('desc')}
          </p>

          <a
            href={LINE_OA.addFriendUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                fill="#fff"
                d="M12 3.2c-5.2 0-9.4 3.4-9.4 7.6 0 3.8 3.3 6.9 7.8 7.5.3.06.7.2.8.45.08.23.05.58.03.81l-.13.8c-.04.23-.19.9.79.49 1-.42 5.4-3.19 7.37-5.46 1.36-1.5 2.14-3.03 2.14-4.59 0-4.2-4.2-7.6-9.4-7.6Z"
              />
            </svg>
            {t('addFriend')}
          </a>

          <div className="mt-2.5 flex items-center gap-2 text-xs text-neutral-500">
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 ring-1 ring-neutral-200">
              {LINE_OA.id}
            </code>
            <button
              type="button"
              onClick={copyId}
              className="font-medium text-[#06C755] underline-offset-2 hover:underline"
            >
              {copied ? t('copied') : t('copyId')}
            </button>
          </div>

          <p className="mt-2 text-[11px] text-neutral-400">{t('hoursNote')}</p>
        </div>
      </div>
    </div>
  );
}
