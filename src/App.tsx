import { useState } from 'preact/hooks';
import type { GameState, QuestionMode, QuestionSourceQuery } from '@shared/types';
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import { useGameState, type GameAction } from '@/hooks/useGameState';
import { useTimer, type TimerControls } from '@/hooks/useTimer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { GameScreen, QUESTION_TIME_LIMIT } from '@/components/GameScreen';
import { Menu } from '@/components/Menu';
import { Result } from '@/components/Result';
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
   * THE timer (todo 9) lives at App level and is passed down — the reducer
   * never owns time. onTimeUp dispatches TIME_UP; the reducer's phase guard
   * makes a stale fire (after the round already ended) harmless.
   */
  const timer = useTimer({
    initialSeconds: QUESTION_TIME_LIMIT,
    onTimeUp: () => dispatch({ type: 'TIME_UP' }),
  });

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
      {renderPhase(state, dispatch, handleStart, startError, timer)}
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
  timer: TimerControls,
): JSX.Element {
  switch (state.phase) {
    case 'menu':
      return <Menu onStart={handleStart} startError={startError} />;
    case 'playing':
    case 'round_end':
      return <GameScreen state={state} dispatch={dispatch} timer={timer} />;
    case 'result':
      return <Result state={state} dispatch={dispatch} />;
  }
}
