# Sea Game — Data Schema & Extension Recipes

Reference for engineers/agents extending the data model. All locations are in `src/types.ts` unless noted. Line numbers are accurate as of this writing — re-confirm if the file changed.

`src/types.ts` is the single source of truth for **all** shared types, enums, and constants. `src/config.ts` holds only dev/test toggles. There is no separate constants file.

---

## 1. The `World` struct (`types.ts:411-445`)

`World` is the entire mutable game state. All `game.ts` / `crew/` functions are free functions that take `World` and mutate it. It is also exposed on `window.__world` and serialized by `debug-state.ts` for `GET /api/state`.

| Field | Type | Holds |
|---|---|---|
| `decks` | `Deck[]` | The two ship decks (upper/lower). Each `Deck` = `{ name, tiles: TileType[][], width, height }` (`types.ts:299-304`). Tile grid indexed `tiles[y][x]`. |
| `actors` | `Actor[]` | All living entities (humans + animals). |
| `corpses` | `Corpse[]` | Dead actors that have become corpses (still on a deck until buried). |
| `camera` | `Camera` | `{ x, y }` pixel scroll offset (`types.ts:306-309`). |
| `activeDeck` | `number` | Which deck index is currently displayed/interacted-with. |
| `selectedActorId` | `number \| null` | Currently selected actor (the one player issues orders to). |
| `selectedCorpseId` | `number \| null` | Currently selected corpse. |
| `selectedObject` | `{ tileType: TileType; x; y; deck } \| null` | Currently selected furniture/object tile. |
| `contextMenu` | `ContextMenu \| null` | Open right-click menu state (see §8). |
| `worldMap` | `WorldMap` | Ship position, heading, speed, islands (see §7). |
| `barrelInventory` | `Map<string, Item[]>` | Barrel contents keyed by `"deck-x-y"` (e.g. `"0-12-5"`). |
| `lanternOil` | `Map<string, number>` | Remaining oil per lantern, keyed by tile pos string. |
| `dayTimeOffset` | `number` | Added to `time` to derive time-of-day; lets the game start at a chosen hour. |
| `mapOverlayOpen` | `boolean` | Whether the full-screen map overlay is showing. |
| `wasNavigating` | `boolean` | Tracks navigation-state transitions. |
| `navTimer` | `number` | Timer for navigation updates. |
| `time` | `number` | Total elapsed game time in seconds (monotonic). |
| `waterOffset` | `{ x, y }` | Animation offset for the water tiles. |
| `activityLog` | `ActivityLogEntry[]` | `{ text, time }` log entries (`types.ts:391-394`). |
| `orderPollTimer` | `number` | Countdown for polling `orders/*.jsonl` files (1/sec). |
| `spottedIslands` | `Set<number>` | Island IDs that have been spotted (revealed on map). |
| `shantyCooldown` | `number` | Seconds until crew can start another shanty. |
| `danceCooldown` | `number` | Seconds until crew can dance again. |
| `mutinyState` | `'none' \| 'ultimatum' \| 'game_over'` | Mutiny progression. |
| `mutinyTimer` | `number` | Timer driving mutiny escalation. |
| `commandInput` | `CommandInput \| null` | In-game command-input UI state (`{ text, mode, cursorPos }`, `types.ts:347-351`). |
| `settingsOpen` | `boolean` | Settings panel open flag. |
| `settings` | `GameSettings` | `{ inputMode: 'html' \| 'ingame' }` (`types.ts:353-355`). |
| `docking` | `DockingState` | Harbor docking phase/animation (see §7). |
| `gangplanks` | `GangplankConnection[]` | Active gangplank links between ship and harbor (see §7). |
| `nearbyHarborIsland` | `Island \| null` | Harbor island in docking range, if any. |
| `strandedActors` | `Map<number, Actor[]>` | Island ID → actors left ashore. |
| `strandedCorpses` | `Map<number, Corpse[]>` | Island ID → corpses left ashore. |

### Missing fields to flag (would need to be ADDED here)

- **No gold/currency field.** There is no money on `World`, on `Actor`, or anywhere. Trading in `harbor.ts` has no backing balance field. To add currency you would add e.g. `gold: number` to `World` (ship treasury) and/or to `ActorProfile`.
- **No weather field.** Nothing tracks wind/storms/fog. `getShipBrightness()` is purely time-driven (see TODO at `config.ts`/`types.ts:20`). A weather system would add e.g. `weather: { ... }` to `World` and feed it into brightness/sailing.
- **No enemy-ship entity.** Only one ship exists (the player's `decks`). There is no array of other ships, no combat target. Cannons (`MANNING_CANNON` state) have no enemy to fire at. Adding naval combat means a new `enemyShips: EnemyShip[]` (or similar) on `World` plus a new entity type.
- **No per-tile current-HP map.** `OBJECT_MAX_HP` (`types.ts:88-98`) defines *max* HP per tile type, but there is **no `World` field storing current HP per placed tile**. Object damage/destruction would need a new `Map<string, number>` keyed by `"deck-x-y"` (mirror the `barrelInventory`/`lanternOil` pattern). `Actor` already has `health`/`maxHealth`; tiles do not.

---

## 2. `TileType` and its lookup tables

### `TileType` enum (`types.ts:35-57`)
Numeric enum (auto-incremented from 0):
`WATER, HULL, FLOOR, STAIRS, HELM, MAST, CANNON, STOVE, BED, BARREL, TABLE, MAP_TABLE, LANTERN, RAISED_FLOOR, NEST, WHARF, LAND, GANGPLANK, HARBOR_WALL, HARBOR_FLOOR, NOTICE_BOARD`.

### Supporting tables
- **`WALKABLE`** (`Set<TileType>`, `types.ts:59-74`) — tiles a crew member may stand on. Includes FLOOR, STAIRS, HELM, BED, STOVE, MAST, MAP_TABLE, LANTERN, RAISED_FLOOR, NEST, WHARF, LAND, GANGPLANK, HARBOR_FLOOR. **Not** in set: WATER, HULL, CANNON, BARREL, TABLE, HARBOR_WALL, NOTICE_BOARD.
- **`SELECTABLE_OBJECTS`** (`Set<TileType>`, `types.ts:76-86`) — furniture the player can left/right-click to select/act on: HELM, CANNON, STOVE, BED, BARREL, TABLE, MAP_TABLE, LANTERN, NOTICE_BOARD.
- **`OBJECT_MAX_HP`** (`Partial<Record<TileType, number>>`, `types.ts:88-98`) — max HP per destroyable object: HELM 100, MAST 150, CANNON 80, STOVE 60, BED 40, BARREL 30, TABLE 30, MAP_TABLE 60, LANTERN 30. (No current-HP storage exists yet — see §1.)
- **`TILE_COLORS`** (`Record<TileType, string>`, `types.ts:100-122`) — fallback rectangle color for every tile (used when sprite missing). This is a **total** record — every `TileType` must have an entry or TS errors.
- **`TILE_ACTIONS`** (`Partial<Record<TileType, ContextMenuItem[]>>`, `types.ts:214-225`) — right-click menu actions per tile. E.g. BED→Sleep, STOVE→Eat, HELM→Steer, CANNON→Man Cannon, STAIRS→Go to stairs, MAST→Lookout, MAP_TABLE→Navigate, BARREL→Copulate, NOTICE_BOARD→Read notices (uses `action: 'read_notices'`). LANTERN has an empty array (actions built dynamically elsewhere).

### Recipe: add a new tile type
Per `.claude/rules/adding_new_tile_types.md` (cross-referenced), the full sequence:
1. Add the value to `TileType` enum (`types.ts:35`). **Gotcha:** append at the end; inserting in the middle renumbers everything and breaks any persisted indices.
2. If crew can stand on it, add to `WALKABLE` (`types.ts:59`).
3. Add a color in `TILE_COLORS` (`types.ts:100`) — **mandatory**, it's a total record.
4. Add the ASCII char mapping in `CHAR_TO_TILE` in `src/ship.ts`.
5. Place the char in the deck ASCII layout in `src/ship.ts`.
6. Add a display name to `TILE_NAMES` in `src/renderer.ts` (used for hover tooltip).
7. Add a sprite-generation prompt in `scripts/generate-sprites.mjs`.
8. Run `node scripts/generate-sprites.mjs` (skips existing sprites).

Additional, if applicable (not in the rules file but required for behavior):
- Add to `SELECTABLE_OBJECTS` (`types.ts:76`) if it's clickable furniture.
- Add to `OBJECT_MAX_HP` (`types.ts:88`) if it should be destroyable.
- Add a `TILE_ACTIONS` entry (`types.ts:214`) if right-clicking it should offer crew commands.

---

## 3. `CrewState` and `STATE_NAMES`

### `CrewState` enum (`types.ts:133-154`)
**String** enum (values are lowercase strings):
`IDLE='idle', WALKING, EATING, SLEEPING, STEERING, MANNING_CANNON, LOOKOUT, NAVIGATING, COPULATING, KISSING, LIGHTING_LANTERN, EXTINGUISHING_LANTERN, TALKING, DRINKING, TAKING_ITEM, PETTING, SINGING, DANCING, CARRYING_CORPSE, BURYING_AT_SEA`.

### `STATE_NAMES` (`Record<CrewState, string>`, `types.ts:156-177`)
Total record — every `CrewState` must have a human-readable display name (e.g. `MANNING_CANNON` → `'Manning cannon'`). TS errors if you add a state without a name here.

### Recipe: add a new crew state
(Cross-ref CLAUDE.md "Adding new actor behaviors".)
1. Add the value to `CrewState` (`types.ts:133`).
2. Add its display string to `STATE_NAMES` (`types.ts:156`) — **mandatory** (total record).
3. Handle it in the `updateActors()` state switch in `src/crew/update.ts`.
4. To make it player-orderable from a furniture tile, add a `TILE_ACTIONS` entry (`types.ts:214`) with `{ label, targetState: CrewState.YOUR_STATE }`.
5. To make it player-orderable as a `Command`, add a `Command` variant (`types.ts:364`) and wire it in `menuItemToCommand()` (`menu.ts`) and `issueCommand()` (`crew/commands.ts`).
6. If the state needs autonomous triggering, edit `updateIdleHuman()` / `updateIdleAnimal()` in `crew/update.ts`.

---

## 4. Actor system

### `ActorType` (`types.ts:227`)
`'human' | 'dog' | 'parrot' | 'monkey' | 'cat'`. Behavior is gated by this string. Animals can't be player-commanded via the menu but can take order-file commands. (CLAUDE.md notes `WORK_ACTOR_TYPES` gates human-only work — that set lives in the `crew/` module, not `types.ts`.)

### `Actor` interface (`types.ts:248-284`) — every field
| Field | Type | Meaning |
|---|---|---|
| `id` | `number` | Unique actor id (referenced by `selectedActorId`, relations, commands). |
| `actorType` | `ActorType` | Species, gates behavior. |
| `profile` | `ActorProfile` | Identity + needs + inventory (see below). |
| `health` | `number` | 0–255 current HP. |
| `maxHealth` | `number` | 0–255 HP cap. |
| `carryingCorpseId` | `number \| null` | Corpse being hauled (for burial). |
| `statuses` | `Map<string, Record<string,any> \| null>` | **Raw** persistent state (traits / tracked values). Writes go here. |
| `conditions` | `Set<string>` | **Derived** flags rebuilt every tick. Reads go here. |
| `skills` | `Record<string, number>` | Named skill → proficiency (0–255; `SKILL_MASTERY=192`). |
| `pixelX`, `pixelY` | `number` | Sub-tile pixel position. |
| `facing` | `'north'\|'south'\|'east'\|'west'` | Facing direction. |
| `deck` | `number` | Which deck the actor is on. |
| `state` | `CrewState` | Current state. |
| `targetState` | `CrewState` | State to enter after current path completes. |
| `path` | `DeckPoint[]` | Pending pathfinding waypoints (`{x,y,deck}`). |
| `stateTimer` | `number` | Time accumulator for the current state. |
| `idleTimer` | `number` | Idle/wander timer. |
| `copulationTarget` | `CopulationTarget \| null` | Barrel or crew target (see §5). |
| `relations` | `ActorRelation[]` | One entry per other actor. |
| `thoughtBubble` | `ThoughtBubble \| null` | Current bubble icon. |
| `thoughtBubbleTimer` | `number` | Seconds remaining for bubble. |
| `conversationPartnerId` | `number \| null` | Conversation partner. |
| `conversationExchangesLeft` | `number` | Remaining conversation turns. |
| `conversationPositive` | `boolean` | Tone of conversation. |
| `conversationScript` | `string[]` | Pre-picked snippet lines. |
| `conversationCooldown` | `number` | Cooldown before next conversation. |
| `conversationMyTurn` | `boolean` | Turn flag in turn-based speech. |
| `speechBubbleText` | `string \| null` | Currently displayed speech text. |
| `speechBubbleTimer` | `number` | Seconds remaining for speech. |
| `takeTarget` | `{ barrelKey; itemName } \| null` | Pending barrel item to grab (TAKING_ITEM). |
| `consumingItem` | `Item \| null` | Item being eaten/drunk. |
| `lustSeekCooldown` | `number` | Cooldown before seeking a copulation partner. |
| `commandQueue` | `Command[]` | Queued player commands. |
| `shantyInitiatorId` | `number \| null` | Who started the current shanty (for syncing singers). |

### `ActorProfile` (`types.ts:229-240`)
`name`, `sex: Sex` (`'M'|'F'`), `color`, `spriteIndex`, `numberOfHands`, `hunger`/`energy`/`morale` (each 0–255, high = satisfied), `inventory: Item[]`, `hands: Item[]` (length ≤ `numberOfHands`).

### `ActorRelation` (`types.ts:242-246`)
`{ actorId, friendship (0–255; ≥128 friend, <64 dislike), attraction (0–255; both ≥128 ⇒ willing to copulate) }`.

### `statuses` Map vs `conditions` Set — critical invariant
- **`statuses`** is the raw, authoritative state. Keys are status names; payload is either `null` (a flag-trait, e.g. `'dickless'`) or an object (tracked value, e.g. `'drunkedness'` → `{ amount }`). **All writes happen here.**
- **`conditions`** is rebuilt from scratch every tick by `refreshConditions()` in `src/crew/update.ts`. It contains every `statuses` key **plus derived conditions** like `'drunk'`, `'tipsy'`, `'exhausted'`, `'tired'`. **Game logic reads `conditions`.**
- **Invariant:** never write to `conditions` directly (it's clobbered each tick) and never read traits straight from `statuses` for behavior — read `conditions`. To add a new derived condition, compute it in `refreshConditions()`.

### `Corpse` (`types.ts:286-297`)
Snapshot of a dead actor for rendering/burial: `actorId, name, actorType, pixelX, pixelY, deck, spriteIndex, color, sex, inventory`.

---

## 5. Items, copulation, thought bubbles

### `Item` (`types.ts:334-343`)
`name`, `createdAt` (game-seconds), `weight` (grams/unit), `description`, `stackable`, `quantity` (1 if non-stackable), `spoilAfter` (`number | null`; null = never), `hungerRestore` (0–255). Created via factories in `src/items.ts`.

### `CopulationTarget` (discriminated union, `types.ts:359-361`)
`{ type: 'barrel'; x; y; deck }` or `{ type: 'crew'; actorId }`.

### `ThoughtBubble` (`types.ts:357`)
`'heart' | 'broken_heart' | 'music_note'`. (Recipe to add one is in `.claude/rules/adding_new_thought_bubbles.md`: extend this union, add sprite prompt, add to `bubbleNames` in `sprites.ts`, regenerate, set `member.thoughtBubble`.)

---

## 6. `Command` discriminated union (`types.ts:364-389`)

Discriminated on `name`. Every variant:

| Variant | Fields | Notes |
|---|---|---|
| `Sleep` | `deck? x? y?` | Optional target tile; else auto-find bed. |
| `Eat` | `deck? x? y?` | |
| `Steer` | `deck? x? y?` | |
| `Navigate` | `deck? x? y?` | |
| `ManCannon` | `deck? x? y?` | |
| `Lookout` | `deck? x? y?` | |
| `GoTo` | `deck? x y` (x,y required) | Walk to tile. |
| `GoToDeck` | `deck` (required) | Switch deck via stairs. |
| `CopulateBarrel` | `deck x y` | |
| `LightLantern` | `deck x y` | |
| `ExtinguishLantern` | `deck x y` | |
| `Kiss` | `actorId` | |
| `Copulate` | `actorId` | |
| `Pet` | `actorId` | Animal interaction. |
| `Converse` | `actorId` | |
| `TakeItem` | `barrelKey itemName` | |
| `Drink` | `itemName?` | |
| `Sing` | — | |
| `Dance` | — | |
| `GroupDance` | — | |
| `BuryAtSea` | `corpseActorId` | |
| `SetHealth` | `amount` | Debug/scripting. |
| `Stop` | — | Cancel current action. |
| `Tell` | `actorId text?` | Make actor say text. |
| `Order` | `actorId order` | Nested: makes `actorId` execute `order` (a `Command`). |

Commands flow: menu click → `menuItemToCommand()` (`menu.ts`) → `issueCommand()` (`crew/commands.ts`). Order files (`orders/orders_for_*.jsonl`) and the in-game command input go through the same `issueCommand()`. **To add a command:** add a variant here, parse it in `command-shorthand.ts`, handle it in `issueCommand()`, and (if menu-triggerable) map it in `menuItemToCommand()`.

---

## 7. World map, islands, docking

### `Island` (`types.ts:311-319`)
`id, name, x, y, hasHarbor, description, hidden?`.

### `WorldMap` (`types.ts:321-330`)
`shipX, shipY, currentHeading` (radians), `currentSpeed` (0..SHIP_SPEED), `targetHeading` (`number|null` = navigator order), `targetSpeed` (`'full'|'stop'`), `destinationIsland` (`Island|null`), `islands: Island[]`. Defined/used in `src/worldmap.ts`. Note `SHIP_SPEED` is not in `types.ts` — it lives in `worldmap.ts`.

### `DockingState` (`types.ts:401-408`)
`phase: 'none'|'docking'|'docked'|'undocking'`, `island`, `harborTiles: TileType[][]`, `harborWidth`, `harborHeight`, `harborAnimOffset` (Y pixel offset for dock animation). Logic in `src/harbor.ts`.

### `GangplankConnection` (`types.ts:396-399`)
`{ deckA, xA, yA, deckB, xB, yB }` — links a ship tile to a harbor tile so pathfinding can cross.

---

## 8. Context menu types

### `ContextMenuItem` (`types.ts:179-189`)
`label`, `targetState: CrewState`, `deckTarget?`, `targetActorId?`, `disabled?`, `submenu?: ContextMenuItem[]` (nestable to 3 levels), `action?: string` (non-state actions like `'take_item'`, `'read_notices'`), `itemData?: { barrelKey, itemName }`, `corpseActorId?`.

### `ContextMenu` (`types.ts:191-202`)
`screenX, screenY, tileX, tileY, deck, items, actorId?, barrelItems?: { items, barrelKey }, selectedBarrelSlot?, barrelSlotClickPos?`.

### `computeMenuWidth(labels, minWidth=0)` (`types.ts:205-212`)
Helper: panel width from longest label (12px monospace ≈ 7.22px/char + padding).

---

## 9. Constants and the time-of-day model

All in `types.ts:1-33` (despite CLAUDE.md saying `SECONDS_PER_DAY` is in `worldmap.ts`, it is actually **defined in `types.ts:8`**).

- `TILE_SIZE = 32`, `CANVAS_WIDTH = 960`, `CANVAS_HEIGHT = 540`, `CREW_SPEED = 64` (px/s).
- **`SECONDS_PER_DAY = 720`** (1 in-game day = 12 IRL minutes).
- **Time-of-day phases** (seconds within a day): Dawn `0–60` (`DAWN_START=0`, `DAY_START=60`), Day `60–420` (`DUSK_START=420`), Dusk `420–480` (`NIGHT_START=480`), Night `480–720`.
- **`getShipBrightness(timeOfDay)`** (`types.ts:21-27`): returns `NIGHT_BRIGHTNESS=0.3` at night, ramps linearly to `1.0` across dawn, `1.0` during day, ramps back down across dusk. `BRIGHTNESS_RANGE = 1.0 - NIGHT_BRIGHTNESS`. TODO comment: vary by season once seasons exist.
- **Morale/skill thresholds:** `NIGHT_FEAR_MORALE_THRESHOLD = 192` (below ⇒ extra night morale drain), `SKILL_MASTERY = 192`.
- **Lantern constants:** `LANTERN_SAFE_RADIUS = 5`, `LANTERN_BURNOUT_RATE = 0.4`, `LIGHT_LANTERN_DURATION = 3`, `EXTINGUISH_LANTERN_DURATION = 0.5`.

`config.ts` (dev toggles): `CONFIG = { startNearIsland: false, instantlyDockToNearestHarbor: false }`, overridable via `/api/config` (reads `config.env`) in `loadConfig()`.

---

## Quick gotcha checklist
- `TileType` is **numeric** (don't reorder); `CrewState` is **string**.
- `TILE_COLORS` and `STATE_NAMES` are **total records** — every new enum value needs an entry or TS won't compile.
- `TILE_ACTIONS`, `OBJECT_MAX_HP` are **partial** — optional per tile.
- Write to `statuses`, read from `conditions`; `conditions` is rebuilt each tick by `refreshConditions()`.
- Tile grids are `tiles[y][x]`; map/barrel/lantern keys are `"deck-x-y"` strings.
- No gold, no weather, no enemy ships, no per-tile current-HP — all four require new `World` (and possibly `Actor`) fields plus a new entity type for ships.
