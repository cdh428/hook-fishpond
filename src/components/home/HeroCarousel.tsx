'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/routing';
import { HERO_SLIDES, photoUrl } from '@/lib/media';

/** 每张停留时间 */
const INTERVAL_MS = 6500;

/**
 * 首页首屏 · 实拍照片轮播（全宽出血）。
 *
 * - 桌面用 16:9、手机用 4:5，靠 `<picture>` 的 media 源切，**一个场景两套裁切成对出现**。
 * - 图片按需解锁：初始只挂前两张的 src，每切一张才放行下一张，
 *   避免首屏一口气拉 4 张大图；**且只有下一张已 onLoad 才会推进**，不会切出白屏。
 * - `prefers-reduced-motion: reduce` 时完全不自动轮播（可以手动点圆点）。
 */
export default function HeroCarousel() {
  const t = useTranslations();
  const [index, setIndex] = useState(0);
  const [unlocked, setUnlocked] = useState(2);
  const [paused, setPaused] = useState(false);
  const loadedRef = useRef<boolean[]>(HERO_SLIDES.map(() => false));

  // 自动轮播
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (paused) return;
      const next = (index + 1) % HERO_SLIDES.length;
      if (!loadedRef.current[next]) return; // 还没加载完，等下一轮
      setUnlocked((n) => Math.max(n, Math.min(next + 2, HERO_SLIDES.length)));
      setIndex(next);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [index, paused]);

  const goTo = (i: number) => {
    setUnlocked((n) => Math.max(n, i + 1));
    setIndex(i);
  };

  const current = HERO_SLIDES[index];

  return (
    <section
      className="relative h-[54vh] max-h-[600px] min-h-[340px] w-full overflow-hidden bg-primary-950"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {HERO_SLIDES.map((slide, i) => (
        <div
          key={slide.key}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {i < unlocked && (
            <picture>
              <source
                media="(max-width: 640px)"
                srcSet={photoUrl(slide.mobile, 'webp')}
                type="image/webp"
              />
              <source media="(max-width: 640px)" srcSet={photoUrl(slide.mobile)} />
              <source srcSet={photoUrl(slide.desktop, 'webp')} type="image/webp" />
              <img
                src={photoUrl(slide.desktop)}
                alt=""
                width={slide.desktop.w}
                height={slide.desktop.h}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                decoding="async"
                onLoad={() => {
                  loadedRef.current[i] = true;
                }}
                className="h-full w-full object-cover"
              />
            </picture>
          )}
        </div>
      ))}

      {/* 压暗遮罩：保证白字在任何一张照片上都读得清 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/15" />

      <div className="absolute inset-x-0 bottom-0 px-5 pb-7">
        <div className="mx-auto max-w-lg">
          <span className="inline-block rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white shadow-cta">
            {t('home.keepFishBig')}
          </span>
          <h2 className="mt-3 text-2xl font-bold leading-snug text-white drop-shadow-sm">
            {t(`home.hero.${current.key}Title`)}
          </h2>
          <p className="mt-1.5 text-sm text-white/85">
            {t(`home.hero.${current.key}Sub`)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/booking"
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:bg-accent-600 active:scale-95"
            >
              {t('home.bookNow')}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <span className="text-xs font-medium text-white/75">
              {t('home.hero.hours')}
            </span>
          </div>
        </div>
      </div>

      {/* 指示点放右上角，避开左下角文案 */}
      <div className="absolute right-4 top-4 flex gap-1.5">
        {HERO_SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`${i + 1} / ${HERO_SLIDES.length}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'w-6 bg-accent-400' : 'w-1.5 bg-white/55 hover:bg-white/80'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
