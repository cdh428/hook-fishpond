import { Link } from '@/i18n/routing';
import { photoUrl, type Photo } from '@/lib/media';

/**
 * 首页 · 照片墙（美食 / 环境共用）。
 *
 * 第 1 张占 2×2 格，其余铺成 3 列方格 —— 纯展示用，缩略图按 1080 方裁切出，
 * 全部 `loading="lazy"`，不抢首屏带宽。
 */
export default function PhotoWall({
  title,
  subtitle,
  photos,
  href,
  cta,
}: {
  title: string;
  subtitle: string;
  photos: Photo[];
  href: string;
  cta: string;
}) {
  return (
    <section className="px-4 pt-6">
      <div className="mx-auto max-w-lg">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
            <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
          </div>
          <Link
            href={href}
            className="shrink-0 pb-1 text-xs font-semibold text-primary-700 transition hover:text-primary-800"
          >
            {cta} →
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((photo, i) => (
            <div
              key={photo.base}
              className={`overflow-hidden rounded-xl bg-neutral-100 ${
                i === 0 ? 'col-span-2 row-span-2' : 'aspect-square'
              }`}
            >
              <picture>
                <source srcSet={photoUrl(photo, 'webp')} type="image/webp" />
                <img
                  src={photoUrl(photo)}
                  alt=""
                  width={photo.w}
                  height={photo.h}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-500 hover:scale-105"
                />
              </picture>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
