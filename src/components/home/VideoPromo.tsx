'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { PROMO, photoUrl } from '@/lib/media';

/**
 * 首页 · 宣传小影片区块（放在首屏下方，不占首屏带宽）。
 *
 * - 桌面播 16:9、手机播 9:16（两版镜头顺序不同，都是实拍照片合成，无 AI 画面）。
 * - 滚进视口才挂载 `<video>`；`prefers-reduced-motion` 时只显示封面图。
 * - 封面图用 `<picture>` 切横竖，**布局比例也交给 CSS 的 max-sm: 变体**，
 *   所以服务端渲染和客户端首帧一致，不会出现「先 16:9 再跳到 9:16」的抖动。
 */
export default function VideoPromo() {
  const t = useTranslations();
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [tall, setTall] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setTall(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin: '250px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const showVideo = inView && tall !== null && !reduced;
  const active = tall ? PROMO.tall : PROMO.wide;

  return (
    <section className="px-4 pt-5">
      <div className="mx-auto max-w-lg">
        <h3 className="text-lg font-bold text-neutral-900">{t('home.video.title')}</h3>
        <p className="mt-1 text-sm text-neutral-500">{t('home.video.subtitle')}</p>

        <div
          ref={boxRef}
          className="relative mt-3 mx-auto aspect-video w-full overflow-hidden rounded-2xl bg-primary-950 shadow-brand max-sm:aspect-[9/16] max-sm:h-[70vh] max-sm:max-h-[680px] max-sm:w-auto"
        >
          {/* 封面：视频加载出来之前、以及「减少动效」时看到的就是它 */}
          <picture>
            <source media="(max-width: 640px)" srcSet={photoUrl(PROMO.tall.poster)} />
            <img
              src={photoUrl(PROMO.wide.poster)}
              alt={t('home.video.posterAlt')}
              width={PROMO.wide.w}
              height={PROMO.wide.h}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </picture>

          {showVideo && (
            <video
              ref={videoRef}
              src={active.src}
              muted
              loop
              playsInline
              autoPlay
              disablePictureInPicture
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* 兜底：浏览器没自动播（省电模式等）时点一下就开始 */}
          {showVideo && (
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) void v.play();
                else v.pause();
              }}
              aria-label={t('home.video.playLabel')}
              className="absolute inset-0 h-full w-full cursor-pointer bg-transparent"
            />
          )}
        </div>

        <p className="mt-2 text-xs text-neutral-400">{t('home.video.note')}</p>
      </div>
    </section>
  );
}
