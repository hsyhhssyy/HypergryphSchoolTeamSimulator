import { useMemo, useRef, useState } from 'preact/hooks';
import type { CSSProperties, JSX } from 'preact';
import {
  computeCropRect,
  outputSizeForCrop,
  renderCroppedFile,
  type CropTransform,
} from '@/utils/imageProcessing';

export interface AdjustableImage {
  originalFile: File;
  originalUrl: string;
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

interface Props {
  image: AdjustableImage;
  reference?: AdjustableImage;
  fixedOutput?: { width: number; height: number };
  title: string;
  onCancel: () => void;
  onApply: (image: AdjustableImage) => void;
}

const ASPECTS = [
  { label: '原图', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const centerOf = (points: Array<{ x: number; y: number }>) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

export function ImageAdjustDialog({ image, reference, fixedOutput, title, onCancel, onApply }: Props) {
  const fixedAspect = fixedOutput === undefined ? null : fixedOutput.width / fixedOutput.height;
  const [aspect, setAspect] = useState(fixedAspect ?? image.width / image.height);
  const [outputWidth, setOutputWidth] = useState(String(fixedOutput?.width ?? image.width));
  const [outputHeight, setOutputHeight] = useState(String(fixedOutput?.height ?? image.height));
  const [customOutput, setCustomOutput] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [opacity, setOpacity] = useState(55);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastGesture = useRef<{ center: { x: number; y: number }; distance: number | null } | null>(null);
  const handleDrag = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    horizontal: -1 | 1;
    vertical: -1 | 1;
  } | null>(null);

  const transform: CropTransform = { aspect, zoom, offsetX, offsetY };
  const rect = useMemo(
    () => computeCropRect(image.originalWidth, image.originalHeight, transform),
    [image.originalWidth, image.originalHeight, aspect, zoom, offsetX, offsetY],
  );
  const requestedWidth = Number(outputWidth);
  const requestedHeight = Number(outputHeight);
  const validRequestedOutput = Number.isInteger(requestedWidth) && Number.isInteger(requestedHeight) && requestedWidth >= 1 && requestedWidth <= 4096 && requestedHeight >= 1 && requestedHeight <= 4096;
  const output = fixedOutput ?? (customOutput && validRequestedOutput ? { width: requestedWidth, height: requestedHeight } : outputSizeForCrop(rect));
  const imageStyle: CSSProperties = {
    width: `${(image.originalWidth / rect.width) * 100}%`,
    height: `${(image.originalHeight / rect.height) * 100}%`,
    left: `${(-rect.x / rect.width) * 100}%`,
    top: `${(-rect.y / rect.height) * 100}%`,
    opacity: reference === undefined ? 1 : opacity / 100,
  };

  const reset = (nextAspect = aspect) => {
    setAspect(nextAspect);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const selectAspect = (nextAspect: number) => {
    reset(nextAspect);
    setCustomOutput(false);
    const nextRect = computeCropRect(image.originalWidth, image.originalHeight, {
      aspect: nextAspect,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const nextOutput = outputSizeForCrop(nextRect);
    setOutputWidth(String(nextOutput.width));
    setOutputHeight(String(nextOutput.height));
  };

  const updateOutputSize = (which: 'width' | 'height', value: string) => {
    const nextWidth = Number(which === 'width' ? value : outputWidth);
    const nextHeight = Number(which === 'height' ? value : outputHeight);
    if (which === 'width') setOutputWidth(value);
    else setOutputHeight(value);
    setCustomOutput(true);
    if (Number.isInteger(nextWidth) && Number.isInteger(nextHeight) && nextWidth >= 1 && nextWidth <= 4096 && nextHeight >= 1 && nextHeight <= 4096) {
      reset(clamp(nextWidth / nextHeight, 0.1, 10));
    }
  };

  const startHandleDrag = (
    event: JSX.TargetedPointerEvent<HTMLButtonElement>,
    horizontal: -1 | 1,
    vertical: -1 | 1,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const viewport = event.currentTarget.parentElement?.getBoundingClientRect();
    if (viewport === undefined) return;
    handleDrag.current = {
      x: event.clientX,
      y: event.clientY,
      width: viewport.width,
      height: viewport.height,
      horizontal,
      vertical,
    };
  };

  const moveHandle = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    const drag = handleDrag.current;
    if (drag === null) return;
    event.preventDefault();
    event.stopPropagation();
    const width = Math.max(56, drag.width + (event.clientX - drag.x) * drag.horizontal * 2);
    const height = Math.max(56, drag.height + (event.clientY - drag.y) * drag.vertical * 2);
    setAspect(clamp(width / height, 0.1, 10));
    setCustomOutput(false);
  };

  const panBy = (dx: number, dy: number, viewport: DOMRect) => {
    const travelX = (image.originalWidth - rect.width) / 2;
    const travelY = (image.originalHeight - rect.height) / 2;
    if (travelX > 0) setOffsetX((value) => clamp(value - (dx * rect.width) / viewport.width / travelX, -1, 1));
    if (travelY > 0) setOffsetY((value) => clamp(value - (dy * rect.height) / viewport.height / travelY, -1, 1));
  };

  const rememberGesture = () => {
    const active = [...pointers.current.values()];
    if (active.length === 0) {
      lastGesture.current = null;
      return;
    }
    lastGesture.current = {
      center: centerOf(active),
      distance: active.length >= 2 ? distance(active[0]!, active[1]!) : null,
    };
  };

  const handlePointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    rememberGesture();
  };

  const handlePointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    const previous = lastGesture.current;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = [...pointers.current.values()];
    const nextCenter = centerOf(active);
    if (previous !== null) {
      panBy(nextCenter.x - previous.center.x, nextCenter.y - previous.center.y, event.currentTarget.getBoundingClientRect());
      if (active.length >= 2 && previous.distance !== null && previous.distance > 0) {
        setZoom((value) => clamp(value * (distance(active[0]!, active[1]!) / previous.distance!), 1, 4));
      }
    }
    lastGesture.current = { center: nextCenter, distance: active.length >= 2 ? distance(active[0]!, active[1]!) : null };
  };

  const handlePointerEnd = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    rememberGesture();
  };

  const handleWheel = (event: JSX.TargetedWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => clamp(value * (event.deltaY > 0 ? 0.94 : 1.06), 1, 4));
  };

  const apply = async () => {
    if (customOutput && !validRequestedOutput) return;
    setSaving(true);
    setError(null);
    try {
      const rendered = await renderCroppedFile(image.originalUrl, rect, output, image.originalFile.name, image.originalFile.type);
      onApply({ ...image, ...rendered });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片处理失败');
      setSaving(false);
    }
  };

  return (
    <div className="image-adjust" role="dialog" aria-modal="true" aria-labelledby="image-adjust-title">
      <header className="image-adjust__header">
        <button type="button" className="image-adjust__text-button" onClick={onCancel}>取消</button>
        <h2 id="image-adjust-title">{title}</h2>
        <button type="button" className="image-adjust__done" aria-label={reference === undefined ? '应用裁切' : '应用校准'} disabled={saving || (customOutput && !validRequestedOutput)} onClick={apply}>{saving ? '处理中' : '完成'}</button>
      </header>

      <div className="image-adjust__stage">
        <p className="image-adjust__hint">{reference === undefined ? '拖动图片调整位置 · 双指捏合缩放' : '拖动或缩放图片 B，与图片 A 对齐'}</p>
        <div
          className="image-adjust__viewport"
          style={{ aspectRatio: String(aspect), width: `min(100%, ${Math.min(720, aspect * 68)}dvh)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          {reference !== undefined && <img className="image-adjust__reference" src={reference.dataUrl} alt="图片 A 对齐参考" draggable={false} />}
          <img className="image-adjust__moving" style={imageStyle} src={image.originalUrl} alt="待调整图片" draggable={false} />
          <div className="image-adjust__grid" aria-hidden="true" />
          {([
            ['nw', -1, -1],
            ['ne', 1, -1],
            ['sw', -1, 1],
            ['se', 1, 1],
          ] as const).map(([corner, horizontal, vertical]) => (
            <button
              type="button"
              className={`image-adjust__handle image-adjust__handle--${corner}`}
              aria-label={`调整裁切框${corner}角`}
              onPointerDown={(event) => startHandleDrag(event, horizontal, vertical)}
              onPointerMove={moveHandle}
              onPointerUp={() => { handleDrag.current = null; }}
              onPointerCancel={() => { handleDrag.current = null; }}
            />
          ))}
        </div>
        <p className="image-adjust__size">{output.width} × {output.height}px · {Math.round(zoom * 100)}%</p>
        {fixedOutput === undefined && (
          <div className="image-adjust__dimensions" aria-label="精确输出尺寸">
            <label>宽<input inputMode="numeric" type="number" min="1" max="4096" value={outputWidth} onInput={(event) => updateOutputSize('width', event.currentTarget.value)} /></label>
            <span aria-hidden="true">×</span>
            <label>高<input inputMode="numeric" type="number" min="1" max="4096" value={outputHeight} onInput={(event) => updateOutputSize('height', event.currentTarget.value)} /></label>
            <span>px</span>
          </div>
        )}
        {customOutput && !validRequestedOutput && <p className="image-adjust__error" role="alert">宽高请输入 1–4096 之间的整数</p>}
        {error !== null && <p className="image-adjust__error" role="alert">{error}</p>}
      </div>

      <footer className="image-adjust__toolbar">
        {fixedAspect === null ? (
          <div className="image-adjust__aspects" role="group" aria-label="裁切比例">
            {ASPECTS.map((item) => {
              const value = item.value === 0 ? image.originalWidth / image.originalHeight : item.value;
              return <button type="button" className={Math.abs(aspect - value) < 0.001 && !customOutput ? 'image-adjust__tool--active' : ''} onClick={() => selectAspect(value)}>{item.label}</button>;
            })}
          </div>
        ) : (
          <button type="button" onClick={() => setOpacity((value) => value >= 90 ? 30 : value + 30)}>对照透明度 {opacity}%</button>
        )}
        <button type="button" onClick={() => reset()}>重置</button>
      </footer>
    </div>
  );
}
