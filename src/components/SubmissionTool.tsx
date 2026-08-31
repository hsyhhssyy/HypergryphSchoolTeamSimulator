import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { strToU8, zip } from 'fflate';
import type { Difference, QuestionMode } from '@shared/types';
import { ImageAdjustDialog, type AdjustableImage } from '@/components/ImageAdjustDialog';
import { differenceMarkerStyle } from '@/components/ImagePanel';
import {
  computeContainTransform,
  toNativeCoords,
  type ContainTransform,
  type Point,
} from '@/utils/hitDetection';
import {
  MAX_PROCESSED_IMAGE_BYTES,
  outputSizeForCrop,
  renderCroppedFile,
  renderRotatedFile,
} from '@/utils/imageProcessing';

const ISSUE_URL = 'https://github.com/hsyhhssyy/HypergryphSchoolTeamSimulator/issues/new?template=question-submission.yml';
const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024;
const DRAG_THRESHOLD_PX = 10;
const DEFAULT_REGION_SIZE = 100;

type ImageSlot = 'imageA' | 'imageB';

export interface SubmissionDraft {
  key: string;
  mode: QuestionMode;
  title: string;
  description: string;
  showCount: boolean;
  imageA: AdjustableImage | null;
  imageB: AdjustableImage | null;
  differences: Difference[];
}

export interface DraftErrors {
  title?: string;
  description?: string;
  imageA?: string;
  imageB?: string;
  differences?: string;
}

interface EditorGeometry {
  transform: ContainTransform;
  naturalW: number;
  naturalH: number;
}

interface DragState {
  pointerId: number;
  startClient: Point;
  startNative: Point;
  moved: boolean;
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
  pointerId: number;
  index: number;
  anchor: Point;
}

interface AdjustingTarget {
  draftKey: string;
  slot: ImageSlot;
}

const uid = (): string => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function createSubmissionDraft(): SubmissionDraft {
  return {
    key: uid(),
    mode: 'spot_diff',
    title: '',
    description: '',
    showCount: true,
    imageA: null,
    imageB: null,
    differences: [],
  };
}

export function validateSubmissionDraft(draft: SubmissionDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.title.trim().length === 0) errors.title = '请输入题目标题';
  else if (draft.title.trim().length > 200) errors.title = '标题不能超过 200 字';
  if (draft.description.trim().length === 0) errors.description = '请输入给玩家的题目说明';
  else if (draft.description.trim().length > 200) errors.description = '说明不能超过 200 字';
  if (draft.imageA === null) errors.imageA = '请上传图片 A';
  if (draft.mode === 'spot_diff' && draft.imageB === null) errors.imageB = '找不同需要图片 B';
  else if (draft.mode === 'spot_diff' && draft.imageA !== null && draft.imageB !== null && (draft.imageA.width !== draft.imageB.width || draft.imageA.height !== draft.imageB.height)) {
    errors.imageB = '图片 B 尺寸需与图片 A 一致，请使用“裁切与校准”';
  }
  if (draft.differences.length === 0) errors.differences = '请至少创建一个答案选区';
  return errors;
}

export function normalizeRect(a: Point, b: Point): Extract<Difference, { type: 'rect' }> {
  return {
    type: 'rect',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(1, Math.abs(a.x - b.x)),
    height: Math.max(1, Math.abs(a.y - b.y)),
  };
}

export function centeredRect(
  center: Point,
  imageWidth: number,
  imageHeight: number,
  size = DEFAULT_REGION_SIZE,
): Extract<Difference, { type: 'rect' }> {
  const width = Math.min(size, imageWidth);
  const height = Math.min(size, imageHeight);
  return {
    type: 'rect',
    x: round1(Math.min(imageWidth - width, Math.max(0, center.x - width / 2))),
    y: round1(Math.min(imageHeight - height, Math.max(0, center.y - height / 2))),
    width: round1(width),
    height: round1(height),
  };
}

function extension(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function safeStem(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'question';
}

export async function buildSubmissionZip(drafts: readonly SubmissionDraft[], authorName: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const questions = [];

  for (const [index, draft] of drafts.entries()) {
    if (draft.imageA === null) continue;
    const prefix = `${String(index + 1).padStart(2, '0')}-${safeStem(draft.title)}`;
    const imageAName = `${prefix}-a.${extension(draft.imageA.file)}`;
    files[`questions/${imageAName}`] = new Uint8Array(await draft.imageA.file.arrayBuffer());
    let imageBPath: string | undefined;
    if (draft.mode === 'spot_diff' && draft.imageB !== null) {
      const imageBName = `${prefix}-b.${extension(draft.imageB.file)}`;
      files[`questions/${imageBName}`] = new Uint8Array(await draft.imageB.file.arrayBuffer());
      imageBPath = `questions/${imageBName}`;
    }
    questions.push({
      id: `submission-${stamp}-${String(index + 1).padStart(2, '0')}`,
      mode: draft.mode,
      title: draft.title.trim(),
      description: draft.description.trim(),
      imageA: `questions/${imageAName}`,
      ...(imageBPath === undefined ? {} : { imageB: imageBPath }),
      differences: draft.differences,
      showCount: draft.showCount,
      source: 'official',
      status: 'approved',
      likes: 0,
      dislikes: 0,
      createdAt: new Date().toISOString(),
    });
  }

  files['submission.json'] = strToU8(JSON.stringify({ formatVersion: 1, authorName: authorName.trim(), questions }, null, 2));
  files['README.txt'] = strToU8('鹰角网络校队题目投稿包\n\n请将此 ZIP 上传到题目投稿 GitHub Issue。\nsubmission.json 包含题目和答案坐标；questions/ 包含已处理的图片。\n');
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => error === null ? resolve(data) : reject(error));
  });
}

function validateImage(file: File): string | null {
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return '原图不能超过 40MB';
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    return '仅支持 JPEG、PNG、WebP 或 HEIC 图片';
  }
  return null;
}

async function loadImage(file: File): Promise<AdjustableImage> {
  let source = file;
  const heic = /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (heic) {
    const { heicTo } = await import('heic-to/csp');
    const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
    source = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  }
  const originalUrl = URL.createObjectURL(source);
  const image = new Image();
  image.src = originalUrl;
  await image.decode();
  const base: AdjustableImage = {
    originalFile: source,
    originalUrl,
    file: source,
    dataUrl: originalUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
  };
  if (source.size < MAX_PROCESSED_IMAGE_BYTES && Math.max(image.naturalWidth, image.naturalHeight) <= 1920) return base;
  const rect = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const rendered = await renderCroppedFile(originalUrl, rect, outputSizeForCrop(rect), source.name, source.type);
  return { ...base, ...rendered };
}

function round1(value: number): number { return Math.round(value * 10) / 10; }
function clampPoint(point: Point, width: number, height: number): Point {
  return { x: Math.min(width, Math.max(0, point.x)), y: Math.min(height, Math.max(0, point.y)) };
}
function differenceText(value: Difference): string {
  return value.type === 'circle'
    ? `圆形 · (${value.x}, ${value.y}) · 半径 ${value.radius}`
    : `矩形 · (${value.x}, ${value.y}) · ${value.width}×${value.height}`;
}
export interface SubmissionToolProps { onBack: () => void }

export function SubmissionTool({ onBack }: SubmissionToolProps): JSX.Element {
  const [drafts, setDrafts] = useState<SubmissionDraft[]>([createSubmissionDraft()]);
  const [activeKey, setActiveKey] = useState(drafts[0]!.key);
  const [authorName, setAuthorName] = useState('');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editorView, setEditorView] = useState<ImageSlot>('imageA');
  const [geometry, setGeometry] = useState<EditorGeometry | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [processing, setProcessing] = useState<AdjustingTarget | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustingTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const objectUrls = useRef(new Set<string>());

  const active = drafts.find((draft) => draft.key === activeKey) ?? drafts[0]!;
  const activeNumber = drafts.findIndex((draft) => draft.key === active.key) + 1;
  const completedCount = drafts.filter((draft) => Object.keys(validateSubmissionDraft(draft)).length === 0).length;

  const updateDraft = (key: string, update: (draft: SubmissionDraft) => SubmissionDraft): void => {
    setDrafts((current) => current.map((draft) => draft.key === key ? update(draft) : draft));
  };
  const updateActive = (patch: Partial<SubmissionDraft>): void => updateDraft(active.key, (draft) => ({ ...draft, ...patch }));
  const clearError = (field: keyof DraftErrors): void => setErrors((current) => {
    const next = { ...current };
    delete next[field];
    return next;
  });

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    setErrors({});
    setSelectedIndex(null);
    setEditorView('imageA');
    setGeometry(null);
    setDrag(null);
    setResize(null);
  }, [activeKey]);

  const syncGeometry = (): void => {
    const image = imageRef.current;
    if (image === null || image.naturalWidth === 0) return;
    const rect = image.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setGeometry({
      naturalW: image.naturalWidth,
      naturalH: image.naturalHeight,
      transform: computeContainTransform(image.naturalWidth, image.naturalHeight, rect.width, rect.height),
    });
  };

  useEffect(() => {
    const image = imageRef.current;
    if (image === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncGeometry);
    observer.observe(image);
    return () => observer.disconnect();
  }, [active.key, active.imageA, active.imageB, editorView]);

  const chooseImage = (slot: ImageSlot) => async (event: JSX.TargetedEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    const validation = validateImage(file);
    if (validation !== null) { setErrors((value) => ({ ...value, [slot]: validation })); return; }
    if (slot === 'imageA' && active.differences.length > 0 && !confirm('更换图片 A 会清除当前题目的答案选区，是否继续？')) return;
    const target = { draftKey: active.key, slot };
    setProcessing(target);
    try {
      const image = await loadImage(file);
      objectUrls.current.add(image.originalUrl);
      updateDraft(active.key, (draft) => ({
        ...draft,
        [slot]: image,
        ...(slot === 'imageA' ? { differences: [] } : {}),
      }));
      setErrors((value) => ({ ...value, [slot]: undefined }));
      setAdjusting(target);
    } catch (reason) {
      console.error('图片处理失败:', reason);
      setErrors((value) => ({ ...value, [slot]: '图片读取或处理失败，请换一张图片重试' }));
    } finally {
      setProcessing(null);
    }
  };

  const rotateImage = async (slot: ImageSlot, direction: -1 | 1): Promise<void> => {
    const current = active[slot];
    if (current === null || processing !== null) return;
    const target = { draftKey: active.key, slot };
    setProcessing(target);
    try {
      const rendered = await renderRotatedFile(current.dataUrl, current.file.name, current.file.type, direction);
      const rotated: AdjustableImage = {
        originalFile: rendered.file,
        originalUrl: rendered.dataUrl,
        file: rendered.file,
        dataUrl: rendered.dataUrl,
        width: rendered.width,
        height: rendered.height,
        originalWidth: rendered.width,
        originalHeight: rendered.height,
      };
      updateDraft(active.key, (draft) => ({ ...draft, [slot]: rotated, ...(slot === 'imageA' ? { differences: [] } : {}) }));
      setGeometry(null);
      setSelectedIndex(null);
    } catch (reason) {
      console.error('图片旋转失败:', reason);
      setToast('图片旋转失败，请重试');
    } finally { setProcessing(null); }
  };

  const addDraft = (): void => {
    const draft = createSubmissionDraft();
    setDrafts((current) => [...current, draft]);
    setActiveKey(draft.key);
    setToast(`已添加第 ${drafts.length + 1} 题`);
  };
  const duplicateDraft = (): void => {
    const draft = { ...active, key: uid(), title: active.title ? `${active.title}（副本）` : '', differences: active.differences.map((item) => ({ ...item })) };
    setDrafts((current) => [...current, draft]);
    setActiveKey(draft.key);
  };
  const deleteDraft = (): void => {
    if (drafts.length === 1) return;
    const index = drafts.findIndex((draft) => draft.key === active.key);
    const next = drafts.filter((draft) => draft.key !== active.key);
    setDrafts(next);
    setActiveKey(next[Math.min(index, next.length - 1)]!.key);
  };

  const addDifference = (difference: Difference): void => {
    const next = [...active.differences, difference];
    updateActive({ differences: next });
    setSelectedIndex(next.length - 1);
    clearError('differences');
  };

  const currentNativePoint = (event: PointerEvent): Point | null => {
    const overlay = overlayRef.current;
    if (overlay === null || geometry === null) return null;
    const rect = overlay.getBoundingClientRect();
    const point = toNativeCoords(event.clientX, event.clientY, rect, computeContainTransform(geometry.naturalW, geometry.naturalH, rect.width, rect.height));
    return clampPoint(point, geometry.naturalW, geometry.naturalH);
  };
  const pointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const point = currentNativePoint(event);
    if (point === null) return;
    setDrag({ pointerId: event.pointerId, startClient: { x: event.clientX, y: event.clientY }, startNative: point, moved: false });
  };
  const pointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) >= DRAG_THRESHOLD_PX) setDrag({ ...drag, moved: true });
  };
  const pointerUp = (event: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    setDrag(null);
    if (!finished.moved && geometry !== null) addDifference(centeredRect(finished.startNative, geometry.naturalW, geometry.naturalH));
  };

  const startResize = (index: number, corner: ResizeCorner) => (event: JSX.TargetedPointerEvent<HTMLButtonElement>): void => {
    const difference = active.differences[index];
    if (difference?.type !== 'rect') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const anchor = {
      x: corner.includes('w') ? difference.x + difference.width : difference.x,
      y: corner.includes('n') ? difference.y + difference.height : difference.y,
    };
    setSelectedIndex(index);
    setResize({ pointerId: event.pointerId, index, anchor });
  };
  const moveResize = (event: JSX.TargetedPointerEvent<HTMLButtonElement>): void => {
    if (resize === null || resize.pointerId !== event.pointerId) return;
    const point = currentNativePoint(event);
    if (point === null) return;
    const next = normalizeRect(resize.anchor, point);
    updateActive({ differences: active.differences.map((item, index) => index === resize.index ? {
      ...next,
      x: round1(next.x), y: round1(next.y), width: round1(next.width), height: round1(next.height),
    } : item) });
  };
  const endResize = (event: JSX.TargetedPointerEvent<HTMLButtonElement>): void => {
    if (resize?.pointerId === event.pointerId) setResize(null);
  };
  const deleteDifference = (index: number): void => {
    updateActive({ differences: active.differences.filter((_, itemIndex) => itemIndex !== index) });
    setSelectedIndex(null);
    setResize(null);
  };

  const exportZip = async (): Promise<void> => {
    const authorError = authorName.trim().length < 2 || authorName.trim().length > 20;
    const invalidIndex = drafts.findIndex((draft) => Object.keys(validateSubmissionDraft(draft)).length > 0);
    if (authorError) { setToast('请填写 2–20 个字符的投稿昵称'); return; }
    if (invalidIndex >= 0) {
      const invalid = drafts[invalidIndex]!;
      setActiveKey(invalid.key);
      setErrors(validateSubmissionDraft(invalid));
      setToast(`第 ${invalidIndex + 1} 题还没有完成`);
      return;
    }
    setExporting(true);
    try {
      const bytes = await buildSubmissionZip(drafts, authorName);
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `题目投稿-${new Date().toISOString().slice(0, 10)}-${drafts.length}题.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(`已生成包含 ${drafts.length} 道题目的 ZIP`);
    } finally { setExporting(false); }
  };

  const adjustedDraft = adjusting === null ? null : drafts.find((draft) => draft.key === adjusting.draftKey) ?? null;
  const adjustedImage = adjusting === null || adjustedDraft === null ? null : adjustedDraft[adjusting.slot];
  const previewImage = editorView === 'imageB' && active.imageB !== null ? active.imageB : active.imageA;
  const currentErrors = useMemo(() => validateSubmissionDraft(active), [active]);

  return (
    <main className="submission-tool">
      <header className="submission-tool__header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>← 返回主页</button>
        <div><span className="submission-tool__eyebrow">离线投稿工具</span><h1 className="font-display">题目创作工坊</h1><p>一次制作多道题，最后统一打包成 ZIP。</p></div>
        <a className="btn btn--ghost" href={ISSUE_URL} target="_blank" rel="noreferrer">打开 Issue ↗</a>
      </header>

      <section className="draft-rail" aria-label="题目列表">
        <div className="draft-rail__summary"><strong>{completedCount}/{drafts.length}</strong><span>题已完成</span></div>
        <div className="draft-rail__items">
          {drafts.map((draft, index) => {
            const complete = Object.keys(validateSubmissionDraft(draft)).length === 0;
            return <button type="button" key={draft.key} className={`draft-tab${draft.key === active.key ? ' draft-tab--active' : ''}`} aria-pressed={draft.key === active.key} onClick={() => setActiveKey(draft.key)}><span>{complete ? '✓' : index + 1}</span><small>{draft.title.trim() || `未命名题目 ${index + 1}`}</small></button>;
          })}
        </div>
        <button type="button" className="btn btn--secondary draft-rail__add" onClick={addDraft}>＋ 新增题目</button>
      </section>

      <div className="submission-tool__body">
        <section className="card draft-toolbar">
          <div><span className="chip chip--success">第 {activeNumber} 题</span><strong>{active.title || '未命名题目'}</strong></div>
          <div><button type="button" className="btn btn--ghost" onClick={duplicateDraft}>复制本题</button><button type="button" className="btn btn--danger" disabled={drafts.length === 1} onClick={deleteDraft}>删除本题</button></div>
        </section>

        <section className="card">
          <h2 className="menu__heading">① 题目类型与说明</h2>
          <div className="workshop__modes">
            <button type="button" className={`mode-card${active.mode === 'spot_diff' ? ' mode-card--active' : ''}`} onClick={() => updateActive({ mode: 'spot_diff' })}><span className="mode-card__label">找不同</span><span className="mode-card__desc">上传两张对照图片</span></button>
            <button type="button" className={`mode-card${active.mode === 'find_area' ? ' mode-card--active' : ''}`} onClick={() => { updateActive({ mode: 'find_area' }); setEditorView('imageA'); }}><span className="mode-card__label">区域识别</span><span className="mode-card__desc">在一张图中寻找目标</span></button>
          </div>
          <div className="workshop-fields submission-fields">
            <label className="field"><span className="field__label">题目标题 <i className="field__required">必填</i></span><input className="field__input" maxLength={200} value={active.title} placeholder="例如：找不同：校园午后" onInput={(event) => { updateActive({ title: event.currentTarget.value }); clearError('title'); }} />{errors.title && <small className="field__error">{errors.title}</small>}</label>
            <label className="field"><span className="field__label">玩家说明 <i className="field__required">必填</i></span><textarea className="field__textarea" maxLength={200} value={active.description} placeholder="告诉玩家要寻找什么" onInput={(event) => { updateActive({ description: event.currentTarget.value }); clearError('description'); }} />{errors.description && <small className="field__error">{errors.description}</small>}</label>
            <div className="field"><span className="field__label">游戏内显示答案数量</span><div className="source-toggle"><button type="button" className={`source-toggle__option${active.showCount ? ' source-toggle--active' : ''}`} onClick={() => updateActive({ showCount: true })}>显示</button><button type="button" className={`source-toggle__option${!active.showCount ? ' source-toggle--active' : ''}`} onClick={() => updateActive({ showCount: false })}>隐藏</button></div></div>
          </div>
        </section>

        <section className="card workshop-uploads">
          <h2 className="menu__heading">② 上传与编辑图片</h2>
          <p className="workshop-hint">支持 JPEG、PNG、WebP、HEIC；可裁切、缩放，找不同的图片 B 可叠加校准。</p>
          {(['imageA', ...(active.mode === 'spot_diff' ? ['imageB'] : [])] as ImageSlot[]).map((slot) => {
            const image = active[slot];
            const busy = processing?.draftKey === active.key && processing.slot === slot;
            return <div className="field submission-upload" key={slot}><span className="field__label">图片 {slot === 'imageA' ? 'A（基准图）' : 'B（对照图）'} <i className="field__required">必填</i></span><label className="btn btn--secondary workshop-upload__trigger"><input type="file" className="workshop-upload__input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={processing !== null} onChange={chooseImage(slot)} />{busy ? '处理中…' : image === null ? `选择图片 ${slot === 'imageA' ? 'A' : 'B'}` : '更换图片'}</label>{errors[slot] && <small className="field__error">{errors[slot]}</small>}{image !== null && <div className="submission-upload__preview"><img src={image.dataUrl} alt={`图片 ${slot === 'imageA' ? 'A' : 'B'} 预览`} /><div><b>{image.width} × {image.height}px</b><div className="submission-upload__actions"><button type="button" className="btn btn--ghost" onClick={() => void rotateImage(slot, -1)}>↶ 左转</button><button type="button" className="btn btn--ghost" onClick={() => void rotateImage(slot, 1)}>↷ 右转</button><button type="button" className="btn btn--ghost" onClick={() => setAdjusting({ draftKey: active.key, slot })}>{slot === 'imageB' ? '裁切与校准' : '重新裁切'}</button></div></div></div>}</div>;
          })}
        </section>

        {active.imageA !== null && <section className="card workshop-editor">
          <h2 className="menu__heading">③ 创建答案选区</h2>
          <p className="workshop-hint">轻点图片创建矩形选区；拖动选区四角调整范围，点击 × 删除。直接在图片上滑动可滚动页面。</p>
          {active.mode === 'spot_diff' && active.imageB !== null && <div className="source-toggle"><button type="button" className={`source-toggle__option${editorView === 'imageA' ? ' source-toggle--active' : ''}`} onClick={() => setEditorView('imageA')}>图片 A（编辑）</button><button type="button" className={`source-toggle__option${editorView === 'imageB' ? ' source-toggle--active' : ''}`} onClick={() => setEditorView('imageB')}>图片 B（检查）</button></div>}
          {errors.differences && <small className="field__error">{errors.differences}</small>}
          <div className="workshop-editor__stage">
            <img ref={imageRef} className="workshop-editor__img" src={previewImage?.dataUrl} alt="答案区域编辑图片" draggable={false} onLoad={syncGeometry} />
            {editorView === 'imageA' && <div ref={overlayRef} className="game-surface workshop-editor__overlay" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => setDrag(null)} />}
            {geometry !== null && active.differences.map((difference, index) => {
              const style = differenceMarkerStyle(difference, geometry.transform);
              if (style === null) return null;
              const selected = selectedIndex === index;
              return <div key={index} className={`workshop-marker${selected ? ' workshop-marker--selected' : ''}`} style={style} role="button" tabIndex={0} aria-label={`选择答案区域 ${index + 1}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedIndex(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedIndex(index); }}>
                {selected && <button type="button" className="workshop-marker__delete" aria-label={`删除答案区域 ${index + 1}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); deleteDifference(index); }}>×</button>}
                {selected && difference.type === 'rect' && (['nw', 'ne', 'sw', 'se'] as const).map((corner) => <button type="button" key={corner} className={`workshop-marker__handle workshop-marker__handle--${corner}`} aria-label={`调整答案区域${corner}角`} onPointerDown={startResize(index, corner)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} />)}
              </div>;
            })}
          </div>
          <ul className="workshop-diff-list">{active.differences.map((difference, index) => <li className={`workshop-diff-item${selectedIndex === index ? ' workshop-diff-item--selected' : ''}`} key={index}><button type="button" className="workshop-diff-item__select" onClick={() => setSelectedIndex(index)}><span className="workshop-diff-item__no">#{index + 1}</span><span>{differenceText(difference)}</span></button><button type="button" className="btn btn--danger workshop-diff-item__delete" onClick={() => deleteDifference(index)}>删除</button></li>)}</ul>
        </section>}

        <section className="card submission-export">
          <div><h2 className="menu__heading">④ 统一生成投稿包</h2><p>ZIP 将包含 {drafts.length} 道题目的 JSON、处理后的图片和上传说明。所有处理都在当前浏览器完成。</p></div>
          <label className="field"><span className="field__label">投稿昵称 <i className="field__required">必填</i></span><input className="field__input" maxLength={20} value={authorName} placeholder="2–20 个字符" onInput={(event) => setAuthorName(event.currentTarget.value)} /></label>
          <div className="submission-export__status"><span className={Object.keys(currentErrors).length === 0 ? 'chip chip--success' : 'chip chip--danger'}>当前题目{Object.keys(currentErrors).length === 0 ? '已完成' : `还差 ${Object.keys(currentErrors).length} 项`}</span><span>{completedCount}/{drafts.length} 题可导出</span></div>
          <button type="button" className="btn btn--primary workshop-form__submit" disabled={exporting || processing !== null} onClick={() => void exportZip()}>{exporting ? '正在打包…' : `生成 ${drafts.length} 题 ZIP`}</button>
          <a className="btn btn--ghost workshop-form__submit" href={ISSUE_URL} target="_blank" rel="noreferrer">下一步：前往 Issue 上传 ZIP ↗</a>
        </section>
      </div>

      {toast !== null && <button type="button" className="toast toast--success" onClick={() => setToast(null)}>{toast}</button>}
      {adjusting !== null && adjustedDraft !== null && adjustedImage !== null && <ImageAdjustDialog image={adjustedImage} {...(adjusting.slot === 'imageB' && adjustedDraft.imageA !== null ? { reference: adjustedDraft.imageA, fixedOutput: { width: adjustedDraft.imageA.width, height: adjustedDraft.imageA.height } } : {})} title={adjusting.slot === 'imageA' ? '裁切图片 A' : '裁切并校准图片 B'} onCancel={() => setAdjusting(null)} onApply={(image) => { updateDraft(adjusting.draftKey, (draft) => ({ ...draft, [adjusting.slot]: image, ...(adjusting.slot === 'imageA' ? { differences: [] } : {}) })); setAdjusting(null); setGeometry(null); }} />}
    </main>
  );
}
