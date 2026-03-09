# Sea Game

2D top-down pirate ship sim. "Dwarf Fortress till sjöss." TypeScript + Canvas + Vite.

**Time scale:** 1 in-game day = 12 minutes IRL (720 seconds). All time-based calculations use this ratio. Defined as `SECONDS_PER_DAY` in `src/worldmap.ts`.

## Quick start

```
npm install
npm run dev      # Vite dev server on port 7070
```

## Project structure

```
src/
  main.ts          Entry point — creates Game and starts loop
  game.ts          Game class — owns all state, orchestrates update/render
  types.ts         All shared types, enums, constants (TILE_SIZE=32, CANVAS=960x540)
  ship.ts          Ship layout — two decks defined as ASCII art, parsed to TileType[][]
  crew.ts          Crew AI — needs system (hunger/energy), A* pathfinding, autonomous behavior
  conversation.ts  Crew conversations — snippets, proximity trigger, turn-based speech bubbles
  pathfinding.ts   A* on multi-deck tile grid — nodes are (x, y, deck), stairs connect decks
  renderer.ts      Canvas rendering — sprites with colored-rectangle fallback, UI overlays
  input.ts         Keyboard + mouse input state, camera scrolling, click/hover handling
  sprites.ts       Async sprite loader — loads PNGs from /sprites/, returns SpriteSheet
  audio.ts         AudioManager — preloads SFX, handles music loop (starts on first click)

scripts/
  generate-sprites.mjs   Generates tile + crew pixel art via OpenAI gpt-image-1.5 API
  generate-music.mjs     Synthesizes sea shanty WAV (procedural, no external deps)
  generate-sfx.mjs       Synthesizes click/stairs/deck_change WAV files

public/
  sprites/               PNG sprites (32x32 pixel art at 1024x1024, scaled down in-game)
  audio/                 WAV files — shanty.wav (music), click/stairs/deck_change (SFX)

architecture/
  GDD.md                 Game Design Document — full vision including future features
```

## Key concepts

### Ship layout (`ship.ts`)
Decks are defined as ASCII strings, each char maps to a TileType:
- `.` water, `#` hull, `_` floor, `S` stairs, `W` helm, `M` mast
- `C` cannon, `K` stove, `B` bed, `R` barrel, `T` table

Currently 2 decks (index 0 = upper, 1 = lower). Keys 2/3 switch. Plan for up to 4 decks.

### Crew AI (`crew.ts`)
Each crew member has hunger/energy (0-255, high = satisfied). Needs tick down over time.
States: IDLE, WALKING, EATING, SLEEPING, STEERING, MANNING_CANNON, KISSING, COPULATING.
When idle: if hungry → pathfind to stove, if tired → pathfind to bed, else wander randomly.
Player gives orders via right-click context menus (see below).
Sleep restores energy gradually (~0.53/s, full restore in ~480s). Eating uses a fixed timer (8s).

**Relations:** Each crew member has `relations: CrewRelation[]` with entries for every other crew.
- `friendship` (0-255): >=128 friend, <64 dislike. Initialized randomly 64-192.
- `attraction` (0-255): >=128 both sides required for copulation. Initialized randomly 0-160.

**Interactions** (right-click crew with another selected → "Interact ▶" submenu):
- **Kiss** (3s): enabled if initiator's friendship >= 64 OR attraction >= 64. If both sides have attraction >= 64: +32 attraction each. Otherwise: -32 attraction and -32 friendship each.
- **Copulate** (15s): enabled if both sides have attraction >= 128. Barrel copulation has no attraction check.

**Thought bubbles:** Shown above the initiator for 3s after kiss/copulation completes.
- Kiss (positive) → heart bubble. Kiss (negative) → broken heart bubble.
- Copulation (crew-crew) → heart bubble.
Sprites: `bubble_heart.png`, `bubble_broken_heart.png`. Fallback: circle with unicode symbol.
Stored as `thoughtBubble: ThoughtBubble | null` + `thoughtBubbleTimer` on CrewMember.

**Conversations** (`conversation.ts`): Idle crew within 2 tiles on the same deck may autonomously start talking (15% chance per idle decision). Conversations have 3-5 exchanges of ~3s each, with crew alternating speech bubbles containing procedural pirate-themed snippets. Snippet categories (generic, work, hungry, tired, friendly, unfriendly, night) are chosen by weighted random based on context (hunger, energy, friendship, brightness). At conversation end: +2 friendship (or -3 for the 15% "disagreement" conversations). 30-60s cooldown after each conversation. Player can stop via right-click "Stop talking". Rendered as canvas-drawn white rounded-rect speech bubbles with text (distinct from sprite-based thought bubbles).

### Pathfinding (`pathfinding.ts`)
Standard A* with 4-directional movement. Stairs tiles connect decks (same x,y position).
Node space is (x, y, deck). Max 2000 iterations to prevent hangs.

### Rendering (`renderer.ts`)
Sprites loaded async — falls back to colored rectangles + hand-drawn icons if sprites missing.
Furniture tiles draw floor sprite underneath (transparent sprites over floor).
Water animates by alternating two sprite frames.

### Input (`input.ts`)
- Arrow keys / WASD: camera scroll
- Mouse wheel: scroll 3 tiles per click
- Left-click crew: select. Left-click stairs: switch deck view.
- Hover over furniture: tooltip with tile name

### Right-click context menu (`game.ts`, `types.ts`)
Right-click opens a context menu with actions. Two targets:

**Right-click a crew member:**
- "Stop [action]" — shown if crew is busy (walking, eating, sleeping, steering, manning cannon)
- "Go to Upper/Lower Deck" — sends crew to the other deck via stairs
- "Interact ▶" — submenu with Kiss/Copulate (shown when another crew is selected)

**Right-click a furniture tile (with crew selected):**
- Bed → "Sleep" (restores energy gradually, ~480s for full restore)
- Stove → "Eat"
- Helm → "Steer"
- Cannon → "Man Cannon"
- Stairs → "Go to stairs"

**Submenus:** `ContextMenuItem` supports `submenu?: ContextMenuItem[]`. Parent items show "▶" and open a flyout on hover. `handleMenuClick` returns `undefined` (keep menu open) for submenu parents/disabled sub-items, vs `null` (close) for outside clicks. Disabled items (`disabled: true`) render grey and are not clickable.

Actions defined in `TILE_ACTIONS` in `types.ts`. Menu rendered by `drawContextMenu()` in `renderer.ts`.
Escape or clicking outside closes the menu.

## Adding new tile types

1. Add to `TileType` enum in `types.ts`
2. Add to `WALKABLE` set if crew can stand on it
3. Add color to `TILE_COLORS`
4. Add char mapping in `ship.ts` `CHAR_TO_TILE`
5. Place it in the deck ASCII layout
6. Add name to `TILE_NAMES` in `renderer.ts` (for tooltip)
7. Add sprite generation prompt in `scripts/generate-sprites.mjs`
8. Run `node scripts/generate-sprites.mjs` (skips existing sprites)

## Adding new crew behaviors

Edit `updateIdle()` in `crew.ts`. Pattern: check condition → find target tile → pathfind → set state.
Add new `CrewState` values in `types.ts` if needed, handle in `updateCrew()` switch.
Add display name to `STATE_NAMES` in `types.ts`.
To make it orderable via context menu, add entry to `TILE_ACTIONS` in `types.ts`.

## Adding new thought bubbles

1. Add the type to `ThoughtBubble` union in `types.ts` (e.g. `'skull'`)
2. Add sprite prompt in `generate-sprites.mjs` using `BUBBLE_STYLE` (name: `bubble_<type>`)
3. Add the name to `bubbleNames` array in `sprites.ts`
4. Run `node scripts/generate-sprites.mjs` to generate the PNG
5. Set `member.thoughtBubble = '<type>'` and `member.thoughtBubbleTimer = <seconds>` where needed in `crew.ts`
6. Fallback rendering (no sprite) is handled in `drawCrewMember()` in `renderer.ts` — add a case there if needed

## Generating assets

Sprites require `OPENAI_API_KEY` in `.env`. Scripts skip already-existing files.
```
node scripts/generate-sprites.mjs   # pixel art tiles + crew
node scripts/generate-music.mjs     # shanty.wav
node scripts/generate-sfx.mjs       # click, stairs, deck_change
```
Delete a sprite file and rerun to regenerate just that one.

## Style guidelines

- Pixel art: SNES Harvest Moon style, 32x32 tiles, top-down
- Swedish comments/docs are fine, code in English
- Keep crew AI autonomous — player observes and occasionally gives orders
- Avoid micromanagement mechanics
