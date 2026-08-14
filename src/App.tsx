import { useState } from 'preact/hooks';
import type { GameState, QuestionMode, QuestionSourceQuery } from '@shared/types';
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import { useGameState, type GameAction } from '@/hooks/useGameState';
import { useTimer, type TimerControls } from '@/hooks/useTimer';
import { useLongPress, type LongPressHandlers } from '@/hooks/useLongPress';
import { AdminReview } from '@/components/AdminReview';
import { AudioPlayer } from '@/components/AudioPlayer';
import { GameScreen, QUESTION_TIME_LIMIT } from '@/components/GameScreen';
import { Menu } from '@/components/Menu';
import { Result } from '@/components/Result';
import { WorkshopSubmit } from '@/components/WorkshopSubmit';
import { fetchQuestions } from '@/lib/api';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { getOrCreateUserId } from '@/lib/userId';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const QUESTION_COUNT = 5;

/**
 * Top-level screen switching INDEPENDENT of GamePhase (todo 20/22). 'game'
 * renders the phase-driven game flow; 'workshop' overlays the submission
 * form; 'admin' (hidden 3s long-press on the Menu title) opens the optional
 * moderation page. Game state is untouched while the view is not 'game' —
 * returning to 'game' resumes where it left off.
 */
type View = 'game' | 'workshop' | 'admin';

export function App() {
  const { state, dispatch } = useGameState();
  const [startError, setStartError] = useState<string | null>(null);
  const [view, setView] = useState<View>('game');
  /** Offline detection (todo 24) — banner renders while navigator is offline. */
  const online = useOnlineStatus();

  /** Hidden admin entry: hold the Menu title for 3s (todo 22). */
  const titleLongPress = useLongPress(() => setView('admin'));

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
        setStartError(friendlyErrorMessage(err, '加载失败，请重试'));
      });
  };

  return (
    <>
      {/* Offline banner (todo 24) — a real signal: every fetch will fail
          while offline. Dismisses automatically on the `online` event. */}
      {!online && <OfflineBanner />}
      {view === 'admin' ? (
        <AdminReview onBack={() => setView('game')} />
      ) : view === 'workshop' ? (
        <WorkshopSubmit onBack={() => setView('game')} />
      ) : (
        renderPhase(
          state,
          dispatch,
          handleStart,
          startError,
          timer,
          () => setView('workshop'),
          titleLongPress,
        )
      )}
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
  onOpenWorkshop: () => void,
  titleLongPress: LongPressHandlers,
): JSX.Element {
  switch (state.phase) {
    case 'menu':
      return (
        <Menu
          onStart={handleStart}
          startError={startError}
          onOpenWorkshop={onOpenWorkshop}
          titleLongPress={titleLongPress}
        />
      );
    case 'playing':
    case 'round_end':
      return <GameScreen state={state} dispatch={dispatch} timer={timer} />;
    case 'result':
      return <Result state={state} dispatch={dispatch} />;
  }
}

/**
 * Offline banner — fixed pill at the top of every screen while
 * `navigator.onLine === false`. role="alert" announces the state change to
 * assistive tech; the banner disappears on the `online` event (no manual
 * dismiss needed — the reconnect IS the dismissal).
 */
function OfflineBanner() {
  return (
    <div className="offline-banner" role="alert">
      <svg
        className="offline-banner__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <path d="M12 20h.01" />
      </svg>
      网络连接已断开
    </div>
  );
}
