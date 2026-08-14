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
      <header className="menu__hero">
        <h1
          className="font-display"
          style={{ fontSize: 'var(--font-size-display)' }}
          {...titleLongPress}
        >
          找不同
        </h1>
        <p className="text-muted">双图找茬 · 区域识别 · 答题小游戏</p>
      </header>

      <section className="menu__section" aria-labelledby="menu-mode-heading">
        <h2 id="menu-mode-heading" className="menu__heading">
          选择模式
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
        <p role="alert" className="menu__error">
          {startError}
        </p>
      )}
    </main>
  );
}
