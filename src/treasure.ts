// FEATURE 8 — Treasure Maps & Exploration.
//
// Treasure maps come from combat loot or the market merchant. Reading a map at the
// MAP_TABLE reveals its target island's name and drops a treasure marker on the world
// map. When docked at a marked island a crew party can be sent ashore (an Expedition):
// they vanish for 2-4 in-game hours, then return with a weighted outcome — treasure,
// nothing, trouble (an injury), or a rescued castaway. A successful dig clears the marker.
//
// Pure helpers operating on the World struct, mirroring combat.ts / trade.ts style.

import {
  World, Actor, Item, CrewState, TILE_SIZE, SECONDS_PER_DAY, Sex,
} from './types';
import {
  createGem, createArtifact, createCursedItem, createTreasureMap,
} from './items';
import { findFirstBarrelKey } from './combat';
import { pickUniqueName } from './crew/factory';
import { DECK_X_SHIFT, DECK_Y_SHIFT } from './harbor';
import type { AudioManager } from './audio';

// Shore party can be 1..4 crew; they're ashore 2-4 in-game hours.
const EXPEDITION_MIN_HOURS = 2;
const EXPEDITION_MAX_HOURS = 4;
const EXPEDITION_MAX_PARTY = 4;
const HOUR = SECONDS_PER_DAY / 24; // in-game seconds per hour

const CASTAWAY_NAMES_M = ['Marooned Pete', 'Castaway Cole', 'Crusoe', 'Salty Jack', 'Driftwood Dan'];
const CASTAWAY_NAMES_F = ['Marooned Meg', 'Castaway Cora', 'Driftwood Dot', 'Salt-Marsh Sal', 'Reef Ruth'];

/** Pick an island id a treasure map can point to. MUST be a harbour island, since the
 * shore expedition requires docking there. Prefers more "exotic / mysterious" harbours
 * (by description) for flavour, else any harbour. */
export function pickTreasureIsland(world: World): number {
  const islands = world.worldMap.islands;
  const harbors = islands.filter(i => i.hasHarbor);
  if (harbors.length === 0) return islands[0]?.id ?? 0; // degenerate fallback
  // Favour harbours whose name or description hints at treasure / mystery / wilderness.
  const exotic = harbors.filter(i => /treasure|cursed|jungle|rock|cove|bay|haven|reef|isle|skull|serpent/i.test(`${i.name} ${i.description}`));
  const pool = exotic.length > 0 ? exotic : harbors;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** Build a fresh treasure map for combat loot (random island, 25% fake). */
export function createLootTreasureMap(world: World): Item {
  return createTreasureMap({ islandId: pickTreasureIsland(world), fake: Math.random() < 0.25 }, world.time);
}

/** Find a 'Treasure map' item the crew/barrels hold. Returns the item + a remover. */
function findTreasureMap(world: World, itemName?: string): { item: Item; remove: () => void } | null {
  // Crew inventories first (the navigator usually carries it), then barrels.
  for (const a of world.actors) {
    if (a.statuses.has('npc')) continue;
    const idx = a.profile.inventory.findIndex(i => i.name === 'Treasure map' && (!itemName || i.name === itemName));
    if (idx !== -1) {
      const item = a.profile.inventory[idx];
      return { item, remove: () => { a.profile.inventory.splice(idx, 1); } };
    }
  }
  for (const [key, items] of world.barrelInventory) {
    const idx = items.findIndex(i => i.name === 'Treasure map' && (!itemName || i.name === itemName));
    if (idx !== -1) {
      const item = items[idx];
      return {
        item,
        remove: () => {
          items.splice(idx, 1);
          if (items.length === 0) world.barrelInventory.delete(key);
        },
      };
    }
  }
  return null;
}

/**
 * Use a treasure map at the map table: consume it, and (if genuine) reveal the target
 * island's name and stamp a treasure marker on the world map. Fake maps reveal nothing
 * useful. Returns true if a map was consumed.
 */
export function useMap(world: World, reader: Actor, audio?: AudioManager): boolean {
  const found = findTreasureMap(world);
  if (!found) {
    world.activityLog.push({ text: `${reader.profile.name} has no treasure map to read.`, time: world.time });
    return false;
  }
  const { item, remove } = found;
  remove();

  const data = item.mapData;
  if (!data || data.fake) {
    world.activityLog.push({ text: `${reader.profile.name} pores over the map... it's a forgery. Worthless.`, time: world.time });
    reader.speechBubbleText = 'Bah! A fake!';
    reader.speechBubbleTimer = 3;
    if (audio) audio.play('click', world.activeDeck);
    return true;
  }

  const island = world.worldMap.islands.find(i => i.id === data.islandId);
  if (!island) {
    world.activityLog.push({ text: 'The map points to no island we know — useless.', time: world.time });
    return true;
  }
  // Reveal + mark.
  island.treasureMarker = true;
  world.treasureIslands.add(island.id);
  world.spottedIslands.add(island.id); // so the name is "known"
  world.activityLog.push({ text: `X marks the spot! Treasure is buried on ${island.name}. Marked on the map.`, time: world.time });
  reader.thoughtBubble = 'heart';
  reader.thoughtBubbleTimer = 3;
  if (audio) audio.play('treasure_found', world.activeDeck);
  return true;
}

/** True if a treasure map (genuine or not) is held anywhere on the ship. */
export function hasTreasureMap(world: World): boolean {
  return findTreasureMap(world) !== null;
}

/** True if the ship is docked at an island that has a treasure marker. */
export function dockedAtTreasureIsland(world: World): boolean {
  return world.docking.phase === 'docked' &&
    world.docking.island != null &&
    world.treasureIslands.has(world.docking.island.id);
}

/**
 * Send a shore party ashore at the currently docked, treasure-marked island. The party
 * (up to EXPEDITION_MAX_PARTY able human crew, preferring the selected actor) gets the
 * 'ashore' status and is hidden until the expedition returns. Returns true on success.
 */
export function startExpedition(world: World, audio?: AudioManager): boolean {
  if (world.expedition) {
    world.activityLog.push({ text: 'A shore party is already ashore.', time: world.time });
    return false;
  }
  if (!dockedAtTreasureIsland(world)) {
    world.activityLog.push({ text: 'No marked treasure to dig for here.', time: world.time });
    return false;
  }
  const island = world.docking.island!;

  // Eligible: able-bodied non-NPC humans not grabbed/carrying a corpse.
  const eligible = world.actors.filter(a =>
    a.actorType === 'human' && !a.statuses.has('npc') && !a.statuses.has('ashore') &&
    a.health > 0 && a.carryingCorpseId === null
  );
  if (eligible.length === 0) {
    world.activityLog.push({ text: 'No crew able to go ashore.', time: world.time });
    return false;
  }

  // Prefer the selected actor leading; keep at least one crew aboard if possible.
  const selected = world.selectedActorId != null ? eligible.find(a => a.id === world.selectedActorId) : undefined;
  const ordered = selected ? [selected, ...eligible.filter(a => a.id !== selected.id)] : eligible;
  const maxParty = Math.min(EXPEDITION_MAX_PARTY, Math.max(1, eligible.length - (eligible.length > 1 ? 1 : 0)));
  const partySize = Math.min(maxParty, ordered.length);
  const party = ordered.slice(0, partySize);

  const hours = EXPEDITION_MIN_HOURS + Math.random() * (EXPEDITION_MAX_HOURS - EXPEDITION_MIN_HOURS);
  const returnTime = world.time + hours * HOUR;

  for (const member of party) {
    // Stop whatever they were doing and stash them ashore.
    member.commandQueue.length = 0;
    member.path = [];
    member.state = CrewState.IDLE;
    member.copulationTarget = null;
    member.conversationPartnerId = null;
    member.speechBubbleText = null;
    member.statuses.set('ashore', { islandId: island.id });
  }
  // Don't leave a hidden actor selected (its panel would show a ghost).
  if (world.selectedActorId != null && party.some(a => a.id === world.selectedActorId)) {
    world.selectedActorId = null;
  }

  world.expedition = { islandId: island.id, returnTime, crewIds: party.map(a => a.id) };
  world.activityLog.push({
    text: `${party.length === 1 ? party[0].profile.name + ' goes' : party.length + ' crew go'} ashore on ${island.name} to dig for treasure...`,
    time: world.time,
  });
  if (audio) audio.play('treasure_dig', world.activeDeck);
  return true;
}

type Outcome = 'treasure' | 'nothing' | 'trouble' | 'rescue';

/** Weighted outcome roll, biased by the party's combat + navigation prowess. */
function rollOutcome(party: Actor[], fakeMap: boolean): Outcome {
  // Average combat + navigation skill of the party (0..255-ish).
  let skillSum = 0;
  for (const m of party) {
    skillSum += (m.skills.combat ?? 30) + (m.skills.navigation ?? 30);
  }
  const avgSkill = party.length > 0 ? skillSum / (party.length * 2) : 30;
  const skillFactor = Math.min(1, avgSkill / 160); // ~0..1

  // A fake map mostly leads to nothing / trouble.
  if (fakeMap) {
    const r = Math.random();
    if (r < 0.55) return 'nothing';
    if (r < 0.9) return 'trouble';
    return 'rescue';
  }

  // Genuine map weights (higher skill → more treasure, less trouble).
  const wTreasure = 0.40 + 0.25 * skillFactor;
  const wNothing = 0.20;
  const wTrouble = 0.25 - 0.15 * skillFactor;
  const wRescue = 0.15;
  const total = wTreasure + wNothing + wTrouble + wRescue;
  let r = Math.random() * total;
  if ((r -= wTreasure) < 0) return 'treasure';
  if ((r -= wNothing) < 0) return 'nothing';
  if ((r -= wTrouble) < 0) return 'trouble';
  return 'rescue';
}

/** Stash an item into the first ship barrel (merging stackables), or onto a party member. */
function awardItem(world: World, item: Item, party: Actor[]): void {
  const barrelKey = findFirstBarrelKey(world);
  if (barrelKey) {
    const items = world.barrelInventory.get(barrelKey) ?? [];
    if (item.stackable) {
      const existing = items.find(i => i.name === item.name && i.stackable && !i.cursed);
      if (existing) { existing.quantity += item.quantity; existing.weight += item.weight; }
      else items.push(item);
    } else {
      items.push(item);
    }
    world.barrelInventory.set(barrelKey, items);
  } else if (party.length > 0) {
    party[0].profile.inventory.push(item);
  }
}

/** Spawn a rescued castaway near the gangplank (self-contained recruit, like recruitSailor). */
function spawnCastaway(world: World): void {
  const id = world.nextActorId++;
  const sex: Sex = Math.random() < 0.5 ? 'M' : 'F';
  const namePool = sex === 'M' ? CASTAWAY_NAMES_M : CASTAWAY_NAMES_F;
  const used = new Set(world.actors.map(a => a.profile.name));
  const name = pickUniqueName(namePool, used);
  const colors = ['#c0a060', '#7fa0c0', '#b07050', '#609080', '#a070a0'];
  const color = colors[id % colors.length];

  const spawnX = DECK_X_SHIFT * TILE_SIZE + 2 * TILE_SIZE;
  const spawnY = (DECK_Y_SHIFT + 8) * TILE_SIZE + TILE_SIZE / 2;

  const castaway: Actor = {
    id,
    actorType: 'human',
    profile: {
      name, sex, color,
      spriteIndex: id % 4,
      numberOfHands: 2,
      hunger: 120 + Math.random() * 60,   // half-starved from being marooned
      energy: 140 + Math.random() * 60,
      morale: 180 + Math.random() * 40,   // overjoyed to be rescued
      inventory: [],
      hands: [],
    },
    health: 70 + Math.floor(Math.random() * 30),
    maxHealth: 100,
    carryingCorpseId: null,
    statuses: new Map<string, Record<string, any> | null>(),
    conditions: new Set(),
    skills: {
      sailing: 10 + Math.floor(Math.random() * 51),
      gunnery: 10 + Math.floor(Math.random() * 51),
      combat: 10 + Math.floor(Math.random() * 51),
      cooking: 10 + Math.floor(Math.random() * 51),
      navigation: 10 + Math.floor(Math.random() * 51),
      singing: 10 + Math.floor(Math.random() * 51),
      dancing: 10 + Math.floor(Math.random() * 51),
    },
    pixelX: spawnX,
    pixelY: spawnY,
    facing: 'south',
    deck: 1,
    state: CrewState.IDLE,
    targetState: CrewState.IDLE,
    path: [],
    stateTimer: 0,
    idleTimer: 1 + Math.random() * 2,
    copulationTarget: null,
    relations: [],
    thoughtBubble: 'heart',
    thoughtBubbleTimer: 5,
    conversationPartnerId: null,
    conversationExchangesLeft: 0,
    conversationPositive: true,
    conversationScript: [],
    conversationCooldown: 0,
    conversationMyTurn: false,
    speechBubbleText: 'Bless ye! Saved at last!',
    speechBubbleTimer: 4,
    takeTarget: null,
    consumingItem: null,
    lustSeekCooldown: 0,
    commandQueue: [],
    shantyInitiatorId: null,
  };
  castaway.statuses.set('climber', { skill: 128 });
  if (sex === 'M') {
    castaway.statuses.set('lust', { amount: Math.floor(Math.random() * 129) });
  } else {
    castaway.statuses.set('lust', { amount: 64 + Math.floor(Math.random() * 65), cycleTimer: Math.floor(Math.random() * 4320) });
  }
  for (const actor of world.actors) {
    if (actor.statuses.has('npc')) continue;
    castaway.relations.push({ actorId: actor.id, friendship: 96 + Math.floor(Math.random() * 64), attraction: Math.floor(Math.random() * 80) });
    actor.relations.push({ actorId: castaway.id, friendship: 96 + Math.floor(Math.random() * 64), attraction: Math.floor(Math.random() * 80) });
  }
  world.actors.push(castaway);
  world.activityLog.push({ text: `${name}, a marooned castaway, joins the crew!`, time: world.time });
}

/**
 * Per-frame expedition tick. When the return time passes, bring the party back to the
 * deck (clear 'ashore'), roll an outcome, apply it, log it, and clear the marker on a
 * successful dig.
 */
export function updateExpedition(world: World, audio?: AudioManager): void {
  const exp = world.expedition;
  if (!exp) return;
  if (world.time < exp.returnTime) return;

  // Bring the party back (those still alive / aboard): reappear at the gangplank, on
  // the upper deck, so they don't pop back in wherever they happened to be standing.
  const gangplankX = DECK_X_SHIFT * TILE_SIZE + 2 * TILE_SIZE;
  const gangplankY = (DECK_Y_SHIFT + 8) * TILE_SIZE + TILE_SIZE / 2;
  const party = world.actors.filter(a => exp.crewIds.includes(a.id));
  for (const m of party) {
    m.statuses.delete('ashore');
    m.state = CrewState.IDLE;
    m.idleTimer = 0.5 + Math.random();
    m.path = [];
    m.deck = 1;
    m.pixelX = gangplankX;
    m.pixelY = gangplankY;
    m.facing = 'south';
  }

  const island = world.worldMap.islands.find(i => i.id === exp.islandId);
  const islandName = island?.name ?? 'the island';

  // Was the map that revealed this island fake? We can't know post-hoc; treat a marked
  // island as genuine for the dig (fake maps don't mark islands — see useMap). So digs
  // here are always "genuine map" rolls. We keep the fakeMap param for buyable trap maps
  // whose markers were never set, but those never reach here.
  const outcome = rollOutcome(party, false);

  if (party.length === 0) {
    // Everyone who went is gone (shouldn't normally happen) — just clear state.
    world.expedition = null;
    return;
  }

  switch (outcome) {
    case 'treasure': {
      const gold = 60 + Math.floor(Math.random() * 140);
      world.gold += gold;
      let extra = '';
      // Bonus loot rolls.
      if (Math.random() < 0.6) { awardItem(world, createGem(world.time), party); extra += ' a gem,'; }
      if (Math.random() < 0.35) { awardItem(world, createArtifact(world.time), party); extra += ' an artifact,'; }
      if (Math.random() < 0.2) {
        const cursed = createCursedItem(world.time);
        awardItem(world, cursed, party);
        extra += ` ${cursed.name.toLowerCase()} (cursed!),`;
      }
      const extraStr = extra ? ` Also recovered:${extra.replace(/,$/, '.')}` : '';
      world.activityLog.push({ text: `The shore party struck gold on ${islandName} — ${gold} gold!${extraStr}`, time: world.time });
      for (const m of party) { m.profile.morale = Math.min(255, m.profile.morale + 25); m.thoughtBubble = 'heart'; m.thoughtBubbleTimer = 4; }
      if (audio) audio.play('treasure_found', world.activeDeck);
      // Successful dig — clear the marker.
      world.treasureIslands.delete(exp.islandId);
      if (island) island.treasureMarker = false;
      break;
    }
    case 'rescue': {
      spawnCastaway(world);
      // Occasionally a small reward too.
      if (Math.random() < 0.4) {
        const gold = 20 + Math.floor(Math.random() * 40);
        world.gold += gold;
        world.activityLog.push({ text: `The castaway shared a hidden cache — ${gold} gold.`, time: world.time });
      }
      if (audio) audio.play('treasure_found', world.activeDeck);
      // The dig still uncovered the spot — clear the marker.
      world.treasureIslands.delete(exp.islandId);
      if (island) island.treasureMarker = false;
      break;
    }
    case 'trouble': {
      const victim = party[Math.floor(Math.random() * party.length)];
      const dmg = 20 + Math.floor(Math.random() * 30);
      victim.health = Math.max(1, victim.health - dmg);
      victim.statuses.set('injured', { severity: victim.health < 32 ? 2 : 1 });
      victim.speechBubbleText = 'Aargh — a trap!';
      victim.speechBubbleTimer = 3;
      world.activityLog.push({ text: `Disaster on ${islandName}! ${victim.profile.name} sprung a trap and was injured.`, time: world.time });
      // Marker stays — the treasure remains buried; they can try again.
      break;
    }
    case 'nothing':
    default: {
      world.activityLog.push({ text: `The shore party dug all over ${islandName} and found nothing. A wasted afternoon.`, time: world.time });
      for (const m of party) m.profile.morale = Math.max(0, m.profile.morale - 8);
      // Empty hole — clear the marker (there was nothing here after all).
      world.treasureIslands.delete(exp.islandId);
      if (island) island.treasureMarker = false;
      break;
    }
  }

  world.expedition = null;
}
