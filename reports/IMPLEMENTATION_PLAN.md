# Sea Game — Planned-Features Implementation Plan

This doc locks the cross-cutting design decisions so that features implemented by
separate agents stay consistent. **Every implementation agent must read this file plus
the relevant `reports/codebase-map/*.md` docs and its own `features/planned/*.md` spec.**

Ground rules for all agents:
- TypeScript + Canvas + Vite. No new runtime deps. Code in English; Swedish comments OK.
- After implementing, run `npx tsc --noEmit` from `/home/ran/seagame` and FIX all type errors you introduced. Do not leave the build broken.
- Do NOT delete or rewrite unrelated working code. Extend, don't refactor wholesale.
- Sprites: it is fine to ship WITHOUT generating PNGs — the renderer has colored-rectangle/hand-drawn fallbacks. Add a fallback drawing branch where a new visual is needed. Do NOT call the OpenAI sprite script.
- New `CrewState` → add enum value in `types.ts`, add to `STATE_NAMES`, handle in the `updateActors()` switch in `crew/update.ts`.
- New tile type → follow `.claude/rules/adding_new_tile_types.md` (enum, WALKABLE if standable, TILE_COLORS, ship.ts CHAR_TO_TILE if placed in ASCII, TILE_NAMES in renderer, TILE_ACTIONS if commandable). Tile-name tooltips live in `renderer.ts` `TILE_NAMES`.
- New command → add to `Command` union in `types.ts`, map it in `menu.ts` `menuItemToCommand()`, handle it in `crew/commands.ts` `issueCommand()`. Menu entries come from `TILE_ACTIONS` (tile-based) or are built in `menu.ts buildContextMenu()` (actor/NPC/special actions via `action?: string`).
- New per-frame system → hook it into `update()` in `game.ts`. Note: `update()` returns early when `world.mutinyState === 'game_over'`. Sailing/docking systems run only when `world.docking.phase === 'none'`.
- Activity log: `world.activityLog.push({ text, time: world.time })`. SFX: `audio.play('<name>', deck)` (missing files tolerated; register new names in `audio.ts`).
- New actor at runtime: copy the full Actor shape from `recruitSailor()` in `game.ts` (it is the canonical template — handles unique id = maxId+1, bidirectional relations skipping NPCs, all required fields).

---

## SHARED SYSTEM A — Object / Hull damage (`src/combat.ts`)

Owned by the **Ship-to-Ship Combat** agent (built first). Storms and Sea Monsters REUSE it.

Add to `World` (in `types.ts`):
```ts
objectHp: Map<string, number>;     // "deck-x-y" -> current HP of a damageable tile (lazy: absent = full)
floodLevel: number;                // 0..100, rises while hull breaches exist on lower deck
gameOverReason: string | null;     // generalized game-over text (mutiny already sets mutinyState)
```
Init in `createWorld()`: `objectHp: new Map()`, `floodLevel: 0`, `gameOverReason: null`.

Add `HULL` and keep `MAST` in `OBJECT_MAX_HP` (`types.ts`):
```ts
[TileType.HULL]: 120,
```
(MAST/HELM/CANNON/etc already present.)

New tile types (`types.ts` enum, appended): `BREACH`, `RUBBLE`.
- `BREACH` — a hole in the hull. NOT walkable. Source of flooding. Repairable back to HULL.
- `RUBBLE` — destroyed structure/furniture. NOT walkable. (Not repairable in v1.)
Add TILE_COLORS, TILE_NAMES, and render fallbacks (BREACH: dark water+jagged edge; RUBBLE: grey debris).

`src/combat.ts` exports (pure helpers operating on World):
- `getObjectMaxHp(tileType): number` — from OBJECT_MAX_HP (HULL=120).
- `getObjectHp(world, deck, x, y): number` — map value, else max for that tile (lazy full).
- `damageObject(world, deck, x, y, amount): void` — clamp to 0; write to objectHp. On reaching 0:
  - HULL → set tile to `BREACH` (flooding source).
  - MAST/HELM/CANNON/furniture → set tile to `RUBBLE`. If a crew was using it, eject to IDLE.
  - log + leave a `world.activityLog` entry.
- `repairObject(world, deck, x, y, amount): boolean` — heal; BREACH being repaired converts back to HULL once HP>0; requires the repairing crew to consume one `Wood` item (caller checks inventory). Returns true if fully repaired.
- `updateFlooding(world, dt): void` — count BREACH tiles on the lowest deck; `floodLevel += breaches * FLOOD_RATE * dt` (no breaches → slowly drain). If `floodLevel >= 100` → `world.gameOverReason = 'Your ship sank!'; world.mutinyState = 'game_over'`. Call from `update()`.

New `CrewState.REPAIRING`. Repair is a commanded action (right-click a BREACH/damaged HULL/object tile with crew selected → "Repair"; needs Wood in inventory or a nearby barrel). Add `{ name: 'Repair'; deck; x; y }` command. Autonomous: brave idle crew may repair the nearest breach when flooding > 0.

`injured` status `{ severity: number }`: reduces effective stats and forces bed rest (crew prefer SLEEPING). Set on crew hit by cannon/tentacle. Heals over time faster with Medicine / at harbor. Add `'injured'` to derived conditions in `refreshConditions()`.

Items needed (combat agent adds to `items.ts`): `createWood()`, `createCannonball()`, `createMedicine()`. Wood: stackable, no spoil. Cannonball: stackable ammo. Medicine: consumable that clears/reduces `injured`.

---

## SHARED SYSTEM B — Gold currency

Owned by the **Harbor Towns** agent. Treasure Maps and Combat loot ADD to it.

Add to `World`: `gold: number;` init `100` in `createWorld()`.
Render a gold counter in the HUD (top-left near deck selector, or near the docked bar). Buying subtracts, selling/treasure/loot adds. Guard against negative (can't buy if insufficient).

---

## SHARED SYSTEM C — Deep-water / region helper (`worldmap.ts`)

Owned by the **Storms** agent (first to need it); Sea Monsters + swordfish reuse.
Add `distanceToNearestIsland(map): number` and `isInDeepWater(map): boolean` (e.g. > 12 leagues from any island). Combat encounters, sea-monster rolls, and swordfish availability use it.

---

## NEW-IDENTIFIER REGISTRY (claim these to avoid collisions)

TileType (append to enum): `FISHING_SPOT`, `BREACH`, `RUBBLE`.
CrewState: `FISHING`, `REPAIRING`, `FIGHTING`, `FLEEING`, `PRAYING`.
Commands: `Repair`, `FireCannon`, `BoardEnemy`, `Fight` (tentacle/melee), `Fish`, `UseMap`, `SendExpedition`, `Pray`.
Statuses: `bruised`, `injured`, `pregnant`, `baby`, `postpartum`, `wet`, `sick`, `kraken_slayer`, `cursed`, `ashore`, `thief` (monkey carrying stolen goods).
Item factories (items.ts): `createFish(kind)`, `createWood`, `createCannonball`, `createMedicine`, `createTreasureMap(opts)`, `createGem`, `createArtifact`, `createCursedItem`, `createKrakenInk`, `createKrakenTooth`, `createTentacleMeat`.
World fields: `objectHp`, `floodLevel`, `gameOverReason`, `gold`, `weather`, `enemyShip`, `tentacles`, `monster`, `expedition`.

---

## FEATURE 1 — Drunk Fighting  (independent, small)
Spec: `features/planned/2026-03-13_DRUNK_FIGHTING.md`.
At sea (any time, not just harbor): two **drunk** crew with low mutual friendship (<64) standing within ~2 tiles have a small per-tick chance (~0.1%/sec) to start a fist fight. Effects: friendship −20 both ways, both gain `bruised` status, both lose 5–15 HP (never lethal — clamp ≥10), small morale bump (+10, "comedy"). Speech bubbles ("Take that!", "Ye scallywag!"), activity-log line, play a `fist_fight` SFX. Reuse/mirror the existing harbor "tavern brawl" logic (see harbor codebase-map) but trigger anywhere on the ship. `bruised` is a derived condition; expires after ~1 in-game day. Implement in `crew/update.ts` (a per-tick scan, like brawl). Keep it from firing on the same pair repeatedly (cooldown).

## FEATURE 2 — Fishing  (independent)
Spec: `features/planned/2026-03-12_FISHING.md`.
- TileType `FISHING_SPOT` on upper-deck railing tiles (edit `ship.ts` ASCII + CHAR_TO_TILE; WALKABLE; colors; TILE_NAMES; TILE_ACTIONS → "Fish" → `CrewState.FISHING`).
- `CrewState.FISHING` + `{name:'Fish'}` command. Crew walks to spot, casts, waits random 15–60s (crew-skills not implemented → leave a note file in `issues/` saying to tie bite-time to a fishing skill later), then catches a fish → goes to nearest barrel inventory as a food Item.
- Fish via `createFish(kind)`: common (+20 hunger, everywhere), tropical (+30, near warm islands — sells at harbor), swordfish (+50, rare, deep water only), pufferfish (+50 but eating gives `sick` status for 1 in-game day: crew vomits, can't work — handle `sick` in update: forced idle/vomit, blocks work states). Fish spoil fast: `spoilAfter ≈ 600` (already-enforced `updateSpoilage`).
- Autonomous: idle crew with low ship food supply (few/no edible items in barrels) choose to fish, like they choose to eat when hungry. Follow `updateIdleHuman()` pattern.

## FEATURE 3 — Baby Animals / Puppies  (independent)
Spec: `features/planned/2026-03-10_PUPPY_FEATURE.md` — follow it closely (it is detailed).
- Hook successful **animal-animal** copulation (same actorType) in `crew/lust.ts`: set `pregnant {father, since, animalType}` on one (the female if sexes differ, else arbitrary). Skip if `postpartum`.
- Gestation: dogs 2 in-game days (1440s), monkeys 3 (2160s). On due → spawn litter (dogs 1–5, monkeys 1) adjacent to mother (retry next tick if blocked). Use the `recruitSailor()` Actor template but `actorType` = baby's type. Set `baby` status; stats per spec (hunger/energy 200; friendship to parents 224, parents→baby 192); auto-generated name from per-type pools (avoid duplicates with living actors). Set mother `postpartum {since}` and zero her lust; remove `postpartum` after 4 in-game days.
- `baby` status (≤3 in-game days): drawn ~0.6× scale (precedent: cat 0.7×, see render-fx map), tighter follow leash (2 tiles), eats 1.5× faster, no work/lust. Remove `baby` after 3 days → adult.
- Implement gestation/spawn/growth ticking in `crew/update.ts` (per-actor in update loop or a dedicated pass). SKIP parrot eggs.

## FEATURE 4 — Ship-to-Ship Combat  (FOUNDATION — build before Storms/Sea Monsters)
Spec: `features/planned/2026-03-12_SHIP_TO_SHIP_COMBAT.md`. Build SHARED SYSTEM A here.
- `world.enemyShip: EnemyShip | null` = `{ name, hp, maxHp, crewCount, distance, hostile, fireTimer }`. Random encounter while sailing (roll in `update()` when `docking.phase==='none'` and moving; higher chance in deep water / near pirate islands). Show enemy on world-map overlay + a simple combat HUD (enemy name, HP bar, distance). Player can flee (sail away → distance grows → escape if fast enough).
- Combat: when in range, both broadside. Crew manning CANNON fire automatically on a reload timer → roll damage to enemy hp. Enemy fires back periodically → `damageObject()` on random ship hull/objects and chance to `injured`/kill a crew member on the relevant deck. Cannon needs cannonballs? keep simple: infinite for v1 but consume if present.
- Hull damage + flooding + repair via SHARED SYSTEM A. Destroyed helm/mast disable steering/sailing (cap speed). 
- `{name:'FireCannon'}` (manual fire) and `{name:'BoardEnemy'}` commands. Boarding when adjacent: resolve as series of 1v1 stat comparisons (combat skill + hunger/energy) → on win, capture enemy: add loot to barrels (gold to `world.gold`, maybe a treasure map / wood / cannonballs). DO NOT implement melee cutlass animation (deferred per spec) — boarding is an abstract resolution.
- Consequences: injured crew (bed rest), killed crew (use existing death/corpse), ship damage persists (repair at harbor/with wood).

## FEATURE 5 — Storms & Weather  (after Combat; reuses SHARED A + adds SHARED C)
Spec: `features/planned/2026-03-12_STORMS_AND_WEATHER.md`.
- `world.weather = { state:'clear'|'cloudy'|'storm'; timer; intensity:0..1; lightningFlash:number }`. State machine in `update()`: clear↔cloudy↔storm, storms last 2–5 in-game hours. Some regions stormier (use SHARED C region).
- Render (render-fx map): darken global brightness further during storm, rain particle overlay, brief full-bright `lightningFlash`. Add a small weather indicator to HUD.
- Effects: crew % chance to stumble while walking (reuse drunk wobble — see render-fx map for the wobble code), loose handling minimal, lanterns blow out (set lanternOil→0 occasionally), sails tear → MAST/`damageObject`, crew get `wet` status (move slower). Steering harder.
- Morale: storms drain morale; low-morale crew may `FLEE` below deck or `PRAY` (new states) or refuse orders; high-morale stay.
- Lightning strike: rare, can set mast "on fire" (just `damageObject` mast + injure upper-deck crew + a fire flash). Keep fire simple (damage event, no persistent fire spread needed for v1, or a short timed mast-fire that crew must address — your call, keep scoped).

## FEATURE 6 — Sea Monsters / Kraken  (after Combat — REQUIRES it)
Spec: `features/planned/2026-03-12_SEA_MONSTERS.md`. The spec says REFUSE if combat absent — combat IS implemented first, so proceed.
- `world.monster` encounter state + `world.tentacles: Tentacle[]` (`{id, deck, x, y, hp, grabbedActorId|null}`). Rare roll in deep water while sailing. Foreshadow: darken water, lookout warning, ~30s prep timer, then attack.
- Phases: (1) tentacles appear at ship edges, crew hack them — `{name:'Fight', x,y,deck}` command + `CrewState.FIGHTING` at a tentacle tile (like Man Cannon but targets tentacle, deals damage per hit using combat skill). Each tentacle has HP. (2) tentacles grab crew (set grabbedActorId; that crew is stuck until freed) — others Fight the grabbing tentacle to free them before dragged overboard (death if not freed in time). (3) Kraken rams hull → `damageObject` burst on one side. (4) retreats when enough tentacles severed, or ship sinks (flooding).
- Crew behavior: brave (high morale) Fight, cowardly (low morale) FLEE below deck. Dogs bark, parrots circle (cosmetic).
- Loot on victory: kraken ink (trade good), kraken tooth (weapon item), tentacle meat (food); crew who fought get permanent `kraken_slayer` status (+morale, convo topic).
- Render tentacles as overlay sprites/fallback at tile positions (render-fx map: tile overlays).

## FEATURE 7 — Harbor Towns remainder  (independent of combat; builds SHARED B)
Spec: `features/planned/2026-03-12_HARBOR_TOWNS.md`. Most is DONE (see harbor codebase-map + `features/implemented/2026-03-23_HARBOR_TOWNS.md`). Implement the GAPS only:
- **Docking minigame**: per the ASCII in the planned spec — when "Dock" pressed, ship sails straight forward into the wharf (the existing docking animation slides the harbor in via `harborAnimOffset`). Ensure it reads as "driving into the wharf"; only show "Docking completed!" when fully docked (it already gates on full animation — verify and polish, e.g. a "Docking…" / "Docking completed!" toast). Keep it scoped; the animation infra exists.
- **Gold currency + real trading** (SHARED B): Market merchant "Browse wares" → buyable list with prices; selling loot/fish/gems. Replace the display-only `browse_wares` log. Buy food/wood/cannonballs/grog/medicine → items into a barrel or buyer inventory; deduct `world.gold`. Sell loot → add gold. Show gold in HUD.
- **Per-island personalities**: price multipliers + flavor per island (Tortuga lawless: cheap crew/expensive goods; Port Royal civilized: good prices; Skull Rock black market: stolen goods). Drive prices from the docked island.
- **Contracts**: simple delivery/hunt missions from an NPC ("Deliver cargo to X", "Hunt ship Y") with a gold reward on completion. Track in `world` (e.g. `world.contracts`). Keep v1 simple: accept → goal recorded → reward on condition met (arrive at island / defeat named ship).

## FEATURE 8 — Treasure Maps & Exploration  (after Harbor — needs docking + gold)
Spec: `features/planned/2026-03-12_TREASURE_MAPS.md`.
- `createTreasureMap({islandId, fake})` item — from combat loot or bought at market. Stored in barrel/inventory.
- Using a map at the `MAP_TABLE` (it already exists as a tile + Navigate action) — add a "Use Map" action → reveals island name + adds a treasure marker to that island (world-map overlay overlay; `Island.treasureMarker?` or a `world` set). Some maps fake (no treasure / trap).
- **Shore expeditions**: when docked at the treasure island, send a crew party ashore (`SendExpedition` command / harbor button). They get `ashore` status and vanish for 2–4 in-game hours (timed `world.expedition`), then return with an outcome (weighted by crew stats + roll): treasure (gold/gems/artifact), nothing (bad map), trouble (a crew `injured`), or a new crew member / animal (rescued castaway — use recruit template). 
- Treasure item types: `createGem` (sell high), `createArtifact` (lore), `createCursedItem` (`cursed` status: lower morale, can't drop), gold coins → `world.gold`. Legendary named cutlass optional.
- World-map treasure marker overlay (render/map.ts).

## FEATURE 9 — Monkey Mischief  (independent — needs fleshing out)
Spec: `features/planned/2026-03-10_MONKEY_MISCHIEF.md` (stub). Flesh out:
- Monkeys (actorType 'monkey') periodically commit mischief when idle: steal an item from a barrel (or from a crew member's inventory if adjacent) and carry it (status `thief {item}`), then stash it somewhere random (another barrel / a deck tile) some time later. Crew may be annoyed (small morale dip / speech bubble "Where's me grog?!"). 
- Keep it light and comedic, emergent, low-stakes. Implement in `updateIdleAnimal()` in `crew/update.ts` gated to monkeys. Use thought/speech bubbles. Log mischief to activity log.
- Optional: monkeys steal shiny treasure (gems) preferentially. Don't let mischief soft-lock anything important.

---

## IMPLEMENTATION ORDER (sequential — shared files)
Batch A (independent): Drunk Fighting → Fishing → Baby Animals → Monkey Mischief.
Batch B (foundation): Ship-to-Ship Combat (builds SHARED A).
Batch C (on foundation): Storms (adds SHARED C) → Sea Monsters.
Batch D (harbor chain): Harbor remainder (builds SHARED B) → Treasure Maps.
Each agent runs `npx tsc --noEmit` and fixes its own type errors before returning.
