export interface CropTransform {
  aspect: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The Worker rejects files whose size is greater than or equal to 5 MiB. */
export const MAX_PROCESSED_IMAGE_BYTES = 5 * 1024 * 1024;
/** Leave headroom for platform-specific encoder differences. */
export const TARGET_PROCESSED_IMAGE_BYTES = Math.floor(4.8 * 1024 * 1024);

const OUTPUT_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => (value === null ? reject(new Error('图片导出失败')) : resolve(value)),
      mimeType,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('图片导出失败'));
    reader.readAsDataURL(blob);
  });
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Encode at the best available quality below the upload cap. PNG is kept when
 * it already fits; oversized PNGs fall back to WebP/JPEG so phone screenshots
 * do not fail at the final submit step.
 */
async function encodeForUpload(
  canvas: HTMLCanvasElement,
  preferredMime: string,
  maxBytes: number,
): Promise<Blob> {
  if (preferredMime === 'image/png') {
    const png = await canvasToBlob(canvas, 'image/png');
    if (png.size < maxBytes) return png;
  }

  const lossyMimes = preferredMime === 'image/webp'
    ? ['image/webp', 'image/jpeg']
    : preferredMime === 'image/png'
      ? ['image/webp', 'image/jpeg']
      : ['image/jpeg'];

  let jpegBackgroundApplied = false;
  for (const mimeType of lossyMimes) {
    if (mimeType === 'image/jpeg' && !jpegBackgroundApplied) {
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('当前浏览器无法处理图片');
      context.save();
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      jpegBackgroundApplied = true;
    }
    for (const quality of OUTPUT_QUALITIES) {
      const blob = await canvasToBlob(canvas, mimeType, quality);
      // Browsers may silently fall back to PNG for an unsupported encoder.
      if (blob.type !== mimeType) break;
      if (blob.size < maxBytes) return blob;
    }
  }

  throw new Error('图片压缩后仍超过 5MB，请缩小输出尺寸');
}

export function computeCropRect(
  sourceWidth: number,
  sourceHeight: number,
  transform: CropTransform,
): SourceRect {
  const sourceAspect = sourceWidth / sourceHeight;
  let baseWidth: number;
  let baseHeight: number;
  if (sourceAspect > transform.aspect) {
    baseHeight = sourceHeight;
    baseWidth = baseHeight * transform.aspect;
  } else {
    baseWidth = sourceWidth;
    baseHeight = baseWidth / transform.aspect;
  }
  const zoom = Math.max(1, transform.zoom);
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  const travelX = (sourceWidth - width) / 2;
  const travelY = (sourceHeight - height) / 2;
  return {
    x: travelX * (transform.offsetX + 1),
    y: travelY * (transform.offsetY + 1),
    width,
    height,
  };
}

export function outputSizeForCrop(rect: SourceRect, maxEdge = 1920): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(rect.width, rect.height));
  return {
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  };
}

export async function renderCroppedFile(
  sourceUrl: string,
  sourceRect: SourceRect,
  output: { width: number; height: number },
  originalName: string,
  mimeType: string,
  maxBytes = TARGET_PROCESSED_IMAGE_BYTES,
): Promise<{ file: File; dataUrl: string; width: number; height: number }> {
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('当前浏览器无法处理图片');
  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    output.width,
    output.height,
  );
  const safeMime = mimeType === 'image/png'
    ? 'image/png'
    : mimeType === 'image/webp'
      ? 'image/webp'
      : 'image/jpeg';
  const blob = await encodeForUpload(canvas, safeMime, maxBytes);
  const extension = extensionForMime(blob.type);
  const stem = originalName.replace(/\.[^.]+$/, '') || 'image';
  const file = new File([blob], `${stem}-edited.${extension}`, { type: blob.type });
  return {
    file,
    dataUrl: await blobToDataUrl(blob),
    width: output.width,
    height: output.height,
  };
}

/** Rotate the currently processed image by one quarter turn in-browser. */
export async function renderRotatedFile(
  sourceUrl: string,
  originalName: string,
  mimeType: string,
  direction: -1 | 1,
): Promise<{ file: File; dataUrl: string; width: number; height: number }> {
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalHeight;
  canvas.height = image.naturalWidth;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('当前浏览器无法处理图片');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(direction * Math.PI / 2);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const safeMime = mimeType === 'image/png' ? 'image/png' : mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const blob = await encodeForUpload(canvas, safeMime, TARGET_PROCESSED_IMAGE_BYTES);
  const stem = originalName.replace(/\.[^.]+$/, '') || 'image';
  const file = new File([blob], `${stem}-rotated.${extensionForMime(blob.type)}`, { type: blob.type });
  return { file, dataUrl: await blobToDataUrl(blob), width: canvas.width, height: canvas.height };
}
