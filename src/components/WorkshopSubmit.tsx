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
 * ≥1 difference, author_name 2-20 chars, title/description 1-200 chars,
 * spot_diff requires image_b. Phone originals are normalized to a supported
 * upload format below 5 MiB before the server re-validates (todo 16).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CSSProperties, JSX } from 'preact';
import type { Difference, QuestionMode } from '@shared/types';
import {
  computeContainTransform,
  toDisplayCoords,
  toNativeCoords,
  type ContainTransform,
  type Point,
} from '@/utils/hitDetection';
import { differenceMarkerStyle } from '@/components/ImagePanel';
import { MODE_OPTIONS } from '@/components/Menu';
import { submitWorkshopQuestion } from '@/lib/api';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { getOrCreateUserId } from '@/lib/userId';
import { ImageAdjustDialog, type AdjustableImage } from '@/components/ImageAdjustDialog';
import {
  MAX_PROCESSED_IMAGE_BYTES,
  outputSizeForCrop,
  renderCroppedFile,
} from '@/utils/imageProcessing';

// --- Pure validation & geometry helpers (exported for unit tests) --------

/** Client-side mirror of the server's 5MB cap (todo 16). */
export const MAX_IMAGE_BYTES = MAX_PROCESSED_IMAGE_BYTES;

/** Protect mobile tabs from decoding exceptionally large source files. */
export const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024;

/** Input formats. HEIC/HEIF are converted locally and never sent as-is. */
export const ACCEPTED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const ACCEPTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

/** Drag threshold in DISPLAY px — a press moving less than this is a click. */
export const DRAG_THRESHOLD_PX = 10;

/** Default radius for newly tapped circles. */
export const DEFAULT_RADIUS = 30;

/** Validate an upload candidate client-side; returns an error message or null. */
export function validateImageFile(file: File): string | null {
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return '原图不能超过 40MB';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const unknownMime = file.type === '' || file.type === 'application/octet-stream';
  if (
    !ACCEPTED_IMAGE_MIME.includes(file.type)
    && !(unknownMime && ACCEPTED_IMAGE_EXTENSIONS.includes(extension))
  ) {
    return '仅支持 JPEG / PNG / WebP / HEIC 图片';
  }
  return null;
}

export function isHeicImageFile(file: File): boolean {
  return file.type === 'image/heic'
    || file.type === 'image/heif'
    || /\.(?:heic|heif)$/i.test(file.name);
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

/** A measured element box (full rect) — for fresh-transform tap math. */
export interface MeasuredRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Client-space tap → image-NATIVE coords using a FRESH contain transform
 * recomputed from the LIVE element box at tap time (task 27b).
 *
 * Immune to a stale stored `geometry.transform`: syncGeometry() can measure
 * the img mid-way through the card's `pop` entrance animation (scale 0.85),
 * when getBoundingClientRect is still scaled — a transform-only change that
 * never refires ResizeObserver, so the stale transform would otherwise
 * persist forever. Because the box and its transform are derived from the
 * SAME rect, a uniform ancestor scale cancels out exactly: the native result
 * is correct whether the tap lands mid-animation or after it settles.
 * Returns null when there is nothing measurable yet (guard parity with
 * syncGeometry/currentRect).
 */
export function tapToNativeCoords(
  clientX: number,
  clientY: number,
  rect: MeasuredRect,
  naturalW: number,
  naturalH: number,
): Point | null {
  if (rect.width === 0 || rect.height === 0 || naturalW === 0 || naturalH === 0) {
    return null;
  }
  return toNativeCoords(
    clientX,
    clientY,
    rect,
    computeContainTransform(naturalW, naturalH, rect.width, rect.height),
  );
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

export type WorkshopErrorField = keyof WorkshopFormErrors;

/** Visual page order, deliberately independent from object insertion order. */
export const WORKSHOP_ERROR_ORDER: readonly WorkshopErrorField[] = [
  'title',
  'description',
  'authorName',
  'imageA',
  'imageB',
  'differences',
];

export function firstWorkshopErrorField(errors: WorkshopFormErrors): WorkshopErrorField | null {
  return WORKSHOP_ERROR_ORDER.find((field) => errors[field] !== undefined) ?? null;
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

export interface WorkshopCompletion {
  basicInfo: boolean;
  images: boolean;
  differences: boolean;
}

export function workshopCompletion(values: WorkshopFormValues): WorkshopCompletion {
  const validation = validateWorkshopForm(values);
  return {
    basicInfo: validation.title === undefined
      && validation.description === undefined
      && validation.authorName === undefined,
    images: validation.imageA === undefined && validation.imageB === undefined,
    differences: validation.differences === undefined,
  };
}

// --- Component -----------------------------------------------------------

type ImageFile = AdjustableImage;

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

function imageStatus(image: ImageFile, optimized: boolean): string {
  const type = image.file.type === 'image/png'
    ? 'PNG'
    : image.file.type === 'image/webp'
      ? 'WebP'
      : 'JPEG';
  const size = `${(image.file.size / (1024 * 1024)).toFixed(1)}MB`;
  return optimized ? `已自动优化：${type} · ${size}` : `已就绪：${type} · ${size}`;
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

function loadBrowserImage(file: File): Promise<ImageFile> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      originalFile: file,
      originalUrl: objectUrl,
      file,
      dataUrl: objectUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
    });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片读取失败'));
    };
    image.src = objectUrl;
  });
}

async function convertHeicToJpeg(file: File): Promise<File> {
  // Kept out of the initial bundle: most visitors never select a HEIC file.
  const { heicTo } = await import('heic-to/csp');
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
  const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' });
}

/** Decode, convert when necessary, and create an upload-safe initial crop. */
async function readImageFile(file: File): Promise<ImageFile> {
  let decoded: ImageFile;
  try {
    // Safari/iOS can decode HEIC natively, avoiding the large fallback codec.
    decoded = await loadBrowserImage(file);
  } catch (error) {
    if (!isHeicImageFile(file)) throw error;
    try {
      decoded = await loadBrowserImage(await convertHeicToJpeg(file));
    } catch {
      throw new Error('当前浏览器无法转换这张 HEIC 图片');
    }
  }

  const needsNormalization = isHeicImageFile(decoded.originalFile)
    || decoded.file.size >= MAX_IMAGE_BYTES
    || Math.max(decoded.width, decoded.height) > 1920
    || !['image/jpeg', 'image/png', 'image/webp'].includes(decoded.file.type);
  if (!needsNormalization) return decoded;

  const output = outputSizeForCrop({
    x: 0,
    y: 0,
    width: decoded.originalWidth,
    height: decoded.originalHeight,
  });
  try {
    const rendered = await renderCroppedFile(
      decoded.originalUrl,
      { x: 0, y: 0, width: decoded.originalWidth, height: decoded.originalHeight },
      output,
      decoded.originalFile.name,
      decoded.originalFile.type,
    );
    return { ...decoded, ...rendered };
  } catch (error) {
    if (decoded.originalUrl.startsWith('blob:')) URL.revokeObjectURL(decoded.originalUrl);
    throw error;
  }
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
  const [validationActive, setValidationActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingImage, setProcessingImage] = useState<'imageA' | 'imageB' | null>(null);
  const [imageStatuses, setImageStatuses] = useState<Partial<Record<'imageA' | 'imageB', string>>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [geometry, setGeometry] = useState<EditorGeometry | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [adjusting, setAdjusting] = useState<'imageA' | 'imageB' | null>(null);
  const [editorView, setEditorView] = useState<'imageA' | 'imageB'>('imageA');

  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);
  const objectUrls = useRef(new Set<string>());
  const submitInFlight = useRef(false);

  // Toast auto-dismiss; timer cleared on unmount (no leak).
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    };
  }, []);

  const showToast = (kind: ToastState['kind'], message: string): void => {
    setToast({ kind, message });
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  const currentFormValues = (overrides: Partial<WorkshopFormValues> = {}): WorkshopFormValues => ({
    mode,
    title,
    description,
    authorName,
    imageAName: processingImage === 'imageA' ? null : imageA?.file.name ?? null,
    imageBName: processingImage === 'imageB' ? null : imageB?.file.name ?? null,
    differences,
    ...overrides,
  });

  const setFieldError = (field: WorkshopErrorField, message: string | undefined): void => {
    setErrors((prev) => {
      if (prev[field] === message) return prev;
      const next = { ...prev };
      if (message === undefined) delete next[field];
      else next[field] = message;
      return next;
    });
  };

  /** Revalidate a text error while typing; first-time errors appear on blur. */
  const updateField = (
    field: 'title' | 'description' | 'authorName',
    value: string,
    setter: (value: string) => void,
  ): void => {
    setter(value);
    if (validationActive || errors[field] !== undefined) {
      setFieldError(field, validateWorkshopForm(currentFormValues({ [field]: value }))[field]);
    }
  };

  const validateTextField = (field: 'title' | 'description' | 'authorName'): void => {
    setFieldError(field, validateWorkshopForm(currentFormValues())[field]);
  };

  // Once submit has been attempted, every edit keeps all inline errors and the
  // nearby summary synchronized without requiring another button press.
  useEffect(() => {
    if (!validationActive) return;
    setErrors(validateWorkshopForm(currentFormValues()));
  }, [validationActive, mode, title, description, authorName, imageA, imageB, differences, processingImage]);

  const applyImage = (which: 'imageA' | 'imageB', value: ImageFile | null, error: string | null): void => {
    if (error !== null) {
      setErrors((prev) => ({ ...prev, [which]: error }));
      showToast('error', error);
      return;
    }
    if (which === 'imageA') {
      if (imageA !== null && imageA.originalUrl !== value?.originalUrl && imageA.originalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageA.originalUrl);
        objectUrls.current.delete(imageA.originalUrl);
      }
      setImageA(value);
      // A new base image invalidates previously authored native coords.
      if (value !== null) {
        setDifferences([]);
        setSelectedIndex(null);
      }
    } else {
      if (imageB !== null && imageB.originalUrl !== value?.originalUrl && imageB.originalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageB.originalUrl);
        objectUrls.current.delete(imageB.originalUrl);
      }
      setImageB(value);
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[which];
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
    const currentPoints = differences.length;
    if (
      which === 'imageA'
      && currentPoints > 0
      && !window.confirm(`更换图片将清除当前 ${currentPoints} 个标记区域，是否继续？`)
    ) return;

    setProcessingImage(which);
    readImageFile(file)
      .then((value) => {
        if (value.originalUrl.startsWith('blob:')) objectUrls.current.add(value.originalUrl);
        applyImage(which, value, null);
        const optimized = value.file.name !== file.name
          || value.file.type !== file.type
          || value.file.size !== file.size;
        setImageStatuses((prev) => ({ ...prev, [which]: imageStatus(value, optimized) }));
        setAdjusting(which);
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error && reason.message.includes('HEIC')
          ? reason.message
          : '图片处理失败，请重试';
        applyImage(which, null, message);
      })
      .finally(() => setProcessingImage(null));
  };

  /** Same measurement pattern as ImagePanel — live box + contain transform.
      NOTE: only the SCROLL-INVARIANT parts (transform, natural dims) live in
      state; the element rect is read FRESH from the overlay at each pointer
      event, because page scroll changes rect.top/left without firing
      ResizeObserver (a stale rect would corrupt tap→native math).
      The stored transform can ALSO be skewed if measured mid-entrance-animation
      (transform-only pop, no ResizeObserver refire) — corrected by
      onAnimationEnd, and tap math recomputes it fresh regardless (task 27b). */
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

  /** Live overlay box (full rect) read at each pointer event. The stored
      geometry.transform may be stale (entrance-animation skew), so tap math
      recomputes the contain transform fresh from this rect (task 27b). */
  const currentRect = (): MeasuredRect | null => {
    const overlay = overlayRef.current;
    if (overlay === null) return null;
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
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
    if (next.length === 0) {
      setFieldError('differences', '请至少添加一个差异区域（点击或拖动画出）');
    }
  };

  const handleOverlayPointerDown = (event: PointerEvent): void => {
    const rect = currentRect();
    if (geometry === null || rect === null) return;
    event.preventDefault();
    overlayRef.current?.setPointerCapture(event.pointerId);
    const native = tapToNativeCoords(
      event.clientX,
      event.clientY,
      rect,
      geometry.naturalW,
      geometry.naturalH,
    );
    if (native === null) return;
    const startNative = clampNative(native, geometry.naturalW, geometry.naturalH);
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
    const native = tapToNativeCoords(
      event.clientX,
      event.clientY,
      rect,
      geometry.naturalW,
      geometry.naturalH,
    );
    setDrag((prev) => {
      if (prev === null || prev.pointerId !== event.pointerId) return prev;
      if (native === null) return prev;
      const moved =
        Math.hypot(event.clientX - prev.startClient.x, event.clientY - prev.startClient.y) >=
        DRAG_THRESHOLD_PX;
      if (!moved) return prev;
      return {
        ...prev,
        currentNative: clampNative(native, geometry.naturalW, geometry.naturalH),
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

  const focusFirstError = (validation: WorkshopFormErrors): void => {
    const field = firstWorkshopErrorField(validation);
    if (field === null) return;
    const targetIds: Record<WorkshopErrorField, string> = {
      title: 'workshop-title',
      description: 'workshop-desc',
      authorName: 'workshop-author',
      imageA: 'workshop-image-a-field',
      imageB: 'workshop-image-b-field',
      differences: 'workshop-differences-field',
    };
    const target = document.getElementById(targetIds[field]);
    if (!(target instanceof HTMLElement)) return;
    // Focus synchronously while the iOS tap gesture is still active, then
    // scroll after Preact has painted the new inline error.
    target.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
  };

  const handleSubmit = (event: JSX.TargetedEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitInFlight.current) return;
    const values = currentFormValues();
    const validation = validateWorkshopForm(values);
    if (processingImage !== null) validation[processingImage] = '图片正在处理，请稍候';
    setValidationActive(true);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      const completion = workshopCompletion(values);
      const incompleteGroups = Object.values(completion).filter((complete) => !complete).length;
      showToast('error', `还有 ${incompleteGroups} 组内容未完成，请查看标红内容`);
      focusFirstError(validation);
      return; // inline errors, NO API call
    }

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

    submitInFlight.current = true;
    setSubmitting(true);
    submitWorkshopQuestion(formData)
      .then(({ id }) => showToast('success', `投稿成功！题目 ID：${id}`))
      .catch((err: unknown) => {
        console.error('投稿失败:', err);
        showToast('error', friendlyErrorMessage(err, '上传失败，请重试'));
      })
      .finally(() => {
        submitInFlight.current = false;
        setSubmitting(false);
      });
  };

  const selected = selectedIndex !== null ? differences[selectedIndex] : undefined;
  const activeImageA = imageA !== null;
  const formValues = currentFormValues();
  const completion = workshopCompletion(formValues);
  const incompleteGroups = Object.values(completion).filter((complete) => !complete).length;
  const errorCount = Object.keys(errors).length;

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
                  onClick={() => {
                    setMode(opt.mode);
                    setEditorView('imageA');
                    if (opt.mode === 'find_area') setFieldError('imageB', undefined);
                  }}
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
              题目标题 <span className="field__required">必填</span>
            </label>
            <input
              id="workshop-title"
              className="field__input"
              type="text"
              maxLength={200}
              placeholder="例如：找出图片中的 5 处不同"
              value={title}
              required
              aria-required="true"
              aria-invalid={errors.title !== undefined}
              aria-describedby={errors.title === undefined ? undefined : 'workshop-title-error'}
              onInput={(e) => updateField('title', e.currentTarget.value, setTitle)}
              onBlur={() => validateTextField('title')}
            />
            {errors.title !== undefined && (
              <p id="workshop-title-error" role="alert" className="field__error">
                {errors.title}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="workshop-desc">
              题目描述 <span className="field__required">必填</span>
            </label>
            <textarea
              id="workshop-desc"
              className="field__textarea"
              rows={2}
              maxLength={200}
              placeholder="给玩家的提示语，例如：找出两张图中的不同之处"
              value={description}
              required
              aria-required="true"
              aria-invalid={errors.description !== undefined}
              aria-describedby={errors.description === undefined ? undefined : 'workshop-desc-error'}
              onInput={(e) => updateField('description', e.currentTarget.value, setDescription)}
              onBlur={() => validateTextField('description')}
            />
            {errors.description !== undefined && (
              <p id="workshop-desc-error" role="alert" className="field__error">
                {errors.description}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="workshop-author">
              昵称 <span className="field__required">必填</span>
            </label>
            <input
              id="workshop-author"
              className="field__input"
              type="text"
              maxLength={20}
              placeholder="2-20 个字符"
              value={authorName}
              required
              aria-required="true"
              aria-invalid={errors.authorName !== undefined}
              aria-describedby={errors.authorName === undefined ? undefined : 'workshop-author-error'}
              onInput={(e) => updateField('authorName', e.currentTarget.value, setAuthorName)}
              onBlur={() => validateTextField('authorName')}
            />
            {errors.authorName !== undefined && (
              <p id="workshop-author-error" role="alert" className="field__error">
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

        {/* Image uploads — local conversion/compression + preview */}
        <section className="card workshop-uploads" aria-label="图片上传">
          <h2 className="menu__heading">图片</h2>
          <p id="workshop-image-rules" className="workshop-hint">
            支持 JPEG、PNG、WebP 和 iPhone HEIC；大图会自动转换并压缩至 5MB 内（原图最大 40MB）。
          </p>

          <div id="workshop-image-a-field" className="field workshop-error-target" tabIndex={-1}>
            <span className="field__label">
              图片 A（基准图） <span className="field__required">必填</span>
            </span>
            <label htmlFor="workshop-image-a" className="btn btn--secondary workshop-upload__trigger">
              <input
                id="workshop-image-a"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                className="workshop-upload__input"
                required
                aria-required="true"
                aria-invalid={errors.imageA !== undefined}
                aria-describedby={`workshop-image-rules${errors.imageA === undefined ? '' : ' workshop-image-a-error'}`}
                disabled={processingImage !== null}
                onChange={handleImageChange('imageA')}
              />
              <span>
                {processingImage === 'imageA'
                  ? '正在处理图片 A…'
                  : imageA === null ? '选择图片 A' : '重新选择图片 A'}
              </span>
            </label>
            {errors.imageA !== undefined && (
              <p id="workshop-image-a-error" role="alert" className="field__error">
                {errors.imageA}
              </p>
            )}
            {imageStatuses.imageA !== undefined && (
              <p className="workshop-upload__status">✓ {imageStatuses.imageA}</p>
            )}
            {imageA !== null && (
              <div className="workshop-image-actions">
                <button type="button" className="btn btn--ghost" onClick={() => {
                  if (differences.length === 0 || window.confirm(`重新裁切将清除当前 ${differences.length} 个标记区域，是否继续？`)) setAdjusting('imageA');
                }}>重新裁切</button>
                {mode === 'spot_diff' && imageB !== null && <button type="button" className="btn btn--ghost" onClick={() => setAdjusting('imageB')}>校准图片 B</button>}
              </div>
            )}
          </div>

          {mode === 'spot_diff' && (
            <div id="workshop-image-b-field" className="field workshop-error-target" tabIndex={-1}>
              <span className="field__label">
                图片 B（对照图） <span className="field__required">必填</span>
              </span>
              <label htmlFor="workshop-image-b" className="btn btn--secondary workshop-upload__trigger">
                <input
                  id="workshop-image-b"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  className="workshop-upload__input"
                  required
                  aria-required="true"
                  aria-invalid={errors.imageB !== undefined}
                  aria-describedby={`workshop-image-rules${errors.imageB === undefined ? '' : ' workshop-image-b-error'}`}
                  disabled={processingImage !== null}
                  onChange={handleImageChange('imageB')}
                />
                <span>
                  {processingImage === 'imageB'
                    ? '正在处理图片 B…'
                    : imageB === null ? '选择图片 B' : '重新选择图片 B'}
                </span>
              </label>
              {errors.imageB !== undefined && (
                <p id="workshop-image-b-error" role="alert" className="field__error">
                  {errors.imageB}
                </p>
              )}
              {imageStatuses.imageB !== undefined && (
                <p className="workshop-upload__status">✓ {imageStatuses.imageB}</p>
              )}
              {imageB !== null && (
                <div className="workshop-upload__preview">
                  <img src={imageB.dataUrl} alt="图片 B 预览" draggable={false} />
                  <button type="button" className="btn btn--ghost workshop-upload__adjust" onClick={() => setAdjusting('imageB')}>裁切与校准</button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Differences editor — tap circle / drag rect over the live preview */}
        {activeImageA && (
          <section
            id="workshop-differences-field"
            className="card workshop-editor"
            aria-labelledby="workshop-editor-heading"
            aria-invalid={errors.differences !== undefined}
            aria-describedby={errors.differences === undefined ? undefined : 'workshop-differences-error'}
            tabIndex={-1}
            onAnimationEnd={(e) => {
              // The card's own `pop` entry animation (transform-only, scale
              // 0.85→1) skews getBoundingClientRect mid-flight; the img may
              // have loaded inside that window and baked a too-small stored
              // transform (a transform-only change never refires
              // ResizeObserver). Re-sync after the animation settles so the
              // stored transform drives marker rendering correctly. Bubbled
              // marker pops (target !== currentTarget) add nothing — skip.
              if (e.target !== e.currentTarget) return;
              syncGeometry();
            }}
          >
            <h2 id="workshop-editor-heading" className="menu__heading">
              添加差异区域 <span className="field__required">必填</span>
            </h2>
            <p className="workshop-hint">点击图片放置圆形区域 · 按住拖动绘制矩形区域</p>
            {mode === 'spot_diff' && imageB !== null && (
              <div className="source-toggle" role="group" aria-label="编辑画布查看图片">
                <button type="button" className={`source-toggle__option${editorView === 'imageA' ? ' source-toggle--active' : ''}`} aria-pressed={editorView === 'imageA'} onClick={() => setEditorView('imageA')}>图片 A（可标记）</button>
                <button type="button" className={`source-toggle__option${editorView === 'imageB' ? ' source-toggle--active' : ''}`} aria-pressed={editorView === 'imageB'} onClick={() => setEditorView('imageB')}>图片 B（检查）</button>
              </div>
            )}
            {errors.differences !== undefined && (
              <p id="workshop-differences-error" role="alert" className="field__error">
                {errors.differences}
              </p>
            )}

            <div className="workshop-editor__stage">
              <img
                ref={imgRef}
                className="workshop-editor__img"
                src={editorView === 'imageB' && imageB !== null ? imageB.dataUrl : imageA.dataUrl}
                alt={editorView === 'imageB' ? '差异检查对照图' : '差异编辑基准图'}
                draggable={false}
                onLoad={syncGeometry}
              />
              {editorView === 'imageA' && <div
                  ref={overlayRef}
                  className="game-surface workshop-editor__overlay"
                  onPointerDown={handleOverlayPointerDown}
                  onPointerMove={handleOverlayPointerMove}
                  onPointerUp={handleOverlayPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  aria-hidden="true"
                />}
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
                      role="button"
                      tabIndex={0}
                      aria-label={`选择第 ${index + 1} 个差异区域`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); setSelectedIndex(index === selectedIndex ? null : index); }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedIndex(index === selectedIndex ? null : index); }
                      }}
                    >
                      {index === selectedIndex && <button type="button" className="workshop-marker__delete" aria-label={`删除第 ${index + 1} 个差异区域`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeDifference(index); showToast('success', `已删除区域 #${index + 1}`); }}>×</button>}
                    </div>
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

        <section className="card workshop-readiness" aria-labelledby="workshop-readiness-heading">
          <h2 id="workshop-readiness-heading" className="menu__heading">提交前检查</h2>
          <ul className="workshop-readiness__list" aria-live="polite">
            <li className={completion.basicInfo ? 'workshop-readiness__item workshop-readiness__item--complete' : 'workshop-readiness__item'}>
              <span className="workshop-readiness__icon" aria-hidden="true">{completion.basicInfo ? '✓' : '!'}</span>
              <span>
                <strong>基本信息</strong>
                <small>{completion.basicInfo ? '已完成' : '请填写标题、描述和昵称'}</small>
              </span>
            </li>
            <li className={completion.images ? 'workshop-readiness__item workshop-readiness__item--complete' : 'workshop-readiness__item'}>
              <span className="workshop-readiness__icon" aria-hidden="true">{completion.images ? '✓' : '!'}</span>
              <span>
                <strong>所需图片</strong>
                <small>
                  {completion.images
                    ? '已完成'
                    : processingImage !== null
                      ? '图片正在处理'
                      : mode === 'spot_diff' ? '请上传图片 A 和 B' : '请上传图片 A'}
                </small>
              </span>
            </li>
            <li className={completion.differences ? 'workshop-readiness__item workshop-readiness__item--complete' : 'workshop-readiness__item'}>
              <span className="workshop-readiness__icon" aria-hidden="true">{completion.differences ? '✓' : '!'}</span>
              <span>
                <strong>差异区域</strong>
                <small>{completion.differences ? `已添加 ${differences.length} 个区域` : '请至少添加 1 个区域'}</small>
              </span>
            </li>
          </ul>
          {validationActive && errorCount > 0 && (
            <div className="workshop-validation-summary" role="alert">
              还有 {incompleteGroups} 组内容未完成，请根据上方标红提示修正。
            </div>
          )}
        </section>

        <button
          type="submit"
          className="btn btn--primary workshop-form__submit"
          disabled={submitting}
        >
          {submitting ? '提交中…' : '提交投稿'}
        </button>
      </form>

      {toast !== null && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
          className={`toast toast--${toast.kind}`}
        >
          {toast.message}
        </div>
      )}
      {adjusting === 'imageA' && imageA !== null && (
        <ImageAdjustDialog
          image={imageA}
          title="裁切图片 A"
          onCancel={() => setAdjusting(null)}
          onApply={(next) => {
            setImageA(next);
            setImageStatuses((prev) => ({ ...prev, imageA: imageStatus(next, true) }));
            setDifferences([]);
            setSelectedIndex(null);
            setGeometry(null);
            if (mode === 'spot_diff' && imageB !== null) setAdjusting('imageB');
            else setAdjusting(null);
          }}
        />
      )}
      {adjusting === 'imageB' && imageB !== null && imageA !== null && (
        <ImageAdjustDialog
          image={imageB}
          reference={imageA}
          fixedOutput={{ width: imageA.width, height: imageA.height }}
          title="裁切与校准图片 B"
          onCancel={() => setAdjusting(null)}
          onApply={(next) => {
            setImageB(next);
            setImageStatuses((prev) => ({ ...prev, imageB: imageStatus(next, true) }));
            setEditorView('imageA');
            setAdjusting(null);
          }}
        />
      )}
    </main>
  );
}
