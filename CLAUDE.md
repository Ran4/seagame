# Sea Game

2D top-down pirate ship sim. "Dwarf Fortress till sjöss." TypeScript + Canvas + Vite.

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
State machine: IDLE → WALKING → EATING/SLEEPING → IDLE.
When idle: if hungry → pathfind to stove, if tired → pathfind to bed, else wander randomly.
Player can click crew to select, then click a tile to order them there.

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
- Click crew: select. Click tile: order selected crew. Click stairs: switch deck.
- Hover over furniture: tooltip with tile name

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
