# Codebase Map 06 — Harbor & Docking

Reference for extending the harbor/docking system. Read this before adding trading,
contracts, per-island personalities, or touching the docking flow.

## Files at a glance

| File | Responsibility |
|------|----------------|
| `src/harbor.ts` (~564 lines) | Harbor ASCII layout + char map, `DockingState` lifecycle (`startDocking`/`completeDocking`/`startUndocking`/`completeUndocking`), NPC spawning (`spawnHarborNPCs`), barrel/lantern seeding, stranding logic. |
| `src/render/docking.ts` (~126 lines) | The two on-screen buttons: `drawDockButton`/`isDockButtonClicked` ("Dock" bar when near island) and `drawDockedBar`/`isLeaveHarborClicked` ("Leave harbor" bar when docked). Pure UI; no state mutation. |
| `src/menu.ts` | Right-click context menu — NPC interaction submenu (Talk/Buy grog/Recruit/Browse wares/Pet), `leave_harbor` on gangplank, `read_notices` on notice board. |
| `src/game.ts` | The docking **state machine driver** (`update()`, lines ~319-393) and the **action dispatch** for `buy_grog`/`recruit_sailor`/`browse_wares`/`leave_harbor`/`read_notices` (lines ~523-592). Also `recruitSailor()` (lines ~18-110). |
| `src/crew/update.ts` | Autonomous harbor behavior (eat/sleep/take-grog/wander), tavern brawl (~756-798), harbor morale boost (~260-262), NPC idle AI `updateIdleNPC()` (~1249-1317), NPC greetings/ambient lines. |
| `src/renderer.ts` | Harbor tile **overlay** animation rendering during docking/undocking (lines ~42-116). |
| `src/notices.ts` | Notice board text generation (`readNoticeBoard`, `getNotices`). |
| `src/types.ts` | `DockingState` interface (line 401), `Island` interface (line 311), `World.docking`/`World.nearbyHarborIsland` (lines 440-442), `ActorType` includes `'cat'` (line 227). |
| `src/worldmap.ts` | Island data (`ISLANDS`-like array, lines 6-12), `getNearbyHarborIsland()` (line 96). |

---

## 1. DockingState machine

### Type (`src/types.ts:401`)
```ts
export interface DockingState {
  phase: 'none' | 'docking' | 'docked' | 'undocking';
  island: Island | null;
  harborTiles: TileType[][];
  harborWidth: number;
  harborHeight: number;
  harborAnimOffset: number;   // Y pixel offset during docking/undocking animation
}
```
Lives at `world.docking`. Initial value (`phase: 'none'`, empty tiles) is set by `completeUndocking()` and in `createWorld()`.

### Phase transitions & driver (`src/game.ts:319-393`)
The state machine is driven once per frame in `update()`. Key gate: **all docking/undocking
animation only advances while `anySteering` is true** (`world.actors.some(c => c.state === CrewState.STEERING)`).
If the helmsman stops steering mid-animation, docking freezes.

1. **none → docking**: `world.nearbyHarborIsland` is set (line 323) when `phase==='none'` via
   `getNearbyHarborIsland(world.worldMap)`. The "Dock" button click (`isDockButtonClicked`, line 329)
   calls `startDocking(world)`.
2. **docking → docked**: each frame `harborAnimOffset += DOCKING_SPEED * dt` (80 px/s). When it
   reaches `>= 0`, clamp to 0, call `completeDocking(world)`, play `harbor_arrive` SFX (line 346-354).
3. **docked → undocking**: `isLeaveHarborClicked` (docked bar, line 338) OR `leave_harbor` menu action
   (game.ts:533) OR gangplank context-menu item calls `startUndocking(world)`.
4. **undocking → none**: each frame `harborAnimOffset -= DOCKING_SPEED * dt`. When it reaches
   `<= UNDOCKING_END` (`-26 * TILE_SIZE = -832`), call `completeUndocking(world)` (line 358-364).

Sailing physics (`updateSailing`, `updateHelmsman`, `updateNavigator`) are **skipped** unless
`phase==='none'` (game.ts:370). Water scroll is driven manually during docking/undocking to match
`DOCKING_SPEED` (game.ts:388-393).

### The docking animation (`harborAnimOffset`)
- Constant `HARBOR_ANIM_START = -21 * TILE_SIZE = -672` (harbor.ts:86). The harbor starts 21 tiles
  north (off-screen above) and slides down to 0.
- `DOCKING_SPEED = 80` px/s (harbor.ts:89).
- `UNDOCKING_END = -26 * TILE_SIZE = -832` (harbor.ts:92) — harbor fully off-screen again.
- **Rendering** (`renderer.ts:42-116`): during `phase==='docking'||'undocking'` the harbor tiles are
  drawn as a **separate overlay deck** (`harborDeckObj`) using a camera offset by `-animOffset`
  (`createHarborRc`). They are NOT yet part of `world.decks`. Only drawn on `deckIndex === 1` (upper
  deck) and faintly on crow's nest (deck 0). Once `phase==='docked'`, the overlay stops and tiles
  live directly in `world.decks[1].tiles`.

### `startDocking` (harbor.ts:138-149)
Reads `world.nearbyHarborIsland`, stops sailing (`stopSailing` + `currentSpeed=0`), closes map
overlay, and assigns `world.docking = createDockingState(island)` (parses HARBOR_LAYOUT, sets
`phase:'docking'`, `harborAnimOffset: HARBOR_ANIM_START`).

### `completeDocking` (harbor.ts:152-246) — the heavy lift
In order:
1. `phase='docked'`, `harborAnimOffset=0`.
2. **Merge harbor tiles into `world.decks[1]`** (upper deck): for each non-water harbor tile where the
   deck currently has WATER, overwrite (harbor.ts:160-167). Invariant: only fills WATER, never the ship.
3. **Gangplank placement**: `upperDeck.tiles[GANGPLANK_Y][GANGPLANK_X] = GANGPLANK` and converts the
   adjacent hull tile to FLOOR for walkability. Constants: `GANGPLANK_X=28`, `GANGPLANK_Y=15`,
   `GANGPLANK_HULL_X=29` (harbor.ts:95-97).
4. Clear all actor paths (walkability changed); reset WALKING actors to IDLE.
5. **Seed lantern oil**: building lanterns (detected via `isInsideBuilding`, ≥3 surrounding walls
   within 2 tiles) start lit (oil=100); wharf lanterns start unlit (0). Keyed `1-${x}-${y}`.
6. **Seed barrels**: every harbor BARREL gets 3 `createGrogRation()` if not already in
   `world.barrelInventory` (key `1-${x}-${y}`).
7. **Restore stranded actors/corpses** for this island id (`world.strandedActors`/`strandedCorpses`),
   rebuilding missing relations bidirectionally.
8. `spawnHarborNPCs(world)`.
9. Give every non-NPC human a `heart` thought bubble for 4s.
10. Activity log: "Docked at {name}".

### `startUndocking` (harbor.ts:249-382) — the heavy teardown
Guards `phase !== 'docked'`. In order:
1. Reset all non-water harbor tiles NOT on the ship back to WATER; restore gangplank tile to WATER and
   hull tile to HULL.
2. **Partition actors**: NPCs (have `npc` status) are dropped entirely. Non-NPC actors are split by
   `isOnShip(tileX,tileY)` into `shipActors` (kept) vs `landActors` (stranded into
   `world.strandedActors[islandId]`, logged "left behind"). `world.actors = shipActors`.
3. Strip NPC relations from kept actors; deselect if selected actor was stranded; break
   conversations/copulation whose partner was stranded.
4. Partition corpses the same way (stranded → `world.strandedCorpses`).
5. Delete harbor lantern-oil and barrel-inventory keys (deck 1, off-ship).
6. `world.gangplanks = []`. `phase='undocking'`, `harborAnimOffset=0`. Log "Leaving {name}".

### `completeUndocking` (harbor.ts:385-394)
Resets `world.docking` to the empty `phase:'none'` state. (Does NOT touch decks — already cleared by
`startUndocking`.)

### Harbor ASCII layout + char map (harbor.ts:19-72)
41 wide × 33 tall (`EXPANDED_WIDTH=41`, `EXPANDED_HEIGHT=33`). The ship occupies a sub-region offset by
`DECK_X_SHIFT=29`, `DECK_Y_SHIFT=7`, size `SHIP_WIDTH=11 × SHIP_HEIGHT=21`. `isOnShip(x,y)` (harbor.ts:119)
tests this box. `HARBOR_CHAR_TO_TILE` (harbor.ts:54-67):
`. → WATER`, `L → LAND`, `W → WHARF`, `l → LANTERN` (wharf), `# → HARBOR_WALL`, `_ → HARBOR_FLOOR`,
`T → TABLE`, `B → BED`, `K → STOVE`, `R → BARREL`, `P → LANTERN` (building), `N → NOTICE_BOARD`.
Buildings (per layout comment): Tavern (cols 1-9 rows 5-10), Inn (cols 13-21 rows 5-10),
Market (cols 1-9 rows 14-19), Smithy (cols 13-21 rows 14-19). One notice board (`N`) at the town
square. `parseHarborLayout()` maps each char; unknown chars fall back to WATER.

**GOTCHA**: the layout is a single string constant shared by ALL islands. There is no per-island
variation yet (see issue `per_island_unique_harbors.md`).

---

## 2. `spawnHarborNPCs()` (harbor.ts:536-564)

Called from `completeDocking`. Allocates ids via `getNextActorId` (max existing id + 1).

### NPC roster (`HARBOR_NPCS`, harbor.ts:407-417)
Shopkeepers (confined, 4-tile wander): `Greg/bartender`, `Betty/innkeeper`, `Walter/merchant`,
`Ida/blacksmith`. Townsfolk (free, 10-tile wander): `Old Tom`, `Maggie`, `Little Jim` — all role
`townsfolk`. Each def: `{ name, role, color, tileX, tileY, sex }`.

### The npc status payload (harbor.ts:477, 532)
`actor.statuses.set('npc', { role, homeX, homeY })`. This single status is the canonical NPC marker.
Code everywhere checks `actor.statuses.has('npc')` to exclude NPCs from: player commands, needs decay,
mutiny... (and `startUndocking` removal). The payload's `homeX/homeY` anchor NPC wandering.

### `createNPC` (harbor.ts:427-479) vs `createHarborCat` (harbor.ts:481-534)
NPCs are `actorType: 'human'`, full hunger/energy=255, morale=200, `deck: 1`. The cat is
`actorType: 'cat'`, name from `CAT_NAMES` pool of 6, `numberOfHands: 0`, lower health (30), payload
`{ role: 'cat', homeX:11, homeY:12 }`. Both spawn at their tile center.

### Relation init (harbor.ts:550-561)
For each spawned NPC: bidirectional relation (friendship=128, attraction=0) with every existing actor,
plus NPC→NPC relations (friendship=192). **GOTCHA**: NPC→NPC relations are one-directional in the loop
(only `npc.relations.push`, the symmetric entry is added when the other npc's own loop runs).

### Shopkeeper vs townsfolk behavior (`updateIdleNPC`, crew/update.ts:1249-1317)
`isFreeRoaming = role === 'townsfolk' || role === 'cat'` → wander radius 10; else radius 4 around
`homeX/homeY`. NPCs greet nearby WALKING crew within 3 tiles (role-specific `NPC_GREETINGS`, 15s
cooldown) and emit ambient lines (`NPC_AMBIENT_LINES`, 1%/tick). NPCs can converse (role-specific
scripts) but cannot be commanded.

**GOTCHA / known issue** (`harbor_npcs_dilute_mutiny_denominator.md`): mutiny detection
(crew/update.ts:~801) counts `crew.filter(c => c.actorType === 'human')` WITHOUT excluding
`statuses.has('npc')`, so the 4 human NPCs inflate the mutiny threshold while docked. Fix would gate on
`!c.statuses.has('npc')`.

---

## 3. Existing "trading" / harbor interactions

All are wired through the **context menu** (`src/menu.ts:101-131`) → **action string dispatch in
`game.ts:523-592`**. None use gold; everything is free/display-only.

### Menu build (menu.ts:101-131)
When a human (non-NPC) is selected and you right-click an NPC, an "Interact ▶" submenu is built:
- All human NPCs: **"Talk to {name}"** (`targetState: TALKING`, `targetActorId`).
- `role==='bartender'`: **"Buy grog"** (`action: 'buy_grog'`).
- `role==='merchant'`: **"Browse wares"** (`action: 'browse_wares'`).
- `role==='innkeeper'`: **"Recruit sailor"** (`action: 'recruit_sailor'`), disabled if any actor has
  `recruited_this_visit` status.
- Cat NPC: **"Pet {name}"** (`targetState: PETTING`).

### Action handlers (game.ts:533-567)
- **`buy_grog`** (538): pushes one `createGrogRation()` into the selected member's inventory. **No cost.**
- **`recruit_sailor`** (548): calls `recruitSailor(world)` then plays `recruit` SFX.
- **`browse_wares`** (553): pushes 5 hard-coded lines into the activity log ending with
  "(Trading not yet available)". **Pure display.**
- **`leave_harbor`** (533): `startUndocking(world)`.
- **`read_notices`** (563): `readNoticeBoard(world)`.

### `recruitSailor()` (game.ts:18-110)
Spawns a new human actor (id = max+1, random sex/name avoiding dups, random skills 10-60), spawn point
near the gangplank (`DECK_X_SHIFT*TILE_SIZE + 2*TILE_SIZE`, row `DECK_Y_SHIFT+8`). Sets statuses
`climber`, `recruited_this_visit` (null payload — the per-visit limit flag), and `lust`. Inits relations
with all non-NPC actors (friendship 96-160). **No hiring cost.** `recruited_this_visit` is never
explicitly cleared per visit — it persists on the recruit's own status; the menu's
`alreadyRecruited` check uses `world.actors.some(a => a.statuses.has('recruited_this_visit'))`, so once a
recruit exists the option stays disabled until that recruit is gone (e.g. stranded/dies). **GOTCHA**:
the flag is not reset on undock/redock — verify behavior before changing recruit limits.

### Notice board (`src/notices.ts`)
`readNoticeBoard` picks 2-3 random notices from `getNotices` (static harbor blurbs + gameplay tips +
dynamic state-based lines like crew-wanted when <4 crew). If any non-NPC crew has navigation ≥
`SKILL_MASTERY` (192), 50% chance to reveal a hidden island (adds to `world.spottedIslands`). All notice
text is intentionally truthful (no fictional rumors).

### Tavern brawl (crew/update.ts:756-798)
When `phase==='docked'`, ~0.1%/sec, two **drunk idle non-NPC** crew within 3 tiles **and off-ship** may
brawl: both lose 5-15 HP (clamped ≥1), friendship −20 both ways, +15 morale both, brawl speech bubbles,
log line, `tavern_brawl` SFX.

---

## 4. Barrel seeding, lanterns, morale, autonomous behavior

- **Barrel seeding**: 3 grog rations per harbor BARREL in `completeDocking` (harbor.ts:194-205); keys
  `1-${x}-${y}`; cleaned up in `startUndocking`. (Ship barrels are seeded separately in `createWorld`,
  game.ts:138-166, with semen + grog.)
- **Lanterns**: building lanterns lit on dock (oil=100), wharf unlit (harbor.ts:183-191). Lantern light
  toggling reuses the normal LANTERN tile actions (menu.ts:240-248). Keys cleaned in `startUndocking`.
- **Morale boost**: `refreshConditions`/morale target in `crew/update.ts:260-262` adds `+20` to the
  morale target while `world.docking.phase === 'docked'`.
- **Autonomous harbor behavior** (all gated on `phase==='docked'`, in `updateIdleHuman`):
  - Hungry → 60% prefer harbor (off-ship) stoves over ship stove (crew/update.ts:879-881).
  - Tired → 60% prefer harbor beds (inn) (904-907).
  - 5%/tick: take a grog ration from a harbor barrel via `orderCrewBesideTile`+`TAKING_ITEM` (977-994).
  - 30%/tick: wander to a random `HARBOR_FLOOR` tile (explore town) (1065-1069).
- **Arrival celebration**: heart bubbles on all crew (completeDocking). Post-NPC-conversation: +3 morale
  and 40% gossip bubble (per implemented spec).

---

## 5. NOT yet implemented (from planned spec) + exact hook points

Planned spec: `features/planned/2026-03-12_HARBOR_TOWNS.md`. Implemented portion documented in
`features/implemented/2026-03-23_HARBOR_TOWNS.md` ("Future work" section lists the gaps).

### (a) Docking MINIGAME — "ship drives into the wharf"
**Status**: PARTIAL. The current implementation slides the *harbor* down onto a stationary ship via
`harborAnimOffset` rather than driving the ship forward into the wharf. The spec wants the boat to visibly
sail straight ahead into the wharf, with "Docking completed!" only at the end (no partial dock).
**Hook points**:
- Animation driver: `game.ts:345-355` (`phase==='docking'` block). To make the *ship* move instead of
  the harbor, you'd drive the ship sprite / water scroll forward and keep the harbor fixed, then call
  `completeDocking` at the end. Currently it does the inverse (harbor moves, water scrolls).
- Overlay rendering: `renderer.ts:86-116` (`createHarborRc`, `harborDeckObj`). The "ship moves" framing
  would invert the camera offset math here.
- No "no partial dock" issue exists today — it already requires reaching offset 0; the only steerer gate
  is `anySteering` (freezes if helmsman leaves). There is no explicit "Docking completed!" banner (only
  an activity-log line + `harbor_arrive` SFX in `completeDocking`).

### (b) DISEMBARKING semantics
**Status**: IMPLICIT, not a real mechanic. There is no explicit "disembark" command. Crew simply walk
across the GANGPLANK tile onto harbor tiles autonomously (eat/sleep/explore behaviors above). "On land"
vs "on ship" is computed purely positionally via `isOnShip()` at undock time — anyone standing on land
when you leave is *stranded* (`startUndocking`, harbor.ts:267-312).
**Hook points** for explicit disembark/recall semantics:
- Add a command + menu action; gate on `world.docking.phase === 'docked'`.
- `isOnShip()` (harbor.ts:119) is the canonical "are they aboard" predicate — reuse it.
- The stranding partition in `startUndocking` (harbor.ts:267-313) is where "recall all crew before
  leaving" or a confirmation warning would hook in.

### (c) GOLD CURRENCY + actual buy/sell
**Status**: NOT IMPLEMENTED. No gold field exists anywhere (`World` has no balance; `Actor.profile` has
no gold). `buy_grog` is free; `browse_wares` is display-only ("Trading not yet available").
**Hook points**:
- Add `gold: number` to `World` (`types.ts:411` World interface) and init in `createWorld`
  (`game.ts:130`).
- Buying: extend the `buy_grog` handler (game.ts:538) and add real handlers for the
  `browse_wares` list (game.ts:553-559) — deduct gold, push item to inventory or a barrel
  (`world.barrelInventory`).
- Selling: new menu action on the merchant (menu.ts:120-122) + handler in game.ts dispatch chain.
- Per the planned spec, "buying supplies just adds items to barrels" — reuse `world.barrelInventory`
  (`createGrogRation` etc. in `items.ts`) rather than inventing storage.
- Render gold somewhere in the HUD (renderer.ts UI section).

### (d) CONTRACTS (delivery/escort missions)
**Status**: NOT IMPLEMENTED. No mission/quest state exists.
**Hook points**:
- Add a `contracts` array to `World` (`types.ts`).
- New NPC action(s) on shopkeepers/townsfolk in the menu submenu (menu.ts:115-129) — e.g. a
  `take_contract` action string, dispatched in game.ts:533-567.
- Completion detection would tie to arriving at a target island (`getNearbyHarborIsland` /
  `completeDocking` island id) or enemy-ship combat (not yet implemented either).

### (e) Per-island PERSONALITIES (Tortuga / Port Royal / Skull Rock pricing)
**Status**: NOT IMPLEMENTED. `Island` (`types.ts:311`) has only `id, name, x, y, hasHarbor,
description, hidden?` — no personality/pricing fields. The harbor layout and NPC roster are global
constants (`HARBOR_LAYOUT`, `HARBOR_NPCS` in harbor.ts), identical for every island. Islands are defined
in `worldmap.ts:6-12` (Tortuga id 0, Port Royal id 2, Skull Rock id 3 hidden, etc.).
Known issue: `issues/per_island_unique_harbors.md`.
**Hook points**:
- Add fields to `Island` (`types.ts:311`), e.g. `priceModifiers`, `crewCostModifier`, `layoutId`,
  `npcSet`.
- `createDockingState(island)` (harbor.ts:125) is the single place that builds the harbor from the
  island — branch the layout/NPC selection here based on `island.id`/personality.
- `spawnHarborNPCs(world)` (harbor.ts:536) currently ignores `world.docking.island` — make it read the
  island to pick a roster.
- Pricing would be consumed by the future gold/buy-sell handlers (game.ts dispatch).

---

## Key invariants & gotchas (cheat sheet)
- **`anySteering` gates ALL docking animation.** No steerer → docking/undocking freezes mid-slide.
- Harbor tiles are an **overlay** during docking/undocking and become **real `world.decks[1]` tiles**
  only after `completeDocking`. Don't read `world.decks` for harbor tiles before `phase==='docked'`.
- **`statuses.has('npc')`** is the universal NPC gate. Any new harbor-NPC logic must respect it (commands,
  needs, mutiny, undock removal).
- NPCs are **destroyed on undock**, never stranded. Player crew on land **are** stranded into
  `world.strandedActors[islandId]` and restored on next dock at the same island.
- Barrel/lantern map keys are strings `"${deck}-${x}-${y}"`; harbor keys always use deck `1`.
- `recruited_this_visit` is a per-recruit flag, not reset on undock — limits to one recruit while that
  recruit lives.
- All harbor menu actions dispatch via **action strings** in `game.ts` (NOT through `menuItemToCommand`),
  except crew-crew/animal interactions (Talk/Pet) which go through `menuItemToCommand` → `issueCommand`.
