import { useReducer } from 'preact/hooks';
import type {
  GameState,
  Question,
  QuestionMode,
  QuestionSourceQuery,
} from '@shared/types';

/**
 * THE single game-level state machine for the whole app (todo 3/8 contract).
 * App renders screens from `state.phase`; there is exactly ONE game reducer —
 * no second game-level reducer may exist anywhere.
 *
 * Ownership boundaries (todo 8 contract):
 * - The timer is owned by useTimer (todo 9). This reducer NEVER reads a clock
 *   and NEVER decrements timeLeft; callers pass remaining seconds in the
 *   FOUND_DIFFERENCE payload. `state.timeLeft` is only a snapshot for the
 *   round_end/result screens.
 * - Questions are fetched by the API client (todo 10); START_GAME receives
 *   them as a payload — the reducer never fetches.
 * - The 800ms wrong-click cooldown is COMPONENT-level (ImagePanel `disabled`
 *   prop + setTimeout in GameScreen). There is no cooldown field and no
 *   COOLDOWN action here.
 */

export const FOUND_SCORE = 100;
export const WRONG_PENALTY = 30;
export const TIME_BONUS_PER_SECOND = 10;

export type GameAction =
  | { type: 'START_GAME'; mode: QuestionMode; source: QuestionSourceQuery; questions: Question[] }
  | { type: 'FOUND_DIFFERENCE'; index: number; timeLeft: number }
  | { type: 'WRONG_CLICK' }
  | { type: 'TIME_UP' }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESET' };

export function createInitialState(): GameState {
  return {
    phase: 'menu',
    mode: 'spot_diff',
    source: 'official',
    questions: [],
    questionIndex: 0,
    currentQuestion: null,
    foundIndices: [],
    totalFound: 0,
    score: 0,
    wrongCount: 0,
    timeLeft: 0,
  };
}

/**
 * Phase guards: every action is a no-op outside its own phase (a timer
 * callback may outlive its round; a stale FOUND may arrive at round_end).
 * Duplicate/out-of-range found indices are ignored — the state returned is
 * the SAME reference, so React/Preact skips re-rendering.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      if (state.phase !== 'menu' || action.questions.length === 0) return state;
      return {
        ...state,
        phase: 'playing',
        mode: action.mode,
        source: action.source,
        questions: action.questions,
        questionIndex: 0,
        currentQuestion: action.questions[0] ?? null,
        foundIndices: [],
        totalFound: 0,
        score: 0,
        wrongCount: 0,
        timeLeft: 0,
      };
    }
    case 'FOUND_DIFFERENCE': {
      if (state.phase !== 'playing' || state.currentQuestion === null) return state;
      const total = state.currentQuestion.differences.length;
      if (action.index < 0 || action.index >= total) return state;
      if (state.foundIndices.includes(action.index)) return state;

      const foundIndices = [...state.foundIndices, action.index];
      const completed = foundIndices.length === total;
      return {
        ...state,
        foundIndices,
        totalFound: state.totalFound + 1,
        phase: completed ? 'round_end' : 'playing',
        score:
          state.score +
          FOUND_SCORE +
          (completed ? Math.max(0, action.timeLeft) * TIME_BONUS_PER_SECOND : 0),
        timeLeft: completed ? Math.max(0, action.timeLeft) : state.timeLeft,
      };
    }
    case 'WRONG_CLICK': {
      if (state.phase !== 'playing') return state;
      return {
        ...state,
        score: Math.max(0, state.score - WRONG_PENALTY),
        wrongCount: state.wrongCount + 1,
      };
    }
    case 'TIME_UP': {
      // The timer may outlive the round: ignore TIME_UP outside 'playing'.
      if (state.phase !== 'playing') return state;
      return { ...state, phase: 'round_end', timeLeft: 0 };
    }
    case 'NEXT_ROUND': {
      if (state.phase !== 'round_end') return state;
      const nextIndex = state.questionIndex + 1;
      if (nextIndex >= state.questions.length) return { ...state, phase: 'result' };
      return {
        ...state,
        phase: 'playing',
        questionIndex: nextIndex,
        currentQuestion: state.questions[nextIndex] ?? null,
        foundIndices: [],
        timeLeft: 0,
      };
    }
    case 'RESET':
      return createInitialState();
  }
}

/** The ONE game-state hook. App.tsx is its only consumer. */
export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, createInitialState());
  return { state, dispatch };
}
