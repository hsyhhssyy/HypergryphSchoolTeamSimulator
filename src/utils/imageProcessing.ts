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
): Promise<{ file: File; dataUrl: string }> {
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
  const safeMime = mimeType === 'image/png' ? 'image/png' : mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value === null ? reject(new Error('图片导出失败')) : resolve(value)), safeMime, 0.92);
  });
  const extension = safeMime === 'image/png' ? 'png' : safeMime === 'image/webp' ? 'webp' : 'jpg';
  const stem = originalName.replace(/\.[^.]+$/, '') || 'image';
  const file = new File([blob], `${stem}-edited.${extension}`, { type: safeMime });
  return { file, dataUrl: canvas.toDataURL(safeMime, 0.92) };
}
