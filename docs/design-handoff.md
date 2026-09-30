# Handoff spec: Finspace interface

## Overview
Finspace is a private, manual-first finance app for people who want to see every account, card and holding in one place, without connecting a bank. The interface should feel like a private bank statement: calm, exact and unhurried. Richness comes from typography, material and restraint, not from decoration.

**Rules that keep it from looking generated**
- No emoji anywhere in the interface. Categories and goals use one drawn icon family (Lucide, 1.5–1.6 stroke); custom categories get a serif monogram. See `src/components/glyphs.tsx`.
- One accent (champagne gold), used for primary actions, the active nav item and progress. Never for large fills.
- Surfaces are solid with hairline borders. No frosted glass on content panels, no coloured drop-shadow glows, no animated sheens inside the app. The sign-in showcase is the one deliberately theatrical area.
- Labels are sentence case. Uppercase is only for table headers and the tiny kind badge on cards.
- Headings are editorial (Fraunces); figures are Geist with tabular numerals so columns line up.
- Headings state facts ("Wednesday 30 September", "Money"), not chatty greetings.

## Layout
| Area | Spec |
|---|---|
| Shell | 248px sidebar + fluid main; main content `max-width: 1440px` |
| Content padding | 32px sides (desktop), 16px (≤860px) |
| Dashboard grid | 12 columns, 24px gap (16px on phones); spans 12/8/7/6/5/4/3 |
| Panels | `--radius-lg` (16px), 24px padding (18px on phones), 1px `--border` |
| Sign-in | Two columns ≥1021px (form ~52% / showcase ~48%); showcase stacks above the form below that |

## Design tokens used
| Token | Value (dark / light) | Usage |
|---|---|---|
| `--bg` | #060910 / #f4f2ec | Page background |
| `--surface-1` | #0d1320 / #ffffff | Panels, KPI tiles, banners |
| `--surface-2` | #121a2b / #f8f7f3 | Nested cells, icon tiles, secondary buttons |
| `--surface-3` | #18223a / #efece4 | Hover, pressed segment |
| `--border` / `--border-strong` | slate @ 12% / 22% | Hairlines, inputs |
| `--text-1/2/3` | #eef1f7, #a3aec2, #7f8ba3 | Primary, secondary, tertiary text (all ≥4.5:1 on surfaces) |
| `--accent` / `--accent-strong` | #d4b26a / #e6c98a (light: #8a6526 / #6f4f19) | Primary buttons, active states, progress |
| `--in` / `--out` | #4f7fe0 / #b8892c | Money in / money out series |
| `--gain` / `--loss` | #34c79a / #f0616d | Gains and losses only |
| `--radius-sm/--radius/--radius-lg` | 8 / 12 / 16px | Buttons, tiles, panels |
| `--font` / `--display` | Geist Variable | Interface text / figures |
| `--serif` | Fraunces Variable (opsz) | Page titles, sheet and dialog titles, brand |
| Spacing scale | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 | All gaps and padding |
| Type scale | 12 · 13 · 14 · 16 · 18 · 20 · 24 · 26 · 30 · 38 · 50 | Body 14/1.5; page title 26 serif; hero figure 50 |

## Components
| Component | Variant | Notes |
|---|---|---|
| Button | default, primary, ghost, danger, sm, icon | Primary is flat `--accent` with a 1px inner highlight; 38px tall (44px on touch) |
| Panel | default | Title 15/600 sans + 13px sub in `--text-3`; action link top-right, never wraps |
| KPI tile | — | Label 13px `--text-2`, value 26/600 tabular, foot 12px |
| Delta | up / down / flat | Coloured figure with arrow; no pill background |
| Category glyph | `CatGlyph`, `CatLabel` | 24px round tile, `--surface-2`, icon 14px `--text-2` |
| Goal glyph | `GoalGlyph` | Gold icon in a 34px `--accent-soft` circle or inside the progress ring |
| Transaction row | — | 38px round icon tile · payee 600 · meta 12px `--text-3` · amount right, tabular |
| Card deck | swipe | 3D stack; the active card's info panel sits below it |
| Sheet | side (desktop) / bottom (≤860px) | Bottom sheet has a 38×5px grab bar, 22px top radius, safe-area padding |
| Banner (demo, notices) | — | `--surface-1` with a 2px gold rule on the left, not a gold fill |
| Showcase (sign-in) | — | Guilloché rosette, three floating cards, glass net-worth chip; illustrative numbers are labelled |

## States and interactions
| Element | State | Behaviour |
|---|---|---|
| Button | Hover | Default: `--surface-3`. Primary: `--accent-strong` |
| Button | Active | `scale(0.98)` for 100ms |
| Button | Disabled | 50% opacity, `not-allowed` cursor |
| Button | Loading | Label changes to "Please wait…" / "Reading your statement…"; control disabled |
| Input | Focus | 2px `--accent` outline, 2px offset |
| Input | Error | Message below in `--loss`, `role="alert"` |
| Nav item | Current | `--accent-soft` fill, gold icon, left rule, `aria-current="page"` |
| Card deck | Drag / flick | Follows the pointer; momentum is capped at about one card per flick |
| Statement drop zone | Drag over / reading | Accepts PDF, CSV, TSV, XLSX, OFX/QFX, QIF; spinner while reading |

## Responsive behaviour
| Breakpoint | Changes |
|---|---|
| Desktop (>1180px) | Full sidebar, search field in top bar, 12-column dashboard |
| Tablet (861–1180px) | Most panels go full width; search collapses to an icon |
| Phone (≤860px) | Sidebar becomes a floating bottom tab bar plus an add button; sheets become bottom sheets; inputs are 16px so iOS doesn't zoom |
| Small phone (≤520px) | KPIs go 2-up; the sign-in showcase shrinks to the cards and headline |
| Installed (standalone) | Safe areas are respected at every edge; long-press on controls doesn't select text |

## Edge cases
- **Empty states:** icon, one-line title, a sentence explaining why it's empty, and one action.
- **Long text:** the page title and subtitle truncate with an ellipsis; payees ellipsize in rows; panel action links never wrap.
- **Loading:** statement import shows a spinner and "Reading your statement…"; prices show "Updating…".
- **Errors:** say what happened and what to do, e.g. "This PDF is password-protected. Open it, save or print a copy without a password, and import that."
- **Missing data:** an account in a currency with no exchange rate is left out of totals, and a notice links to add the rate.
- **Privacy mode:** every amount is masked, and charts keep their shape without figures.

## Animation and motion
| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Page | Route change | Fade and rise 8px | 500ms | `--ease` (0.22, 1, 0.36, 1) |
| Sheet (phone) | Open | Slide up from the bottom | 420ms | `--ease` |
| Sheet (desktop) | Open | Slide in 40px from the right | 350ms | `--ease` |
| Card deck | Swipe | Spring to the nearest card | ~450ms | `--ease` |
| Showcase cards | Idle | Float ±8px | 8–10s loop | ease-in-out |
| Showcase rosette | Idle | Rotate 360° | 160s loop | linear |
| Net-worth line | Mount | Draws in | 2.4s | `--ease` |

All motion stops under `prefers-reduced-motion: reduce`.

## Accessibility notes
- **Focus order:** skip link → sidebar → top bar → content → sheets. Focus is trapped inside open sheets and dialogs, starting on `[data-autofocus]`.
- **Labels:** icon-only buttons have `aria-label` ("Share Finspace", "Lock Finspace", "Search and commands"); decorative glyphs are `aria-hidden`.
- **Keyboard:** ⌘K opens the palette; N adds a transaction; H hides amounts; ← → move through the card deck; Esc closes sheets.
- **Announcements:** toasts use `role="status"`, and error toasts use `role="alert"`.
- **Contrast and targets:** WCAG 2.2 AA; every control has at least a 24×24 hit area, and 44px on touch screens.
- **Colour is never the only signal:** deltas carry arrows and signs, and chart series are labelled with a table view.
