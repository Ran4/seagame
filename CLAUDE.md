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

```
src/
  main.ts          Entry point — creates World, wires up renderer/input/audio, runs game loop
  game.ts          createWorld() + update() — free functions operating on World struct
  menu.ts          Context menu — buildContextMenu(), handleMenuClick(), menuItemToCommand()
  types.ts         All shared types, enums, constants (TILE_SIZE=32, CANVAS=960x540), World struct
  ship.ts          Ship layout — two decks defined as ASCII art, parsed to TileType[][]
  crew.ts          Actor AI — needs system (hunger/energy), A* pathfinding, autonomous behavior (humans + animals)
  conversation.ts  Crew conversations — snippets, proximity trigger, turn-based speech bubbles
  pathfinding.ts   A* on multi-deck tile grid — nodes are (x, y, deck), stairs connect decks
  renderer.ts      Canvas rendering — sprites with colored-rectangle fallback, UI overlays
  input.ts         Keyboard + mouse input state, camera scrolling, click/hover handling
  sprites.ts       Async sprite loader — loads PNGs from /sprites/, returns SpriteSheet
  audio.ts         AudioManager — preloads SFX, handles music loop (starts on first click)

scripts/
  generate-sprites.mjs   Generates tile + crew pixel art via OpenAI gpt-image-1 API
  generate-music.mjs     Synthesizes sea shanty WAV (procedural, no external deps)
  generate-sfx.mjs       Generates SFX — procedural, OpenAI TTS, or ElevenLabs

public/
  sprites/               PNG sprites (32x32 pixel art at 1024x1024, scaled down in-game)
  audio/                 shanty.wav (music)
    sfx/                 Procedural/OpenAI-generated SFX (WAV fallbacks)
    elevenlabs-generated/  ElevenLabs-generated SFX (MP3, used by default)

architecture/
  GDD.md                 Game Design Document — full vision including future features

features/
  COMMAND_SYSTEM.md      Command system — serializable action queues, external order files

orders/
  orders_for_*.jsonl     External order files (one per actor, polled once/sec by Vite plugin)
```

## Key concepts

### Ship layout (`ship.ts`)
Decks are defined as ASCII strings, each char maps to a TileType:
- `.` water, `#` hull, `_` floor, `S` stairs, `W` helm, `M` mast
- `C` cannon, `K` stove, `B` bed, `R` barrel, `T` table

Currently 2 decks (index 0 = upper, 1 = lower). Keys 2/3 switch. Plan for up to 4 decks.

### Actor AI (`crew.ts`)
All entities are `Actor` with `actorType: 'human' | 'dog' | 'parrot' | 'monkey'`.
Each actor has hunger/energy (0-255, high = satisfied). Needs tick down over time.
States: IDLE, WALKING, EATING, SLEEPING, STEERING, MANNING_CANNON, LOOKOUT, NAVIGATING, COPULATING, KISSING, LIGHTING_LANTERN, EXTINGUISHING_LANTERN, TALKING, DRINKING, TAKING_ITEM, PETTING.
When idle (human): if hungry → pathfind to stove, if tired → pathfind to bed, else wander randomly.
When idle (animal): hungry → stove, tired → nearby bed or sleep in place, dog follows liked entity, wander.
Player gives orders to humans via right-click context menus (see below) or the command system (see `features/COMMAND_SYSTEM.md`). Animals cannot be commanded via menu but can receive commands via order files.
Sleep restores energy gradually (~0.53/s, full restore in ~480s). Eating uses a fixed timer (8s).

**Statuses & Conditions** (`refreshConditions()` in `crew.ts`):
Each crew member has `statuses: Map<string, payload | null>` (raw state) and `conditions: Set<string>` (rebuilt every tick). Statuses hold permanent traits (`'dickless'`, null payload) or tracked values (`'drunkedness'`, `{ amount }` payload). Conditions include every status key plus derived conditions: `'drunk'` (drunkedness >= 128), `'tipsy'` (>= 64), `'exhausted'` (energy < 25, sleeps even in daytime), `'tired'` (energy < 60), `'starving'` (hunger < 15), `'hungry'` (hunger < 70). Game code reads `conditions` for behaviour; writes go to `statuses`. Drunk effects: wobbly walking (25% per step), lowered kiss/copulate thresholds. Tipsy: 8% wobble, slightly lowered thresholds.

**Relations:** Each actor has `relations: ActorRelation[]` with entries for every other actor (including cross-species).
- `friendship` (0-255): >=128 friend, <64 dislike. Initialized randomly 64-192.
- `attraction` (0-255): >=128 both sides required for copulation. Initialized randomly 0-160 (0 cross-species).

**Interactions** (right-click actor with another selected → "Interact ▶" submenu):
- **Pet** (3s, human→animal only): +2 friendship both ways. Heart thought bubble.
- **Kiss** (3s, human→human): enabled if initiator's friendship >= 64 OR attraction >= 64. If both sides have attraction >= 64: +32 attraction each. Otherwise: -32 attraction and -32 friendship each.
- **Copulate** (15s, same species): enabled if both sides have attraction >= 128. Barrel copulation has no attraction check.

**Thought bubbles:** Shown above the initiator for 3s after kiss/copulation completes.
- Kiss (positive) → heart bubble. Kiss (negative) → broken heart bubble.
- Copulation (crew-crew) → heart bubble.
Sprites: `bubble_heart.png`, `bubble_broken_heart.png`. Fallback: circle with unicode symbol.
Stored as `thoughtBubble: ThoughtBubble | null` + `thoughtBubbleTimer` on CrewMember.

**Conversations** (`conversation.ts`): Idle actors within 2 tiles on the same deck may autonomously start talking (15% chance per idle decision for humans; animals attempt at 1/20th rate with animal-specific lines like "Woof!", "BRAWWK!", etc.). Conversations have 3-5 exchanges of ~3s each, with crew alternating speech bubbles containing procedural pirate-themed snippets. Snippet categories (generic, work, hungry, tired, friendly, unfriendly, night) are chosen by weighted random based on context (hunger, energy, friendship, brightness). At conversation end: +2 friendship (or -3 for the 15% "disagreement" conversations). 30-60s cooldown after each conversation. Player can stop via right-click "Stop talking". Rendered as canvas-drawn white rounded-rect speech bubbles with text (distinct from sprite-based thought bubbles).

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
Right-click opens a context menu with actions. Two targets:

**Right-click a human crew member:**
- "Stop [action]" — shown if crew is busy (walking, eating, sleeping, steering, manning cannon)
- "Go to Upper/Lower Deck" — sends crew to the other deck via stairs
- "Interact ▶" — submenu with Converse/Kiss/Copulate (shown when another human is selected)

**Right-click an animal (with human selected):**
- "Interact ▶" → "Pet" (3s, +2 friendship both ways)

**Right-click a furniture tile (with crew selected):**
- Bed → "Sleep" (restores energy gradually, ~480s for full restore)
- Stove → "Eat"
- Helm → "Steer"
- Cannon → "Man Cannon"
- Stairs → "Go to stairs"
- Barrel → "Items ▶" (if barrel has items) + "Copulate" (males only)

**Barrel items submenu (3-level):** Right-clicking a barrel with a crew selected shows "Items ▶" → per-item entries (e.g. "Semen (x2) ▶") → "Take". Clicking "Take" pathfinds the crew to the barrel then transfers one unit to their inventory on arrival. Uses `TAKING_ITEM` crew state. Stackable items show quantity and decrement; non-stackable items are moved whole. Empty barrels have their inventory entry cleaned up. Barrel contents stored in `World.barrelInventory: Map<string, Item[]>` keyed by `"deck-x-y"`.

**Submenus (up to 3 levels):** `ContextMenuItem` supports `submenu?: ContextMenuItem[]`, nestable to 3 levels. Parent items show "▶" and open a flyout on hover. `handleMenuClick` checks deepest level first. Returns `undefined` (keep menu open) for submenu parents/disabled sub-items, vs `null` (close) for outside clicks. Disabled items (`disabled: true`) render grey and are not clickable. Level-3 panels edge-clamp (flip to left side if they'd overflow `CANVAS_WIDTH`). `ContextMenuItem` also supports `action?: string` and `itemData?: { barrelKey, itemName }` for non-state-based actions like taking items.

Actions defined in `TILE_ACTIONS` in `types.ts`. Menu rendered by `drawContextMenu()` in `renderer.ts`.
Escape or clicking outside closes the menu.

**Command dispatch:** All context menu actions (except "Open Map") are converted to `Command` objects via `menuItemToCommand()` in `menu.ts` and executed via `issueCommand()` from `crew.ts`. This means right-click UI actions and external order file commands go through the same code path. See `features/COMMAND_SYSTEM.md` for the full command reference.

## Adding new tile types

1. Add to `TileType` enum in `types.ts`
2. Add to `WALKABLE` set if crew can stand on it
3. Add color to `TILE_COLORS`
4. Add char mapping in `ship.ts` `CHAR_TO_TILE`
5. Place it in the deck ASCII layout
6. Add name to `TILE_NAMES` in `renderer.ts` (for tooltip)
7. Add sprite generation prompt in `scripts/generate-sprites.mjs`
8. Run `node scripts/generate-sprites.mjs` (skips existing sprites)

## Adding new actor behaviors

Edit `updateIdleHuman()` or `updateIdleAnimal()` in `crew.ts`. Pattern: check condition → find target tile → pathfind → set state.
Add new `CrewState` values in `types.ts` if needed, handle in `updateActors()` switch.
Add display name to `STATE_NAMES` in `types.ts`.
To make it orderable via context menu, add entry to `TILE_ACTIONS` in `types.ts`.
Gate human-only behaviors with `WORK_ACTOR_TYPES.has(member.actorType)`.

## Adding new thought bubbles

1. Add the type to `ThoughtBubble` union in `types.ts` (e.g. `'skull'`)
2. Add sprite prompt in `generate-sprites.mjs` using `BUBBLE_STYLE` (name: `bubble_<type>`)
3. Add the name to `bubbleNames` array in `sprites.ts`
4. Run `node scripts/generate-sprites.mjs` to generate the PNG
5. Set `member.thoughtBubble = '<type>'` and `member.thoughtBubbleTimer = <seconds>` where needed in `crew.ts`
6. Fallback rendering (no sprite) is handled in `drawCrewMember()` in `renderer.ts` — add a case there if needed

## Generating assets

Sprites require `OPENAI_API_KEY` in `.env`. SFX supports three backends per sound (see `generate-sfx.mjs`).
ElevenLabs sounds require `ELEVENLABS_API_KEY` in `.env`. Scripts skip already-existing files.
```
node scripts/generate-sprites.mjs   # pixel art tiles + crew
node scripts/generate-music.mjs     # shanty.wav
node scripts/generate-sfx.mjs       # SFX (procedural → sfx/, elevenlabs → elevenlabs-generated/)
```
Delete a file and rerun to regenerate just that one.

## Style guidelines

- Pixel art: SNES Harvest Moon style, 32x32 tiles, top-down
- Swedish comments/docs are fine, code in English
- Keep crew AI autonomous — player observes and occasionally gives orders
- Avoid micromanagement mechanics
