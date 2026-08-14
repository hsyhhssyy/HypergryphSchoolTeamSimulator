import { useState } from 'preact/hooks';
import type { GameState, QuestionMode, QuestionSourceQuery } from '@shared/types';
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import { useGameState, type GameAction } from '@/hooks/useGameState';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Menu } from '@/components/Menu';
import { fetchQuestions } from '@/lib/api';

const QUESTION_COUNT = 5;
const USER_ID_KEY = 'h5-spot-diff.userId';

/**
 * Anonymous player identity (todo 11). Created once via crypto.randomUUID()
 * and persisted in localStorage; reused by the ratings API later (todo 18).
 */
function getOrCreateUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

export function App() {
  const { state, dispatch } = useGameState();
  const [startError, setStartError] = useState<string | null>(null);

  /**
   * Menu start handler — ALL game-start logic lives here (todo 11 contract:
   * Menu is presentational, never fetches). Reducer phase guard makes a
   * double-tap race harmless: the second START_GAME no-ops after phase flips.
   */
  const handleStart = (mode: QuestionMode, source: QuestionSourceQuery): void => {
    getOrCreateUserId();
    setStartError(null);
    fetchQuestions(mode, source, QUESTION_COUNT)
      .then((questions) => {
        if (questions.length === 0) {
          setStartError('暂无可用题目，请稍后再试');
          return;
        }
        dispatch({ type: 'START_GAME', mode, source, questions });
      })
      .catch((err: unknown) => {
        console.error('加载题目失败:', err);
        setStartError(err instanceof Error ? err.message : '加载题目失败，请检查网络后重试');
      });
  };

  return (
    <>
      {renderPhase(state, dispatch, handleStart, startError)}
      {/* Floating BGM player — present on every screen, never autoplays. */}
      <AudioPlayer />
    </>
  );
}

function renderPhase(
  state: GameState,
  dispatch: Dispatch<GameAction>,
  handleStart: (mode: QuestionMode, source: QuestionSourceQuery) => void,
  startError: string | null,
): JSX.Element {
  switch (state.phase) {
    case 'menu':
      return <Menu onStart={handleStart} startError={startError} />;
    case 'playing':
      return (
        <main className="screen">
          <h2>游戏中…</h2>
          <p className="text-muted">
            第 {state.questionIndex + 1} 题 · 得分 {state.score}
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => dispatch({ type: 'TIME_UP' })}
          >
            时间到（占位）
          </button>
          <span className="chip">游戏占位 · todo 13/14 接入双图与区域识别</span>
        </main>
      );
    case 'round_end':
      return (
        <main className="screen">
          <h2>本关完成！</h2>
          <span className="chip chip--success">round_end 占位 · todo 13 自动进入下一题</span>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => dispatch({ type: 'NEXT_ROUND' })}
          >
            下一题（占位）
          </button>
        </main>
      );
    case 'result':
      return (
        <main className="screen">
          <h2>本局结束</h2>
          <p className="text-muted">得分 {state.score}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => dispatch({ type: 'RESET' })}
          >
            再来一局
          </button>
          <span className="chip chip--danger">结果占位 · todo 15 接入结算</span>
        </main>
      );
  }
}
