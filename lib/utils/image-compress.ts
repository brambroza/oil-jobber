/**
 * Client-side image downscaling for OCR uploads.
 *
 * Phone photos are often 3000-4000px / 5-12 MB. Sending them raw as base64 JSON
 * makes the upload slow on mobile networks, can exceed platform body limits, and
 * makes the OCR model slower. Downscaling to ~2000px keeps price text legible.
 */

/** Longest edge (px) sent to OCR. Large enough for small digits on price sheets. */
export const OCR_MAX_EDGE = 2000;
/** JPEG quality used when re-encoding. */
export const OCR_JPEG_QUALITY = 0.85;

/**
 * Compute target dimensions that fit inside `maxEdge` while keeping aspect ratio.
 * Never upscales.
 * @param width source width in px
 * @param height source height in px
 * @param maxEdge maximum length of the longest edge
 * @returns integer target width/height
 */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(maxEdge > 0)) {
    throw new Error('ขนาดภาพไม่ถูกต้อง');
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Load a File into a drawable image source. Uses createImageBitmap (honours EXIF
 * orientation) when available, otherwise falls back to an <img> element.
 * @param file image file chosen by the user
 */
async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img> (e.g. older Safari not supporting options)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('เปิดไฟล์ภาพไม่ได้ (รองรับ JPG/PNG)'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Downscale and re-encode an image as JPEG, returning raw base64 (no data: prefix).
 * Also converts formats like HEIC (when the browser can decode them) to JPEG.
 * @param file image file chosen by the user
 * @param maxEdge longest edge in px
 * @param quality JPEG quality 0..1
 * @returns base64 JPEG payload and its approximate byte size
 */
export async function compressImageForOcr(
  file: File,
  maxEdge: number = OCR_MAX_EDGE,
  quality: number = OCR_JPEG_QUALITY,
): Promise<{ base64: string; bytes: number }> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error('กรุณาเลือกไฟล์รูปภาพ');
  }
  const img = await loadImage(file);
  try {
    const target = fitWithin(img.width, img.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับการย่อภาพ');
    ctx.fillStyle = '#ffffff'; // flatten transparent PNGs onto white
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(img.source, 0, 0, target.width, target.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { base64, bytes: Math.floor((base64.length * 3) / 4) };
  } finally {
    img.close();
  }
}
