'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/routing';
import { FLOOD_PROMO } from '@/lib/media';

/**
 * 首页 · 洪水促销视频区块
 * 显示曼谷淹水期间的特别促销视频（泰语配音，鱼第一人称）
 */
export default function FloodPromo() {
  const t = useTranslations();
  const locale = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.5 }
    );
    
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (locale === 'en') return null; // 仅泰语/中文显示

  return (
    <section className="px-4 py-8 bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto max-w-lg">
        {/* 标题 */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-neutral-900">
            {t('home.floodPromo.title')}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {t('home.floodPromo.subtitle')}
          </p>
        </div>

        {/* 视频容器 */}
        <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl">
          {inView && (
            <video
              ref={videoRef}
              src={FLOOD_PROMO.src}
              width={FLOOD_PROMO.w}
              height={FLOOD_PROMO.h}
              muted
              loop
              playsInline
              autoPlay
              disablePictureInPicture
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="h-full w-full object-cover"
            />
          )}
          
          {/* 播放/暂停按钮 */}
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) void v.play();
              else v.pause();
            }}
            aria-label={t('home.floodPromo.playLabel', { defaultValue: '播放/暂停' })}
            className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors"
          >
            {isPlaying ? (
              <svg className="w-6 h-6 text-neutral-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6 text-neutral-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
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
          
          <div className="flex justify-center gap-4 text-xs text-neutral-500">
            <span>{t('home.floodPromo.line')}</span>
            <span>·</span>
            <span>{t('home.floodPromo.facebook')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
