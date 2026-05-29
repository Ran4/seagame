# Codebase Map 05 — World Map & Sailing

Reference for engineers/agents extending the over-world (sailing) layer: islands,
ship navigation, the map overlay, docking triggers, island spotting, and where to
hook ocean-level random events (sea monsters, swordfish, storms, combat) and a
treasure-marker overlay.

Primary files:
- `src/worldmap.ts` — world model + sailing physics + map-overlay click handling
- `src/render/map.ts` — `drawMapOverlay()` (the full-screen map UI)
- `src/game.ts` — the `update()` tick that drives navigator/helmsman/sailing/docking
- `src/types.ts` — `WorldMap` / `Island` / `World` interfaces, constants
- `src/crew/update.ts` — lookout island-spotting (`checkForIslandSpotting`)
- `src/notices.ts` — expert-navigator hidden-island reveal
- `src/main.ts` — game loop; advances `world.time`, calls `update()` then `render()`

---

## 1. World map model

### Types (`src/types.ts`)

`Island` (`types.ts:311`):
```ts
interface Island {
  id: number;
  name: string;
  x: number;          // world coords, 0..100 (X), see bounds below
  y: number;          // world coords, 0..80 (Y)
  hasHarbor: boolean; // only harbor islands are dockable
  description: string;// shown in map tooltip
  hidden?: boolean;   // not drawn/clickable unless revealed (expert navigator)
}
```

`WorldMap` (`types.ts:321`):
```ts
interface WorldMap {
  shipX: number;
  shipY: number;
  currentHeading: number;        // radians, ACTUAL ship direction
  currentSpeed: number;          // ACTUAL speed (0 .. SHIP_SPEED)
  targetHeading: number | null;  // navigator's order (null = no order)
  targetSpeed: 'full' | 'stop';  // navigator's order
  destinationIsland: Island | null;
  islands: Island[];
}
```

The `WorldMap` lives on `World.worldMap` (`types.ts:421`). It is created by
`createWorldMap()` and stored in `createWorld()` at `game.ts:133`/`game.ts:194`.

### Islands (hardcoded, `worldmap.ts:5-13`)

There are 7 islands in the `ISLANDS` const array. Coordinates are in "leagues"
(1 grid cell = 1 league):

| id | name           | x  | y  | hasHarbor | hidden |
|----|----------------|----|----|-----------|--------|
| 0  | Tortuga        | 20 | 30 | yes       |        |
| 1  | Isla Muerta    | 75 | 15 | no        |        |
| 2  | Port Royal     | 35 | 60 | yes       |        |
| 3  | Skull Rock     | 85 | 55 | no        | yes    |
| 4  | Palm Cove      | 10 | 10 | yes       |        |
| 5  | Blackwater Bay | 60 | 45 | yes       |        |
| 6  | Serpent Isle   | 45 | 75 | no        | yes    |

To add an island: append an object to `ISLANDS`. `id` must be unique (used as the
key in `World.spottedIslands: Set<number>` and for destination-highlight matching
in `render/map.ts:74`). Set `hidden: true` to keep it off the map until revealed.

### World bounds

Hardcoded as `[0,100] x [0,80]` in `updateSailing()` (`worldmap.ts:81-82`):
```ts
map.shipX = Math.max(0, Math.min(100, map.shipX));
map.shipY = Math.max(0, Math.min(80, map.shipY));
```
The same `100`/`80` magic numbers appear in `render/map.ts` for the screen
projection (`toScreenX`/`toScreenY`, lines 24/31/39/40) and in
`worldmap.ts:131-132`. **GOTCHA / INVARIANT:** these bounds are NOT named
constants — if you change the world size you must update all four spots
(2 in `worldmap.ts`, the grid loops + both projection fns in `render/map.ts`).

### Speed & time constants

- `SECONDS_PER_DAY = 720` (`types.ts:8`, re-exported by `worldmap.ts:3`). 1 in-game
  day = 12 min IRL.
- `LEAGUES_PER_DAY = 70` (`worldmap.ts:16`, local const, not exported).
- `SHIP_SPEED = LEAGUES_PER_DAY / SECONDS_PER_DAY` ≈ **0.0972 leagues/sec**
  (`worldmap.ts:17`, exported). This is the full-speed value; `currentSpeed` is
  either `0` or exactly `SHIP_SPEED`.
- `DOCKING_DISTANCE = 3` leagues (`worldmap.ts:19`, exported) — radius for the dock
  prompt.
- `ISLAND_SPOT_DISTANCE = 3` leagues (`crew/update.ts:67`, local). Lookout spotting
  range. `eagle_eye` condition bumps it to `5` (`update.ts:827`).
- `ISLAND_SPOT_RESET = 16` leagues (`crew/update.ts:68`, local). When the ship is
  this far from ALL spotted islands, the spotted set is cleared.

`world.time` is advanced **in the game loop**, not in `update()`:
`main.ts:61` `world.time += dt;` then `main.ts:63` calls `update(...)`,
`main.ts:64` calls `renderer.render(...)`.

---

## 2. The "three-step" sailing pipeline

Driven each tick from `game.ts:367-378` (only when `docking.phase === 'none'`):

```
navigator (sets target) -> helmsman (applies target) -> physics (always moves)
```

1. **Navigator** — `updateNavigator(map)` (`worldmap.ts:46`). Runs only if a crew
   member is in `CrewState.NAVIGATING` (`anyNavigating`, `game.ts:369`), and is
   throttled to every 0.5s via `world.navTimer` (`game.ts:371-375`). Computes
   `dx,dy` to `destinationIsland`; if within `0.5` leagues it ARRIVES (clears
   destination, sets `targetSpeed='stop'`). Otherwise sets
   `targetHeading = atan2(dy,dx)` and `targetSpeed='full'`.
2. **Helmsman** — `updateHelmsman(map)` (`worldmap.ts:66`). Runs only if someone is
   `CrewState.STEERING` (`anySteering`, `game.ts:320`/`376`). Instantly copies
   `targetHeading -> currentHeading` and sets `currentSpeed = targetSpeed==='full'
   ? SHIP_SPEED : 0`.
3. **Physics** — `updateSailing(map, dt)` (`worldmap.ts:74`). ALWAYS runs (coasting):
   moves `shipX/Y` along `currentHeading` at `currentSpeed`, then clamps to bounds.
   Early-returns if `currentSpeed === 0`.

**INVARIANT / GOTCHA:** A destination alone does nothing. You need BOTH a navigator
(to translate destination → heading) AND a helmsman (to apply speed). With no
helmsman, `currentSpeed` is whatever it last was — typically 0, so the ship sits
still even with a destination set. The map overlay surfaces this with separate
Navigator/Helmsman status dots (`render/map.ts:168-181`).

Other sailing helpers:
- `stopSailing(map)` (`worldmap.ts:85`) — clears destination + target heading, sets
  `targetSpeed='stop'`. Does NOT zero `currentSpeed` directly (helmsman/physics
  handle that next tick). Called from the overlay "Stop Sailing" button
  (`worldmap.ts:126`).
- `setDestination(map, island)` (`worldmap.ts:91`) — just sets
  `map.destinationIsland`. Called from `handleMapOverlayClick` when an island is
  clicked.

Water visual: `game.ts:382-393` scrolls `world.waterOffset.y` only (the ship sprite
always faces up; heading-based scroll was intentionally avoided as disorienting).

---

## 3. Docking trigger & `getNearbyHarborIsland`

`getNearbyHarborIsland(map)` (`worldmap.ts:96`) iterates islands, skips
`!hasHarbor`, returns the first harbor island within `DOCKING_DISTANCE`
(Euclidean), else `null`. **GOTCHA:** "nearest" in the doc comment is a misnomer —
it returns the FIRST match in array order, not the closest. Fine today because
harbor islands are far apart, but if you cluster harbors, fix this to track min
distance.

Wired in `game.ts:322-325`:
```ts
world.nearbyHarborIsland = world.docking.phase === 'none'
  ? getNearbyHarborIsland(world.worldMap)
  : null;
```
When set and `docking.phase==='none'`, `drawDockButton()` renders a Dock prompt
(`renderer.ts:221-223`). Clicking it (`game.ts:328-334`, gated by `anySteering`)
calls `startDocking(world)` (from `harbor.ts`). The docking/undocking animation
state machine is `game.ts:345-365`; sailing updates are SKIPPED while
`docking.phase !== 'none'` (`game.ts:370`). Docking/harbor internals live in
`harbor.ts` and `render/docking.ts` — out of scope here.

---

## 4. The map overlay

### Opening / closing (`game.ts`)

- `World.mapOverlayOpen: boolean` (`types.ts:425`) is the single source of truth.
- Auto-open/close on navigation transitions (`game.ts:395-403`): opens when
  `anyNavigating` becomes true (tracked via `world.wasNavigating`), auto-closes when
  nobody is navigating.
- **M key** toggles it, but ONLY if `anyNavigating && docking.phase==='none'`
  (`game.ts:418-424`). You cannot open the map without an active navigator.
- **Escape** closes it (after settings, before context menu) — `game.ts:406-415`.

### Rendering (`render/map.ts:4` `drawMapOverlay`)

Called from `renderer.ts:210-212` only when `mapOverlayOpen && worldMap`. Signature:
```ts
drawMapOverlay(rc, worldMap, mousePos, time, hasNavigator, hasHelmsman, hasExpertNavigator?)
```
Computed at the call site in `renderer.ts:59-62`:
- `hasNavigator = crew.some(c => c.state === CrewState.NAVIGATING)`
- `hasHelmsman  = crew.some(c => c.state === CrewState.STEERING)`
- `hasExpertNavigator = crew.some(c => NAVIGATING && (c.skills.navigation ?? 0) >= SKILL_MASTERY)`
  (`SKILL_MASTERY = 192`, `types.ts:17`).

Overlay box: `ox=40, oy=40, ow=880, oh=460` (`render/map.ts:6`). World→screen
projection:
```ts
toScreenX = wx => ox + (wx/100)*ow;
toScreenY = wy => oy + 30 + ((wy/80)*(oh-50));
```
Draws: dark-blue panel, grid, dashed ship→destination line, islands (green dot if
`hasHarbor`, brown otherwise; golden ring on the destination), the ship as a red
triangle rotated to `currentHeading + π/2` (heading 0 = east), hovered-island
tooltip, close "X", Navigator/Helmsman status dots, and (if a destination is set) a
"Sailing to ... — N leagues — ETA: ..." line plus a Stop Sailing button.

**Hidden islands:** `render/map.ts:61` skips drawing any island where
`island.hidden && !hasExpertNavigator`.

### Click handling (`worldmap.ts:110` `handleMapOverlayClick`)

Called from `game.ts:440-452` when `mouseClick && mapOverlayOpen`. `hasExpertNavigator`
is recomputed there independently (`game.ts:442-444`). Returns one of:
- `'close'` — close X hit OR click outside the overlay rect.
- `'click'` — Stop-Sailing button hit, or an island dot hit (sets destination).
  Plays the `'click'` SFX (`game.ts:448-449`).
- `null` — inside overlay but no actionable hit (keeps it open).

Island hit-test (`worldmap.ts:133-143`) uses the SAME hidden-island gate
(`island.hidden && !hasExpertNavigator => skip`) and a 14px radius. The overlay
layout constants here (`OVL_X/Y/W/H`, `worldmap.ts:107`) are a SEPARATE copy of the
ones in `render/map.ts`. **GOTCHA / INVARIANT:** the projection formula and box
geometry are duplicated across `worldmap.ts` and `render/map.ts` and MUST be kept in
sync or clicks will land on the wrong island. Same for the close-X and Stop-Sailing
button coords.

---

## 5. Hidden islands & navigator reveal

Two reveal paths add an island id to `World.spottedIslands` (a
`Set<number>`, `types.ts:432`, initialised empty at `game.ts:205`):

1. **Lookout spots it on approach** — `checkForIslandSpotting()`
   (`crew/update.ts:826`), called from the `CrewState.LOOKOUT` branch
   (`update.ts:399-400`). Adds the id if within `spotDistance` (3, or 5 with
   `eagle_eye`), triggers "Land ho!" speech, +30 morale to all crew
   (`LAND_HO_MORALE_BOOST`). One island per tick.
2. **Expert navigator reads the notice board (in harbor)** — `readNoticeBoard()`
   (`notices.ts:42`). If any non-NPC human has `navigation >= SKILL_MASTERY`, 50%
   chance to reveal one not-yet-spotted hidden island (`notices.ts:52-65`).

**GOTCHA — `spottedIslands` is NOT what gates map visibility.** The overlay reveals
hidden islands purely via `hasExpertNavigator` (a LIVE check: is an
expert-skilled crew member currently NAVIGATING). `spottedIslands` drives
"Land ho!" / notice-board flavour and the debug snapshot
(`debug-state.ts:114`), and is auto-cleared when the ship sails `ISLAND_SPOT_RESET`
(16 leagues) away from all spotted islands (`crew/update.ts:193-207`). If you want
hidden islands to stay revealed on the map after being spotted, you'd change the
`render/map.ts:61` and `worldmap.ts:134` gate to also consult `spottedIslands`.

---

## 6. "Deep water / far from islands" — distance to nearest island

There is **no existing helper** for "how far is the ship from land." You compute it
ad hoc, exactly like the existing distance checks (`worldmap.ts:99-101`,
`crew/update.ts:198-200`):

```ts
function distanceToNearestIsland(map: WorldMap): number {
  let min = Infinity;
  for (const isl of map.islands) {
    const dx = map.shipX - isl.x;
    const dy = map.shipY - isl.y;
    min = Math.min(min, Math.sqrt(dx*dx + dy*dy));
  }
  return min; // leagues
}
```

**Recommended pattern for monster/swordfish gating:** add a named threshold next to
the others in `worldmap.ts` (e.g. `export const DEEP_WATER_DISTANCE = 12;`) and a
helper `isInDeepWater(map)` returning `distanceToNearestIsland(map) > DEEP_WATER_DISTANCE`.
Put it in `worldmap.ts` so the over-world model stays self-contained.

Calibration notes for picking a threshold (world is 100x80):
- `DOCKING_DISTANCE = 3` (right at land), `ISLAND_SPOT_DISTANCE = 3` (visible from
  deck), `ISLAND_SPOT_RESET = 16` (effectively "out of sight"). A deep-water
  threshold somewhere in `8..16` reads as "open ocean, no land in view."
- Note hidden islands also count as "land" in the loop above. If sea monsters should
  lurk near uncharted islands, that's fine; if deep water should mean "no land at
  all," include them (they're still in `map.islands`).

Also available: the swordfish should probably also require the ship be MOVING
(`map.currentSpeed > 0`) — check that too.

---

## 7. Where to roll world-level random events (storms, monsters, combat)

There is currently **no ocean-event system** and no per-tick random roll in `update()`
beyond crew AI. The natural insertion point is inside `update()` in `game.ts`, after
the sailing block and gated on not-docked. Two good spots:

- **Right after the sailing pipeline** (`game.ts:378`), still inside the
  `if (world.docking.phase === 'none')` block — so events only fire while at sea, not
  in harbor. You have `world.worldMap`, `world.actors`, `world.activityLog`, and the
  computed `anyNavigating`/`anySteering` in scope.
- Or as its own block before crew AI (`updateActors` is called at `game.ts:749`).

**Throttle pattern (use the existing timer idiom).** Don't roll every frame — copy
the `navTimer`/`orderPollTimer` approach:
- `navTimer` (`game.ts:371-375`): accumulate `dt`, fire every 0.5s.
- `orderPollTimer` (`game.ts:734-738`): accumulate `dt`, fire every 1s.

To add one: declare a field on `World` (e.g. `eventTimer: number`) in `types.ts`,
init it in `createWorld()` (`game.ts` ~line 197-205 where `navTimer`/`orderPollTimer`
are initialised), then in `update()`:
```ts
world.eventTimer += dt;
if (world.docking.phase === 'none' && world.eventTimer >= EVENT_TICK_SECONDS) {
  world.eventTimer = 0;
  // roll: Math.random() < perCheckChance, gate by isInDeepWater(world.worldMap), etc.
}
```
Push narrative to `world.activityLog` (capped to 50 at `game.ts:740-743`) and play
SFX via `audio.play('<name>', world.activeDeck)` (see e.g. `game.ts:331`).

**GOTCHA:** time only advances via `world.time += dt` in `main.ts:61`; `dt` passed
into `update()` is real seconds (not scaled). Convert to in-game time with
`SECONDS_PER_DAY` if you want "X events per game-day."

---

## 8. Where a treasure-marker overlay would go

The map overlay is the obvious host. Treasure markers (e.g. on Skull Rock /
Serpent Isle, which already hint at treasure in their descriptions) would be drawn
inside `drawMapOverlay()` in `render/map.ts`, in the island loop (after line 98) or
as a dedicated pass after it — using the same `toScreenX/toScreenY` projection. Draw
a small X / chest icon at the treasure's world coords.

If treasure has its own world position (not tied to an island), add a data source:
- A new field on `WorldMap` (e.g. `treasureMarkers: {x,y,found,islandId?}[]`) in
  `types.ts:321`, populated in `createWorldMap()` (`worldmap.ts:33`).
- Render it in `drawMapOverlay` (`render/map.ts`).
- If clickable (set as destination), add a hit-test branch in
  `handleMapOverlayClick` (`worldmap.ts:119-144`) BEFORE/after the island loop, and
  remember to keep the projection math identical to the render side.
- Gate visibility on `hasExpertNavigator` and/or `spottedIslands` to match the
  hidden-island convention (Section 5).

The full-screen world overlay is the only existing UI that maps world coords to
screen, so any "where on the ocean" marker (treasure, last-known monster sighting,
storm front) belongs there. There is no separate minimap.

---

## Quick reference — exact symbols

| Symbol | Location | Notes |
|--------|----------|-------|
| `ISLANDS` | `worldmap.ts:5` | hardcoded island list |
| `SHIP_SPEED` | `worldmap.ts:17` | exported, ≈0.0972 leagues/s |
| `DOCKING_DISTANCE` | `worldmap.ts:19` | exported, 3 |
| `createWorldMap()` | `worldmap.ts:21` | initial ship at (50,40) or near island |
| `updateNavigator()` | `worldmap.ts:46` | destination → targetHeading |
| `updateHelmsman()` | `worldmap.ts:66` | target → current (instant) |
| `updateSailing()` | `worldmap.ts:74` | moves ship, clamps to [0,100]x[0,80] |
| `stopSailing()` | `worldmap.ts:85` | |
| `setDestination()` | `worldmap.ts:91` | |
| `getNearbyHarborIsland()` | `worldmap.ts:96` | first harbor within DOCKING_DISTANCE |
| `handleMapOverlayClick()` | `worldmap.ts:110` | returns 'click'/'close'/null |
| `drawMapOverlay()` | `render/map.ts:4` | full overlay render |
| sailing pipeline call site | `game.ts:367-378` | navigator/helmsman/physics |
| docking trigger | `game.ts:322-334` | nearbyHarborIsland + dock button |
| map open/close + M key | `game.ts:395-424` | |
| map click interception | `game.ts:440-452` | |
| `checkForIslandSpotting()` | `crew/update.ts:826` | lookout "Land ho!" |
| spotted-set reset | `crew/update.ts:193-207` | ISLAND_SPOT_RESET = 16 |
| expert-nav notice reveal | `notices.ts:52-65` | |
| `WorldMap` / `Island` types | `types.ts:321` / `types.ts:311` | |
| `World.worldMap` / `spottedIslands` / `mapOverlayOpen` | `types.ts:421/432/425` | |
| `SKILL_MASTERY = 192` | `types.ts:17` | expert threshold |
| `SECONDS_PER_DAY = 720` | `types.ts:8` | |
