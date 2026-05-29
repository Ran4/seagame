# Codebase Map 04 — Crew Social Systems

Reference for engineers/agents extending the **actor spawning, lust/copulation, death/corpse, movement, and conversation** systems.

Files covered (all read fully):
- `src/crew/factory.ts` — `createActors()` (initial spawn)
- `src/crew/lust.ts` — autonomous attraction/copulation seeking
- `src/crew/death.ts` — `killActor()` / `checkDeath()`
- `src/crew/movement.ts` — `orderCrewTo*` helpers + `updateWalking()` arrival dispatch
- `src/conversation.ts` — snippet/script system, proximity trigger, NPC scripts

Cross-referenced (not the focus, but load-bearing): `src/types.ts` (Actor/Corpse/ActorRelation/CrewState), `src/crew/update.ts` (state machine, COPULATING completion, corpse carrying), `src/harbor.ts` (runtime NPC/cat spawning, the canonical "add an actor at runtime" pattern), `src/crew/commands.ts` (BuryAtSea/Copulate command path).

---

## 1. Actor data model (read this first)

`Actor` is defined at `src/types.ts:248-284`. Key fields for social systems:

- `id: number` — unique within `world.actors`. **There is no global counter.** IDs are dense (0..N-1) only at initial spawn; runtime spawns use `max(existing id)+1`.
- `actorType: ActorType` — `'human' | 'dog' | 'parrot' | 'monkey' | 'cat'` (`src/types.ts:227`). `'cat'` is harbor-only (added in `harbor.ts`, not in `factory.ts`).
- `profile: ActorProfile` (`src/types.ts:229-240`) — `name, sex, color, spriteIndex, numberOfHands, hunger, energy, morale (all 0-255), inventory: Item[], hands: Item[]`.
- `health` / `maxHealth` — 0-100 for humans, 50 for animals, 30 for cats. **Note:** the type comment says "0-255" but factory uses 100/50.
- `statuses: Map<string, Record<string,any>|null>` — raw traits/values. **Writes go here.** Null payload = flag trait; object payload = tracked value.
- `conditions: Set<string>` — derived, **rebuilt every tick** by `refreshConditions()` in `crew/update.ts`. **Reads go here** for behaviour. Never write to `conditions` directly — it will be clobbered next tick.
- `relations: ActorRelation[]` — one entry per *other* actor. `ActorRelation = { actorId, friendship (0-255), attraction (0-255) }` (`src/types.ts:242-246`). `friendship >= 128` = friend, `< 64` = dislike; `attraction >= 128` on both sides = willing to copulate.
- `copulationTarget: CopulationTarget | null` — `{ type: 'crew', actorId }` or `{ type: 'barrel', deck, x, y }`. Also reused as a generic "interaction target" pointer for player-ordered KISSING/TALKING (see movement arrival dispatch).
- conversation fields: `conversationPartnerId, conversationExchangesLeft, conversationPositive, conversationScript, conversationCooldown, conversationMyTurn, speechBubbleText, speechBubbleTimer`.
- `carryingCorpseId: number | null` — corpse being carried for burial.

When you add a new `Actor` you **must** populate every field — TS will error otherwise. Copy an existing factory verbatim (see §2 recipe).

---

## 2. Spawning actors

### 2.1 Initial spawn — `createActors(humanCount, decks)` (`factory.ts:100-194`)

Returns `Actor[]`. Steps, in order:

1. **Humans** (`factory.ts:105-109`): loops `humanCount`. Name = `PIRATE_NAMES[i % 8]` (`factory.ts:16-19`: Anne, Jack, Mary, Flint, Morgan, Pete, Jane, Bones — cycles/repeats if `humanCount > 8`). Sex from `PIRATE_SEXES` lookup (`factory.ts:23-26`), else 50/50. Color = `CREW_COLORS[i % 6]` (`factory.ts:21`). `spriteIndex = i`. ID = `nextId++` starting at 0.
2. **Animals** (`factory.ts:111-124`): fixed roster — 2 dogs (1M/1F), 1 parrot (random sex), 1 monkey (random sex). Names pulled per-type from `ANIMAL_NAMES` (`factory.ts:4-8`) using a per-type index counter. Color from `ANIMAL_COLORS` (`factory.ts:10-14`). `spriteIndex = nextId-1` (i.e. its own id).
3. **Climber/flyer statuses** (`factory.ts:126-134`): everyone except dogs gets `statuses.set('climber', { skill: 128 })`; parrots also get `'flyer'` (null payload → enables `findPathFlying`).
4. **doghater** (`factory.ts:136-141`): ~1% of humans get `'doghater'`.
5. **Lust init** (`factory.ts:143-151`): only for `LUST_ACTOR_TYPES` = `{human, dog, monkey}` (`factory.ts:29`). Males: `{ amount: 0-128 }`. Females: `{ amount: 64-128, cycleTimer: random within LUST_CYCLE_LENGTH }` where `LUST_CYCLE_LENGTH = 6*720 = 4320s` (`factory.ts:31`). Parrots and cats have **no** lust.
6. **Relations (bidirectional, all-pairs)** (`factory.ts:153-165`): for every ordered pair `(member, other)` with `other.id !== member.id`, pushes one relation onto `member`. friendship = `64 + rand(0..128)` → 64-192. attraction = `rand(0..160)` if same species, else `0`. **Each direction is rolled independently** — relations are NOT symmetric in value (only in existence).
7. **Skills (humans only)** (`factory.ts:167-179`): `SKILL_NAMES = sailing, gunnery, combat, cooking, navigation, singing, dancing`, each `10-60`. Trait rolls: `eagle_eye` 12%, `iron_stomach` 10%, `sea_legs` 10%, `berserker` 8%.
8. **Hardcoded starting gear** (`factory.ts:181-191`): Jack gets a cutlass in hands; Mary gets 2 grog rations + 1 semen in inventory.

`createActor(...)` (`factory.ts:45-98`) is the per-actor constructor: picks a random spawn deck (`1 + floor(rand * min(2, decks.length-1))`), a random WALKABLE tile on that deck (`getWalkableTiles`, `factory.ts:33-43`), randomizes `numberOfHands` (humans: 0.1% → 0 hands, 0.5% → 1 hand, else 2; animals always 0), and initializes all fields. **It does NOT set statuses/relations/skills** — those are layered on afterward in `createActors`.

### 2.2 Runtime spawn — the canonical pattern (`harbor.ts`)

There is **no public "add actor at runtime" helper**. The pattern to copy lives in `harbor.ts`:

- **Unique ID**: `getNextActorId(world)` (`harbor.ts:419-425`) returns `max(actor.id for actor in world.actors) + 1`. Use this — do NOT reuse `factory`'s `nextId` (it's local and restarts at 0).
- **Constructor**: `createNPC(def, id)` (`harbor.ts:427-479`) and `createHarborCat(id)` (`harbor.ts:481+`) are full `Actor` literals — copy one of these as your template. NPCs additionally `statuses.set('npc', { role, homeX, homeY })` (`harbor.ts:477`).
- **Relations wiring** (`harbor.ts:549-561`): for each new actor, loop **all existing** `world.actors` and push **both directions**:
  ```ts
  newActor.relations.push({ actorId: existing.id, friendship: 128, attraction: 0 });
  existing.relations.push({ actorId: newActor.id, friendship: 128, attraction: 0 });
  ```
  Also wire new-to-new relations. Finally `world.actors.push(...newActors)`.

**INVARIANT (critical):** every actor must have a `relations` entry for every other actor it can interact with. `lust.ts`, `conversation.ts`, and friendship updates all do `relations.find(r => r.actorId === other.id)` and silently bail (or crash on `!`) if missing. `killActor` maintains this invariant on death by splicing out the dead id from all survivors (`death.ts:46-50`); `harbor.ts:213-221` rebuilds missing relations when restoring stranded actors. **If you spawn an actor and skip relations wiring, it will be antisocial and may cause null-deref via the `!` non-null assertions in `lust.ts:30-31`.**

### Recipe: spawn a NEW actor at runtime (recruit / newborn / castaway)

```ts
import { getNextActorId } from './harbor'; // or replicate it inline
const id = getNextActorId(world);
const actor: Actor = { /* full literal — copy createNPC/createActor and adjust */
  id, actorType: 'human', profile: {...}, health, maxHealth,
  carryingCorpseId: null, statuses: new Map(), conditions: new Set(), skills: {},
  pixelX, pixelY, facing: 'south', deck, state: CrewState.IDLE, targetState: CrewState.IDLE,
  path: [], stateTimer: 0, idleTimer: 1 + Math.random()*2, copulationTarget: null,
  relations: [], thoughtBubble: null, thoughtBubbleTimer: 0,
  conversationPartnerId: null, conversationExchangesLeft: 0, conversationPositive: true,
  conversationScript: [], conversationCooldown: 0, conversationMyTurn: false,
  speechBubbleText: null, speechBubbleTimer: 0, takeTarget: null, consumingItem: null,
  lustSeekCooldown: 0, commandQueue: [], shantyInitiatorId: null,
};
// statuses you likely want: climber (non-dogs), flyer (parrots), lust (human/dog/monkey)
if (actor.actorType !== 'dog') actor.statuses.set('climber', { skill: 128 });
if (LUST_ACTOR_TYPES.has(actor.actorType)) actor.statuses.set('lust', { amount: ... });
// relations — BOTH directions, for every existing actor:
for (const other of world.actors) {
  actor.relations.push({ actorId: other.id, friendship: 96, attraction: 0 });
  other.relations.push({ actorId: actor.id, friendship: 96, attraction: 0 });
}
world.actors.push(actor);
```
Gotchas: spawn tile must be WALKABLE for the chosen deck or pathfinding will never reach it. `spriteIndex` selects the sprite sheet frame; humans expect 0-3 typically (harbor uses `id % 4`). For a **newborn animal**, set `actorType` to the species, give it `lust` only if in `LUST_ACTOR_TYPES`, and skip skills (humans-only).

---

## 3. Lust / copulation — `lust.ts`

### 3.1 Autonomous seeking — `trySeekLustPartner(member, crew, decks)` (`lust.ts:7-104`)

Returns `true` if it initiated an interaction (kiss or copulate). Called from the idle/lust path in `crew/update.ts` (gated by `lustSeekCooldown` and the `'lustful'` condition).

1. **Partner search** (`lust.ts:9-28`): scans `crew` for best **same-deck, same-species** partner not already KISSING/COPULATING, scoring by `myRel.attraction + theirRel.attraction` (mutual). Skips anyone missing a relation entry. No partner → set `lustSeekCooldown` to 30-60s, return false.
2. **Threshold computation** (`lust.ts:33-46`): base `kissThreshold` = 64 (48 if either tipsy, 32 if either drunk); base `copThreshold` = 128 (80 if either drunk, 64 if both drunk). **Then both are halved** unconditionally at `lust.ts:45-46` (this is the "lustful" discount applied to a crew member already in the lust-seeking path). These mirror the player-menu thresholds in `menu.ts`.
3. **Interaction-type decision** (`lust.ts:49-58`):
   - COPULATING if **both** have `'lustful'` condition AND both `attraction >= copThreshold`.
   - else KISSING if `myRel.friendship >= kissThreshold || myRel.attraction >= kissThreshold`.
   - else bail (cooldown 30-60s).
4. **Partner interrupt** (`lust.ts:60-77`): if target was TALKING, tears down both sides of that conversation; sets target IDLE, clears path.
5. **Lock both** (`lust.ts:79-82`): sets `copulationTarget = { type:'crew', actorId }` on **both**; sets `partner.idleTimer = 999` to freeze the partner while the initiator walks over.
6. **Pathfind initiator** (`lust.ts:84-91`): KISSING → `orderCrewBesideTile(...)`; COPULATING → `orderCrewToAdjacentTile(...)`. The chosen `targetState` is carried so on arrival the state machine enters KISSING/COPULATING.
7. **Failure cleanup** (`lust.ts:93-100`): if pathfinding fails, clears both `copulationTarget`s, unfreezes partner, short 10s cooldown.

### 3.2 Copulation completion — the PREGNANCY HOOK POINT

`lust.ts` only *initiates*. The actual completion runs in the state machine: **`case CrewState.COPULATING:` in `crew/update.ts:498-551`.**

- On first frame, pulls the crew partner into COPULATING too (`update.ts:502-511`), syncing `stateTimer`.
- `stateTimer` counts down `COPULATE_DURATION = 15s` (set in `movement.ts:11`, applied on arrival at `movement.ts:72-73`).
- **On completion (`update.ts:512-550`):**
  - Male + barrel target → produces/stacks a `Semen` item in the barrel inventory (`update.ts:513-526`).
  - Both partners' `lust.amount -= 128` (clamped ≥0) (`update.ts:527-529`, `535-536`).
  - **`activityLog.push({ text: \`${member.profile.name} copulated with ${partner...}\`, ... })`** at `update.ts:541` — this is the single line that fires on a **successful crew-on-crew copulation**.
  - `thoughtBubble='heart'` for 3s; both return to IDLE.

**To add pregnancy:** hook at `update.ts:540-541` (the crew-crew branch, right where the activity log fires). At that point you have `member` and `partner` (look up via `crew.find(c => c.id === target.actorId)`). Determine M/F pair, roll conception, and either set a `pregnant` status on the female (`partner.statuses.set('pregnant', { fatherId, conceivedAt: gameTime })`) or schedule a newborn. Spawning the newborn later must follow the §2.2 runtime-spawn recipe (ID + bidirectional relations). Note the barrel branch (`update.ts:542-543`) is a separate, non-conception path.

### 3.3 Player-initiated copulation/kiss

Menu → `Command` (`menu.ts:438`, `commands.ts:144-150`) sets `copulationTarget` and pathfinds with `CrewState.COPULATING`. Same arrival/completion machinery as autonomous. Thresholds for whether the menu item is enabled live in `menu.ts:161-176`.

---

## 4. Death & corpses — `death.ts`

### `killActor(world, actor)` (`death.ts:4-53`)

1. Pushes a `Corpse` (`types.ts:286-297`) snapshotting position/sprite/color/sex and **transferring `actor.profile.inventory`** to the corpse (`death.ts:6-18`). The corpse keeps the dead actor's `actorId` as its key.
2. Deselects if currently selected (`death.ts:21-24`).
3. Ends any conversation via `stopConversation` (`death.ts:27-29`).
4. Frees a crew copulation partner (sets them IDLE, clears their `copulationTarget`) (`death.ts:32-40`).
5. **Removes the actor** from `world.actors` (`death.ts:43-44`).
6. **Relation cleanup invariant**: splices the dead `actor.id` out of every surviving actor's `relations` (`death.ts:46-50`). Mirror this if you ever remove an actor by any other path.
7. Logs `"{name} has died"` to `world.activityLog` (`death.ts:52`).

### `checkDeath(world, actor)` (`death.ts:55-61`)

Returns true and calls `killActor` if `actor.health <= 0`. Called per-tick from `crew/update.ts:317` (`if (!isNPC && world && checkDeath(world, member)) continue;`). **NPCs are exempt from death.** To kill an actor from anywhere else, set `actor.health = 0` (or call `killActor` directly). Both are re-exported from `src/crew/index.ts:5`.

### Corpse carrying & burial (lives in `crew/update.ts`, NOT death.ts)

- Trigger: `BuryAtSea` command (`commands.ts:297-309`) — sets `member.carryingCorpseId`, pathfinds to the corpse with target `CrewState.CARRYING_CORPSE`. Player path is via right-click corpse menu (`menu.ts:191`).
- **`CARRYING_CORPSE`** (`update.ts:715-742`): after a 2s pickup timer (`movement.ts:99`), removes the corpse from `world.corpses`, finds nearest hull-adjacent tile (`findNearestHullAdjacentTile`), and walks there with target `BURYING_AT_SEA`. If no reachable hull tile, `dropCorpse(member, world)` re-adds the corpse and goes idle.
- **`BURYING_AT_SEA`** (`update.ts:744-752`): 3s toss timer (`movement.ts:101`), logs `"{name} buried a crewmate at sea"`, clears `carryingCorpseId`.
- `dropCorpse(member, world)` (`update.ts:1358-1374`) and the `Stop` command (`commands.ts:336-352`) both re-materialize a carried corpse if it's not already in `world.corpses` (the Stop path uses an "Unknown" placeholder if data is lost).
- Corpses are persisted across docking: `harbor.ts` separates ship vs land corpses and stores land ones in `world.strandedCorpses` (island id → corpses), restored on return.

**There is no land burial / decay / corpse-spoilage system** — only sea burial. If you add decay, the corpse lacks a `createdAt`/`time` field; you'd extend the `Corpse` type (`types.ts:286-297`).

---

## 5. Movement helpers — `movement.ts`

All three return `boolean` (true = path found, member set to WALKING with the given `targetState`). They wrap `findPath`/`findPathFlying` (`pathfinding.ts`); flyers (parrots, `conditions.has('flyer')`) auto-use `findPathFlying`.

- **`orderCrewTo(member, target, decks, targetState=IDLE, gangplanks?)`** (`movement.ts:165-176`): direct A* from the member's current tile to `target`. Sets `member.path`, `state=WALKING`, `targetState`. Pass `gangplanks` (`world.gangplanks`) when crew may need to cross the dock connection.
- **`orderCrewToAdjacentTile(member, target, decks, targetState, gangplanks?)`** (`movement.ts:178-189`): tries `orderCrewTo(target)` first (works when target itself is WALKABLE — BED/STOVE/HELM). If that fails (non-walkable target like CANNON/BARREL), tries the 4 orthogonal neighbors in order N,S,W,E. **Use for "stand next to and use" targets** (eat, man cannon, copulate-at-barrel, pick up corpse).
- **`orderCrewBesideTile(member, target, decks, targetState, gangplanks?)`** (`movement.ts:191-206`): always targets a neighbor (4 orthogonals), **sorted by Manhattan distance to the member** so they approach from the nearest side. Falls back to standing ON the target tile. **Use for face-to-face interactions** (kissing, player-ordered conversation walk-up).

### Arrival dispatch — `updateWalking` (`movement.ts:57-163`)

When `member.path` empties, `member.state = member.targetState` and a big switch (`movement.ts:58-105`) sets the per-state timer and any setup. **This is where a new "walk somewhere then do X" behavior plugs in:** add a `case CrewState.YOUR_STATE:` that sets `member.stateTimer` (and any one-shot setup), then handle the countdown/completion in the matching `case` in `crew/update.ts`. Durations defined at top of `movement.ts:5-12` (EAT 8, STEER/NAVIGATE 999999, CANNON 15 (halved at gunnery mastery), LOOKOUT 30, COPULATE 15, KISS 3, PET 3). Note arrival for `CrewState.TALKING` (`movement.ts:80-91`) and `TAKING_ITEM` (`movement.ts:92-95`) reuse `copulationTarget`/`takeTarget` as the "what I walked here to do" pointer.

Other behaviors in `updateWalking`: facing-direction update, drunk/tipsy **wobble** (perpendicular detours, `movement.ts:134-151`), injured speed 0.75x (`movement.ts:153`), and wandering crew chatting via `tryStartConversationWhileWalking` (`movement.ts:160-162`).

---

## 6. Conversation system — `conversation.ts`

### 6.1 Data sources

- **Crew snippet scripts**: loaded async at module init from `public/CONVERSATION_SNIPPETS.json` into `CONVERSATION_SCRIPTS: Record<string, string[][]>` (`conversation.ts:36-41`). Keyed by `"{context}_{mood}"`. Each value is an array of scripts; each script is `string[]` of alternating lines.
  - Contexts (`ContextTag`, `conversation.ts:43`): `generic, work, night, hungry, tired, grumbling`.
  - Moods (`MoodTag`, `conversation.ts:44`): `friendly, unfriendly, tired, hungry, horny, drunken, grumbling, mutinous`.
- **Animal lines**: `ANIMAL_LINES` (`conversation.ts:29-34`), per-type barks for dog/parrot/monkey/cat.
- **NPC scripts**: `NPC_SCRIPTS` (`conversation.ts:95-150`), hardcoded per role: `bartender, innkeeper, merchant, townsfolk, blacksmith`. Each is a full 3-line script.

### 6.2 Script selection — `pickConversationScript(speaker, partner, brightness)` (`conversation.ts:152-201`)

Priority order:
1. **NPC** — if either participant has an `'npc'` status with a `role` in `NPC_SCRIPTS`, use a random role script. If the NPC is the *partner* (not speaker), the script's line order is swapped pairwise so the NPC speaks first (`conversation.ts:161-168`). Mood forced `'friendly'`.
2. **Animal** — if either participant is non-human, generate a short 2-3 line script alternating animal barks (`pickAnimalLine`) and canned human-to-animal phrases (`conversation.ts:172-189`).
3. **Crew snippets** — `context = pickContext(speaker, brightness)` (weighted by speaker's conditions + darkness, `conversation.ts:56-63`), `mood = pickPartnerMood(speaker, partner)` (weighted by relation values + partner conditions, `conversation.ts:65-87`). Look up `CONVERSATION_SCRIPTS["{context}_{mood}"]`, falling back to `generic_friendly`, then to a hardcoded `['Arr...','Aye...']` (`conversation.ts:195-200`).

### 6.3 Triggers (proximity)

- **`tryStartConversation(member, crew, brightness)`** (`conversation.ts:266-274`): called from idle path. Bails if `conversationCooldown > 0`. Finds a nearby available partner; with `CONVERSATION_CHANCE = 0.15` (`conversation.ts:23`) starts one.
- **`tryStartConversationWhileWalking(...)`** (`conversation.ts:277-286`): called from `updateWalking` (`movement.ts:161`) for *wandering* crew only (`targetState === IDLE`).
- **`findNearbyPartner`** (`conversation.ts:250-263`): same-deck, within `CONVERSATION_PROXIMITY = 1.5` tiles (`conversation.ts:19`), and `isAvailableForConversation` (`conversation.ts:242-248`: cooldown 0, no conversation partner, no copulation target, and either IDLE or aimlessly WALKING).

### 6.4 Playback state machine

- **`beginConversation(member, partner, brightness=1.0)`** (`conversation.ts:216-239`): picks the script, sets both actors to `CrewState.TALKING`, shares the same `conversationScript` and `conversationExchangesLeft = script.length`, gives the initiator `conversationMyTurn = true`, clears paths.
- **`updateTalking(member, crew, dt, brightness)`** (`conversation.ts:288-365`): per-tick. Ticks the speech-bubble timer; ends gracefully if the partner left (`conversation.ts:295-304`). On bubble expiry it decrements the **shared** `conversationExchangesLeft` and hands the turn over. Picks the next line by `scriptIndex = conversationScript.length - conversationExchangesLeft` (`conversation.ts:361`), each line shown for `CONVERSATION_EXCHANGE_DURATION = 3s` (`conversation.ts:20`).
- **Outcome on finish** (`conversation.ts:314-351`): rolls friendship delta on **both** relations — `roll<0.85 → +2`, `<0.97 → −4`, else `−50` (`CONVERSATION_FRIENDSHIP_GAIN/LOSS/CATASTROPHE`, `conversation.ts:24-26`/`321-323`), clamped 0-255. For NPC chats, the crew side gets `+3 morale` and a 40% chance to emit a hardcoded **gossip** speech bubble (`conversation.ts:327-348`). Then `endConversation` on both, which sets a 30-60s `conversationCooldown` (`conversation.ts:203-213`).
- **`stopConversation(member, crew)`** (`conversation.ts:367-381`): tears down both sides; interrupted partner gets a short 10s cooldown. Called by `killActor` and the `Stop` command.
- **`tickConversationCooldown(member, dt)`** (`conversation.ts:383-387`): decrements cooldown each tick (called from update loop).

### 6.5 How to add speech / extend conversations

- **New crew lines for an existing context/mood**: add scripts to the matching `"{context}_{mood}"` array in `public/CONVERSATION_SNIPPETS.json`. No code change. Scripts are `string[]` of alternating speakers; keep them 2-4 lines to fit the 3s/line pacing.
- **New context or mood tag**: add the literal to `ContextTag`/`MoodTag` (`conversation.ts:43-44`), add a weighted push in `pickContext` / `pickPartnerMood` (`conversation.ts:56-87`) gated on a `conditions`/relation check, and add `"{context}_{mood}"` keys to the JSON. Without the JSON key it silently falls back to `generic_friendly`.
- **New NPC role**: add a `role` key + 3-line scripts to `NPC_SCRIPTS` (`conversation.ts:95-150`), spawn the NPC with `statuses.set('npc', { role, ... })`, and (optionally) add gossip lines for that role in `updateTalking` (`conversation.ts:337-343`).
- **New animal species lines**: add to `ANIMAL_LINES` (`conversation.ts:29-34`) keyed by the `ActorType`.
- **One-off speech bubble (no conversation)**: just set `actor.speechBubbleText = '...'` and `actor.speechBubbleTimer = <seconds>` (this is exactly what the gossip path does, `conversation.ts:345-346`). The renderer draws it; the timer is ticked by `updateTalking` only while TALKING, so for non-talking bubbles tick it wherever you emit (or it persists until something clears it).

### 6.6 Gotchas

- `conversationExchangesLeft` is **shared and mutated on the speaker each turn, then copied to the partner** (`conversation.ts:311-312`). Don't read it as a per-actor remaining count.
- Conversation lookups use `relations.find(...)` and silently skip the friendship update if a relation is missing — another reason §2.2's bidirectional-relations invariant matters.
- `beginConversation` clears `path` and forces `TALKING`; if you start one on a crew member mid-task you'll abandon their order. The availability gate normally prevents this, but player/scripted triggers bypass it.
- The JSON load is async and fire-and-forget; very early conversations (first frames after boot) fall back to `['Arr...','Aye...']` until the fetch resolves.
