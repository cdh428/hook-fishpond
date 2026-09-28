'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { LINE_OA } from '@/lib/site';

/**
 * 全站 LINE 好友悬浮按钮（右下角）。
 *
 * 为什么需要它：Footer 里那条 `LINE · @300bsham` 只是文字链接，藏在页面最底部
 * （还要滚过整个页脚），手机上几乎点不到。钓场客人的高频动作是「问一句」——
 * 悬浮按钮把它变成随时可点。
 *
 * 位置与 BottomNav 错开（`bottom-20`）：底部导航固定占 64px，悬浮球再往上放
 * 一点才不会被压在下面。开屏时轻微延迟出现，不抢首屏视线。
 *
 * 硬规则（与 BottomNav / Footer 一致）：**后台不渲染**。后台有自己的导航体系，
 * 这个球会挡住右下角的操作按钮。
 */
export default function LineFloat() {
  const t = useTranslations('lineCard');
  const pathname = usePathname();

  if (pathname.startsWith('/admin')) return null;

  return (
    <a
      href={LINE_OA.addFriendUrl}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={t('addFriend')}
      title={`${t('addFriend')} · ${LINE_OA.id}`}
      className="group fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#06C755] text-white shadow-lg shadow-black/20 ring-2 ring-white transition hover:scale-105 hover:shadow-xl active:scale-95"
    >
      {/* LINE 品牌图标（官方三色气泡） */}
      <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
        <path
          fill="#fff"
          d="M12 3.2c-5.2 0-9.4 3.4-9.4 7.6 0 3.8 3.3 6.9 7.8 7.5.3.06.7.2.8.45.08.23.05.58.03.81l-.13.8c-.04.23-.19.9.79.49 1-.42 5.4-3.19 7.37-5.46 1.36-1.5 2.14-3.03 2.14-4.59 0-4.2-4.2-7.6-9.4-7.6Z"
        />
        <path
          fill="#06C755"
          d="M7.4 8.1c.19 0 .35.16.35.35v3.5a.35.35 0 0 1-.35.35H6.1a.35.35 0 0 1-.35-.35v-3.5c0-.19.16-.35.35-.35h1.3Zm2.03 0c.19 0 .35.16.35.35v2.1l-.01 1.4a.35.35 0 0 1-.5.31l-2.1-1.4v.99a.35.35 0 0 1-.35.35h-.01a.35.35 0 0 1-.35-.35v-3.5c0-.19.16-.35.35-.35h.2c.07 0 .13.02.19.06l1.88 1.25V8.45c0-.19.16-.35.35-.35Zm6.53 0c.19 0 .35.16.35.35v3.5a.35.35 0 0 1-.35.35h-1.3a.35.35 0 0 1-.35-.35v-3.5c0-.19.16-.35.35-.35h1.3Zm-3.4 0c.19 0 .35.16.35.35v3.5c0 .19-.16.35-.35.35h-2.1a.35.35 0 0 1-.35-.35v-3.5c0-.19.16-.35.35-.35h2.1Zm-1.05.7h-.61v2.1h.61V8.8Zm3.75 1.17v.94h.6V8.8h-.6v1.17Z"
        />
      </svg>
    </a>
  );
}
