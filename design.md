# Design: BAKTINUSA HUB

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: app screen
- Theme: brand (the BAKTI NUSA red and the logo are kept; everything else was restyled on 27 Oct 2026)
- Axes: light/grotesk-sans/chromatic-red · posture: Restrained

## Tokens
`app/tokens.css` is the source of truth. The roles:
```css
:root {
  --color-paper: oklch(98.5% 0.004 20);  --color-paper-2: oklch(96% 0.006 20);  --color-paper-3: oklch(93% 0.008 20);
  --color-ink: oklch(21% 0.012 20);  --color-ink-2: oklch(36% 0.012 20);  --color-muted: oklch(50% 0.012 20);  --color-rule: oklch(90% 0.008 20);
  --color-accent: oklch(58% 0.205 20);  --color-accent-ink: oklch(99% 0.005 20);  --color-focus: oklch(55% 0.2 20);
  --font-display: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;  --font-body: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --radius-card: 8px;  --radius-pill: 999px;  --shadow-card: none;
}
```
The spacing scale, the type scale (1.2 ratio from a 16px body), the easings and the durations are the scaffold's and live in `tokens.css`.
`app/globals.css` maps the project's older names (`--ink`, `--surface`, `--card`, `--primary` and the rest) onto these roles; add a colour there only as a derived value, never as a literal in a rule.

## Surfaces
- The page and the card share one paper. A card is a 1px border (`--line`) and an 8px radius, never a shadow as well. A well (`--surface-sunken`) sits inside a card, never a bordered box inside a well.
- The accent marks the primary action, the active nav item, the focus ring and status. It is never a fill for a surface.
- Radii, one per level: 12px the rail and dialogs, 8px cards, 6px controls and tiles, 4px tags and bars. Round only what is round (an avatar, a close button).
- Weights: 400, 600, 700, and no others. Labels, table heads and captions are the body face a step smaller, sentence case, untracked.

## Controls
- Primary: accent fill · 6px radius · 40px tall (32px small)
- Secondary: outline in `--field-edge` · same radius and height. Delete is a secondary too, outlined in `--bad`.
- Fields: 1px `--field-edge` (3:1 or better), the focus ring an inset outline, never a border change.

## Motion
- Character: still; a notice fades in with opacity only; no reveal on load; under reduced motion everything ends at once.

## Exports
`app/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
