/**
 * Result — todo 15 (+ todo 21 rating). Rendered at phase==='result'. Pure
 * display except the workshop rating vote (the only local state): final score,
 * accuracy %, a summary of every attempted question, and a 再来一局 button
 * that dispatches RESET.
 */
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import type { GameState } from '@shared/types';
import type { GameAction } from '@/hooks/useGameState';
import { Confetti } from '@/components/Confetti';
import { ImagePanel } from '@/components/ImagePanel';
import { resolveQuestionAsset } from '@/lib/questions';

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
  const accuracy = computeAccuracy(state.totalFound, state.wrongCount);
  const answeredQuestions = state.questions.slice(0, state.questionIndex + 1);
  const failedQuestion =
    state.currentQuestion !== null &&
    state.foundIndices.length < state.currentQuestion.differences.length
      ? state.currentQuestion
      : null;

  return (
    <main className="screen result-screen">
      {/* Todo 27: end-of-game celebration — decorative, aria-hidden. */}
      <Confetti />
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

      {failedQuestion !== null && (
        <section className="result-answer" aria-label="答案区域">
          <h2 className="result-answer__title">答案区域</h2>
          <div className="result-answer__legend" aria-label="答案标记说明">
            <span><i className="result-answer__dot result-answer__dot--found" />已找到</span>
            <span><i className="result-answer__dot result-answer__dot--missed" />未找到</span>
          </div>
          <ImagePanel
            src={resolveQuestionAsset(failedQuestion.imageB ?? failedQuestion.imageA)}
            differences={failedQuestion.differences}
            foundIndices={state.foundIndices}
            revealAll
            onHit={() => undefined}
            onMiss={() => undefined}
            disabled
          />
        </section>
      )}

      {answeredQuestions.length > 0 && (
        <section className="result-list" aria-label="已回答题目">
          <h2 className="result-list__title">已回答题目</h2>
          <ul className="result-list__items">
            {answeredQuestions.map((question, index) => {
              const isCurrentQuestion = index === state.questionIndex;
              const foundCount = isCurrentQuestion
                ? state.foundIndices.length
                : question.differences.length;

              return (
                <li
                  key={question.id}
                  className="result-list__item"
                  data-testid="result-question-item"
                >
                  <span className="result-list__idx" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="result-list__desc">{question.title}</span>
                  <span className="result-list__status">{foundCount} 处</span>
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
