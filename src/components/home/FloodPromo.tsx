'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/routing';
import { FLOOD_PROMO } from '@/lib/media';

/**
 * 首页 · 洪水促销视频区块
 * 显示曼谷淹水期间的特别促销视频（泰语配音，鱼第一人称）。
 *
 * 实现要点（修 2026-10-06 两个 bug）：
 *  - observer 目标是**常驻容器 div**（不是懒挂载的 <video>），滚动进视野才 setInView，
 *    避免「video 不挂载 → ref 为 null → observer 没建 → inView 永远 false」的死锁。
 *  - 默认静音自动播放（浏览器策略要求）；提供 🔊 声音开关，点开才有泰语配音。
 *  - <video> 懒挂载 + 封面兜底（视频没加载完/加载失败时有内容可见）。
 */
export default function FloodPromo() {
  const t = useTranslations();
  const locale = useLocale();
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [loaded, setLoaded] = useState(false);

  // IntersectionObserver：进视野播放、出视野暂停（<video> 始终渲染，不受此控制）
  useEffect(() => {
    const el = boxRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 同步 muted 到 video 元素
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // 仅泰语 / 中文显示；英文页整个区块不渲染
  if (locale === 'en') return null;

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      // 开声音时若视频在暂停态顺手播放
      const v = videoRef.current;
      if (v && next === false) v.play().catch(() => {});
      return next;
    });
  };

  return (
    <section className="px-4 py-8 bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto max-w-lg md:max-w-3xl">
        {/* 标题 */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-neutral-900">
            {t('home.floodPromo.title')}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {t('home.floodPromo.subtitle')}
          </p>
        </div>

        {/* 视频容器：boxRef 常驻，作为 observer 目标 */}
        <div
          ref={boxRef}
          className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl"
        >
          {/* 封面兜底（视频未加载完或加载失败） */}
          {!loaded && (
            <div
              className="absolute inset-0 flex items-center justify-center text-6xl bg-neutral-900"
              aria-hidden
            >
              🎣
            </div>
          )}

          {/* video 始终渲染（首屏即可见）；observer 只控播放/暂停，不控挂载 */}
          <video
            ref={videoRef}
            src={FLOOD_PROMO.src}
            width={FLOOD_PROMO.w}
            height={FLOOD_PROMO.h}
            muted={muted}
            loop
            playsInline
            autoPlay
            preload="metadata"
            disablePictureInPicture
            onCanPlay={() => setLoaded(true)}
            onLoadedData={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* 声音开关（右下角，常驻） */}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? '開聲音' : '静音'}
            className="absolute bottom-4 right-4 z-10 w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors"
          >
            {muted ? (
              <svg className="w-6 h-6 text-neutral-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6 text-neutral-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.8 5 3.47 5 6.71s-2.11 5.91-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
        </div>

        {/* 说明文字 */}
        <p className="mt-3 text-center text-sm text-neutral-600">
          {t('home.floodPromo.note')}
        </p>

        {/* CTA 按钮 */}
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/booking"
            className="block w-full text-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          >
            {t('home.floodPromo.cta')} 🎣
          </Link>

          <div className="flex justify-center gap-3 text-xs text-neutral-500">
            <span>{t('home.floodPromo.line')}</span>
            <span>·</span>
            <span>{t('home.floodPromo.facebook')}</span>
            <span>·</span>
            <span>{t('home.floodPromo.website')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
