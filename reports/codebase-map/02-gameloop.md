# Codebase Map 02 — Game Loop & World Lifecycle

Reference for engineers (incl. fresh-context AI agents) adding per-frame systems.
Covers `src/game.ts` (createWorld + update), `src/main.ts` (the RAF loop, wiring,
debug endpoints), and `vite.config.ts` (order/state/config dev-server plugins).

**Source of truth:** `src/game.ts` (816 lines), `src/main.ts` (69 lines),
`vite.config.ts` (152 lines), `src/types.ts` (World struct ~411-444, time constants 8-33).
All architecture is free-functions-over-a-`World`-struct — there is no class for the game
itself. The `World` interface is defined in `src/types.ts:411`.

---

## 1. Architecture in one breath

- `main.ts` owns the `requestAnimationFrame` loop. Each frame it does exactly three things:
  advance `world.time`, call `update(world, input, audio, hoveredItem, dt)`, then
  `renderer.render(...)`. (`src/main.ts:58-67`)
- `game.ts` `update()` is the **single per-frame simulation tick**. Everything that must
  happen each frame hooks in here. There is no separate ECS / system registry — systems are
  just inline blocks called in a fixed order inside `update()`.
- State lives entirely in the `World` struct (`src/types.ts:411`). Free functions mutate it
  in place. No immutability, no event bus.

---

## 2. `createWorld(): World` — `src/game.ts:130-226`

Builds and wires the entire initial world. Returns a fully-populated `World`. Steps:

1. **Decks** — `createShip()` (`src/ship.ts`) → `Deck[]` (parsed from ASCII art). Stored as
   `world.decks`. Index convention: `0` = crow's nest, `1` = upper deck, `2` = lower deck
   (see deck-switch keys below). `world.activeDeck` starts at `1` (upper deck).
2. **Actors** — `createActors(4, decks)` (`src/crew/factory.ts`) spawns 4 starting actors
   (humans + animals with randomized traits/relations). Stored as `world.actors`.
3. **World map** — `createWorldMap()` (`src/worldmap.ts:21`) → `world.worldMap`
   (ship position in leagues, heading, speed, islands).
4. **Barrel inventory** — `world.barrelInventory: Map<string, Item[]>` keyed by
   `"<deck>-<x>-<y>"`. Every `TileType.BARREL` tile is seeded with 2× semen
   (`createSemen(0)`). The **first** barrel found on the lower deck additionally gets 4×
   grog rations (`createGrogRation()`). (`src/game.ts:137-166`)
5. **Lantern oil** — `world.lanternOil: Map<string, number>` keyed the same way; every
   `TileType.LANTERN` initialized to `0` oil (crew light them at night). (`src/game.ts:169-178`)
6. **Camera** — centered over the ship region within the expanded (harbor-capable) grid,
   using `DECK_X_SHIFT`/`DECK_Y_SHIFT`/`SHIP_WIDTH`/`SHIP_HEIGHT` from `harbor.ts`.
7. **Misc init flags** the simulation later reads: `dayTimeOffset: Math.random()*720`
   (randomizes starting time-of-day), `time: 0`, `mutinyState: 'none'`, `mutinyTimer: 0`,
   `orderPollTimer: 0`, `navTimer: 0`, `shantyCooldown/danceCooldown: 0`,
   `docking.phase: 'none'`, empty `corpses`, `activityLog`, `gangplanks`, `spottedIslands`,
   `strandedActors`, `strandedCorpses`, and `settings: loadSettings()`.

**Gotcha:** `createWorld()` does NOT dock the ship. The "instantly dock" dev shortcut lives in
`main.ts:17-30` (gated by `CONFIG.instantlyDockToNearestHarbor`), not here. If you add config-driven
startup state, decide deliberately between `createWorld()` (always) vs `main.ts` (config-gated).

**Settings persistence:** `loadSettings()`/`saveSettings()` (`src/game.ts:113-128`) read/write
`localStorage['seagame_settings']` (only `inputMode: 'html' | 'ingame'`). Defaults to `'html'`.

---

## 3. `update(world, input, audio, hoveredItem, dt)` — `src/game.ts:228-777`

**This is THE per-frame hook point.** The exact ordered list of every block it runs, top to
bottom. Numbers are the operation order; new systems should be inserted at the documented spot.

### Frame-entry guard
- `audio.activeDeck = world.activeDeck` — keeps audio panning in sync. (`:229`)
- **GAME OVER short-circuit:** `if (world.mutinyState === 'game_over') return;` (`:232`).
  When mutiny ends the game, *the entire simulation stops* — `update()` returns immediately.
  Nothing below runs (not even input). Restart handling is NOT here (rendering layer / reload).

> **INVARIANT:** Any per-frame system you add runs only while `mutinyState !== 'game_over'`.
> If your system must keep ticking during game-over (unlikely), it must go above line 232.

### A. Command input bar — `:234-313`
Handles the in-game/HTML command-entry text bar (`world.commandInput`). Captures all
`input.keyEvents` while open (Enter submits via `submitCommandInput`, Tab/autocomplete via
`getAutocomplete`, Escape closes). **While the command bar is open it clears `input.keyEvents`
and `input.keysDown` and consumes clicks** — i.e. it swallows input so nothing below sees it.
Opens on Enter when an actor is selected and no menu/overlay/settings is open.
Always ends with `input.keyEvents.length = 0` (`:313`).

### B. Shanty / dance cooldowns — `:316-317`
`world.shantyCooldown` and `world.danceCooldown` decremented by `dt` (floored at 0). Simple
timer pattern — copy this for any new cooldown.

### C. Docking state machine — `:319-365`
- `anySteering = world.actors.some(c => c.state === STEERING)` (`:320`) — used throughout.
- `world.nearbyHarborIsland = (phase==='none') ? getNearbyHarborIsland(...) : null` (`:323`).
- Dock button click → `startDocking(world)` (`harbor.ts`). (`:328-334`)
- Leave-harbor button click (when `phase==='docked'`) → `startUndocking(world)`. (`:337-343`)
- **Docking animation** (`phase==='docking'`): only advances *while someone is steering*;
  slides `harborAnimOffset += DOCKING_SPEED*dt` until `>= 0`, then `completeDocking(world)`.
- **Undocking animation** (`phase==='undocking'`): slides offset down by `DOCKING_SPEED*dt`
  until `<= UNDOCKING_END` (`-26*TILE_SIZE`), then `completeUndocking(world)`.
- Phases: `'none' | 'docking' | 'docked' | 'undocking'` (`types.ts:402`).
  `DOCKING_SPEED = 80` px/s, `UNDOCKING_END = -832` (`harbor.ts:89,92`).

### D. Sailing physics (three-step) — `:367-378`
**Skipped entirely unless `docking.phase === 'none'`.** When sailing is active:
- `world.navTimer += dt`; if any actor is `NAVIGATING` and `navTimer >= 0.5`,
  call `updateNavigator(world.worldMap)` (sets orders) then reset `navTimer`.
- If `anySteering`, `updateHelmsman(world.worldMap)` (executes orders).
- Always `updateSailing(world.worldMap, dt)` (physics integration of position/speed/heading).
- Three-tier design: navigator (sets target) → helmsman (steers toward target) → physics (always).

### E. Water scroll — `:380-393`
Cosmetic. `waterOffset.y` decremented proportional to `currentSpeed/SHIP_SPEED` while sailing,
or by `DOCKING_SPEED*dt` during docking/undocking (only while steering). Y-axis only by design
(ship sprite always faces up).

### F. Map overlay auto-open/close — `:395-403`
When `phase==='none'`: transitioning into `NAVIGATING` auto-opens `mapOverlayOpen`; when nobody
navigates and overlay is open, auto-closes. `world.wasNavigating` tracks the edge.

### G. UI key/click handling — `:405-721`
In order:
- **Escape** (`:406-415`): closes settings → overlay → context menu (first non-null wins).
- **M key** (`:418-424`): toggles map overlay (only if someone navigating & not docking).
- **Deck switch keys 1/2/3** (`:426-435`): `world.activeDeck = d`, clears context menu.
  Limited to `Math.min(3, decks.length)`. Harbor deck only reachable via gangplank click.
- **Camera** (`:438`): `updateCamera(...)` (arrow/WASD/wheel). Frozen-ish when `phase==='docked'`.
- **Map overlay click interception** (`:441-452`): `handleMapOverlayClick(...)`, consumes click.
- **Bottom-left buttons** (`:459-521`): settings cogwheel toggle, music mute, sfx mute,
  settings-panel pill clicks (inputMode), deck-selector panel clicks.
- **Context menu click** (`:524-592`): `handleMenuClick` → either a UI action
  (`Open Map`, `leave_harbor`, `buy_grog`, `recruit_sailor`, `browse_wares`, `read_notices`)
  or, for everything else, `menuItemToCommand(...)` → `issueCommand(member, command, world.actors)`.
  This is the **shared dispatch path** for menu actions and order-file commands.
- **Right-click barrel-item flyout** (`:595-614`).
- **Crew panel click** (`:617-623`): consumes click without deselecting.
- **World left-click** (`:625-708`): corpse hit-test → `handleClick(...)` → select crew /
  select object / use stairs (incl. gangplank connections via `world.gangplanks`).
- **World right-click** (`:711-721`): `buildContextMenu(...)` → `world.contextMenu`.

### H. Lantern oil burn — `:723-728`
Every lit lantern (`oil > 0`) burns `LANTERN_BURNOUT_RATE * dt` (`= 0.4/s`), floored at 0.

### I. Time-of-day / brightness — `:730-731`
```ts
const brightness = getShipBrightness((world.time + world.dayTimeOffset) % SECONDS_PER_DAY);
```
`brightness` is a local (0.3–1.0) passed into `updateActors`. **Not stored on World.**
Day cycle (`types.ts:9-27`): Dawn 0-60s, Day 60-420s, Dusk 420-480s, Night 480-720s;
`SECONDS_PER_DAY = 720`, `NIGHT_BRIGHTNESS = 0.3`.

### J. Order-file polling — `:733-738`
`world.orderPollTimer += dt`; every full second calls `pollOrders(world)` (see §5).

### K. Activity-log trim — `:740-743`
`world.activityLog` trimmed to the last 50 entries via `splice`.

### L. Spoilage — `:745`
`updateSpoilage(world.barrelInventory, world.actors, world.time, world.activityLog)`
(`src/items.ts`). **This is the model for a time-based decay system** — it gets barrels,
actors, the wall-clock `world.time`, and the log to push events. Pregnancy/rot/wear systems
should follow this exact signature pattern (pass what you mutate + `time` + `activityLog`).

### M. Crew AI tick + sound transitions — `:747-776`
The big one:
```ts
const prevStates = new Map(world.actors.map(c => [c.id, c.state]));
updateActors(world.actors, world.decks, dt, world.barrelInventory, world.time,
             world.lanternOil, brightness, world.activityLog, world.worldMap,
             world.spottedIslands, world, audio);
```
`updateActors` (`src/crew/update.ts`) runs the entire needs/behavior/state-machine for every
actor: needs decay, autonomous behavior, pathfinding, conversations, lust, death, **and mutiny**
(`mutinyState`/`mutinyTimer` are mutated inside `updateActors` at `crew/update.ts:806-819`,
NOT in game.ts). After the call, game.ts diffs `prevStates` vs new state to fire one-shot SFX
(lantern light/extinguish, kiss, drinking) and to refresh stale "busy" labels on an open
context menu (`:765-775`).

> **Note:** `updateActors` receives the whole `world` as its 11th arg, so AI code can read/write
> anything. Most new actor behavior belongs inside `crew/update.ts`, not here.

---

## 4. WHERE TO HOOK NEW PER-FRAME SYSTEMS (the cheat sheet)

All hooks go inside `update()` in `game.ts`. Recommended insertion points:

| New system | Insert after | Why |
|---|---|---|
| **Weather** (wind/storms affecting sailing) | step C (docking, `:365`), **before** step D sailing | so `updateSailing` can read current weather; or store weather on `World` and read it in `updateSailing` |
| **Combat / monster encounters** | after step D sailing physics (`:378`) | encounters trigger off ship position/speed; needs `worldMap` updated first |
| **Spoilage / rot** | alongside step L (`:745`) — already exists as `updateSpoilage` | reuse the `(collection, actors, world.time, activityLog)` pattern |
| **Pregnancy / gestation timers** | between step L and step M (`:745`-`:749`) | copy `updateSpoilage` signature; tick gestation by `dt` or compare to `world.time` |
| **Any cooldown timer** | step B (`:316`) | `if (world.x > 0) world.x = Math.max(0, world.x - dt);` |
| **New autonomous actor behavior** | NOT in game.ts — edit `crew/update.ts` `updateIdleHuman`/`updateIdleAnimal` | `updateActors` already has the whole world |

**Required for any new World-state field:** add it to the `World` interface (`types.ts:411`) AND
initialize it in `createWorld()` (`game.ts:181-225`) — TS will not flag a missing init since the
return object is a literal; a forgotten field is a runtime `undefined` bug.

**`dt` invariant:** `dt` is real seconds, **clamped to ≤ 0.1s** (`main.ts:59`). Never assume a
fixed step. Multiply rates by `dt`. For "X per in-game day" rates, divide by `SECONDS_PER_DAY` (720).

**Pause invariant:** there is no global pause flag. The only thing that halts the sim is
`mutinyState === 'game_over'` (full early-return). Docking pauses *sailing only* (gated on
`docking.phase === 'none'`). Map overlay does NOT pause the sim (crew keep acting underneath).

---

## 5. Order-file polling — `pollOrders()` (`game.ts:779-815`) + Vite plugin (`vite.config.ts:65-121`)

Two halves:

**Client side** (`pollOrders`, async, fired ~1×/sec from `update`):
- `fetch('/api/orders')` → array of `{ actorName, commands: Command[] }`.
- For each, find actor by case-insensitive name; if missing, log `Orders for unknown actor`.
- **Clears the actor's `commandQueue` then pushes the new commands** (replace, not append).
- Forces the actor to act immediately: if `IDLE`, set `idleTimer = 0`; if `WALKING` toward
  idle, snap to `IDLE` and clear `path`.
- Pushes a summary line to `activityLog`.
- Wrapped in try/catch — silently no-ops if the dev server isn't serving `/api/orders`.

**Server side** (`ordersPlugin`, `vite.config.ts:65`):
- Dev-server middleware on `/api/orders`. Reads `orders/orders_for_*.jsonl`.
- Actor name parsed from filename: `orders_for_anne.jsonl` → `"anne"` (regex `:85`).
- Each non-empty, non-`#` line is parsed: `{...}` JS-object-literal lines via
  `new Function('return (...)')`, otherwise treated as shorthand via `parseShorthand`
  (`src/command-shorthand.ts`).
- **After reading, each file is truncated to empty** (`fs.writeFileSync(filePath, '')`) so
  orders fire exactly once. To send orders, write JSONL into `orders/orders_for_<name>.jsonl`.

---

## 6. Activity log — how to push entries

`world.activityLog: ActivityLogEntry[]`. Each entry: `{ text: string, time: number }`.
Push directly:
```ts
world.activityLog.push({ text: `${name} did the thing`, time: world.time });
```
Examples throughout game.ts (`:109, :543, :554-559, :787, :810`). Auto-trimmed to 50 entries
each frame (`game.ts:740-743`). Functions that need to log (e.g. `updateSpoilage`, `updateActors`)
receive `world.activityLog` (or the whole `world`) as a parameter. Exposed read-only via
`/api/state?log` (see §8).

---

## 7. `main.ts` — loop, wiring, timestep — `src/main.ts:1-69`

- **Startup (top-level await):** `await loadConfig()` → `createWorld()`. Then optional
  instant-dock (`:17-30`, gated by `CONFIG.instantlyDockToNearestHarbor`): teleports ship to
  the nearest/first harbor island, builds docking state via `createDockingState(island)`, and
  calls `completeDocking(world)` immediately.
- **`window.__world = world`** (`:33`) — the live World struct on the global for console /
  Chrome-extension debugging.
- **State POST loop** (`:36-45`): `setInterval(..., 1000)` POSTs `serializeState(world)`
  (`src/debug-state.ts`) JSON to `/api/state`. This is *separate* from the RAF loop and runs
  on a wall-clock 1s interval. Silent on failure.
- **Renderer / input / audio wired** (`:46-55`): `new Renderer(canvas)`, `createInputHandler(canvas)`,
  `new AudioManager()`. Sprites loaded async (`loadSprites().then(...)`); rendering falls back to
  colored rectangles until they arrive.
- **The loop** (`:57-68`):
  ```ts
  let lastTime = performance.now();
  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);  // clamp prevents huge catch-up steps
    lastTime = timestamp;
    world.time += dt;                                          // <-- the ONLY place world.time advances
    update(world, input, audio, renderer.getHoveredItem(), dt);
    renderer.render(world, input.mousePos, audio.muted, audio.sfxMuted);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  ```

> **TIMESTEP MODEL:** This is a **variable-timestep RAF loop, NOT a fixed timestep.** `dt`
> varies per frame (capped at 0.1s). There is no accumulator and no decoupled
> physics/render rate — `update` and `render` run once per animation frame, lockstep.
> All simulation math must be `dt`-scaled. The 0.1s clamp means after a tab-background pause,
> time advances at most 0.1s in the first frame back (no spiral-of-death, but sim "loses" the
> wall-clock gap — `world.time` is sim time, not wall time).

> **`world.time` is the single global clock** (seconds of accumulated sim time since start).
> Used for: time-of-day (`(time+dayTimeOffset)%720`), spoilage, activity-log timestamps,
> and anything date/age-based. Advanced ONLY at `main.ts:61`.

---

## 8. Debug / state endpoints (dev server, `vite.config.ts`)

Three middleware plugins registered at `vite.config.ts:147`:

- **`/api/state`** (`statePlugin`, `:6-63`): POST caches the latest serialized snapshot;
  GET returns it with query filters: `?log`, `?actors`, `?actor=<name>` (from `actorDetails`),
  `?barrels`, `?time`, or no filter = everything except `actorDetails`. Snapshot is whatever
  `serializeState(world)` produces (`src/debug-state.ts`) — if you add World fields you want
  inspectable, extend that serializer.
- **`/api/orders`** (`ordersPlugin`): see §5.
- **`/api/config`** (`configPlugin`, `:123-144`): reads `config.env` key=value pairs, returns
  JSON. Consumed by `loadConfig()` (`src/config.ts`) at startup.

Dev server port: **7070** (`vite.config.ts:149`, also `npm run dev`).

---

## 9. Mode / sim-state matrix (what changes the simulation)

There is no single `mode` enum. Behavior is driven by several orthogonal flags on `World`:

| Flag | Values | Effect on sim |
|---|---|---|
| `mutinyState` | `'none' \| 'ultimatum' \| 'game_over'` | `'game_over'` → `update()` returns immediately, **whole sim frozen** (`game.ts:232`). Set inside `updateActors` (`crew/update.ts:806-819`). `'ultimatum'` counts down `mutinyTimer` (720s = 1 day) but sim runs normally. |
| `docking.phase` | `'none' \| 'docking' \| 'docked' \| 'undocking'` | Anything except `'none'` **disables sailing physics, navigator, helmsman, harbor detection** (`game.ts:370`). `'docking'`/`'undocking'` only animate while someone is `STEERING`. |
| `mapOverlayOpen` | bool | UI only — sim keeps running underneath. Auto-opens when navigating, toggled by `M`/Escape. |
| `commandInput` | `CommandInput \| null` | When non-null, swallows keyboard/click input but sim still runs. |
| `settingsOpen` | bool | UI only. |
| `activeDeck` | number (0=crow's nest,1=upper,2=lower) | Which deck renders + audio panning; does not pause sim. |

**There is no explicit "sailing vs docked" mode variable** — "sailing" is simply
`docking.phase === 'none'` with crew steering/navigating; "docked" is `docking.phase === 'docked'`.
If you need a new top-level mode (e.g. "in combat", "boarding"), follow the `docking.phase`
pattern: add a discriminated field to `World`, gate the relevant `update()` blocks on it, and
decide explicitly which existing systems it should suspend.
