# 鹰角网络校队 (Spot the Difference) — Design System

## 0. Research Log (greenfield)

- Embedded refs: shortlisted `figma.md` (vibrant multi-color, playful) + `posthog.md` (playful hedgehog branding) + `zapier.md` (friendly gradients) → picked `figma.md` for its signature **vibrant multi-stop gradient + pill geometry**, combined with the plan's explicit cartoon brief (todo 3 spec: bright playful palette, radii ≥ 12px, Baloo 2 / ZCOOL KuaiLe display type, bounce/wiggle/confetti keyframes).
- Lazyweb: skipped — no network-accessible screen research needed; the game brief is fully specified in the plan.
- Imagen drafts: skipped — this todo ships the token foundation, not pixel mockups; screens are built later (todos 11–15) directly on these tokens.
- Palette sanity-checked against the plan's required tokens: primary/danger/success + secondary/background/accent.

## 1. Atmosphere & Identity

A candy-box arcade game: warm cream paper background, thick ink outlines, and saturated candy colors that pop like stickers on a lunchbox. The signature is **"candy on cream"** — every interactive surface is a rounded, shadowed, gradient-topped candy button that visibly bounces when pressed, on a soft cream field with a subtle sunburst sky gradient. The one moment a player remembers: the **pop-bounce** of a correct hit and the **wiggle** of a wrong one — the game surface itself reacts like a character.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Background | --color-background | #FFF6E5 (warm cream) | Page background |
| Background alt | --color-background-alt | #FFEECB (deeper cream) | Cards, panels, game surface band |
| Surface | --color-surface | #FFFFFF | Cards, panels |
| Primary | --color-primary | #FF8A3D (tangerine) | CTA buttons, active states |
| Primary alt | --color-primary-alt | #FF6B6B (coral) | Gradient partner of primary |
| Secondary | --color-secondary | #4ECDC4 (teal) | Secondary buttons, toggles |
| Accent | --color-accent | #FFD166 (sun yellow) | Highlights, badges, confetti |
| Accent alt | --color-accent-alt | #FFB347 (amber) | Gradient partner of accent |
| Danger | --color-danger | #EF476F (hot pink-red) | Wrong hits, errors, penalties |
| Success | --color-success | #06D6A0 (mint green) | Correct hits, round complete |
| Info | --color-info | #6C8EFF (periwinkle) | Tips, neutral info |
| Ink | --color-ink | #3D2C1F (warm dark brown) | Text, icons — NEVER pure black |
| Ink muted | --color-ink-muted | #8A7463 (warm gray-brown) | Captions, disabled text |
| Ink on-color | --color-ink-on | #FFFFFF | Text on colored fills |

### Rules
- Text is always `--color-ink` (warm dark brown), never pure black — keeps the candy warmth.
- Color is used for interactive meaning: success = found it, danger = missed it, primary = the main action.
- Any new color must be added to this table first — no orphan hexes in components.

## 3. Typography

### Fonts
- **Display (headings, score, big buttons)**: `"Baloo 2"` (Google Font, `font-display: swap`), fallback `"ZCOOL KuaiLe"`, then `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`. Loaded via Google Fonts `<link>` with `display=swap`.
- **Body/UI**: `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif` — crisp on mobile, zero font-load cost for Chinese text.

### Scale

| Level | Token | Size | Weight | Line-height | Usage |
|-------|-------|------|--------|-------------|-------|
| Display | --font-size-display | 34px | 700 | 1.15 | Screen titles |
| H1 | --font-size-h1 | 26px | 700 | 1.2 | Section headers |
| H2 | --font-size-h2 | 20px | 700 | 1.25 | Card titles |
| Body | --font-size-body | 17px | 500 | 1.5 | Default text, buttons |
| Small | --font-size-small | 14px | 500 | 1.4 | Captions, hints |
| Micro | --font-size-micro | 12px | 600 | 1.3 | Badges, labels (uppercase-friendly) |

### Rules
- Display font only for headings and scores — body stays system for CJK clarity.
- Never below 12px (micro floor).

## 4. Spacing & Layout

### Base unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Tight icon gaps |
| --space-2 | 8px | Compact gaps, chip padding |
| --space-3 | 12px | Form field padding |
| --space-4 | 16px | Card padding, default gap |
| --space-6 | 24px | Section spacing |
| --space-8 | 32px | Screen edge padding, big gaps |
| --space-10 | 40px | Major section breaks |

### Grid
- Mobile-first; max content width 640px. Game panels: mobile/portrait stack the two spot-diff images vertically (`.game-panels` defaults to ONE `1fr` column); at `@media (min-width: 900px)` desktop, spot_diff goes side-by-side (`1fr 1fr` via `.game-panels:not(.game-panels--single)`), and the game panels / HUD / question description widen to `min(1120px, 92vw)`. find_area's single-panel mode (`.game-panels--single`) stays one column at EVERY width — the `:not(...--single)` guard must never be dropped.
- Screen shell: `min-height: 100dvh` (never `100vh` — iOS URL bar), `padding: env(safe-area-inset-*)` via `--safe-area-top/bottom` tokens.
- No horizontal scroll: `overflow-x: hidden` on html/body guard.

## 5. Components (primitives, foundation layer)

### .btn (touch button)
- **Structure**: `<button class="btn btn--primary">` — inline-block, centered text.
- **Variants**: `--primary` (tangerine→coral gradient), `--secondary` (teal), `--ghost` (white surface, ink border), `--danger` (hot pink).
- **Spacing**: `padding: 14px 24px`; radius `--radius-pill` (999px); `min-height: 44px` (touch target).
- **States**: default (gradient + `--shadow-candy`), active (`transform: scale(0.96)` pop), focus-visible (dashed `--color-accent` outline), disabled (muted, no shadow, `pointer-events` semantics via `:disabled`).
- **Accessibility**: `touch-action: manipulation`; visible focus; contrast ≥ 4.5:1 (white text on tangerine = 3.6:1 → large-text pass; body text always ink on cream = 8+:1).
- **Motion**: press pop 120ms; entry pop 350ms.

### .card
- **Structure**: `<div class="card">` — white surface.
- **Variants**: default; `--tilted` (slight rotate for playfulness).
- **Spacing**: `padding: var(--space-4)`; radius `--radius-card` (20px).
- **States**: rest (`--shadow-card`), no hover on touch.
- **Motion**: entry pop 350ms staggered.

### .chip / .badge
- Small rounded status labels (found count, mode tag): radius `--radius-pill`, micro font, colored per semantic role.

### .screen
- Full-viewport phase wrapper (menu / playing / round_end / result): `min-height: 100dvh`, safe-area padding, centered column stack.

### .hud (HUD, todo 15)
- **Structure**: `<header class="hud">` — score chip + timer bar + found chip in one row, `max-width: 720px`; at `@media (min-width: 900px)` desktop it widens to `min(1120px, 92vw)` (matches `.game-panels`).
- **Timer bar**: track `--radius-pill`, fill width is a RUNTIME percent (`timeLeft/totalTime`, inline style — dynamic value, not a token), teal→mint gradient; `--low` variant (<25% remaining) switches to danger gradient — a real low-time signal, not decoration. Label uses `font-variant-numeric: tabular-nums` (no width jitter each second).
- **Found chip**: `chip--success` when the count is shown; show_count=false renders the unnumbered "还有差异未找到" — gameplay concealment; the Result screen always reveals the count.
- **Accessibility**: timer bar is a `role="progressbar"` with `aria-valuemin/max/now/text`.

### .result (Result screen, todo 15)
- **Structure**: `.screen.result-screen` — title, score card, found/missed list, 再来一局 button (all `max-width: 420px`).
- **Score card**: white surface, `--color-success` left edge, display-font score, success-ink accuracy (accuracy = found/(found+wrong), 0 on the no-taps case — never NaN).
- **Found/missed list**: one row per difference (numbered circle badge, type label 圆形区域/矩形区域, status 已找到/未找到). Missed rows = danger tint bg + danger border + danger status — ALWAYS shown regardless of show_count.
- **States**: replay button = `.btn.btn--primary` → dispatch RESET.

## 6. Motion & Interaction

### Keyframes (tokens usable by any component)

| Name | Token | Purpose |
|------|-------|---------|
| --anim-bounce | bounce 350ms cubic-bezier(0.34, 1.56, 0.64, 1) | Correct-hit marker pop, button entry |
| --anim-pop | pop 350ms cubic-bezier(0.34, 1.56, 0.64, 1) | Card/screen entry |
| --anim-wiggle | wiggle 400ms ease-in-out | Wrong-hit ✕, shake feedback |
| --anim-confetti | confetti-fall 2s linear infinite | Result celebration (confetti-ready) |
| --anim-fade-out | fade-out 600ms ease-out | Wrong-hit ✕ fading (todo 13) |

### Timing
- Micro 120ms (press), standard 250ms (state change), emphasis 350–400ms (entries), confetti 2s loop.

### Rules
- GPU-composited only: `transform` + `opacity` + `filter`. Never animate layout properties.
- `prefers-reduced-motion: reduce` disables all decorative animation (bounce/wiggle/confetti) — game feedback stays instant.
- Motion maps to real state: pop on entry, bounce on correct hit, wiggle on wrong hit. No decorative slop.

## 7. Depth & Surface

Strategy: **shadows + gradient** (candy elevation).

| Level | Token | Value | Usage |
|-------|-------|-------|-------|
| Card | --shadow-card | 0 4px 12px rgba(61, 44, 31, 0.12) | Cards at rest |
| Candy | --shadow-candy | 0 4px 0 #D96A2B (solid drop) + 0 6px 16px rgba(61,44,31,0.18) | Buttons — the solid offset edge reads as candy depth |
| Pop | --shadow-pop | 0 8px 24px rgba(61, 44, 31, 0.22) | Modals, floating elements |

Interactive gradient accents: primary buttons use `linear-gradient(180deg, var(--color-primary), var(--color-primary-alt))`; the page background carries a soft `radial-gradient` sunburst from `--color-accent` to `--color-background`.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- WCAG 2.2 AA target: contrast floor 4.5:1 body / 3:1 large text; visible focus on every interactive element (dashed accent outline); full keyboard reachability; `prefers-reduced-motion` respected; touch targets ≥ 44px; **no** `user-scalable=no` / `maximum-scale=1` (WCAG 1.4.4); `touch-action: manipulation` on all controls.
- `touch-action: none` reserved for the game surface overlay (ImagePanel, todo 12) — needs pointer-based hit precision, and its coordinates are handled by the panel itself.
- Chinese text at body scale never below 14px for primary content.

### Accepted Debt
| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Google Fonts (Baloo 2) requires network | index.html | H5 game runs online; fallback chain keeps CJK system font intact offline | If offline mode is ever needed, bundle font via @fontsource |
| White text on tangerine CTA = 3.6:1 (large-text pass only) | .btn--primary | Candy aesthetic priority; button text is 17px/700 (large text ≥ 3:1) | Re-audit in todo 23 if color shifted |
| Body-text contrast floor measured on cream, not white | global | Warm background raises contrast above 8:1 for ink text | None |
