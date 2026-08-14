/**
 * WorkshopSubmit — todo 20. Creative-workshop submission form.
 *
 * Flow: pick mode → fill title/description/author → upload image A (+ image B
 * in spot_diff mode) → author differences on a live preview (tap = circle
 * center + radius slider, drag = rect) → submit as multipart FormData with
 * snake_case field names (todo 16 contract) via submitWorkshopQuestion.
 *
 * Coordinate contract (single canonical pipeline from todo 7): preview taps
 * are converted to image-NATIVE pixels via computeContainTransform +
 * toNativeCoords against the ACTUAL laid-out img box (letterbox-aware,
 * identical math to ImagePanel). Differences are stored native and rendered
 * back with differenceMarkerStyle — the same marker math the game uses.
 *
 * Validation is client-side FIRST (inline errors, no API call when invalid):
 * ≥1 difference, images ≤ 5MB, author_name 2-20 chars, title/description
 * 1-200 chars, spot_diff requires image_b. The server re-validates (todo 16).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CSSProperties, JSX } from 'preact';
import type { Difference, QuestionMode } from '@shared/types';
import {
  computeContainTransform,
  toDisplayCoords,
  toNativeCoords,
  type ContainTransform,
  type ElementRect,
  type Point,
} from '@/utils/hitDetection';
import { differenceMarkerStyle } from '@/components/ImagePanel';
import { MODE_OPTIONS } from '@/components/Menu';
import { submitWorkshopQuestion } from '@/lib/api';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { getOrCreateUserId } from '@/lib/userId';

// --- Pure validation & geometry helpers (exported for unit tests) --------

/** Client-side mirror of the server's 5MB cap (todo 16). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Raster-only whitelist mirroring the server (SVG rejected — stored-XSS defense). */
export const ACCEPTED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Drag threshold in DISPLAY px — a press moving less than this is a click. */
export const DRAG_THRESHOLD_PX = 10;

/** Default radius for newly tapped circles. */
export const DEFAULT_RADIUS = 30;

/** Validate an upload candidate client-side; returns an error message or null. */
export function validateImageFile(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) return '图片不能超过 5MB';
  if (!ACCEPTED_IMAGE_MIME.includes(file.type)) return '仅支持 JPEG / PNG / WebP 图片';
  return null;
}

/**
 * Normalize a drag rectangle (arbitrary start→end order) into a positive-size
 * Difference rect. Width/height are floored at 1px so the result always
 * satisfies the server rule rect.width > 0 AND rect.height > 0.
 */
export function normalizeRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(1, Math.abs(a.x - b.x)),
    height: Math.max(1, Math.abs(a.y - b.y)),
  };
}

/** Form values validateWorkshopForm reads — plain data, unit-testable. */
export interface WorkshopFormValues {
  mode: QuestionMode;
  title: string;
  description: string;
  authorName: string;
  imageAName: string | null;
  imageBName: string | null;
  differences: readonly Difference[];
}

export interface WorkshopFormErrors {
  title?: string;
  description?: string;
  authorName?: string;
  imageA?: string;
  imageB?: string;
  differences?: string;
}

/**
 * Client-side validation mirroring the server (todo 16): title/description
 * 1-200 chars (description is the 题目描述 instruction text, REQUIRED),
 * author_name 2-20 chars (trimmed), ≥1 difference, image_a always required,
 * image_b required ONLY for spot_diff. Returns empty object when valid.
 */
export function validateWorkshopForm(values: WorkshopFormValues): WorkshopFormErrors {
  const errors: WorkshopFormErrors = {};
  const title = values.title.trim();
  if (title.length === 0) errors.title = '请输入题目标题';
  else if (title.length > 200) errors.title = '标题不能超过 200 字';
  const description = values.description.trim();
  if (description.length === 0) errors.description = '题目描述为必填项';
  else if (description.length > 200) errors.description = '题目描述不能超过 200 字';
  const authorName = values.authorName.trim();
  if (authorName.length < 2 || authorName.length > 20) {
    errors.authorName = '昵称需为 2-20 个字符';
  }
  if (values.differences.length === 0) {
    errors.differences = '请至少添加一个差异区域（点击或拖动画出）';
  }
  if (values.imageAName === null) errors.imageA = '请上传图片 A';
  if (values.mode === 'spot_diff' && values.imageBName === null) {
    errors.imageB = '找不同模式需要上传图片 B';
  }
  return errors;
}

// --- Component -----------------------------------------------------------

interface ImageFile {
  file: File;
  dataUrl: string;
}

interface EditorGeometry {
  transform: ContainTransform;
  naturalW: number;
  naturalH: number;
}

/** Pointer drag on the editor overlay (tap vs drag disambiguated by distance). */
interface DragState {
  pointerId: number;
  startClient: Point;
  startNative: Point;
  currentNative: Point | null;
}

interface ToastState {
  kind: 'success' | 'error';
  message: string;
}

function clampNative(point: Point, naturalW: number, naturalH: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), naturalW),
    y: Math.min(Math.max(point.y, 0), naturalH),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function descriptionOf(difference: Difference): string {
  switch (difference.type) {
    case 'circle':
      return `圆形 (${difference.x}, ${difference.y}) · 半径 ${difference.radius}`;
    case 'rect':
      return `矩形 (${difference.x}, ${difference.y}) · ${difference.width}×${difference.height}`;
  }
}

/** Native-rect → display style for the drag preview (same contain math). */
function rectStyleFor(
  rect: { x: number; y: number; width: number; height: number },
  transform: ContainTransform,
): CSSProperties {
  const pos = toDisplayCoords(rect.x, rect.y, transform);
  return {
    left: pos.x,
    top: pos.y,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale,
  };
}

export interface WorkshopSubmitProps {
  /** Navigate back to the game menu (App view state, todo 20). */
  onBack: () => void;
}

export function WorkshopSubmit({ onBack }: WorkshopSubmitProps) {
  const [mode, setMode] = useState<QuestionMode>('spot_diff');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [showCount, setShowCount] = useState(true);
  const [imageA, setImageA] = useState<ImageFile | null>(null);
  const [imageB, setImageB] = useState<ImageFile | null>(null);
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sliderRadius, setSliderRadius] = useState(DEFAULT_RADIUS);
  const [errors, setErrors] = useState<WorkshopFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [geometry, setGeometry] = useState<EditorGeometry | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Toast auto-dismiss; timer cleared on unmount (no leak).
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (kind: ToastState['kind'], message: string): void => {
    setToast({ kind, message });
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  /** Set one field + clear its inline error (error disappears as user fixes). */
  const updateField = <K extends keyof WorkshopFormErrors>(
    field: K,
    value: string,
    setter: (value: string) => void,
  ): void => {
    setter(value);
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const applyImage = (which: 'imageA' | 'imageB', value: ImageFile | null, error: string | null): void => {
    if (which === 'imageA') {
      setImageA(value);
      // A new base image invalidates previously authored native coords.
      if (value !== null) {
        setDifferences([]);
        setSelectedIndex(null);
      }
    } else {
      setImageB(value);
    }
    setErrors((prev) => {
      const next = { ...prev };
      if (error === null) delete next[which];
      else next[which] = error;
      return next;
    });
  };

  const handleImageChange = (which: 'imageA' | 'imageB') => (event: JSX.TargetedEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = ''; // allow re-picking the same file
    if (!file) return;
    const error = validateImageFile(file);
    if (error !== null) {
      // Keep the previous valid image, surface the rejection inline.
      applyImage(which, null, error);
      return;
    }
    readFileAsDataUrl(file)
      .then((dataUrl) => applyImage(which, { file, dataUrl }, null))
      .catch(() => applyImage(which, null, '图片读取失败'));
  };

  /** Same measurement pattern as ImagePanel — live box + contain transform.
      NOTE: only the SCROLL-INVARIANT parts (transform, natural dims) live in
      state; the element rect is read FRESH from the overlay at each pointer
      event, because page scroll changes rect.top/left without firing
      ResizeObserver (a stale rect would corrupt tap→native math). */
  const syncGeometry = (): void => {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setGeometry({
      transform: computeContainTransform(
        img.naturalWidth,
        img.naturalHeight,
        rect.width,
        rect.height,
      ),
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
    });
  };

  const currentRect = (): ElementRect | null => {
    const overlay = overlayRef.current;
    if (overlay === null) return null;
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { left: rect.left, top: rect.top };
  };

  // Keep the transform fresh across layout shifts (viewport resize, URL bar).
  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncGeometry);
    observer.observe(img);
    return () => observer.disconnect();
  }, []);

  const addDifference = (difference: Difference): void => {
    const next = [...differences, difference];
    setDifferences(next);
    setSelectedIndex(next.length - 1);
    setErrors((prev) => {
      if (prev.differences === undefined) return prev;
      const nextErrors = { ...prev };
      delete nextErrors.differences;
      return nextErrors;
    });
  };

  const removeDifference = (index: number): void => {
    const next = differences.filter((_, i) => i !== index);
    setDifferences(next);
    setSelectedIndex((prev) => {
      if (prev === null || prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
  };

  const handleOverlayPointerDown = (event: PointerEvent): void => {
    const rect = currentRect();
    if (geometry === null || rect === null) return;
    event.preventDefault();
    overlayRef.current?.setPointerCapture(event.pointerId);
    const startNative = clampNative(
      toNativeCoords(event.clientX, event.clientY, rect, geometry.transform),
      geometry.naturalW,
      geometry.naturalH,
    );
    setDrag({
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startNative,
      currentNative: null,
    });
  };

  const handleOverlayPointerMove = (event: PointerEvent): void => {
    const rect = currentRect();
    if (geometry === null || rect === null) return;
    setDrag((prev) => {
      if (prev === null || prev.pointerId !== event.pointerId) return prev;
      const moved =
        Math.hypot(event.clientX - prev.startClient.x, event.clientY - prev.startClient.y) >=
        DRAG_THRESHOLD_PX;
      if (!moved) return prev;
      return {
        ...prev,
        currentNative: clampNative(
          toNativeCoords(event.clientX, event.clientY, rect, geometry.transform),
          geometry.naturalW,
          geometry.naturalH,
        ),
      };
    });
  };

  const handleOverlayPointerUp = (event: PointerEvent): void => {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    setDrag(null);
    if (geometry === null) return;
    if (drag.currentNative === null) {
      // Click → circle at the press point with the current slider radius.
      addDifference({
        type: 'circle',
        x: round1(drag.startNative.x),
        y: round1(drag.startNative.y),
        radius: sliderRadius,
      });
    } else {
      // Drag → normalized rect (positive width AND height guaranteed).
      const rect = normalizeRect(drag.startNative, drag.currentNative);
      addDifference({
        type: 'rect',
        x: round1(rect.x),
        y: round1(rect.y),
        width: round1(rect.width),
        height: round1(rect.height),
      });
    }
  };

  const handleRadiusChange = (value: number): void => {
    setSliderRadius(value);
    const selected = selectedIndex !== null ? differences[selectedIndex] : undefined;
    if (selectedIndex !== null && selected?.type === 'circle') {
      setDifferences((prev) =>
        prev.map((difference, index) =>
          index === selectedIndex && difference.type === 'circle'
            ? { ...difference, radius: value }
            : difference,
        ),
      );
    }
  };

  const handleSubmit = (event: JSX.TargetedEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const validation = validateWorkshopForm({
      mode,
      title,
      description,
      authorName,
      imageAName: imageA?.file.name ?? null,
      imageBName: imageB?.file.name ?? null,
      differences,
    });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return; // inline errors, NO API call

    const formData = new FormData();
    formData.set('mode', mode);
    formData.set('title', title.trim());
    formData.set('description', description.trim());
    formData.set('differences', JSON.stringify(differences));
    formData.set('show_count', showCount ? 'true' : 'false');
    formData.set('author_name', authorName.trim());
    formData.set('author_id', getOrCreateUserId());
    if (imageA !== null) formData.set('image_a', imageA.file);
    if (mode === 'spot_diff' && imageB !== null) formData.set('image_b', imageB.file);

    setSubmitting(true);
    submitWorkshopQuestion(formData)
      .then(({ id }) => showToast('success', `投稿成功！题目 ID：${id}`))
      .catch((err: unknown) => {
        console.error('投稿失败:', err);
        showToast('error', friendlyErrorMessage(err, '上传失败，请重试'));
      })
      .finally(() => setSubmitting(false));
  };

  const selected = selectedIndex !== null ? differences[selectedIndex] : undefined;
  const activeImageA = imageA !== null;

  return (
    <main className="screen workshop-screen">
      <header className="workshop-screen__header">
        <button type="button" className="btn btn--ghost workshop-screen__back" onClick={onBack}>
          ← 返回
        </button>
        <h1 className="font-display workshop-screen__title">创意工坊投稿</h1>
      </header>

      <form className="workshop-form" onSubmit={handleSubmit} noValidate>
        {/* Mode selector — same touch cards as the Menu. */}
        <section className="card" aria-labelledby="workshop-mode-heading">
          <h2 id="workshop-mode-heading" className="menu__heading">
            题目模式
          </h2>
          <div className="workshop__modes">
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.mode;
              return (
                <button
                  type="button"
                  key={opt.mode}
                  className={`mode-card${active ? ' mode-card--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => setMode(opt.mode)}
                >
                  <span className="mode-card__label">{opt.label}</span>
                  <span className="mode-card__desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="workshop-hint">
            {mode === 'spot_diff' ? '双图模式：需要在下方上传两张图片' : '单图模式：只需上传一张图片'}
          </p>
        </section>

        {/* Text fields */}
        <section className="card workshop-fields">
          <div className="field">
            <label className="field__label" htmlFor="workshop-title">
              题目标题
            </label>
            <input
              id="workshop-title"
              className="field__input"
              type="text"
              maxLength={200}
              placeholder="例如：找出图片中的 5 处不同"
              value={title}
              aria-invalid={errors.title !== undefined}
              onInput={(e) => updateField('title', e.currentTarget.value, setTitle)}
            />
            {errors.title !== undefined && (
              <p role="alert" className="field__error">
                {errors.title}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="workshop-desc">
              题目描述 <span className="field__required">（必填）</span>
            </label>
            <textarea
              id="workshop-desc"
              className="field__textarea"
              rows={2}
              maxLength={200}
              placeholder="给玩家的提示语，例如：找出两张图中的不同之处"
              value={description}
              aria-invalid={errors.description !== undefined}
              onInput={(e) => updateField('description', e.currentTarget.value, setDescription)}
            />
            {errors.description !== undefined && (
              <p role="alert" className="field__error">
                {errors.description}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="workshop-author">
              昵称
            </label>
            <input
              id="workshop-author"
              className="field__input"
              type="text"
              maxLength={20}
              placeholder="2-20 个字符"
              value={authorName}
              aria-invalid={errors.authorName !== undefined}
              onInput={(e) => updateField('authorName', e.currentTarget.value, setAuthorName)}
            />
            {errors.authorName !== undefined && (
              <p role="alert" className="field__error">
                {errors.authorName}
              </p>
            )}
          </div>

          <div className="field">
            <span className="field__label" id="workshop-showcount-label">
              游戏内差异数量显示
            </span>
            <div className="source-toggle" role="group" aria-labelledby="workshop-showcount-label">
              <button
                type="button"
                className={`source-toggle__option${showCount ? ' source-toggle--active' : ''}`}
                aria-pressed={showCount}
                onClick={() => setShowCount(true)}
              >
                显示
              </button>
              <button
                type="button"
                className={`source-toggle__option${!showCount ? ' source-toggle--active' : ''}`}
                aria-pressed={!showCount}
                onClick={() => setShowCount(false)}
              >
                隐藏（更有挑战）
              </button>
            </div>
          </div>
        </section>

        {/* Image uploads — FileReader preview */}
        <section className="card workshop-uploads" aria-label="图片上传">
          <h2 className="menu__heading">图片</h2>

          <div className="field">
            <span className="field__label">图片 A（基准图）</span>
            <label className="btn btn--secondary workshop-upload__trigger">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="workshop-upload__input"
                onChange={handleImageChange('imageA')}
              />
              <span>{imageA === null ? '选择图片 A' : '重新选择图片 A'}</span>
            </label>
            {errors.imageA !== undefined && (
              <p role="alert" className="field__error">
                {errors.imageA}
              </p>
            )}
            {imageA !== null && (
              <div className="workshop-upload__preview">
                <img src={imageA.dataUrl} alt="图片 A 预览" draggable={false} />
              </div>
            )}
          </div>

          {mode === 'spot_diff' && (
            <div className="field">
              <span className="field__label">图片 B（找不同模式必填）</span>
              <label className="btn btn--secondary workshop-upload__trigger">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="workshop-upload__input"
                  onChange={handleImageChange('imageB')}
                />
                <span>{imageB === null ? '选择图片 B' : '重新选择图片 B'}</span>
              </label>
              {errors.imageB !== undefined && (
                <p role="alert" className="field__error">
                  {errors.imageB}
                </p>
              )}
              {imageB !== null && (
                <div className="workshop-upload__preview">
                  <img src={imageB.dataUrl} alt="图片 B 预览" draggable={false} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Differences editor — tap circle / drag rect over the live preview */}
        {activeImageA && (
          <section className="card workshop-editor" aria-labelledby="workshop-editor-heading">
            <h2 id="workshop-editor-heading" className="menu__heading">
              添加差异区域
            </h2>
            <p className="workshop-hint">点击图片放置圆形区域 · 按住拖动绘制矩形区域</p>
            {errors.differences !== undefined && (
              <p role="alert" className="field__error">
                {errors.differences}
              </p>
            )}

            <div className="workshop-editor__stage">
              <img
                ref={imgRef}
                className="workshop-editor__img"
                src={imageA.dataUrl}
                alt="差异编辑基准图"
                draggable={false}
                onLoad={syncGeometry}
              />
              <div
                ref={overlayRef}
                className="game-surface workshop-editor__overlay"
                onPointerDown={handleOverlayPointerDown}
                onPointerMove={handleOverlayPointerMove}
                onPointerUp={handleOverlayPointerUp}
                onPointerCancel={() => setDrag(null)}
                aria-hidden="true"
              />
              {geometry !== null &&
                differences.map((difference, index) => {
                  const style = differenceMarkerStyle(difference, geometry.transform);
                  if (style === null) return null;
                  return (
                    <div
                      key={index}
                      className={`workshop-marker${
                        index === selectedIndex ? ' workshop-marker--selected' : ''
                      }`}
                      style={style}
                      aria-hidden="true"
                    />
                  );
                })}
              {drag !== null && drag.currentNative !== null && geometry !== null && (
                <div
                  className="workshop-marker workshop-marker--drag"
                  style={rectStyleFor(normalizeRect(drag.startNative, drag.currentNative), geometry.transform)}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="workshop-radius">
                圆形半径：{selected?.type === 'circle' ? selected.radius : sliderRadius}px
              </label>
              <input
                id="workshop-radius"
                className="workshop-slider"
                type="range"
                min={5}
                max={200}
                step={1}
                value={selected?.type === 'circle' ? selected.radius : sliderRadius}
                onChange={(e) => handleRadiusChange(Number(e.currentTarget.value))}
              />
            </div>

            {differences.length > 0 && (
              <ul className="workshop-diff-list">
                {differences.map((difference, index) => (
                  <li
                    key={index}
                    className={`workshop-diff-item${
                      index === selectedIndex ? ' workshop-diff-item--selected' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="workshop-diff-item__select"
                      aria-pressed={index === selectedIndex}
                      onClick={() => setSelectedIndex(index === selectedIndex ? null : index)}
                    >
                      <span className="workshop-diff-item__no">#{index + 1}</span>
                      <span className="workshop-diff-item__desc">{descriptionOf(difference)}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger workshop-diff-item__delete"
                      aria-label={`删除第 ${index + 1} 个差异区域`}
                      onClick={() => removeDifference(index)}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <button
          type="submit"
          className="btn btn--primary workshop-form__submit"
          disabled={submitting}
        >
          {submitting ? '提交中…' : '提交投稿'}
        </button>
      </form>

      {toast !== null && (
        <div role="status" className={`toast toast--${toast.kind}`}>
          {toast.message}
        </div>
      )}
    </main>
  );
}
