/**
 * Result — todo 15. Rendered at phase==='result'. Pure display, no internal
 * state: final score, accuracy %, per-difference found/missed list for the
 * LAST question (state.currentQuestion is still the last question — the
 * reducer never nulls it), and a 再来一局 button that dispatches RESET.
 *
 * The missed list ALWAYS reveals the full count regardless of showCount —
 * show_count governs the HUD only (plan decision #6: gameplay concealment,
 * not post-game).
 */
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import type { GameState } from '@shared/types';
import type { GameAction } from '@/hooks/useGameState';

export interface ResultProps {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

/**
 * Accuracy = correct finds / (correct finds + wrong clicks). The 0/0 case
 * (played without a single tap) returns 0 — NEVER NaN (adversarial probe).
 */
export function computeAccuracy(totalFound: number, wrongCount: number): number {
  if (totalFound + wrongCount === 0) return 0;
  return Math.round((totalFound / (totalFound + wrongCount)) * 100);
}

export function Result({ state, dispatch }: ResultProps): JSX.Element {
  const { currentQuestion } = state;
  const accuracy = computeAccuracy(state.totalFound, state.wrongCount);

  return (
    <main className="screen result-screen">
      <h1 className="result-screen__title">本局结束</h1>

      <div className="result-card">
        <p className="result-card__score" data-testid="result-score">
          最终得分 <strong>{state.score}</strong>
        </p>
        <p className="result-card__accuracy" data-testid="result-accuracy">
          准确率 {accuracy}%
        </p>
        <p className="result-card__meta">
          找到 {state.totalFound} 处 · 点错 {state.wrongCount} 次
        </p>
      </div>

      {currentQuestion !== null && (
        <section className="result-list" aria-label="差异清单">
          <h2 className="result-list__title">
            {currentQuestion.title} · 差异清单
          </h2>
          <ul className="result-list__items">
            {currentQuestion.differences.map((difference, index) => {
              const found = state.foundIndices.includes(index);
              return (
                <li
                  key={index}
                  className={`result-list__item${
                    found ? '' : ' result-list__item--missed'
                  }`}
                  data-testid={found ? 'result-item-found' : 'result-item-missed'}
                >
                  <span className="result-list__idx" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="result-list__desc">
                    {difference.type === 'circle' ? '圆形区域' : '矩形区域'}
                  </span>
                  <span className="result-list__status">{found ? '已找到' : '未找到'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <button
        type="button"
        className="btn btn--primary result-replay"
        data-testid="result-replay"
        onClick={() => dispatch({ type: 'RESET' })}
      >
        再来一局
      </button>
    </main>
  );
}
