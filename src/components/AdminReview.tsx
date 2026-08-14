import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Question, QuestionMode } from '@shared/types';
import {
  fetchAdminImage,
  fetchPendingSubmissions,
  isForbiddenError,
  resolveImageUrl,
  reviewSubmission,
  type ReviewDecision,
} from '@/lib/api';

/**
 * Admin review page (todo 22) — the optional moderation mode, only exercised
 * when AUTO_APPROVE_WORKSHOP=false. Entry is the 3s long-press on the Menu
 * title (App-level), then a key gate. The key lives in sessionStorage ONLY —
 * never the URL, never localStorage. Pending thumbnails are quarantined at
 * serve time, so they MUST be fetched with the X-Admin-Key header and shown
 * via object URLs (`<img>` cannot send headers; ?key= params would leak).
 */

const ADMIN_KEY_STORAGE = 'h5-spot-diff.adminKey';

type AdminPhase =
  | { kind: 'gate'; error: string | null; retryKey: string | null }
  | { kind: 'loading' }
  | {
      kind: 'list';
      key: string;
      items: Question[];
      nextCursor: string | null;
      banner: string | null;
      loadingMore: boolean;
    };

/** Pure helpers (exported for unit tests, no DOM needed). */
export function modeLabel(mode: QuestionMode): string {
  return mode === 'spot_diff' ? '找不同' : '区域识别';
}

/**
 * SQLite datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" — parse it as
 * UTC and render in the admin's local timezone. ISO strings parse as-is.
 */
export function formatCreatedAt(raw: string): string {
  const trimmed = raw.trim();
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/.test(trimmed);
  const iso = hasZone ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export interface AdminReviewProps {
  onBack: () => void;
}

export function AdminReview({ onBack }: AdminReviewProps) {
  const [keyInput, setKeyInput] = useState('');
  const [phase, setPhase] = useState<AdminPhase>(() =>
    sessionStorage.getItem(ADMIN_KEY_STORAGE) === null
      ? { kind: 'gate', error: null, retryKey: null }
      : { kind: 'loading' },
  );

  const loadFirstPage = (key: string): void => {
    setPhase({ kind: 'loading' });
    fetchPendingSubmissions(key)
      .then((page) => {
        sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
        setPhase({
          kind: 'list',
          key,
          items: page.items,
          nextCursor: page.nextCursor,
          banner: null,
          loadingMore: false,
        });
      })
      .catch((err: unknown) => {
        if (isForbiddenError(err)) {
          sessionStorage.removeItem(ADMIN_KEY_STORAGE);
          setPhase({ kind: 'gate', error: '无权限', retryKey: null });
        } else {
          setPhase({
            kind: 'gate',
            error: err instanceof Error ? err.message : '加载失败，请重试',
            retryKey: key,
          });
        }
      });
  };

  // Auto-try a key restored from sessionStorage on a fresh visit.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    const stored = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (stored !== null) loadFirstPage(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only intent
  }, []);

  const handleGateSubmit = (e: JSX.TargetedEvent<HTMLFormElement, Event>): void => {
    e.preventDefault();
    const key = keyInput.trim();
    if (key.length === 0) return;
    loadFirstPage(key);
  };

  const handleLoadMore = (): void => {
    if (phase.kind !== 'list' || phase.nextCursor === null || phase.loadingMore) return;
    setPhase({ ...phase, loadingMore: true });
    fetchPendingSubmissions(phase.key, phase.nextCursor)
      .then((page) => {
        setPhase((prev) =>
          prev.kind === 'list'
            ? {
                ...prev,
                items: [...prev.items, ...page.items],
                nextCursor: page.nextCursor,
                loadingMore: false,
                banner: null,
              }
            : prev,
        );
      })
      .catch((err: unknown) => {
        setPhase((prev) =>
          prev.kind === 'list'
            ? {
                ...prev,
                loadingMore: false,
                banner: err instanceof Error ? err.message : '加载失败，请重试',
              }
            : prev,
        );
      });
  };

  const handleReviewed = (id: string): void => {
    setPhase((prev) =>
      prev.kind === 'list' ? { ...prev, items: prev.items.filter((q) => q.id !== id) } : prev,
    );
  };

  const retryKey = phase.kind === 'gate' ? phase.retryKey : null;

  return (
    <main className="screen admin-screen">
      <header className="admin-screen__header">
        <button type="button" className="btn btn--ghost admin-screen__back" onClick={onBack}>
          返回
        </button>
        <h1 className="admin-screen__title">题目审核</h1>
      </header>

      {phase.kind === 'gate' && (
        <form className="admin-gate" onSubmit={handleGateSubmit}>
          <label className="field__label" htmlFor="admin-key">
            管理员密钥
          </label>
          <div className="admin-key-row">
            <input
              id="admin-key"
              className="field__input admin-key-input"
              type="password"
              value={keyInput}
              placeholder="请输入管理员密钥"
              autoComplete="off"
              onInput={(e) => setKeyInput(e.currentTarget.value)}
            />
            <button
              type="submit"
              className="btn btn--primary admin-key-submit"
              disabled={keyInput.trim().length === 0}
            >
              登录
            </button>
          </div>
          {phase.error !== null && (
            <p role="alert" className="admin-gate__error">
              {phase.error}
            </p>
          )}
          {retryKey !== null && (
            <button
              type="button"
              className="btn btn--ghost admin-gate__retry"
              onClick={() => loadFirstPage(retryKey)}
            >
              重试
            </button>
          )}
        </form>
      )}

      {phase.kind === 'loading' && <p className="admin-status">加载中…</p>}

      {phase.kind === 'list' && (
        <>
          {phase.items.length === 0 ? (
            <p className="admin-status">暂无待审核题目</p>
          ) : (
            <ul className="admin-list">
              {phase.items.map((q) => (
                <li key={q.id} className="admin-list__item">
                  <PendingCard question={q} adminKey={phase.key} onReviewed={handleReviewed} />
                </li>
              ))}
            </ul>
          )}
          {phase.banner !== null && (
            <p role="alert" className="admin-banner">
              {phase.banner}
            </p>
          )}
          {phase.nextCursor !== null && (
            <button
              type="button"
              className="btn btn--ghost admin-load-more"
              disabled={phase.loadingMore}
              onClick={handleLoadMore}
            >
              {phase.loadingMore ? '加载中…' : '加载更多'}
            </button>
          )}
        </>
      )}
    </main>
  );
}

interface PendingCardProps {
  question: Question;
  adminKey: string;
  onReviewed: (id: string) => void;
}

/** One pending submission row: quarantined thumbnail + review actions. */
function PendingCard({ question, adminKey, onReviewed }: PendingCardProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // External placeholders can be <img src> directly; R2 keys need the blob
  // path (fetchAdminImage carries X-Admin-Key — <img> cannot send headers).
  const directUrl = question.imageA.startsWith('http') ? resolveImageUrl(question.imageA) : null;

  useEffect(() => {
    if (directUrl !== null) return;
    let cancelled = false;
    let url: string | null = null;
    setThumbFailed(false);
    fetchAdminImage(question.imageA, adminKey)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setThumbFailed(true);
      });
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [question.id, question.imageA, adminKey, directUrl]);

  const review = (status: ReviewDecision): void => {
    if (reviewing) return;
    const action = status === 'approved' ? '通过' : '驳回';
    if (!window.confirm(`确定${action}「${question.title}」吗？`)) return;
    setReviewing(true);
    setActionError(null);
    reviewSubmission(question.id, status, adminKey)
      .then(() => onReviewed(question.id))
      .catch((err: unknown) => {
        setReviewing(false);
        setActionError(err instanceof Error ? err.message : '操作失败，请重试');
      });
  };

  const src = directUrl ?? blobUrl;
  const thumbReady = src !== null && !thumbFailed;

  return (
    <article className="admin-card">
      {thumbReady ? (
        <img
          className="admin-thumb"
          src={src ?? undefined}
          alt={question.title}
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <div
          className={`admin-thumb admin-thumb--placeholder${
            thumbFailed ? ' admin-thumb--error' : ' admin-thumb--loading'
          }`}
          role="img"
          aria-label={thumbFailed ? '图片加载失败' : '图片加载中'}
        >
          {thumbFailed ? '图片加载失败' : '加载中…'}
        </div>
      )}
      <h3 className="admin-card__title">{question.title}</h3>
      <p className="admin-card__meta">
        作者：{question.authorName ?? '匿名'} · {modeLabel(question.mode)} ·{' '}
        {question.differences.length} 处差异
      </p>
      <p className="admin-card__meta admin-card__time">提交于 {formatCreatedAt(question.createdAt)}</p>
      <div className="admin-actions">
        <button
          type="button"
          className="btn btn--primary admin-actions__approve"
          disabled={!thumbReady || reviewing}
          onClick={() => review('approved')}
        >
          通过
        </button>
        <button
          type="button"
          className="btn btn--danger admin-actions__reject"
          disabled={reviewing}
          onClick={() => review('rejected')}
        >
          驳回
        </button>
      </div>
      {actionError !== null && (
        <p role="alert" className="admin-card__error">
          {actionError}
        </p>
      )}
    </article>
  );
}
