/**
 * Result — todo 15 (+ todo 21 rating). Rendered at phase==='result'. Pure
 * display except the workshop rating vote (the only local state): final score,
 * accuracy %, per-difference found/missed list for the LAST question
 * (state.currentQuestion is still the last question — the reducer never nulls
 * it), a 再来一局 button that dispatches RESET, and — ONLY for approved
 * workshop questions with a known anonymous user id — 👍/👎 rating buttons.
 *
 * The missed list ALWAYS reveals the full count regardless of showCount —
 * show_count governs the HUD only (plan decision #6: gameplay concealment,
 * not post-game).
 */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import type { GameState, Question } from '@shared/types';
import type { GameAction } from '@/hooks/useGameState';
import { rateQuestion } from '@/lib/api';
import { friendlyErrorMessage } from '@/lib/friendlyError';

/** Same anonymous-user key App.tsx writes on game start (todo 11). */
const USER_ID_KEY = 'h5-spot-diff.userId';

/** 'like' | 'dislike' — same union the shared rating schema derives. */
export type RatingVote = 'like' | 'dislike';

/**
 * Rating gate (todo 21): buttons render ONLY for approved workshop questions
 * AND only when a user id exists. Pure + exported so the gate is unit-testable
 * without a DOM harness (todo 15 convention).
 */
export function isRatableQuestion(
  question: Pick<Question, 'source' | 'status'> | null,
  userId: string | null,
): boolean {
  return (
    question !== null &&
    question.source === 'workshop' &&
    question.status === 'approved' &&
    userId !== null
  );
}

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

  /** Optimistic vote (todo 21): null = not voted; otherwise the local choice. */
  const [vote, setVote] = useState<RatingVote | null>(null);
  const [pending, setPending] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // User id is read from the same localStorage key App.getOrCreateUserId
  // writes at game start — absent → no rating UI at all (no rating without id).
  const userId = localStorage.getItem(USER_ID_KEY);
  const canRate = isRatableQuestion(currentQuestion, userId);

  // Displayed counts = server counts + the local optimistic vote (the backend
  // upsert makes the +1 the truth once the request succeeds).
  const displayedLikes =
    (currentQuestion?.likes ?? 0) + (vote === 'like' ? 1 : 0);
  const displayedDislikes =
    (currentQuestion?.dislikes ?? 0) + (vote === 'dislike' ? 1 : 0);

  const handleVote = (next: RatingVote): void => {
    if (pending || vote !== null || !canRate || currentQuestion === null || userId === null) {
      return;
    }
    setVote(next);
    setPending(true);
    setRateError(null);
    rateQuestion(currentQuestion.id, userId, next)
      .then(() => setPending(false))
      .catch((err: unknown) => {
        // Failure → revert the optimistic vote and RE-ENABLE both buttons
        // (retry possible); surface a friendly message, never raw JSON.
        console.error('评价失败:', err);
        setVote(null);
        setPending(false);
        setRateError(friendlyErrorMessage(err, '评价失败，请重试'));
      });
  };

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

      {canRate && (
        <section className="result-rating" aria-label="题目评价">
          <h2 className="result-rating__title">觉得这题怎么样？</h2>
          <div className="result-rating__buttons">
            <button
              type="button"
              className={`btn result-rating__btn result-rating__btn--like${
                vote === 'like' ? ' result-rating__btn--active' : ''
              }`}
              data-testid="rating-like"
              aria-pressed={vote === 'like'}
              disabled={pending || vote !== null}
              onClick={() => handleVote('like')}
            >
              <span aria-hidden="true">👍</span>
              有用
              <span className="result-rating__count" data-testid="rating-like-count">
                {displayedLikes}
              </span>
            </button>
            <button
              type="button"
              className={`btn result-rating__btn result-rating__btn--dislike${
                vote === 'dislike' ? ' result-rating__btn--active' : ''
              }`}
              data-testid="rating-dislike"
              aria-pressed={vote === 'dislike'}
              disabled={pending || vote !== null}
              onClick={() => handleVote('dislike')}
            >
              <span aria-hidden="true">👎</span>
              不好
              <span className="result-rating__count" data-testid="rating-dislike-count">
                {displayedDislikes}
              </span>
            </button>
          </div>
          {vote !== null && !pending && (
            <p className="result-rating__status" data-testid="rating-status">
              已评价
            </p>
          )}
          {rateError !== null && (
            <p className="result-rating__error" role="alert" data-testid="rating-error">
              {rateError}
            </p>
          )}
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
