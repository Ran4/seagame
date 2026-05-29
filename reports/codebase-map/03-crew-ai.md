# Codebase Map 03 — Crew/Actor AI (`src/crew/`)

Reference for extending the actor AI: needs, the `updateActors()` state machine, the
status/conditions system, autonomous idle behavior, and the command system.

**Source of truth files** (read these, not this doc, if unsure):
- `src/crew/update.ts` (~1376 lines) — the big one: `updateActors()`, `refreshConditions()`, `updateIdleHuman()`, `updateIdleAnimal()`, `updateIdleNPC()`.
- `src/crew/commands.ts` — `tryExecuteCommand()`, `issueCommand()`. All commanded behavior lives here.
- `src/crew/movement.ts` — `updateWalking()`, `orderCrewTo/AdjacentTile/BesideTile`, `performTakeItem()`.
- `src/crew/index.ts` — public re-exports (`refreshConditions`, `updateActors`, `issueCommand`, `createActors`, `orderCrewTo*`, `killActor`, `checkDeath`, `DRINK_DURATION`).
- `src/types.ts` — `CrewState` enum (L133), `STATE_NAMES` (L156), `Command` union (L364), `Actor` (L248), `ActorProfile` (L229), `ThoughtBubble` (L357), `TILE_ACTIONS` (L214), `ActorType` (L227), key constants (L1–L60).

`index.ts` is the only file `game.ts` imports from (`import { ... } from './crew'`). Add new public API by re-exporting through `index.ts`.

---

## 1. Entry point & call site

`game.ts:749` calls, once per frame:
```ts
updateActors(world.actors, world.decks, dt, world.barrelInventory, world.time,
  world.lanternOil, brightness, world.activityLog, world.worldMap,
  world.spottedIslands, world, audio);
```
- `dt` is in **seconds**. All rates below are per-second. Time scale: 1 in-game day = 720 IRL seconds (`SECONDS_PER_DAY`, `worldmap.ts`).
- `brightness` is a 0..1 day/night value; thresholds `< 0.5` (dark), `< 0.7` (dim), `> 0.9` (bright) gate behavior.
- `updateActors` loops `crew` **backwards** (`for (ci = crew.length-1; ci >= 0; ci--)`) so `checkDeath()` can splice the current actor without breaking iteration. Keep this invariant if you add removals.

`Actor` is the unified entity type for `actorType: 'human' | 'dog' | 'parrot' | 'monkey' | 'cat'` (`types.ts:227`). NPCs are humans carrying the `'npc'` status.

---

## 2. Per-actor tick order (inside `updateActors`, `update.ts:209`–`753`)

For each actor, every frame:
1. `isNPC = member.statuses.has('npc')`.
2. **If not NPC**: decay needs + morale + drunkenness + lust + starvation (section 3).
3. `refreshConditions(member, crew)` — always runs, even for NPCs (section 4).
4. **If not NPC** and `world`: `checkDeath(world, member)` — if it returns true, `continue` (actor removed).
5. `tickConversationCooldown(member, dt)`.
6. Tick down `thoughtBubble` (clears when `thoughtBubbleTimer <= 0`).
7. Tick down `speechBubbleText` **only if `state !== TALKING`** (TALKING bubbles are owned by `updateTalking()`).
8. `switch (member.state)` — the state machine (section 5).

After the per-actor loop (`update.ts:756`+):
- **Tavern brawl**: when `world.docking.phase === 'docked'`, ~`0.001*dt` chance to find two drunk idle humans off-ship within 3 tiles → mutual damage, friendship −20, morale +15, speech bubbles, `audio.play('tavern_brawl')`.
- **Mutiny detection** (`update.ts:801`): counts humans with the `'mutinous'` condition. If `>= ceil(humans*0.6)` → `world.mutinyState='ultimatum'`, `mutinyTimer=720`. Times out to `'game_over'` or recovers to `'none'`.

---

## 3. Needs decay & morale (NPCs are exempt)

Rates (constants at top of `update.ts`):
| Need | Rate | Notes |
|------|------|-------|
| hunger | `HUNGER_RATE = 0.7`/s | `profile.hunger -= 0.7*dt`, floored at 0 |
| energy | `ENERGY_RATE = 0.4`/s | passive drain; restored by SLEEPING at `ENERGY_RESTORE_RATE = 255/240` (~240s full) |
| morale | `MORALE_RATE = 0.3`/s | drifts toward a computed target |
| drunkenness | `DRUNKEDNESS_RATE = 255/720`/s | decays the `'drunkedness'` status, deletes at 0 |
| lust (M) | `LUST_RATE_MALE = 0.15`/s | grows to 255 |
| lust (F) | `LUST_RATE_FEMALE = 0.05`/s | 6-day cycle (`LUST_CYCLE_LENGTH = 6*720`): first half grows, second half decays via `cycleTimer` |

**Morale target** (`update.ts:249`): `target = clamp((hunger + energy + avgFriendship)/3 + dogMoraleAdj + injuryPenalty + harborBonus, 0, 255)`.
- `avgFriendship` = mean of `relations[].friendship` (default 128 if none).
- `dogMoraleAdj` (`getDogMoraleAdj`, `update.ts:48`): `+DOG_MORALE_BONUS (15)` if a friendly dog (friendship ≥128) is on same deck; `−15` if a `doghater` has an unfriendly dog within `DOGHATER_PROXIMITY (5)` tiles.
- `injuryPenalty = -40` when `injured`.
- `harborBonus = +20` when `world.docking.phase === 'docked'`.
- Morale steps toward target by `MORALE_RATE*dt` (snaps if within one step).

**Morale modifiers applied separately:**
- **Night fear** (`update.ts:272`): if `brightness < 0.5` AND `morale < NIGHT_FEAR_MORALE_THRESHOLD (192)` AND not within `LANTERN_SAFE_RADIUS (5, Manhattan)` of a lit lantern on the same deck → `morale -= NIGHT_FEAR_RATE (1.0)*dt`. Lantern keys are `"${deck}-${lx}-${ly}"` in `lanternOil` (value = oil amount, >0 = lit).
- **Starvation** (`update.ts:295`): if `starving`, `health -= (maxHealth/400)*dt`; logs once when health first drops from full; ~1/120s emits a random complaint speech bubble.

To add a new morale source, add a term to the `target` expression (drift-based, smooth) or a direct `morale +=/-= ...*dt` block (immediate, like night fear).

---

## 4. Status / Conditions system — `refreshConditions()` (`update.ts:98`–`143`)

Two layers on every `Actor`:
- **`statuses: Map<string, payload|null>`** — raw persisted state. **Write here.** Permanent traits use `null` payload (`statuses.set('dickless', null)`); tracked values use an object (`statuses.set('drunkedness', { amount })`).
- **`conditions: Set<string>`** — rebuilt from scratch **every tick**. **Read here** for all behavior checks. Never write `conditions` directly (it's cleared each tick).

`refreshConditions()` does: `conditions.clear()` → copy every `statuses` key in → add derived conditions:

| Derived condition | Rule |
|-------------------|------|
| `drunk` | `drunkedness.amount >= 128` |
| `tipsy` | `>= 64` (else, exclusive with `drunk`) |
| `lustful` | `lust.amount > 160` |
| `exhausted` | `energy < 25` (sleeps even in daytime) |
| `tired` | `energy < 60` (exclusive with `exhausted`) |
| `starving` | `hunger < 15` |
| `hungry` | `hunger < 70` (exclusive with `starving`) |
| `injured` | `health < 32` (−40 morale, ×0.75 walk speed) |
| `happy` | `morale >= 192` |
| `content` | `morale >= 128` |
| `grumbling` | `morale < 96` |
| `miserable` | `morale < 64` |
| `mutinous` | `morale < 32` (feeds mutiny detection) |
| `near_friendly_dog` | human with friendly dog on deck |
| `despises_nearby_dog` | `doghater` + unfriendly dog within 5 tiles |

**Status keys used anywhere in the codebase** (the full set you may set/test): `'npc'` (payload `{ role, homeX, homeY }`), `'drunkedness'` (`{ amount }`), `'lust'` (`{ amount, cycleTimer? }`), `'dickless'` (trait, null), `'climber'` (trait — required to reach deck 0 crow's nest, see `canAccessDeck`), `'flyer'` (trait — uses `findPathFlying`; parrots), `'doghater'` (trait), `'eagle_eye'` (trait — lookout spot distance 5 vs 3). Derived-only condition strings (not statuses): all of the table above.

**Recipe to add a new status/condition:**
1. To set raw state: `member.statuses.set('seasick', { amount: 100 })` (or `null` for a trait).
2. To make it a derived condition, add a branch in `refreshConditions()` (e.g. `if (seasick.amount > 50) conditions.add('seasick')`). If it's a plain trait set in `statuses`, it auto-copies into `conditions` — no edit needed.
3. Read it in behavior code via `member.conditions.has('seasick')`.
4. If it needs to decay, add a decay block in the `if (!isNPC) { ... }` section of `updateActors` (mirror the `'drunkedness'` block, `update.ts:219`).

---

## 5. `updateActors` state machine — every `CrewState` case

`CrewState` enum + `STATE_NAMES` display strings live in `types.ts:133` / `:156`. Each timed state ticks `stateTimer -= dt` and falls back to `IDLE` with `idleTimer = 1 + Math.random()*2`. Skill gains use `member.skills.<x>` (humans only, gated by `actorType === 'human'`), capped at 255; `SKILL_MASTERY = 192` unlocks bonuses.

| Case | Behavior summary |
|------|------------------|
| `IDLE` | → `updateIdle()` (section 6). |
| `WALKING` | → `updateWalking()` in `movement.ts`. On path empty, transitions to `targetState` and sets its duration timer (see section 7). |
| `EATING` | timer (8s, set in movement). On finish: cooking skill +4; `hunger += hungerRestore` (270 if cooking ≥ mastery, else 180); logs "finished eating". |
| `SLEEPING` | no timer — `energy += ENERGY_RESTORE_RATE*dt`; wakes at energy 255. |
| `STEERING` | sailing skill +0.05*dt; timer `STEER_DURATION = 999999` (effectively until stopped). |
| `MANNING_CANNON` | gunnery +0.2*dt; timer `CANNON_DURATION = 15` (halved if mastery). |
| `NAVIGATING` | navigation +0.05*dt; timer 999999. |
| `LOOKOUT` | timer `LOOKOUT_DURATION = 30`; ticks own speech bubble; calls `checkForIslandSpotting()` → "Land ho!", +30 morale to all crew (`eagle_eye` extends spot distance to 5). |
| `LIGHTING_LANTERN` / `EXTINGUISHING_LANTERN` | timer (`LIGHT_LANTERN_DURATION = 3` / `EXTINGUISH = 0.5`). On finish: finds adjacent `LANTERN` tile, sets `lanternOil["deck-x-y"]` to 100 or 0. |
| `KISSING` | timer 3s; pulls partner into KISSING, slow lean-in. On finish: if mutual attraction ≥64 → +32 attraction + `heart` bubble; else −32 attraction/friendship + `broken_heart`. Both gain +20 lust. |
| `COPULATING` | timer 15s; `energy -= 4.0*dt`. Male+barrel → produce `Semen` into `barrelInventory`. Both lust −128. `heart` bubble. |
| `DRINKING` | timer `DRINK_DURATION = 5`; consumes `consumingItem`. Grog ration → +140 drunkenness, +20 morale; any item → `hunger += hungerRestore`. |
| `TALKING` | → `updateTalking()` in `conversation.ts` (owns its speech bubbles). |
| `PETTING` | timer 3s; +`PET_FRIENDSHIP_GAIN (2)` both ways; pet gets `heart`; cat → `audio.play('cat_meow')`. |
| `DANCING` | timer `DANCE_DURATION = 15`; dancing skill +0.3*dt; `energy -= 3.0*dt`; procedural move animation (spin/moonwalk/step; drunk = sloppier). On finish: morale +8 (×2 if mastery), lust +10, nearby watchers +attraction, group members +friendship/+attraction; initiator sets `world.danceCooldown`. |
| `SINGING` | timer = `audio.shantyDuration` (default 30); singing skill +0.3*dt. On finish: morale +`SHANTY_MORALE_GAIN (10)`; co-singers (same `shantyInitiatorId`) +friendship; initiator sets `world.shantyCooldown` and `audio.stopShanty()`. |
| `CARRYING_CORPSE` | timer 2s pickup. On finish: removes corpse from `world.corpses`, paths to `findNearestHullAdjacentTile()`, sets `targetState = BURYING_AT_SEA`. If unreachable, `dropCorpse()` re-adds corpse and goes IDLE. |
| `BURYING_AT_SEA` | timer 3s; logs "buried a crewmate at sea"; clears `carryingCorpseId`. |

**Grouped activities** (`shantyInitiatorId`): singers/dancers share the initiator's id so end-of-activity loops can find the group. Cleared to `null` on finish or `Stop`.

**Adding a new state to the switch**: add the enum + `STATE_NAMES` entry in `types.ts`, then a `case` here. If it's reached via WALKING (pathfind-then-act), also add a branch in `updateWalking()` to set its `stateTimer` (section 7).

---

## 6. Autonomous idle — `updateIdle()` and the decision trees

`updateIdle()` (`update.ts:845`) is the dispatcher:
1. If `copulationTarget` is set → `return` (waiting for partner, don't wander).
2. `idleTimer -= dt`; if `> 0` → `return` (still cooling down).
3. **`tryExecuteCommand(...)`** — if it returns true, `return` (queued command took over). **This is why commands always win over autonomous behavior.**
4. NPC (`statuses.has('npc')`) → `updateIdleNPC()`.
5. `actorType === 'human'` → `updateIdleHuman()`; else → `updateIdleAnimal()`.

### The universal idle pattern (the template for new behaviors)
```ts
if (member.conditions.has('<trigger>')) {            // 1. check condition
  const targets = findTilesOfType(decks, TileType.X); // 2. find candidate tiles
  const target = pickRandom(targets);
  if (target) {
    const path = findPath(decks, from, target, world?.gangplanks); // 3. pathfind
    if (path) {
      member.path = path;
      member.state = CrewState.WALKING;
      member.targetState = CrewState.<DOING_IT>;       // 4. set state on arrival
      return;
    }
  }
}
```
`from = currentTile(member)`. Helpers in `update.ts`: `findTilesOfType(decks, type)`, `getWalkableTiles(deck, idx)`, `pickRandom(arr)`, `wanderRandomly(member, decks)`, `isOnShipCheck(x, y)` (true if tile is on the ship rect, used to prefer harbor vs ship tiles when docked).

### `updateIdleHuman()` decision tree (`update.ts:873`) — first match wins, ordered:
1. **Hungry/starving** → walk to `STOVE` → `EATING`. When docked, 60% prefer off-ship (tavern) stoves.
2. **Lustful** (and `lustSeekCooldown <= 0`) → `trySeekLustPartner()` (`lust.ts`).
3. **Tired/exhausted** AND (`brightness < 0.7` OR exhausted) → walk to `BED` → `SLEEPING`. Daytime gate: won't nap in bright light unless `exhausted`. Docked: 60% prefer off-ship (inn) beds.
4. **`brightness < 0.7`**: light an unlit `LANTERN` (skips lanterns another crew is already walking to) → `LIGHTING_LANTERN`.
5. **`brightness > 0.9`**: extinguish a lit lantern → `EXTINGUISHING_LANTERN`.
6. **0.4% chance**: auto-drink a `Grog ration` from inventory → `DRINKING` (no pathing).
7. **Docked, 5% chance**: take grog from an off-ship harbor barrel (`orderCrewBesideTile(..., TAKING_ITEM)`).
8. **`tryStartConversation()`** (`conversation.ts`).
9. **Shanty** (`update.ts:1001`): `brightness < 0.5`, `world.shantyCooldown <= 0`, `conversationCooldown <= 0`, `Math.random() < SHANTY_CHANCE (0.004)`, avg human morale ≥ `SHANTY_MORALE_THRESHOLD (160)`, ≥3 eligible idle humans on deck → all → `SINGING`.
10. **Dance** (`update.ts:1039`): `brightness > 0.7`, `world.danceCooldown <= 0`, morale ≥ `DANCE_MORALE_THRESHOLD (140)` (lowered for drunk/tipsy), ≥2 dancers → `DANCING`. Drunk/tipsy raise the chance (×3/×2).
11. **Docked, 30% chance**: wander to a `HARBOR_FLOOR` tile (explore town).
12. **Fallback**: `wanderRandomly()`.

### `updateIdleAnimal()` decision tree (`update.ts:1086`) — restricted set:
1. **Hungry/starving** → `STOVE` → `EATING` (no docking logic).
2. **Lustful** AND `LUST_ACTOR_TYPES` (`'human','dog','monkey'`, `factory.ts:29`) → `trySeekLustPartner()`.
3. **Tired/exhausted**: parrots → fly (`findPathFlying`) to `NEST`, else random floor within 8 tiles, else sleep-in-place. Other animals → nearby `BED` (path ≤8) on same deck, else **sleep in place** (`state = SLEEPING` with no walk).
4. **Dog only** → `tryFollowLikedEntity()` (follows best friend, friendship ≥100, only if >2.5 tiles away on same deck; crosses decks via `canAccessDeck`).
5. **5% chance** → `tryStartConversation()`.
6. **Fallback** → `wanderRandomly()`.

`wanderRandomly()` (`update.ts:1211`) picks a random walkable tile across accessible decks (`canAccessDeck` excludes deck 0 without `'climber'`); flyers use `findPathFlying`.

### `updateIdleNPC()` (`update.ts:1249`): conversations, greets nearby walking crew (`NPC_GREETINGS` by role), ambient flavor lines (`NPC_AMBIENT_LINES`), wanders within a radius of `homeX/homeY` (10 tiles for `townsfolk`/`cat`, 4 for shopkeepers).

---

## 7. `updateWalking()` & the pathfind-then-act bridge (`movement.ts:57`)

When `path` empties, the actor transitions `state = targetState` and `updateWalking` sets the **arrival timer/setup** per state (the big `if/else` at `movement.ts:58`–105):
`EATING→8s`, `SLEEPING→no timer`, `STEERING→999999`, `MANNING_CANNON→15 (½ if mastery)`, `LOOKOUT→30`, `NAVIGATING→999999`, `COPULATING→15`, `KISSING→3`, `LIGHTING_LANTERN→3`, `EXTINGUISHING_LANTERN→0.5`, `TALKING→beginConversation()`, `TAKING_ITEM→performTakeItem() then IDLE`, `PETTING→3`, `CARRYING_CORPSE→2`, `BURYING_AT_SEA→3`, default → `idleTimer = 2 + rand*4`.

**Gotcha:** if you add a state reached via WALKING but forget to add its `else if` branch here, it falls into the `default` and immediately becomes idle with no timer set — the action silently never happens.

Movement details: `CREW_SPEED = 64 px/s`, ×0.75 if `injured`; facing derived from dominant axis; drunk/tipsy crew get perpendicular "wobble" detours; walking crew may `tryStartConversationWhileWalking()`.

`performTakeItem()` (`movement.ts:22`) moves one unit (stackable) or the whole item from `barrelInventory[barrelKey]` into `profile.inventory`, deleting empty barrels. Driven by `member.takeTarget = { barrelKey, itemName }`.

**Movement helpers** (re-exported via `index.ts`): `orderCrewTo(member, target, decks, targetState, gangplanks?)` (direct path), `orderCrewToAdjacentTile(...)` (direct, else 4-neighbor), `orderCrewBesideTile(...)` (prefers nearest neighbor, falls back to the tile itself). All return `boolean` (false = unreachable) and respect `'flyer'` (use `findPathFlying`).

---

## 8. `WORK_ACTOR_TYPES` & human-only gating

`const WORK_ACTOR_TYPES: Set<ActorType> = new Set(['human'])` (`update.ts:65`). **Note:** it is *defined* but the actual gating in this file is done inline via `member.actorType === 'human'` (skill gains, `getDogMoraleAdj`, idle dispatch) — `WORK_ACTOR_TYPES` is the documented intent per `CLAUDE.md` ("Gate human-only behaviors with `WORK_ACTOR_TYPES.has(member.actorType)`"). For new human-only work, prefer `WORK_ACTOR_TYPES.has(member.actorType)`.

Other gating sets: `LUST_ACTOR_TYPES` (`factory.ts:29`, `{human,dog,monkey}`); deck access via `canAccessDeck` (`update.ts:186`, deck 0 needs `'climber'`); flying via `'flyer'` condition.

Commands: `tryExecuteCommand` does **not** itself gate on actorType — animals receive commands via order files. Per `CLAUDE.md`, the menu only offers human commands; animal-incompatible commands simply won't be issued through the UI.

---

## 9. Eating, sleeping, beds, stoves (concrete)

- **Eat**: pathfind to a `TileType.STOVE` tile, `targetState = EATING`. Arrival timer = `EAT_DURATION (8s)`. On finish: cooking +4, `hunger += 270` (cooking ≥ mastery) or `180`. There is **no consumed item for autonomous eating** — the stove is treated as an infinite food source; hunger is just restored.
- **Drink** (the item path): `DRINKING` consumes `member.consumingItem`. Grog ration → drunkenness/morale; `hungerRestore > 0` → hunger. Item factories in `items.ts` (`createGrogRation`, `createSemen`, ...).
- **Sleep**: pathfind to a `TileType.BED` tile, `targetState = SLEEPING`. No fixed timer; `energy += ENERGY_RESTORE_RATE (255/240)*dt` until 255 (~240s / 8 in-game hours), then wakes. Animals can sleep in place (no bed); parrots use `NEST`.

`hungerRestore` is a field on `Item` (`types.ts:342`).

---

## 10. Speech bubbles & thought bubbles

`Actor` fields (`types.ts`): `thoughtBubble: ThoughtBubble|null` + `thoughtBubbleTimer`; `speechBubbleText: string|null` + `speechBubbleTimer`.
- `ThoughtBubble = 'heart' | 'broken_heart' | 'music_note'` (`types.ts:357`).
- **Set** a thought bubble: `member.thoughtBubble = 'heart'; member.thoughtBubbleTimer = 3;` (seconds).
- **Set** a speech bubble: `member.speechBubbleText = 'Land ho!'; member.speechBubbleTimer = 6;`.
- **Tick-down**: both decay in `updateActors` (sections 2.6/2.7). Speech bubbles only tick when `state !== TALKING`; some states (`LOOKOUT`) tick their own bubble manually. TALKING bubbles are managed by `conversation.ts`.
- **Render** (`render/actors.ts:111`): speech bubble takes priority over thought bubble. Thought bubble draws the sprite from `rc.sprites.bubbles.get(type)`, with a colored-glyph fallback (`♥` / `♪` / `💔`).

**Adding a new thought bubble** (see `.claude/rules/adding_new_thought_bubbles.md`): extend the `ThoughtBubble` union (`types.ts`), add sprite prompt in `generate-sprites.mjs` (`bubble_<type>`), add the name to `bubbleNames` in `sprites.ts:86`, regenerate, set the field where needed, and add a fallback case in `render/actors.ts`.

---

## 11. The command system — `tryExecuteCommand` & `issueCommand` (`commands.ts`)

- Each actor has `commandQueue: Command[]`. `Command` is a discriminated union on `name` (`types.ts:364`).
- **`issueCommand(actor, command, allActors)`** (`commands.ts:390`, called from `menu.ts`/UI in `game.ts:577/603`): cleans up current activity (stops conversation, frees partner), **clears the queue**, pushes the one command, sets `state = IDLE`, `idleTimer = 0` so it fires next tick. Use this for UI/immediate orders.
- Order files (`orders/orders_for_*.jsonl`, polled by a Vite plugin) push onto `commandQueue` and let the chain run (multiple commands queued).
- **`tryExecuteCommand(member, decks, crew, activityLog, gameTime, world?, audio?)`** (`commands.ts:36`): called from `updateIdle` step 3. Reads `commandQueue[0]`, **shifts it off**, switches on `cmd.name`. Returns `true` if it handled a command (caller returns early). Most cases pathfind via `orderCrew*` then set a `targetState`.

**Behaviors of note:**
- **Refusal**: if `morale < 64` and `cmd.name !== 'Stop'`, 50% chance to refuse — clears the whole queue, logs, returns true.
- `fail(reason)` logs and **drops the entire chain** (`commandQueue.length = 0`).
- Commands map 1:1 from menu via `menuItemToCommand()` (`menu.ts:422`): `CrewState` targetState → `Command.name` (e.g. `EATING → Eat`, `SLEEPING → Sleep`, actor-target `KISSING → Kiss`). `TILE_ACTIONS` (`types.ts:214`) defines which menu items appear per tile type.
- Meta-commands: `Order` (delegate a command to another actor, with friendship compliance check), `Tell` (cosmetic speech bubble), `Stop` (cancel everything, free partner, drop carried corpse), `SetHealth` (debug).

---

## 12. RECIPE — add a NEW autonomous idle behavior

Example goal: "When idle and near water-adjacent tiles, crew sometimes go fishing."

1. **(If a new state is needed)** Add `FISHING` to `CrewState` (`types.ts:133`) and `STATE_NAMES` (`types.ts:156`).
2. **Handle the state** in the `switch` in `updateActors` (`update.ts:339`): add `case CrewState.FISHING:` — tick `stateTimer -= dt`, on finish grant reward (e.g. add a Fish item, morale), then `state = IDLE; idleTimer = 1 + Math.random()*2;`.
3. **Set the arrival timer** in `updateWalking()` (`movement.ts:58`): add `else if (member.state === CrewState.FISHING) { member.stateTimer = 30; }` — **required** if reached via WALKING, or it falls into `default`.
4. **Add the idle trigger** in `updateIdleHuman()` (`update.ts:873`), using the template in section 6: choose a position in the priority order (before `wanderRandomly`), find target tiles (e.g. via `findTilesOfType` or `findNearestHullAdjacentTile`), `findPath`, set `path/state=WALKING/targetState=FISHING`, `return`.
5. **(Optional)** Gate to humans with `WORK_ACTOR_TYPES.has(member.actorType)`, add a `thoughtBubble`, or use a `condition` as the trigger.
6. **(Optional)** Add it as a tile action in `TILE_ACTIONS` so it's also commandable (then it becomes a *commanded* behavior too — see next recipe).

Gotchas: behaviors are first-match-wins (earlier = higher priority); commands always preempt (the `tryExecuteCommand` early return). Always `return` after assigning a path, or later branches will overwrite it. Respect `brightness`/`docked` gates if relevant.

## 13. RECIPE — add a NEW commanded behavior

Example: a "Fish" command targeting a tile.

1. **Add to the `Command` union** (`types.ts:364`): `| { name: 'Fish'; deck?: number; x?: number; y?: number }`.
2. **Handle it** in `tryExecuteCommand()` `switch` (`commands.ts:84`): resolve target (`findTileOrRandom(decks, TileType.X, cmd)` or fixed coords), call `orderCrewToAdjacentTile(member, target, decks, CrewState.FISHING)`; on failure `fail('reason')`; on success `log('going to fish')`; `return true`.
3. **(State + timer + reward)**: same as steps 1–3 of recipe 12 (enum, switch case, `updateWalking` timer).
4. **Expose in the menu** (optional): add a `ContextMenuItem` to the relevant tile in `TILE_ACTIONS` (`types.ts:214`) with `targetState: CrewState.FISHING`, then map it in `menuItemToCommand()` (`menu.ts:481` tile switch) to `return { name: 'Fish', deck: targetDeck, x: tileX, y: tileY }`.
5. **Order-file usage**: the command is automatically usable in `orders/orders_for_*.jsonl` (JSON matching the union) and may also be parsed by `command-shorthand.ts` if you add a shorthand mapping.

Gotchas: `tryExecuteCommand` shifts the command off **before** the switch (so `fail` must clear remaining chain explicitly, which it does). `issueCommand` clears the queue; order files append. Low-morale (<64) refusal applies to all non-`Stop` commands. If the actor is mid-conversation/copulation, `issueCommand` cleans up automatically but raw `commandQueue.push` does not.
