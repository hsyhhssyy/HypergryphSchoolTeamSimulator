/**
 * HUD — todo 15. Pure display: score chip, timer bar, found-count chip.
 *
 * show_count contract (plan scope, todo 2/15): the number of remaining
 * differences is hidden IN-GAME when `showCount === false` — the HUD shows
 * the unnumbered "还有差异未找到" instead of "N/M 已找到". The Result screen
 * ALWAYS reveals the full list (gameplay concealment, not post-game).
 *
 * Timer bar width is computed by the caller (timeLeft/totalTime) and applied
 * as an inline style width — the reducer never owns the clock (todo 8), so
 * GameScreen passes the LIVE useTimer value here.
 */
import type { JSX } from 'preact';

export interface HUDProps {
  score: number;
  timeLeft: number;
  totalTime: number;
  foundCount: number;
  totalCount: number;
  showCount: boolean;
}

/** Timer bar fill percent, clamped to [0, 100]. totalTime <= 0 → 0 (never NaN). */
export function timerBarPercent(timeLeft: number, totalTime: number): number {
  if (totalTime <= 0 || timeLeft <= 0) return 0;
  return Math.min(100, (timeLeft / totalTime) * 100);
}

/** show_count-aware found label: "2/5 已找到" vs the unnumbered "还有差异未找到". */
export function foundLabel(
  foundCount: number,
  totalCount: number,
  showCount: boolean,
): string {
  return showCount ? `${foundCount}/${totalCount} 已找到` : '还有差异未找到';
}

export function HUD({ score, timeLeft, totalTime, foundCount, totalCount, showCount }: HUDProps): JSX.Element {
  const percent = timerBarPercent(timeLeft, totalTime);
  // Danger fill under 25% remaining — a real state signal, not decoration.
  const low = percent < 25;

  return (
    <header className="hud">
      <span className="chip hud__score" data-testid="hud-score">
        得分 {score}
      </span>

      <div
        className="hud__timer"
        role="progressbar"
        aria-label="剩余时间"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(totalTime))}
        aria-valuenow={Math.max(0, Math.round(timeLeft))}
        aria-valuetext={`剩余 ${Math.max(0, Math.round(timeLeft))} 秒`}
      >
        <div className="hud__timer-track">
          <div
            className={`hud__timer-fill${low ? ' hud__timer-fill--low' : ''}`}
            style={{ width: `${percent}%` }}
            data-testid="timer-fill"
          />
        </div>
        <span className="hud__timer-label" data-testid="time-left">
          {Math.max(0, Math.round(timeLeft))} 秒
        </span>
      </div>

      <span
        className={`chip hud__found${showCount ? ' chip--success' : ''}`}
        data-testid="hud-found"
      >
        {foundLabel(foundCount, totalCount, showCount)}
      </span>
    </header>
  );
}
