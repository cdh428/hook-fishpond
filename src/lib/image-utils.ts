/**
 * Client-side image processing utility.
 * Uses Canvas API to resize/compress images without server-side storage.
 *
 * Generates two versions:
 * - HD: max 1200px width, JPEG 85% quality (for zoom modal)
 * - Thumbnail: max 400px width, JPEG 60% quality (for list display)
 *
 * Both returned as base64 data URLs, stored directly in the database.
 * This approach avoids needing external file storage (Vercel filesystem is read-only).
 */

export interface ProcessedImage {
  hdUrl: string;      // High-resolution data URL (for zoom)
  thumbUrl: string;   // Low-resolution thumbnail data URL (for list)
  width: number;
  height: number;
}

const HD_MAX_WIDTH = 1200;
const HD_QUALITY = 0.85;
const THUMB_MAX_WIDTH = 400;
const THUMB_QUALITY = 0.6;

/**
 * Process an image File into HD + thumbnail data URLs.
 * @param file - Image file (JPEG/PNG/WebP)
 * @returns ProcessedImage with hdUrl and thumbUrl
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  // Validate file size (max 10MB original)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be smaller than 10MB');
  }

  const bitmap = await loadImage(file);
  const { width, height } = bitmap;

  const hdUrl = resizeToDataURL(bitmap, HD_MAX_WIDTH, HD_QUALITY);
  const thumbUrl = resizeToDataURL(bitmap, THUMB_MAX_WIDTH, THUMB_QUALITY);

  return { hdUrl, thumbUrl, width, height };
}

/**
 * Load a File into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize an image element to a canvas with max width, then export as JPEG data URL.
 * Maintains aspect ratio. If the original is smaller than maxWidth, uses original size.
 */
function resizeToDataURL(
  img: HTMLImageElement,
  maxWidth: number,
  quality: number,
): string {
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const scale = Math.min(1, maxWidth / originalWidth);
  const targetWidth = Math.round(originalWidth * scale);
  const targetHeight = Math.round(originalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // White background (for PNGs with transparency)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', quality);
}
