import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Menu } from './Menu';

describe('Menu static random-game entry', () => {
  it('offers one random start action and no selectors', () => {
    const html = renderToString(<Menu onStart={() => true} />);
    expect(html).toContain('随机玩法');
    expect(html.match(/mode-card--entry/g)).toHaveLength(1);
    expect(html).not.toContain('source-toggle');
  });

  it('opens the guided submission chooser', () => {
    const html = renderToString(<Menu onStart={() => true} />);
    expect(html).toContain('投稿题目');
    expect(html).toContain('menu__workshop');
    expect(html).not.toContain('issues/new');
  });

  it('shows a disabled loading entry', () => {
    const html = renderToString(<Menu onStart={() => true} starting />);
    expect(html).toContain('正在抽取…');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
  });
});
