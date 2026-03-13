# Website

Single-file feature roadmap at `website.html`. No build step — just static HTML with inline CSS and SVG.

## Structure

- **Header** — title + subtitle
- **"On the Horizon"** section — planned feature cards (class `card`)
- **"Already Implemented"** section — shipped feature cards (class `card done`)

Each card has:
1. Inline SVG icon (hand-drawn, ~100x100 viewBox)
2. `<h2>` title
3. `<p>` description
4. Shipped cards also get `<span class="badge shipped">Shipped</span>`

## Adding a new planned feature

1. Add a `<div class="card">` inside the first `.grid` (under "On the Horizon")
2. Include an inline SVG icon, `<h2>`, and `<p>`

## Moving a feature to "shipped"

1. Move the card's `<div>` from the first `.grid` to the second `.grid` (under "Already Implemented")
2. Change `class="card"` to `class="card done"`
3. Add `<span class="badge shipped">Shipped</span>` before the `<h2>`

## Adding a new section

Add a `<div class="section-header">` with an `<h2>` and `<p>`, then a new `<div class="grid">` after it. Use CSS class `planned` or `done` on the section header for color.

## Style notes

- Colors: dark navy background (`#0a1628`), gold headings (`#f0c040`), green for shipped (`#66BB6A`)
- Fonts: Pirata One (headings), Inter (body) — loaded from Google Fonts
- SVG icons are inline (no external files), using the game's color palette
- Cards have hover lift effect and gold/green border highlight
