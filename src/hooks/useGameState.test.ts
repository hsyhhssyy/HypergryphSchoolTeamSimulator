import { describe, expect, it } from 'vitest';
import type { Difference, GameState, Question } from '@shared/types';
import {
  FOUND_SCORE,
  TIME_BONUS_PER_SECOND,
  WRONG_PENALTY,
  createInitialState,
  gameReducer,
  type GameAction,
} from './useGameState';

function circle(x: number, y: number, radius = 25): Difference {
  return { type: 'circle', x, y, radius };
}

function makeQuestion(id: string, differences: Difference[]): Question {
  return {
    id,
    mode: 'spot_diff',
    title: `题目 ${id}`,
    description: '找出两图的不同之处',
    imageA: 'https://example.com/a.jpg',
    imageB: 'https://example.com/b.jpg',
    differences,
    showCount: true,
    source: 'official',
    status: 'approved',
    likes: 0,
    dislikes: 0,
    createdAt: '2026-08-14T00:00:00Z',
  };
}

/** Given: a fresh menu state. When: START_GAME with the questions. Then: playing round 1. */
function startGame(questions: Question[]): GameState {
  return gameReducer(createInitialState(), {
    type: 'START_GAME',
    mode: 'spot_diff',
    source: 'official',
    questions,
  });
}

/** Given: a playing state. When: one FOUND_DIFFERENCE. Then: the new state. */
function find(state: GameState, index: number, timeLeft = 10): GameState {
  return gameReducer(state, { type: 'FOUND_DIFFERENCE', index, timeLeft });
}

const qOne = () => makeQuestion('q1', [circle(10, 10), circle(20, 20)]);
const qTwo = () => makeQuestion('q2', [circle(30, 30)]);

describe('START_GAME', () => {
  it('transitions menu → playing and loads the first question', () => {
    // Given: menu phase. When: START_GAME with 2 questions.
    const state = startGame([qOne(), qTwo()]);
    // Then: playing, index 0, first question loaded, counters reset.
    expect(state.phase).toBe('playing');
    expect(state.questionIndex).toBe(0);
    expect(state.currentQuestion).toEqual(qOne());
    expect(state.questions).toHaveLength(2);
    expect(state.score).toBe(0);
    expect(state.foundIndices).toEqual([]);
    expect(state.wrongCount).toBe(0);
  });

  it('ignores START_GAME with no questions (stays menu)', () => {
    // Given: menu. When: START_GAME with an empty question list.
    const state = gameReducer(createInitialState(), {
      type: 'START_GAME',
      mode: 'spot_diff',
      source: 'official',
      questions: [],
    });
    // Then: still menu — a playing state without a question is illegal.
    expect(state.phase).toBe('menu');
  });
});

describe('FOUND_DIFFERENCE', () => {
  it('stays playing and awards 100 when found < total', () => {
    // Given: playing a 2-difference round. When: first find.
    const state = find(startGame([qOne()]), 0);
    // Then: still playing, +100, index recorded.
    expect(state.phase).toBe('playing');
    expect(state.score).toBe(FOUND_SCORE);
    expect(state.foundIndices).toEqual([0]);
    expect(state.currentQuestion).toEqual(qOne());
  });

  it('moves to round_end with 100 + timeLeft×10 bonus when found == total', () => {
    // Given: playing, one difference already found. When: final find with 7s left.
    const before = find(startGame([qOne()]), 0);
    const state = find(before, 1, 7);
    // Then: round_end, score 100 + 100 + 70, timeLeft snapshot = 7.
    expect(state.phase).toBe('round_end');
    expect(state.score).toBe(FOUND_SCORE + FOUND_SCORE + 7 * TIME_BONUS_PER_SECOND);
    expect(state.timeLeft).toBe(7);
    expect(state.foundIndices).toEqual([0, 1]);
  });

  it('awards no bonus when timeLeft is 0', () => {
    // Given: playing, one find left. When: final find with 0s left.
    const before = find(startGame([qOne()]), 0);
    const state = find(before, 1, 0);
    // Then: exactly 100 for the find, no time bonus.
    expect(state.score).toBe(FOUND_SCORE + FOUND_SCORE);
  });

  it('does NOT increment on a duplicate index (guard returns same state)', () => {
    // Given: index 0 already found. When: FOUND_DIFFERENCE index 0 again.
    const before = find(startGame([qOne()]), 0);
    const state = gameReducer(before, { type: 'FOUND_DIFFERENCE', index: 0, timeLeft: 10 });
    // Then: identical state — no extra score, no duplicate entry.
    expect(state).toBe(before);
    expect(state.score).toBe(FOUND_SCORE);
    expect(state.foundIndices).toEqual([0]);
  });

  it('ignores an out-of-range index', () => {
    // Given: playing a 2-difference round. When: FOUND with index 5.
    const before = startGame([qOne()]);
    const state = find(before, 5);
    // Then: unchanged.
    expect(state).toBe(before);
  });

  it('ignores FOUND when already at round_end (stale tap)', () => {
    // Given: round_end (all found). When: another FOUND arrives.
    const atRoundEnd = find(find(startGame([qOne()]), 0), 1, 5);
    const state = gameReducer(atRoundEnd, { type: 'FOUND_DIFFERENCE', index: 0, timeLeft: 5 });
    // Then: unchanged — no double scoring.
    expect(state).toBe(atRoundEnd);
    expect(state.phase).toBe('round_end');
  });
});

describe('WRONG_CLICK', () => {
  it('deducts 30, increments wrongCount, and stays playing', () => {
    // Given: playing with score 100. When: wrong click.
    const before = find(startGame([qOne()]), 0);
    const state = gameReducer(before, { type: 'WRONG_CLICK' });
    // Then: score 70, wrongCount 1, still playing.
    expect(state.phase).toBe('playing');
    expect(state.score).toBe(FOUND_SCORE - WRONG_PENALTY);
    expect(state.wrongCount).toBe(1);
    expect(state.foundIndices).toEqual([0]);
  });

  it('never lets score go below 0 (score floor)', () => {
    // Given: playing with score 0. When: repeated wrong clicks.
    let state = startGame([qOne()]);
    state = gameReducer(state, { type: 'WRONG_CLICK' });
    state = gameReducer(state, { type: 'WRONG_CLICK' });
    // Then: score stays 0, wrongCount counts every click.
    expect(state.score).toBe(0);
    expect(state.wrongCount).toBe(2);
  });
});

describe('TIME_UP', () => {
  it('moves playing → round_end with NO time bonus', () => {
    // Given: playing with score 100. When: timer fires TIME_UP.
    const before = find(startGame([qOne()]), 0);
    const state = gameReducer(before, { type: 'TIME_UP' });
    // Then: round_end, score unchanged, timeLeft snapshot 0.
    expect(state.phase).toBe('round_end');
    expect(state.score).toBe(FOUND_SCORE);
    expect(state.timeLeft).toBe(0);
  });

  it('ignores TIME_UP when phase is not playing (timer outlives the round)', () => {
    // Given: menu phase. When: a late TIME_UP arrives.
    const state = gameReducer(createInitialState(), { type: 'TIME_UP' });
    // Then: still menu, unchanged.
    expect(state).toEqual(createInitialState());
    expect(state.phase).toBe('menu');
  });
});

describe('NEXT_ROUND', () => {
  it('moves round_end → playing with questionIndex+1 when more questions remain', () => {
    // Given: round 1 finished at round_end, score carried. When: NEXT_ROUND.
    const atRoundEnd = find(find(startGame([qOne(), qTwo()]), 0), 1, 7);
    const state = gameReducer(atRoundEnd, { type: 'NEXT_ROUND' });
    // Then: playing question 2, foundIndices reset, score carried, timeLeft 0.
    expect(state.phase).toBe('playing');
    expect(state.questionIndex).toBe(1);
    expect(state.currentQuestion).toEqual(qTwo());
    expect(state.foundIndices).toEqual([]);
    expect(state.score).toBe(FOUND_SCORE + FOUND_SCORE + 7 * TIME_BONUS_PER_SECOND);
    expect(state.timeLeft).toBe(0);
  });

  it('moves round_end → result on the last question', () => {
    // Given: last question finished. When: NEXT_ROUND.
    const atRoundEnd = find(find(startGame([qOne()]), 0), 1, 7);
    const state = gameReducer(atRoundEnd, { type: 'NEXT_ROUND' });
    // Then: result, final score intact.
    expect(state.phase).toBe('result');
    expect(state.score).toBe(FOUND_SCORE + FOUND_SCORE + 7 * TIME_BONUS_PER_SECOND);
  });

  it('ignores NEXT_ROUND outside round_end', () => {
    // Given: playing. When: NEXT_ROUND.
    const before = startGame([qOne()]);
    const state = gameReducer(before, { type: 'NEXT_ROUND' });
    // Then: unchanged.
    expect(state).toBe(before);
  });
});

describe('RESET', () => {
  it('returns a fresh menu state from anywhere', () => {
    // Given: result phase with accumulated score. When: RESET.
    const atResult = gameReducer(
      find(find(startGame([qOne()]), 0), 1, 7),
      { type: 'NEXT_ROUND' },
    );
    const state = gameReducer(atResult, { type: 'RESET' });
    // Then: menu with all counters cleared.
    expect(state.phase).toBe('menu');
    expect(state.score).toBe(0);
    expect(state.wrongCount).toBe(0);
    expect(state.foundIndices).toEqual([]);
    expect(state.questions).toEqual([]);
    expect(state.currentQuestion).toBeNull();
  });
});

describe('full lifecycle', () => {
  it('walks menu → playing → round_end → playing → round_end → result → menu', () => {
    // Given: two questions. When: the complete action sequence.
    const questions = [qOne(), qTwo()];
    let state = createInitialState();

    const dispatch = (action: GameAction): GameState => {
      state = gameReducer(state, action);
      return state;
    };

    dispatch({
      type: 'START_GAME',
      mode: 'spot_diff',
      source: 'official',
      questions,
    });
    expect(state.phase).toBe('playing');
    expect(state.questionIndex).toBe(0);

    dispatch({ type: 'FOUND_DIFFERENCE', index: 0, timeLeft: 12 });
    dispatch({ type: 'FOUND_DIFFERENCE', index: 1, timeLeft: 8 });
    expect(state.phase).toBe('round_end');
    expect(state.score).toBe(2 * FOUND_SCORE + 8 * TIME_BONUS_PER_SECOND);

    dispatch({ type: 'NEXT_ROUND' });
    expect(state.phase).toBe('playing');
    expect(state.questionIndex).toBe(1);

    dispatch({ type: 'FOUND_DIFFERENCE', index: 0, timeLeft: 3 });
    expect(state.phase).toBe('round_end');
    expect(state.score).toBe(3 * FOUND_SCORE + 8 * TIME_BONUS_PER_SECOND + 3 * TIME_BONUS_PER_SECOND);

    dispatch({ type: 'NEXT_ROUND' });
    expect(state.phase).toBe('result');

    dispatch({ type: 'RESET' });
    expect(state.phase).toBe('menu');
    expect(state.score).toBe(0);
  });
});
