import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

const ISSUE_URL =
  'https://github.com/hsyhhssyy/HypergryphSchoolTeamSimulator/issues/new?template=question-submission.yml';

export interface MenuProps {
  onStart: () => boolean;
  startError?: string | null;
  starting?: boolean;
}

function ShuffleIcon(): JSX.Element {
  return (
    <svg className="mode-card__icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h4c7 0 9 16 16 16h4" /><path d="m24 20 4 4-4 4" />
      <path d="M4 24h4c3 0 5-3 7-7M21 8h7" /><path d="m24 4 4 4-4 4" />
    </svg>
  );
}

export function Menu({ onStart, startError = null, starting = false }: MenuProps) {
  const [showSubmitChoices, setShowSubmitChoices] = useState(false);
  return (
    <main className="screen menu menu--source-official">
      <div className="menu__stickers" aria-hidden="true">
        <span className="menu__sticker menu__sticker--star-1" />
        <span className="menu__sticker menu__sticker--star-2" />
        <span className="menu__sticker menu__sticker--circle-1" />
        <span className="menu__sticker menu__sticker--circle-2" />
        <span className="menu__sticker menu__sticker--dot" />
      </div>
      <header className="menu__hero">
        <h1 className="font-display">
          <picture>
            <source type="image/webp" srcSet={`${import.meta.env.BASE_URL}wordmark.webp`} />
            <img className="menu__title-img" src={`${import.meta.env.BASE_URL}wordmark.png`} alt="鹰角网络校队" draggable={false} decoding="async" />
          </picture>
        </h1>
        <p className="text-muted">本地题库 · 每局随机玩法 · 答题小游戏</p>
      </header>

      <section className="menu__section" aria-labelledby="menu-mode-heading">
        <h2 id="menu-mode-heading" className="menu__heading">准备好了吗？</h2>
        <p className="menu__source-hint">开始时将随机分配「找不同」或「区域识别」玩法</p>
        <button type="button" className={`mode-card mode-card--entry${starting ? ' mode-card--loading' : ''}`} aria-busy={starting} disabled={starting} onClick={onStart}>
          <ShuffleIcon />
          <span className="mode-card__label">随机玩法</span>
          <span className="mode-card__desc">题目全部来自项目本地题库</span>
          <span className="mode-card__action">{starting ? '正在抽取…' : '开始游戏 →'}</span>
        </button>
      </section>

      <button type="button" className="btn btn--ghost menu__workshop" onClick={() => setShowSubmitChoices(true)}>
        投稿题目 ✦
      </button>

      {startError !== null && (
        <div className="menu__error-block">
          <p role="alert" className="menu__error">{startError}</p>
          <button type="button" className="btn btn--ghost menu__retry" disabled={starting} onClick={onStart}>重试</button>
        </div>
      )}

      {showSubmitChoices && (
        <div className="submit-guide" role="presentation" onClick={() => setShowSubmitChoices(false)}>
          <section className="submit-guide__card" role="dialog" aria-modal="true" aria-labelledby="submit-guide-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="submit-guide__close" aria-label="关闭投稿选项" onClick={() => setShowSubmitChoices(false)}>×</button>
            <span className="submit-guide__spark" aria-hidden="true">✦</span>
            <h2 id="submit-guide-title" className="font-display">一起扩充题库吧！</h2>
            <p>推荐先用投稿工具编辑图片、标记答案并生成 ZIP，再前往 GitHub Issue 上传 ZIP。</p>
            <div className="submit-guide__steps" aria-label="投稿步骤">
              <span><b>1</b> 制作题目</span><i aria-hidden="true">→</i><span><b>2</b> 下载 ZIP</span><i aria-hidden="true">→</i><span><b>3</b> 上传 Issue</span>
            </div>
            <div className="submit-guide__actions">
              <a className="submit-choice submit-choice--tool" href="#/submit">
                <strong>打开投稿工具</strong><small>支持多题、图片编辑与答案选区</small>
              </a>
              <a className="submit-choice submit-choice--github" href={ISSUE_URL} target="_blank" rel="noreferrer">
                <strong>前往 GitHub Issue ↗</strong><small>上传工具生成的 ZIP 文件</small>
              </a>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
