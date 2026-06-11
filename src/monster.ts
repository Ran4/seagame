// FEATURE 6 — Sea Monsters / Kraken.
//
// A rare deep-water survival-horror encounter, ticked from the sailing block of
// update() (game.ts) — like combat and weather, it only runs at sea. Reuses SHARED
// SYSTEM A (damageObject) for the kraken ramming the hull, SHARED SYSTEM C
// (isInDeepWater) to gate the encounter to open ocean, and the existing death/corpse
// path (killActor) when a crew member is dragged overboard.
//
// The monster lives on `world.monster` (MonsterState) and its limbs on
// `world.tentacles` (Tentacle[]). Phases:
//   warning   — ~30s foreshadow: darker water (renderer reads weather/phase), lookout
//               shout, a 'kraken_warning' SFX. No damage yet.
//   attacking — tentacles grip the ship's edges; crew Fight to sever them; tentacles
//               grab crew and (if not freed) drag them overboard; the kraken
//               periodically rams the hull (a burst of damageObject on one side).
//   retreating— enough tentacles severed (or the ship sank): a brief wind-down, then
//               cleared (monster = null, tentacles = []), loot dropped on victory.
//
// Rendering lives in renderer.ts / render/* — this module only mutates World.

import { World, CrewState, TileType, TILE_SIZE, Tentacle, Actor } from './types';
import { damageObject } from './combat';
import { isInDeepWater } from './worldmap';
import { killActor } from './crew/death';
import { stopConversation } from './conversation';
import { createKrakenInk, createKrakenTooth, createTentacleMeat } from './items';
import { CONFIG } from './config';
import type { AudioManager } from './audio';

// --- Encounter roll (throttled like ship combat) ---
const ENCOUNTER_TICK = 5;            // seconds between rolls while sailing in deep water
const ENCOUNTER_CHANCE = 0.018;      // per roll (deep water only — krakens haunt the abyss)

// --- Phase durations (seconds) ---
const WARNING_DURATION = 30;         // foreshadow window before the attack (per spec)
const RETREAT_DURATION = 6;          // brief wind-down before the monster vanishes

// --- Tentacle tuning ---
const TENTACLE_MIN = 3;              // tentacles spawned when the attack begins
const TENTACLE_MAX = 5;
const TENTACLE_HP = 60;              // HP each (a few good hacks to sever)
const SEVER_TO_RETREAT = 4;          // sever this many → the kraken gives up
const RESPAWN_INTERVAL = 14;         // seconds between fresh tentacles surfacing
const MAX_LIVE_TENTACLES = 6;        // cap concurrent tentacles on the rails

// --- Grab tuning ---
const GRAB_INTERVAL = 7;             // seconds between grab attempts (a free tentacle reaches out)
const GRAB_CHANCE = 0.5;             // chance a grab attempt actually seizes someone
const GRAB_RADIUS = 2;               // tiles: a tentacle grabs crew within this range
const DRAG_TIME = 14;               // seconds a grabbed crew has before being dragged under

// --- Ram tuning ---
const RAM_INTERVAL = 16;             // seconds between hull rams
const RAM_TILES_MIN = 2;             // hull tiles smashed per ram
const RAM_TILES_MAX = 4;
const RAM_DAMAGE_MIN = 40;
const RAM_DAMAGE_MAX = 80;

// --- Damage a crew deals per Fight hit, scaled by combat skill ---
const FIGHT_BASE_DAMAGE = 12;
const FIGHT_SKILL_SCALE = 0.12;      // + combatSkill * this per hit

const WARNING_SHOUTS = ['Something stirs below!', 'The water… it’s alive!', 'Kraken! KRAKEN!', 'Monster off the bow!'];

let encounterTimer = 0;
let respawnTimer = 0;
let grabTimer = 0;
let ramTimer = 0;
let nextTentacleId = 1;

/** The upper deck index (the open deck whose hull/railing the tentacles grip). */
function topDeckIndex(world: World): number {
  // Deck 0 is the crow's nest; deck 1 is the open upper deck. Prefer deck 1 if present.
  return world.decks.length > 1 ? 1 : 0;
}

/** Collect ship-edge HULL/FISHING_SPOT tiles on the upper deck — the railing the kraken grips. */
function edgeTiles(world: World): { deck: number; x: number; y: number }[] {
  const d = topDeckIndex(world);
  const deck = world.decks[d];
  const out: { deck: number; x: number; y: number }[] = [];
  if (!deck) return out;
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      const t = deck.tiles[y][x];
      if (t === TileType.HULL || t === TileType.FISHING_SPOT) out.push({ deck: d, x, y });
    }
  }
  return out;
}

/** Roll for a new kraken encounter. Deep water only, while actually moving. */
function maybeSpawnMonster(world: World, audio: AudioManager): void {
  if (world.monster) return;
  if (world.worldMap.currentSpeed <= 0) return;

  let chance = isInDeepWater(world.worldMap) ? ENCOUNTER_CHANCE : 0;
  if (CONFIG.forceKraken) { chance = 1; CONFIG.forceKraken = false; }
  if (chance <= 0) return;
  if (Math.random() >= chance) return;

  beginEncounter(world, audio);
}

/** Kick off the warning phase (foreshadowing). */
function beginEncounter(world: World, audio: AudioManager): void {
  world.monster = { phase: 'warning', timer: WARNING_DURATION, tentaclesSevered: 0 };
  world.tentacles = [];
  respawnTimer = 0;
  grabTimer = 0;
  ramTimer = RAM_INTERVAL * 0.6; // first ram comes a little after tentacles appear
  world.activityLog.push({ text: 'The sea darkens and churns — something monstrous rises from the deep!', time: world.time });
  audio.play('kraken_warning', world.activeDeck);

  // A lookout (or any crew on the open deck) shouts the alarm.
  const top = topDeckIndex(world);
  const shouter = world.actors.find(a => a.actorType === 'human' && !a.statuses.has('npc') &&
    (a.state === CrewState.LOOKOUT || a.deck === top)) ??
    world.actors.find(a => a.actorType === 'human' && !a.statuses.has('npc'));
  if (shouter) {
    shouter.speechBubbleText = WARNING_SHOUTS[Math.floor(Math.random() * WARNING_SHOUTS.length)];
    shouter.speechBubbleTimer = 4;
  }
}

/** Spawn one tentacle at a random free ship-edge tile (not where one already grips). */
function spawnTentacle(world: World): void {
  const tiles = edgeTiles(world);
  if (tiles.length === 0) return;
  const taken = new Set(world.tentacles.map(t => `${t.deck}-${t.x}-${t.y}`));
  const free = tiles.filter(t => !taken.has(`${t.deck}-${t.x}-${t.y}`));
  if (free.length === 0) return;
  const spot = free[Math.floor(Math.random() * free.length)];
  world.tentacles.push({
    id: nextTentacleId++,
    deck: spot.deck, x: spot.x, y: spot.y,
    hp: TENTACLE_HP, maxHp: TENTACLE_HP,
    grabbedActorId: null, grabTimer: 0,
  });
}

/** Begin the attack: tentacles surface and the kraken starts ramming. */
function beginAttack(world: World, audio: AudioManager): void {
  if (!world.monster) return;
  world.monster.phase = 'attacking';
  const count = TENTACLE_MIN + Math.floor(Math.random() * (TENTACLE_MAX - TENTACLE_MIN + 1));
  for (let i = 0; i < count; i++) spawnTentacle(world);
  world.activityLog.push({ text: 'Tentacles burst over the railings — to arms!', time: world.time });
  audio.play('kraken_attack', world.activeDeck);
}

/**
 * Apply a Fight hit to a tentacle. Called from the FIGHTING state handler (crew/update.ts)
 * once the attacker is adjacent. Damage scales with the attacker's combat skill. Returns
 * true if the tentacle was severed by this hit.
 */
export function hitTentacle(world: World, tentacle: Tentacle, attacker: Actor, audio?: AudioManager): boolean {
  const skill = attacker.skills.combat ?? 30;
  let dmg = FIGHT_BASE_DAMAGE + skill * FIGHT_SKILL_SCALE + Math.random() * 6;
  if (attacker.conditions.has('injured')) dmg *= 0.6;
  // A kraken tooth in hand bites deeper.
  if (attacker.profile.inventory.some(i => i.name === 'Kraken tooth')) dmg *= 1.5;
  dmg = Math.round(dmg);
  tentacle.hp = Math.max(0, tentacle.hp - dmg);
  // Record participation — the Kraken Slayer honour goes only to crew who fought.
  attacker.statuses.set('fought_kraken', null);
  if (audio) audio.play('fist_fight', attacker.deck);

  if (tentacle.hp <= 0) {
    severTentacle(world, tentacle);
    return true;
  }
  return false;
}

/** Find the tentacle (if any) at the given tile. */
export function tentacleAt(world: World, deck: number, x: number, y: number): Tentacle | undefined {
  return world.tentacles.find(t => t.deck === deck && t.x === x && t.y === y);
}

/** Sever a tentacle: free any grabbed crew, mark the kill, remove it from the world. */
function severTentacle(world: World, tentacle: Tentacle): void {
  if (tentacle.grabbedActorId !== null) {
    const victim = world.actors.find(a => a.id === tentacle.grabbedActorId);
    if (victim) {
      victim.statuses.delete('grabbed');
      if (victim.state === CrewState.IDLE) victim.idleTimer = 0.5;
      victim.speechBubbleText = 'Free! Cut loose!';
      victim.speechBubbleTimer = 3;
    }
  }
  const idx = world.tentacles.indexOf(tentacle);
  if (idx !== -1) world.tentacles.splice(idx, 1);
  if (world.monster) world.monster.tentaclesSevered++;
  world.activityLog.push({ text: 'A tentacle is hacked clean off — it thrashes and sinks!', time: world.time });
}

/** Mark a crew member as grabbed by a tentacle (stuck until freed). */
function grabCrew(world: World, tentacle: Tentacle, victim: Actor): void {
  // Drop whatever the victim was doing — they're hauled off their feet.
  // Free any interaction partner first (mirrors killActor): a Kiss/Copulate/Pet/Converse
  // partner is frozen with idleTimer 999 waiting on the victim and would otherwise
  // stand in place until they starve.
  if (victim.state === CrewState.TALKING || victim.conversationPartnerId !== null) {
    stopConversation(victim, world.actors);
  }
  if (victim.copulationTarget?.type === 'crew') {
    const partnerId = victim.copulationTarget.actorId;
    const partner = world.actors.find(a => a.id === partnerId);
    if (partner && partner.copulationTarget?.type === 'crew' && partner.copulationTarget.actorId === victim.id) {
      partner.copulationTarget = null;
      partner.state = CrewState.IDLE;
      partner.idleTimer = 1 + Math.random() * 2;
    }
  }
  victim.path = [];
  victim.copulationTarget = null;
  victim.commandQueue.length = 0;
  victim.state = CrewState.IDLE;
  victim.statuses.set('grabbed', { by: tentacle.id });
  tentacle.grabbedActorId = victim.id;
  tentacle.grabTimer = DRAG_TIME;
  victim.speechBubbleText = 'Help! It’s got me!';
  victim.speechBubbleTimer = 4;
  world.activityLog.push({ text: `A tentacle seizes ${victim.profile.name}! Cut them free!`, time: world.time });
}

/** A free tentacle reaches out and tries to grab a nearby ungrabbed crew member. */
function tryGrab(world: World): void {
  const free = world.tentacles.filter(t => t.grabbedActorId === null);
  if (free.length === 0) return;
  const tentacle = free[Math.floor(Math.random() * free.length)];
  if (Math.random() >= GRAB_CHANCE) return;

  // Eligible victims: humans on the tentacle's deck, not already grabbed, within reach.
  const victims = world.actors.filter(a =>
    a.actorType === 'human' && !a.statuses.has('npc') && a.deck === tentacle.deck &&
    !a.conditions.has('grabbed') && a.health > 0 &&
    Math.abs(Math.floor(a.pixelX / TILE_SIZE) - tentacle.x) + Math.abs(Math.floor(a.pixelY / TILE_SIZE) - tentacle.y) <= GRAB_RADIUS,
  );
  if (victims.length === 0) return;
  const victim = victims[Math.floor(Math.random() * victims.length)];
  grabCrew(world, tentacle, victim);
}

/** The kraken rams the hull: a burst of damage to several tiles along one side. */
function ramHull(world: World, audio?: AudioManager): void {
  const d = topDeckIndex(world);
  const deck = world.decks[d];
  if (!deck) return;
  // Pick a side (left/right) and gather its HULL tiles.
  const side = Math.random() < 0.5 ? 'left' : 'right';
  const hullTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      if (deck.tiles[y][x] !== TileType.HULL) continue;
      const isLeftish = x < deck.width / 2;
      if ((side === 'left') === isLeftish) hullTiles.push({ x, y });
    }
  }
  if (hullTiles.length === 0) return;
  const hits = RAM_TILES_MIN + Math.floor(Math.random() * (RAM_TILES_MAX - RAM_TILES_MIN + 1));
  world.activityLog.push({ text: 'The kraken slams the hull — timbers shatter!', time: world.time });
  if (audio) audio.play('ship_hit', world.activeDeck);
  for (let i = 0; i < hits && hullTiles.length > 0; i++) {
    const idx = Math.floor(Math.random() * hullTiles.length);
    const t = hullTiles.splice(idx, 1)[0];
    damageObject(world, d, t.x, t.y, RAM_DAMAGE_MIN + Math.floor(Math.random() * (RAM_DAMAGE_MAX - RAM_DAMAGE_MIN)), world.activityLog);
  }
}

/** Drop the kraken's loot into the first available barrel and mark fighters as slayers. */
function dropLoot(world: World): void {
  // Find a barrel to stash the loot in.
  let barrelKey: string | null = null;
  for (let d = 0; d < world.decks.length && !barrelKey; d++) {
    const deck = world.decks[d];
    for (let y = 0; y < deck.height && !barrelKey; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === TileType.BARREL) { barrelKey = `${d}-${x}-${y}`; break; }
      }
    }
  }
  if (barrelKey) {
    const items = world.barrelInventory.get(barrelKey) ?? [];
    const ink = createKrakenInk(world.time); ink.quantity = 2 + Math.floor(Math.random() * 3); ink.weight = 600 * ink.quantity;
    items.push(ink);
    items.push(createKrakenTooth(world.time));
    items.push(createTentacleMeat(world.time));
    if (Math.random() < 0.6) items.push(createTentacleMeat(world.time));
    world.barrelInventory.set(barrelKey, items);
    world.activityLog.push({ text: 'The kraken’s carcass yields ink, a great tooth, and meat — stowed in the hold!', time: world.time });
  }
}

/** Begin the retreat (victory): clear loose tentacles, drop loot, brand the fighters. */
function beginRetreat(world: World, killed: boolean): void {
  if (!world.monster) return;
  world.monster.phase = 'retreating';
  world.monster.timer = RETREAT_DURATION;

  // Free anyone still grabbed.
  for (const t of world.tentacles) {
    if (t.grabbedActorId !== null) {
      const v = world.actors.find(a => a.id === t.grabbedActorId);
      if (v) v.statuses.delete('grabbed');
    }
  }
  world.tentacles = [];

  if (killed) {
    world.activityLog.push({ text: 'The kraken recoils, beaten, and sinks back into the abyss!', time: world.time });
    // Every able human aboard who took part (landed a hit — see hitTentacle)
    // earns the Kraken Slayer honour (permanent).
    for (const a of world.actors) {
      if (a.actorType !== 'human' || a.statuses.has('npc')) continue;
      if (!a.statuses.has('fought_kraken')) continue;
      if (!a.statuses.has('kraken_slayer')) {
        a.statuses.set('kraken_slayer', { since: world.time });
        a.profile.morale = Math.min(255, a.profile.morale + 40);
      }
    }
    dropLoot(world);
  }

  // Reset participation markers for the next encounter.
  for (const a of world.actors) a.statuses.delete('fought_kraken');
}

/**
 * Advance the kraken encounter. Called once per frame from the sailing block in
 * update() (so it only runs at sea, like combat/weather). `dt` is real seconds.
 */
export function updateMonster(world: World, dt: number, audio: AudioManager): void {
  // Roll for new encounters on a throttle while sailing.
  if (!world.monster) {
    encounterTimer += dt;
    if (encounterTimer >= ENCOUNTER_TICK) {
      encounterTimer = 0;
      maybeSpawnMonster(world, audio);
    }
    return;
  }

  const m = world.monster;
  m.timer -= dt;

  if (m.phase === 'warning') {
    if (m.timer <= 0) beginAttack(world, audio);
    return;
  }

  if (m.phase === 'retreating') {
    if (m.timer <= 0) {
      world.monster = null;
      world.tentacles = [];
    }
    return;
  }

  // --- phase === 'attacking' ---

  // Sever count met → the beast retreats, beaten.
  if (m.tentaclesSevered >= SEVER_TO_RETREAT) {
    beginRetreat(world, true);
    return;
  }

  // Periodically surface fresh tentacles (keeps pressure on as ones are cut).
  respawnTimer += dt;
  if (respawnTimer >= RESPAWN_INTERVAL) {
    respawnTimer = 0;
    if (world.tentacles.length < MAX_LIVE_TENTACLES) spawnTentacle(world);
  }

  // Grab attempts.
  grabTimer += dt;
  if (grabTimer >= GRAB_INTERVAL) {
    grabTimer = 0;
    tryGrab(world);
  }

  // Tick grab timers — a held crew is dragged overboard if not freed in time.
  // Iterate a snapshot since we may splice the live array mid-loop.
  for (const t of [...world.tentacles]) {
    if (t.grabbedActorId === null) continue;
    t.grabTimer -= dt;
    const victim = world.actors.find(a => a.id === t.grabbedActorId);
    if (!victim) { t.grabbedActorId = null; continue; }
    if (t.grabTimer <= 0) {
      // Dragged under — death via the existing death path (killActor handles relations,
      // selection, conversation/copulation partners). They go over the side, so we
      // remove the deck corpse it leaves behind (no body to recover at sea).
      world.activityLog.push({ text: `${victim.profile.name} is dragged overboard by the kraken!`, time: world.time });
      victim.statuses.delete('grabbed');
      victim.health = 0;
      killActor(world, victim);
      const cIdx = world.corpses.findIndex(c => c.actorId === victim.id);
      if (cIdx !== -1) world.corpses.splice(cIdx, 1);
      t.grabbedActorId = null;
      // The sated tentacle slips back beneath the waves.
      const idx = world.tentacles.indexOf(t);
      if (idx !== -1) world.tentacles.splice(idx, 1);
    }
  }

  // Hull rams.
  ramTimer += dt;
  if (ramTimer >= RAM_INTERVAL) {
    ramTimer = 0;
    ramHull(world, audio);
  }
}

// ---------------------------------------------------------------------------
// Crew reactions (called from the idle handler in crew/update.ts).
// ---------------------------------------------------------------------------

const FIGHT_BRAVE_MORALE = 96;   // morale at/above this → brave crew charge the tentacles
const FLEE_MORALE = 64;          // morale below this → cowardly crew flee below deck

/**
 * Autonomous crew reaction to an active kraken attack. Returns true if it set a
 * behaviour (caller should not fall through to normal wander/idle logic). Mirrors the
 * storm reaction helper in weather.ts.
 *
 * - Grabbed crew: stuck (can't act) — handled here so they don't wander.
 * - Brave (high morale): run to Fight the nearest tentacle.
 * - Cowardly (low morale): flee below deck (FLEEING walk to the sheltered deck).
 */
export function tryMonsterReaction(
  member: Actor,
  world: World,
  fightNearest: (m: Actor) => boolean,
  fleeBelow: (m: Actor, deck: number) => boolean,
): boolean {
  if (!world.monster || world.monster.phase !== 'attacking') return false;
  if (member.actorType !== 'human' || member.statuses.has('npc')) return false;

  // Seized crew can't do anything but struggle.
  if (member.conditions.has('grabbed')) {
    member.path = [];
    member.idleTimer = 0.5;
    if (!member.speechBubbleText && Math.random() < 0.2) {
      member.speechBubbleText = 'Aaargh! Cut me loose!';
      member.speechBubbleTimer = 3;
    }
    return true;
  }

  if (world.tentacles.length === 0) return false;

  const morale = member.profile.morale;

  // Cowardly → flee to the sheltered lower deck.
  if (morale < FLEE_MORALE) {
    const shelter = world.decks.length - 1;
    if (member.deck !== shelter) {
      if (fleeBelow(member, shelter)) {
        member.speechBubbleText = 'I’ll not die out here!';
        member.speechBubbleTimer = 3;
        return true;
      }
    }
    // Already below — cower/pray.
    member.state = CrewState.PRAYING;
    member.stateTimer = 5 + Math.random() * 5;
    member.path = [];
    member.thoughtBubble = 'prayer';
    member.thoughtBubbleTimer = member.stateTimer;
    return true;
  }

  // Brave → charge the nearest tentacle.
  if (morale >= FIGHT_BRAVE_MORALE && !member.conditions.has('injured')) {
    if (fightNearest(member)) {
      if (Math.random() < 0.4) {
        member.speechBubbleText = 'Hack it down!';
        member.speechBubbleTimer = 3;
      }
      return true;
    }
  }

  return false;
}

/** A dog barks / a parrot circles at the tentacles (cosmetic). Light flavour. */
export function animalMonsterFlavor(member: Actor, world: World): void {
  if (!world.monster || world.monster.phase !== 'attacking') return;
  if (world.tentacles.length === 0) return;
  if (member.actorType === 'dog') {
    if (Math.random() < 0.02) {
      member.speechBubbleText = '*barks furiously*';
      member.speechBubbleTimer = 2.5;
    }
  } else if (member.actorType === 'parrot') {
    if (Math.random() < 0.02) {
      member.speechBubbleText = 'Awk! Danger!';
      member.speechBubbleTimer = 2.5;
    }
  }
}
