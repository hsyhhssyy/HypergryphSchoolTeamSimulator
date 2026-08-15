import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { QuestionMode, QuestionSourceQuery } from '@shared/types';
import type { LongPressHandlers } from '@/hooks/useLongPress';

/**
 * Menu screen (todo 11) — PURELY PRESENTATIONAL.
 *
 * Holds only local UI selection state (chosen mode/source). Everything else —
 * anonymous userId, question fetching, START_GAME dispatch — lives in
 * App.handleStart (App.tsx). This component never fetches and never touches
 * game state.
 */
export interface MenuProps {
  onStart: (mode: QuestionMode, source: QuestionSourceQuery) => void;
  /** Fetch/load failure surfaced from App (todo 24 refines error states). */
  startError?: string | null;
  /** Switch the App-level view to the workshop submission form (todo 20). */
  onOpenWorkshop: () => void;
  /** Long-press gesture handlers for the app title (hidden admin entry). */
  titleLongPress: LongPressHandlers;
}

export interface ModeOption {
  mode: QuestionMode;
  label: string;
  desc: string;
}

/** Shared with WorkshopSubmit (todo 20) — single source for mode labels. */
export const MODE_OPTIONS: ModeOption[] = [
  { mode: 'spot_diff', label: '找不同', desc: '双图对比 · 找出差异' },
  { mode: 'find_area', label: '区域识别', desc: '单图寻物 · 点出位置' },
];

const SOURCE_OPTIONS: { value: QuestionSourceQuery; label: string }[] = [
  { value: 'official', label: '仅官方题目' },
  { value: 'mixed', label: '包含创意工坊' },
];

/** Inline SVG icons (no emoji-as-icon — lucide-style stroke icons). */
function SpotDiffIcon() {
  return (
    <svg
      className="mode-card__icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="6" width="15" height="20" rx="3" />
      <rect x="13" y="6" width="15" height="20" rx="3" />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FindAreaIcon() {
  return (
    <svg
      className="mode-card__icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="9" />
      <path d="M16 3v6M16 23v6M3 16h6M23 16h6" />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MODE_ICONS: Record<QuestionMode, () => JSX.Element> = {
  spot_diff: SpotDiffIcon,
  find_area: FindAreaIcon,
};

export function Menu({ onStart, startError = null, onOpenWorkshop, titleLongPress }: MenuProps) {
  const [mode, setMode] = useState<QuestionMode | null>(null);
  const [source, setSource] = useState<QuestionSourceQuery>('official');

  return (
    <main className="screen menu">
      {/* Todo 5: decorative background stickers — aria-hidden + pointer-events
          none (CSS), so they never intercept the title long-press. */}
      <div className="menu__stickers" aria-hidden="true">
        <span className="menu__sticker menu__sticker--star-1" />
        <span className="menu__sticker menu__sticker--star-2" />
        <span className="menu__sticker menu__sticker--circle-1" />
        <span className="menu__sticker menu__sticker--circle-2" />
        <span className="menu__sticker menu__sticker--dot" />
      </div>

      <header className="menu__hero">
        <h1 className="font-display" {...titleLongPress}>
          <picture>
            <source type="image/webp" srcSet="/wordmark.webp" />
            <img
              className="menu__title-img"
              src="/wordmark.png"
              alt="鹰角网络校队"
              draggable={false}
              decoding="async"
            />
          </picture>
        </h1>
        <p className="text-muted">找不同 · 区域识别 · 答题小游戏</p>
      </header>

      <section className="menu__section" aria-labelledby="menu-mode-heading">
        <h2 id="menu-mode-heading" className="menu__heading">
          选择模式
          {/* Todo 5: hand-drawn squiggle underline — decorative, stroked via
              the --color-accent token in CSS. */}
          <svg
            className="menu__heading-squiggle"
            viewBox="0 0 120 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 8 C 12 4, 28 4, 40 8 C 52 12, 68 12, 80 8 C 92 4, 108 4, 118 6"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </h2>
        <div className="menu__modes">
          {MODE_OPTIONS.map((opt) => {
            const Icon = MODE_ICONS[opt.mode];
            const active = mode === opt.mode;
            return (
              <button
                type="button"
                key={opt.mode}
                className={`mode-card${active ? ' mode-card--active' : ''}`}
                aria-pressed={active}
                onClick={() => setMode(opt.mode)}
              >
                <Icon />
                <span className="mode-card__label">{opt.label}</span>
                <span className="mode-card__desc">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="menu__section" aria-labelledby="menu-source-heading">
        <h2 id="menu-source-heading" className="menu__heading">
          题目来源
          <svg
            className="menu__heading-squiggle"
            viewBox="0 0 120 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 8 C 12 4, 28 4, 40 8 C 52 12, 68 12, 80 8 C 92 4, 108 4, 118 6"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </h2>
        <div className="source-toggle" role="group" aria-label="题目来源">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`source-toggle__option${
                source === opt.value ? ' source-toggle--active' : ''
              }`}
              aria-pressed={source === opt.value}
              onClick={() => setSource(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="btn btn--primary menu__start"
        disabled={mode === null}
        onClick={() => {
          if (mode !== null) onStart(mode, source);
        }}
      >
        {/* Todo 5: decorative sparkle — aria-hidden, tinted via the accent
            token in CSS. */}
        <svg
          className="menu__start-sparkle"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z" />
        </svg>
        开始游戏
      </button>

      <button
        type="button"
        className="btn btn--ghost menu__workshop"
        aria-label="进入创意工坊投稿"
        onClick={onOpenWorkshop}
      >
        <svg
          className="menu__workshop-icon"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
        创意工坊投稿
      </button>

      {startError !== null && (
        <div className="menu__error-block">
          <p role="alert" className="menu__error">
            {startError}
          </p>
          {/* Retry re-runs onStart with the CURRENT selections — the fetch
              is owned by App.handleStart; Menu stays presentational. */}
          <button
            type="button"
            className="btn btn--ghost menu__retry"
            data-testid="menu-retry"
            onClick={() => {
              if (mode !== null) onStart(mode, source);
            }}
          >
            重试
          </button>
        </div>
      )}
    </main>
  );
}
