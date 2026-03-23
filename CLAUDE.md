# Sea Game

2D top-down pirate ship sim. "Dwarf Fortress till sjöss." TypeScript + Canvas + Vite.

**Time scale:** 1 in-game day = 12 minutes IRL (720 seconds). All time-based calculations use this ratio. Defined as `SECONDS_PER_DAY` in `src/worldmap.ts`.

Note: during development, guy just means crew member (male or female).

**Actor system:** All entities (human crew, dogs, parrots, monkeys) are `Actor` with `actorType: ActorType`. Behavior is gated by actorType — animals share the same pathfinding, needs, and conversation systems but have restricted actions (no player commands, no steering/manning/lookout/lanterns/drinking). Dogs follow liked entities. Parrots use flying pathfinding (can cross hull/furniture). Animals can be petted (select human → right-click animal → Interact → Pet).

## Quick start

```
npm install
npm run dev      # Vite dev server on port 7070
```

## Project structure

### Code

```
src/
  main.ts              Entry point — creates World, wires up renderer/input/audio, runs game loop
  game.ts              createWorld() + update() — free functions operating on World struct
  menu.ts              Context menu — buildContextMenu(), handleMenuClick(), menuItemToCommand()
  types.ts             All shared types, enums, constants (TILE_SIZE=32, CANVAS=960x540), World struct
  ship.ts              Ship layout — two decks defined as ASCII art, parsed to TileType[][]
  crew/                Actor AI module (was crew.ts, split into submodules)
    index.ts           Re-exports public API (updateActors, issueCommand, createActors, movement helpers)
    update.ts          refreshConditions(), updateActors() — needs system, autonomous behavior
    commands.ts        issueCommand() — executes Command objects (from menu or order files)
    factory.ts         createActors() — spawns humans + animals with randomized traits/relations
    movement.ts        orderCrewTo/Adjacent/Beside — pathfinding-based movement helpers
    lust.ts            Attraction/copulation logic
  conversation.ts      Crew conversations — snippets, proximity trigger, turn-based speech bubbles
  pathfinding.ts       A* on multi-deck tile grid — nodes are (x, y, deck), stairs connect decks
  renderer.ts          Canvas rendering — sprites with colored-rectangle fallback, UI overlays
  input.ts             Keyboard + mouse input state, camera scrolling, click/hover handling
  sprites.ts           Async sprite loader — loads PNGs from /sprites/, returns SpriteSheet
  audio.ts             AudioManager — preloads SFX, handles music loop (starts on first click)
  items.ts             Item factory functions — createCutlass(), createGrogRation(), createSemen(), spoilage
  worldmap.ts          World map — islands, sailing, navigation, SECONDS_PER_DAY
  command-shorthand.ts Parses shorthand command strings (e.g. "Sleep 1 3 5") into Command objects
  debug-state.ts       serializeState() — produces JSON snapshot of World for /api/state

public/
  sprites/                 PNG sprites
  audio/                   Music
    sfx/                   Procedural/OpenAI-generated SFX
    elevenlabs-generated/  ElevenLabs-generated SFX
```

### Folders used during development/debugging

```
scripts/
  generate-sprites.mjs     Generates tile + crew pixel art via OpenAI gpt-image-1 API
  generate-music.mjs       Synthesizes sea shanty WAV (procedural, no external deps)
  generate-sfx.mjs         Generates SFX — procedural, OpenAI TTS, or ElevenLabs


features/
  implemented/             Completed feature specs (e.g. command system, dog morale etc.)
      ...
      2026-03-10_LIVE_DEBUGGING.md Live state inspection via /api/state endpoint
  planned/                 Planned feature specs (dated, e.g. 2026-03-12_FISHING.md)

issues/                  Known issues and open bugs

orders/
  orders_for_*.jsonl     Write orders (one per actor) here to execute them, polled once/sec by Vite plugin
```

## Key concepts

### Actor AI (`crew/`)
Read code for exact details.

All entities are `Actor` with `actorType: 'human' | 'dog' | 'parrot' | 'monkey'`.
Each actor has hunger/energy/morale (0-255, high = satisfied). Needs tick down over time.
Morale modifiers include night fear (when dark and morale below `NIGHT_FEAR_MORALE_THRESHOLD` → extra morale drain), lanterns (mitigate night fear), ...
States are like `IDLE, WALKING, EATING, SLEEPING, LIGHTING_LANTERN, EXTINGUISHING_LANTERN, ...`
When idle (human): if hungry → pathfind to stove, if tired → pathfind to bed, else wander randomly.
When idle (animal): hungry → stove, tired → nearby bed or sleep in place, dog follows liked entity, wander.
Player gives orders to humans via right-click context menus (see below) or the command system (see `features/implemented/2026-03-10_COMMAND_SYSTEM.md`). Animals cannot be commanded via menu but can receive commands via order files.

**Statuses & Conditions** (`refreshConditions()` in `crew/update.ts`):
Each crew member has `statuses: Map<string, payload | null>` (raw state) and `conditions: Set<string>` (rebuilt every tick). Statuses hold permanent traits (`'dickless'`, null payload) or tracked values (`'drunkedness'`, `{ amount }` payload). Conditions include every status key plus derived conditions: `'drunk'`, `'tipsy'`, `'exhausted'` (sleeps even in daytime), `'tired'`.... Game code reads `conditions` for behaviour; writes go to `statuses`. Drunk effects: wobbly walking, lowered kiss/copulate thresholds. Tipsy: less wobble, slightly lowered thresholds etc.

**Relations:** Each actor has `relations: ActorRelation[]` mapping to every other actor (including cross-species), including friendship + attraction

**Interactions** (right-click actor with another selected → "Interact ▶" submenu):

**Conversations** (`conversation.ts`):

### Pathfinding (`pathfinding.ts`)
Standard A* with 4-directional movement. Stairs tiles connect decks (same x,y position).
Node space is (x, y, deck). Max 2000 iterations to prevent hangs.
`findPathFlying()` variant for parrots — can traverse any non-water tile (hull, furniture, etc.).

### Rendering (`renderer.ts`)
Sprites loaded async — falls back to colored rectangles + hand-drawn icons if sprites missing.
Furniture tiles draw floor sprite underneath (transparent sprites over floor).
Water animates by alternating two sprite frames.

### Input (`input.ts`)
- Arrow keys / WASD: camera scroll
- Mouse wheel: scroll 4 tiles per click
- Left-click crew: select. Left-click stairs: switch deck view.
- Hover over furniture: tooltip with tile name

### Right-click context menu (`menu.ts`, `types.ts`)

See .claude/rules/context_menu.md

## Command dispatch

All context menu actions (except "Open Map") are converted to `Command` objects via `menuItemToCommand()` in `menu.ts` and executed via `issueCommand()` from `crew.ts`. This means right-click UI actions and external order file commands go through the same code path. See `features/implemented/2026-03-10_COMMAND_SYSTEM.md` for the full command reference.

## Live debugging

Game state is readable via `GET /api/state` (with query filters like `?log`, `?actors`, `?actor=name`, `?barrels`, `?time`).
The `World` object is also on `window.__world`. See `features/implemented/2026-03-10_LIVE_DEBUGGING.md`.

## Adding new tile types

See .claude/rules/adding_new_tile_types.md

## Adding new actor behaviors

Edit `updateIdleHuman()` or `updateIdleAnimal()` in `crew.ts`. Pattern: check condition → find target tile → pathfind → set state.
Add new `CrewState` values in `types.ts` if needed, handle in `updateActors()` switch.
Add display name to `STATE_NAMES` in `types.ts`.
To make it orderable via context menu, add entry to `TILE_ACTIONS` in `types.ts`.
Gate human-only behaviors with `WORK_ACTOR_TYPES.has(member.actorType)`.

## Adding new thought bubbles

See .claude/rules/adding_new_thought_bubbles.md

## Generating assets

See .claude/rules/generating_assets.md

## Style guidelines

- Pixel art: SNES Harvest Moon style, 32x32 tiles, top-down
- Swedish comments/docs are fine, code in English
- Keep crew AI autonomous — player observes and occasionally gives orders
- Avoid micromanagement mechanics
