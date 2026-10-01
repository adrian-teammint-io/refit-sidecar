---
name: ui-system
description: Refit Sidecar's design system (copied from claude-sidecar) — theme tokens, shared CSS primitives, typography, motion and layout recipes for the drawer, popup and settings page. Use when building a new UI surface or component, restyling, adding a theme, or reviewing UI code in this repo.
---

# UI system

Direction: **dark premium, keyboard-first**, in the spirit of Raycast and Linear. The UI is dense but calm: one accent, quiet surfaces, numbers in tabular figures. Every surface follows the user's theme and mode.

## 1. Tokens

`src/themes.ts` defines `THEMES[key] = { label, dark: Pal, light: Pal }`, where `Pal` is `[bg, surface, raised, text, muted, accent, onAccent]`. `vars(theme, dark)` returns them as `--bg --surface --raised --text --muted --accent --on-accent`, applied inline on `.root`.

`src/ui.css` derives the rest. Use these names and don't invent new colours:

| Token | Meaning |
|---|---|
| `--bg` | page / panel background |
| `--surface` | cards, inputs |
| `--raised` | selected segment, code, step numbers |
| `--line` / `--line-strong` | 1px borders (10% / 18% text) |
| `--hover` | hover wash (5% text) |
| `--accent` / `--accent-soft` | the one brand hue / 16% tint |
| `--shadow-tint` | shadow colour derived from bg (no pure black) |
| `--ease-out` `--ease-drawer` | motion curves |
| `--sans` `--mono` | Geist Variable / JetBrains Mono Variable |

Fixed hues are allowed only for status:
- Run state via `.pill[data-tone]` (ui.css): green ok, red fail, accent while running. Failure reasons get a faint red tint.
- Error: `#f87171` dark / `#b91c1c` light.
- Danger button: `#dc2626`.

In light mode the accent can be too dark to read as text on a tint. Use `.light .x { color: var(--text) }`, as `.badge` and `.empty-icon` do.

### Adding a theme

Add one entry to `THEMES` with both palettes. Then check the following, and render the drawer Settings and popup with `ui-verify` in both modes:
- `text` on `bg` ≥ 4.5:1
- `onAccent` on `accent` ≥ 4.5:1
- the light-mode `accent` is dark enough to read as text

## 2. Primitives (`src/ui.css`)

| Class | Use |
|---|---|
| `.btn.primary` / `.btn.ghost` / `.btn.danger` | 34px buttons; an optional trailing `kbd` shows the shortcut |
| `.icon-btn` | 32px square icon button. Always add `aria-label` and `title` |
| `.segmented` | Radiogroup. Children are `button role="radio" aria-checked`; any count (auto columns) |
| `.hint` / `.err` / `.muted` | helper text, inline error, secondary colour |
| `kbd`, `code` | shortcut keys, inline variable names |

React wrappers live in `src/shared/controls.tsx`:
- `<Segmented label value options={[[v, text]]} onChange />`
- `<Switch label checked onChange />`, which renders `.switch` with `role="switch"`
- `<ThemePicker settings dark onChange />`, the mode segmented plus the theme grid. The popup compacts the grid to 4 columns via `.p-settings .themes`.

Shared components (used by two or more surfaces, styled in `ui.css`):
- `<Terminal output run now onCancel />` (`shared/Terminal.tsx`): `.term-wrap` > `.term` log + `.term-bar` with status pill, Follow switch, Cancel
- `<SyncList rows now limit? newTab? />` (`shared/SyncList.tsx`): `.sync` cards; the popup compacts them in `popup.css`
- `<HostSetup host compact? />` / `<HostCard host />` (`shared/HostSetup.tsx`): host-missing empty state with the copyable install command, and the status row
- `.pill[data-tone=ok|fail|run]`, `.banner` (amber, keeps last data), `.badge` (platform), `.btn.sm`

Icons are inline Lucide-style SVG paths (`ICONS` in `shared/icons.tsx`): 24 viewBox, stroke 1.8, `currentColor`. No icon libraries, no emoji.

Surface-specific styles stay with their surface: `content/styles.css` (drawer, `@import '../ui.css'`) and `popup/popup.css`. Promote a style to `ui.css` once a second surface needs it.

## 3. Typography

- Base is 13px / 1.45 Geist with letter-spacing -0.005em. Titles are 14px/600, big numbers 38px/650 at -0.04em.
- Eyebrows: 10.5px, 600, uppercase, letter-spacing 0.08–0.09em, `--muted`.
- Numbers use `font-variant-numeric: tabular-nums` (set on `.popup`).
- Use mono for data axes, tags, code, kbd and variable names.
- Fonts come from `@fontsource-variable/*`:
  - Extension pages import the CSS directly.
  - The content script inlines it into the page `<head>`, because shadow DOM ignores `@font-face`.

## 4. Shape and depth

- **Radius ladder:** drawer 16, card 14, input/button 9–10, chip 999, heat cell 3–5. Inner radius = outer radius minus padding.
- **Borders:** 1px `--line`. Selected state is `--accent` border plus a 1px accent ring.
- **Shadows:** layered, one light source (offset down/left for the right-docked drawer), tinted with `--shadow-tint`.
- **Atmosphere:** a soft radial `--accent` glow (6–7%) in a corner of the panel background. Never a flat gradient wash.

## 5. Motion

| Interaction | Spec |
|---|---|
| press | `transform: scale(.94–.97)` on `:active`, 120–160ms |
| hover | colour/background only, 150ms, inside `@media (hover: hover) and (pointer: fine)` |
| drawer | translateX with `--ease-drawer`: 300ms open, 260ms close; `visibility` delayed on close |
| cards / list items | 4px rise + fade, 220–240ms, 30–50ms stagger |
| gauges / bars | `stroke-dashoffset` / `width` transition 300ms `--ease-out` |

Rules:
- List exact transition properties, never `all`.
- Don't animate keyboard-driven changes such as list navigation.
- Every stylesheet ends with a `prefers-reduced-motion` block that removes movement and keeps fades.

## 6. Layout recipes

- **Surface shell:**
  ```tsx
  <main className={`root ${dark ? 'dark' : 'light'} <surface>`} style={vars(settings.theme, dark)}>
  ```
  Resolve dark as `mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)`. Extension pages also set `document.documentElement.style.background = theme['--bg']` to avoid a white flash.
- **Card:** `.card` = 16px padding, `--surface`, `--line` border, radius 14. Put an eyebrow on top and the value below.
- **Popup:** 420px wide (Chrome's max is 800×600; stay under ~580px tall). Two-column card grid with 10px gap. Use `minmax(0, 1fr)` for dense grids so labels can't force overflow.
- **Drawer:** 420px, right-docked, inset 12px, sticky footer with keyboard hints.
- **States to design every time:** loading (skeleton shimmer, `aria-busy`), empty (icon tile + one sentence + primary action), error (amber banner that keeps the last data and offers a fix action), success (toast).

## 7. Accessibility checklist

- Every input has a `<label htmlFor>`.
- Radiogroups use `role="radio"` with `aria-checked`. Progress bars carry `aria-valuenow`, `aria-valuemin` and `aria-valuemax`.
- `:focus-visible` shows a 2px accent outline; never remove it.
- Hit targets are ≥ 32px. Use a negative-inset `::before` to enlarge small ones (see `.launcher`).
- Esc goes back or closes. ↑/↓/Enter navigate lists.
