/**
 * GameScreen — todo 13. Renders gameplay for the CURRENT question by
 * `state.phase` and `state.currentQuestion.mode`.
 *
 * Spot-diff (this todo): TWO ImagePanel instances side by side (imageA left,
 * imageB right) sharing ONE `foundIndices` array, so a found difference draws
 * its green marker on BOTH panels. Hit detection lives ONLY in ImagePanel
 * (todo 12) — no duplication here.
 *
 * Ownership boundaries (todo 8/9/13 contract):
 * - The timer is owned by useTimer (todo 9). GameScreen calls
 *   `timer.deductTime(WRONG_TIME_PENALTY_SECONDS)` alongside
 *   dispatch(WRONG_CLICK) — the reducer never touches time, and the
 *   FOUND_DIFFERENCE payload carries the remaining seconds so the reducer can
 *   compute the time bonus.
 * - Timer discipline lives in `useRoundTimer`: RESET+START on every
 *   transition INTO 'playing' (START_GAME and NEXT_ROUND), PAUSE on every
 *   transition OUT (round_end) — the clock must NOT tick through the 1500ms
 *   interstitial, and a new question must never inherit leftover time.
 * - The 800ms wrong-click cooldown is COMPONENT-level: ImagePanel
 *   `disabled={cooldown}` + a setTimeout here. No reducer field, no action.
 * - find_area (todo 14): an imageB-less question renders a SINGLE centered
 *   full-width panel (`.game-panels--single` modifier on the same container)
 *   — same hit logic via the same ImagePanel, no duplicate code path.
 * - QuestionDescription (todo 14) renders title + required 题目描述 above the
 *   panels for BOTH modes — always visible during gameplay.
 *
 * NO Canvas. NO hardcoded image dimensions.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import type { GamePhase, GameState } from '@shared/types';
import type { GameAction } from '@/hooks/useGameState';
import { WRONG_TIME_PENALTY_SECONDS, type TimerControls } from '@/hooks/useTimer';
import { resolveImageUrl } from '@/lib/api';
import { preloadImage } from '@/utils/preload';
import { Confetti } from '@/components/Confetti';
import { HUD } from '@/components/HUD';
import { ImagePanel } from '@/components/ImagePanel';
import { QuestionDescription } from '@/components/QuestionDescription';

/** Seconds per question (60s default; documented in .omo/notepads decisions.md). */
export const QUESTION_TIME_LIMIT = 60;
/** Component-level wrong-click cooldown (ms) — ImagePanel `disabled`. */
export const WRONG_COOLDOWN_MS = 800;
/** round_end interstitial length (ms) before auto-dispatching NEXT_ROUND. */
export const ROUND_END_DELAY_MS = 1500;
/** Wrong ✕ fade-out duration (ms) — mirrors the --anim-fade-out token. */
export const WRONG_FADE_MS = 600;

export interface GameScreenProps {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  timer: TimerControls;
}

/**
 * Timer discipline (todo 13 core contract): RESET+START every time phase
 * becomes 'playing' (START_GAME and NEXT_ROUND both land here — a new
 * question never inherits the previous round's leftover time, especially
 * after TIME_UP), PAUSE every time phase leaves 'playing' (round_end) so the
 * clock does NOT tick through the interstitial. Exported as a plain function
 * (the effect is a thin wrapper) so unit tests can drive the exact contract
 * directly — see GameScreen.test.ts.
 */
export function applyRoundTimerPhase(
  phase: GamePhase,
  timer: TimerControls,
  questionTimeLimit: number,
): void {
  if (phase === 'playing') {
    timer.reset(questionTimeLimit);
    timer.start();
  } else if (phase === 'round_end') {
    timer.pause();
  }
}

/**
 * Effect wrapper — keyed on `phase` (questionIndex cannot change while phase
 * stays constant) plus the STABLE useTimer controls (reset/start/pause are
 * useCallback([]) — never the `timer` object, which is recreated every
 * render; depending on it would reset the clock after every re-render).
 */
export function useRoundTimer(
  phase: GamePhase,
  timer: TimerControls,
  questionTimeLimit: number,
): void {
  const { reset, start, pause } = timer;
  useEffect(() => {
    applyRoundTimerPhase(phase, timer, questionTimeLimit);
  }, [phase, reset, start, pause, questionTimeLimit]);
}

/**
 * round_end interstitial: auto-dispatch NEXT_ROUND after ROUND_END_DELAY_MS.
 * The setTimeout is cleared on unmount AND on phase change (effect cleanup),
 * so an unmount mid-interstitial or a manual dispatch never double-advances.
 */
export function useRoundEndAutoAdvance(
  phase: GamePhase,
  dispatch: Dispatch<GameAction>,
): void {
  useEffect(() => {
    if (phase !== 'round_end') return;
    const id = setTimeout(() => dispatch({ type: 'NEXT_ROUND' }), ROUND_END_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, dispatch]);
}

/**
 * Component-level 800ms wrong-click cooldown (todo 8/13: NOT a reducer
 * field). `trigger()` re-arms the window even if one is already active;
 * the timeout is cleared on unmount so a dead component can never flip state.
 */
export function useWrongClickCooldown(): {
  cooldown: boolean;
  trigger: () => void;
} {
  const [cooldown, setCooldown] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const trigger = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    setCooldown(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setCooldown(false);
    }, WRONG_COOLDOWN_MS);
  }, []);

  return { cooldown, trigger };
}

/**
 * Todo 23: background-preload the NEXT question's images (imageA, plus
 * imageB when present) as soon as the current question becomes active, so
 * the next round's panels paint from cache. Keyed on `questionIndex` +
 * the `questions` array reference (both stable across renders within a
 * round — `questions` is replaced only by START_GAME), so it fires EXACTLY
 * once per question advance and NEVER scans the whole set. Out-of-bounds
 * (menu, last question, result) → no-op.
 */
export function usePreloadNextQuestion(state: GameState): void {
  const { questionIndex, questions } = state;
  useEffect(() => {
    const next = questions[questionIndex + 1];
    if (next === undefined) return;
    preloadImage(resolveImageUrl(next.imageA));
    if (next.imageB !== undefined) preloadImage(resolveImageUrl(next.imageB));
  }, [questionIndex, questions]);
}

export function GameScreen({ state, dispatch, timer }: GameScreenProps) {
  const { phase, currentQuestion } = state;

  usePreloadNextQuestion(state);

  // Round-score baseline: snapshot the TOTAL score the moment a round starts,
  // so the interstitial can show this round's delta (find bonus + time bonus).
  const roundStartScoreRef = useRef(state.score);
  useEffect(() => {
    if (phase === 'playing') roundStartScoreRef.current = state.score;
  }, [phase]);

  const { cooldown, trigger: triggerCooldown } = useWrongClickCooldown();
  useRoundTimer(phase, timer, QUESTION_TIME_LIMIT);
  useRoundEndAutoAdvance(phase, dispatch);

  // Wrong ✕ flash counter — used as the element key so every miss remounts
  // the mark and replays the wiggle + 600ms fade-out animations.
  const [wrongFlash, setWrongFlash] = useState(0);
  const wrongFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (wrongFlashRef.current !== null) clearTimeout(wrongFlashRef.current);
    },
    [],
  );

  const handleHit = useCallback(
    (index: number) => {
      // timeLeft payload REQUIRED — the reducer computes the round-completion
      // time bonus from it (never reads the timer itself).
      dispatch({ type: 'FOUND_DIFFERENCE', index, timeLeft: timer.timeLeft });
    },
    [dispatch, timer],
  );

  const handleMiss = useCallback(() => {
    dispatch({ type: 'WRONG_CLICK' });
    timer.deductTime(WRONG_TIME_PENALTY_SECONDS);
    setWrongFlash((n) => n + 1);
    if (wrongFlashRef.current !== null) clearTimeout(wrongFlashRef.current);
    wrongFlashRef.current = setTimeout(() => setWrongFlash(0), WRONG_FADE_MS);
    triggerCooldown();
  }, [dispatch, timer, triggerCooldown]);

  if (currentQuestion === null) {
    // Defensive empty state (todo 24): the reducer rejects START_GAME with an
    // empty question list, so this is only reachable through a logic bug —
    // still, a blank screen is never acceptable.
    return (
      <main className="game-screen">
        <div className="game-empty" role="status">
          <p className="game-empty__text">暂无题目</p>
          <button
            type="button"
            className="btn btn--primary game-empty__back"
            data-testid="game-empty-back"
            onClick={() => dispatch({ type: 'RESET' })}
          >
            返回菜单
          </button>
        </div>
      </main>
    );
  }

  const panelsDisabled = cooldown || phase !== 'playing';

  return (
    <main className="game-screen">
      {/* HUD (todo 15) — score chip, timer bar (live useTimer value, width =
          timeLeft/totalTime), and show_count-aware found label. */}
      <HUD
        score={state.score}
        timeLeft={timer.timeLeft}
        totalTime={QUESTION_TIME_LIMIT}
        foundCount={state.foundIndices.length}
        totalCount={currentQuestion.differences.length}
        showCount={currentQuestion.showCount}
      />

      {/* Title + 题目描述 instruction text (todo 14) — REQUIRED per Question,
          always visible above the panels in BOTH modes. */}
      <QuestionDescription
        title={currentQuestion.title}
        description={currentQuestion.description}
      />

      {/* find_area (imageB undefined, todo 14) → single centered full-width
          panel via the --single modifier; spot_diff keeps the 2-col grid. */}
      <div
        className={`game-panels${
          currentQuestion.imageB === undefined ? ' game-panels--single' : ''
        }`}
      >
        <ImagePanel
          src={resolveImageUrl(currentQuestion.imageA)}
          differences={currentQuestion.differences}
          foundIndices={state.foundIndices}
          onHit={handleHit}
          onMiss={handleMiss}
          disabled={panelsDisabled}
        />
        {currentQuestion.imageB !== undefined && (
          <ImagePanel
            src={resolveImageUrl(currentQuestion.imageB)}
            differences={currentQuestion.differences}
            foundIndices={state.foundIndices}
            onHit={handleHit}
            onMiss={handleMiss}
            disabled={panelsDisabled}
          />
        )}
      </div>

      {/* round_end interstitial — covers the still-mounted panels; the timer
          is paused (useRoundTimer) and NEXT_ROUND fires in ~1500ms. */}
      {phase === 'round_end' && (
        <div className="round-end" role="status" aria-live="polite">
          {/* Todo 27: celebratory confetti behind the text — decorative
              (aria-hidden), transform/opacity only. */}
          <Confetti />
          <h1 className="round-end__title">本关完成</h1>
          <p className="round-end__score">
            +{Math.max(0, state.score - roundStartScoreRef.current)} 分
          </p>
          <p className="round-end__total">总分 {state.score}</p>
        </div>
      )}

      {wrongFlash > 0 && (
        <div key={wrongFlash} className="wrong-mark" aria-hidden="true">
          <span className="wrong-mark__glyph">✕</span>
        </div>
      )}
    </main>
  );
}
