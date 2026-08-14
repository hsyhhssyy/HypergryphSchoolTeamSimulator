import type { GameState, Question } from '@shared/types';
import type { JSX } from 'preact';
import type { Dispatch } from 'preact/hooks';
import { useGameState, type GameAction } from '@/hooks/useGameState';
import { AudioPlayer } from '@/components/AudioPlayer';

/**
 * Placeholder round data so the menu's 开始游戏 button exercises the real
 * state machine until todo 11 wires the menu to the API client.
 */
const PLACEHOLDER_QUESTIONS: Question[] = [
  {
    id: 'placeholder-1',
    mode: 'spot_diff',
    title: '占位题目',
    description: '找出两图的不同之处（占位数据，todo 11 接入真实题目）',
    imageA: 'https://picsum.photos/seed/a/800/600',
    imageB: 'https://picsum.photos/seed/b/800/600',
    differences: [
      { type: 'circle', x: 120, y: 80, radius: 25 },
      { type: 'rect', x: 300, y: 150, width: 40, height: 30 },
      { type: 'circle', x: 600, y: 400, radius: 20 },
    ],
    showCount: true,
    source: 'official',
    status: 'approved',
    likes: 0,
    dislikes: 0,
    createdAt: '2026-08-14T00:00:00Z',
  },
];

export function App() {
  const { state, dispatch } = useGameState();

  return (
    <>
      {renderPhase(state, dispatch)}
      {/* Floating BGM player — present on every screen, never autoplays. */}
      <AudioPlayer />
    </>
  );
}

function renderPhase(state: GameState, dispatch: Dispatch<GameAction>): JSX.Element {
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
            onClick={() =>
              dispatch({
                type: 'START_GAME',
                mode: 'spot_diff',
                source: 'official',
                questions: PLACEHOLDER_QUESTIONS,
              })
            }
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
