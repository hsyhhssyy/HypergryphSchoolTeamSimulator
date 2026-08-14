import { useReducer } from 'preact/hooks';
import type { GamePhase } from '@shared/types';

/**
 * Minimal slice of the canonical GameState (shared/types.ts). Todo 8 grows
 * it into the full shape; phase + action vocabulary below are the frozen
 * skeleton that useGameState must stay consistent with.
 */
interface GameState {
  phase: GamePhase;
  score: number;
  questionIndex: number;
  foundIndices: number[];
  wrongCount: number;
}

const initialState: GameState = {
  phase: 'menu',
  score: 0,
  questionIndex: 0,
  foundIndices: [],
  wrongCount: 0,
};

/**
 * ONE game-level reducer for the whole app — App renders screens from
 * `phase`. Actions are stubs; the full transitions (FOUND_DIFFERENCE,
 * WRONG_CLICK, guarded TIME_UP/NEXT_ROUND, score math) arrive in todo 8.
 */
type GameAction =
  | { type: 'START_GAME' }
  | { type: 'TIME_UP' }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESET' };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return { ...initialState, phase: 'playing' };
    case 'TIME_UP':
      return { ...state, phase: 'round_end' };
    case 'NEXT_ROUND':
      return { ...state, phase: 'result' };
    case 'RESET':
      return initialState;
  }
}

export function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  switch (state.phase) {
    case 'menu':
      return (
        <main className="screen">
          <h1 className="font-display" style={{ fontSize: 'var(--font-size-display)' }}>
            找不同
          </h1>
          <p className="text-muted">
            双图找茬 · 区域识别 · 答题小游戏
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => dispatch({ type: 'START_GAME' })}
          >
            开始游戏
          </button>
          <span className="chip">菜单占位 · todo 11 接入真实菜单</span>
        </main>
      );
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
