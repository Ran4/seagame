import { Actor, ActorType, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, Item, ActivityLogEntry, NIGHT_FEAR_MORALE_THRESHOLD, LANTERN_SAFE_RADIUS, WorldMap, World, SKILL_MASTERY, Corpse } from '../types';
import { findPath, findPathFlying } from '../pathfinding';
import { createSemen, createFish, FishKind } from '../items';
import { tryStartConversation, updateTalking, tickConversationCooldown } from '../conversation';
import { updateWalking, orderCrewBesideTile } from './movement';
import { DECK_X_SHIFT, DECK_Y_SHIFT, SHIP_WIDTH, SHIP_HEIGHT } from '../harbor';
import { tryExecuteCommand } from './commands';
import { trySeekLustPartner } from './lust';
import { LUST_ACTOR_TYPES } from './factory';
import { checkDeath } from './death';
import { AudioManager } from '../audio';

// Needs decay
const HUNGER_RATE = 0.7;
const ENERGY_RATE = 0.4;

// Morale
const MORALE_RATE = 0.3; // drift toward target per second
const NIGHT_FEAR_RATE = 1.0;
const DOG_MORALE_BONUS = 15; // added to morale target if friendly dog on same deck
const DOGHATER_PROXIMITY = 5; // tiles

// Social
const PET_FRIENDSHIP_GAIN = 2;

// Shanty singing
const SHANTY_MORALE_THRESHOLD = 160;
const SHANTY_MIN_SINGERS = 3;
const SHANTY_MAX_SINGERS = 5;
const SHANTY_CHANCE = 0.004;
const SHANTY_MORALE_GAIN = 10;
const SHANTY_FRIENDSHIP_GAIN = 5;
const SHANTY_COOLDOWN = 120;
const SHANTY_DEFAULT_DURATION = 30;

// Dancing
const DANCE_MORALE_THRESHOLD = 140;
const DANCE_MIN_DANCERS = 2;
const DANCE_CHANCE = 0.003;
const DANCE_DURATION = 15;
const DANCE_MORALE_GAIN = 8;
const DANCE_FRIENDSHIP_GAIN = 4;
const DANCE_COOLDOWN = 150;
const DANCE_LUST_GAIN = 10;
const DANCE_ATTRACTION_GAIN = 5;
const DANCE_ATTRACTION_RADIUS = 3;

function getDogMoraleAdj(member: Actor, crew: Actor[]): number {
  if (member.actorType !== 'human') return 0;
  const hasFriendlyDog = crew.some(c =>
    c.actorType === 'dog' && c.deck === member.deck &&
    (member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128
  );
  const hasNearbyUnfriendlyDog = member.conditions.has('doghater') && crew.some(c => {
    if (c.actorType !== 'dog' || c.deck !== member.deck) return false;
    if ((member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128) return false;
    const dx = (c.pixelX - member.pixelX) / TILE_SIZE;
    const dy = (c.pixelY - member.pixelY) / TILE_SIZE;
    return dx * dx + dy * dy <= DOGHATER_PROXIMITY * DOGHATER_PROXIMITY;
  });
  return (hasFriendlyDog ? DOG_MORALE_BONUS : 0) + (hasNearbyUnfriendlyDog ? -DOG_MORALE_BONUS : 0);
}

// Actor types that can do human work (steer, man cannons, navigate, etc.)
const WORK_ACTOR_TYPES: Set<ActorType> = new Set(['human']);

const ISLAND_SPOT_DISTANCE = 3;    // leagues
const ISLAND_SPOT_RESET = 16;      // leagues — clear spotted set when all islands are this far
const LAND_HO_MORALE_BOOST = 30;
const LAND_HO_SPEECH_DURATION = 6; // seconds

const ENERGY_RESTORE_RATE = 255 / 240; // full restore in ~240s (8 in-game hours)
const DRUNKEDNESS_RATE = 255 / 720;

// Fishing
const WARM_ISLAND_DISTANCE = 8;      // leagues — "near a warm island" for tropical fish
const DEEP_WATER_DISTANCE = 12;      // leagues — >this from any island counts as deep water
const SICK_DURATION = 720;           // pufferfish poisoning lasts ~1 in-game day
const SICK_VOMIT_INTERVAL = 90;      // average seconds between vomit speech bubbles
// Ship food supply: idle crew fish autonomously when edible items in barrels run low.
const LOW_FOOD_THRESHOLD = 3;        // fewer than this many edible units → consider fishing
const AUTO_FISH_CHANCE = 0.02;       // per idle decision, when food is low

// Drunk fighting (drunk crew with low mutual friendship may throw fists at sea)
const DRUNK_FIGHT_CHANCE = 0.001;       // ~0.1%/sec while a valid pair exists
const DRUNK_FIGHT_RANGE = 2;            // tiles
const DRUNK_FIGHT_FRIENDSHIP_MAX = 64;  // only low-friendship pairs fight
const DRUNK_FIGHT_FRIENDSHIP_LOSS = 20;
const DRUNK_FIGHT_MORALE_GAIN = 10;     // comedic — a good scrap lifts spirits
const DRUNK_FIGHT_MIN_HEALTH = 10;      // never lethal
const BRUISED_DURATION = 720;           // ~1 in-game day
const DRUNK_FIGHT_COOLDOWN = 120;       // seconds before the same pair refights
const LUST_RATE_MALE = 0.15;         // 0→255 in ~1700s (~2.4 days)
const LUST_RATE_FEMALE = 0.05;       // +108 over 3-day growth phase
const LUST_CYCLE_LENGTH = 6 * 720;   // 6 in-game days = 4320s

// Baby animals / reproduction (dogs & monkeys; parrots use eggs — not implemented)
const DAY = 720;                                  // SECONDS_PER_DAY (kept local to avoid import churn)
const GESTATION_DAYS: Partial<Record<ActorType, number>> = { dog: 2, monkey: 3 };
const LITTER_SIZE: Partial<Record<ActorType, [number, number]>> = { dog: [1, 5], monkey: [1, 1] };
const BABY_DURATION = 3 * DAY;                    // 'baby' status removed after 3 in-game days → adult
const POSTPARTUM_DURATION = 4 * DAY;              // lust cooldown after birth
const BABY_HUNGER_MULT = 1.5;                     // babies eat more often (hunger decays faster)
const BABY_FOLLOW_LEASH = TILE_SIZE * 2;          // tighter than the normal dog 2.5-tile leash
const BABY_PARENT_FRIENDSHIP = 224;               // baby → mother/father
const PARENT_BABY_FRIENDSHIP = 192;               // mother/father → baby
const BABY_START_STAT = 200;                      // hunger/energy at birth
const BABY_NAMES: Partial<Record<ActorType, string[]>> = {
  dog: ['Rex', 'Pip', 'Salty', 'Bones', 'Biscuit', 'Plank', 'Scupper', 'Rigger', 'Grog', 'Noodle'],
  monkey: ['Mango', 'Coconut', 'Rascal', 'Jib', 'Tango', 'Bandit'],
};
const BABY_ANIMAL_COLORS: Partial<Record<ActorType, string>> = { dog: '#f5f5dc', monkey: '#c68c53' };

// Monkey mischief: idle monkeys occasionally pinch an item and stash it elsewhere.
// Light, comedic, low-stakes — items are never destroyed, only relocated (recoverable).
const MISCHIEF_CHANCE = 0.01;             // per idle decision, when off cooldown
const MISCHIEF_COOLDOWN = 90;             // seconds before a monkey thieves again
const MISCHIEF_CARRY_TIME = 20;           // seconds a monkey carries loot before stashing
const MISCHIEF_STEAL_RANGE = 1;           // tiles — only pinch from a crew right beside it
const MISCHIEF_VICTIM_MORALE_DIP = 8;     // small morale hit for the robbed crew
// Items a monkey will not pinch (would soft-lock or just be gross).
const MISCHIEF_BLOCKED_ITEMS = new Set(['Semen']);
// "Shiny" items the monkey prefers to nick if present.
const MISCHIEF_SHINY_ITEMS = new Set(['Gem', 'Gemstone', 'Ruby', 'Pearl', 'Gold coin', 'Artifact']);
const MISCHIEF_THIEF_LINES = ['Ook ook!', 'Eee-eee!', '*chatters gleefully*', '*snatches and runs*'];
const MISCHIEF_STASH_LINES = ['*hides its loot*', 'Ook!', '*chitters*'];
const MISCHIEF_VICTIM_LINES = ["Where's me grog?!", 'Oi! Me things!', 'That blasted monkey!', 'Thief! Come back!'];

/**
 * Status/Conditions system.
 *
 * Two layers on each Actor:
 *   statuses  — Map<string, payload | null>.  Raw state, persisted.
 *              Permanent traits: statuses.set('dickless', null)
 *              Tracked values:  statuses.set('drunkedness', { amount: 180 })
 *
 *   conditions — Set<string>.  Rebuilt every tick by this function.
 *              Contains every raw status key PLUS derived conditions:
 *                'drunk'    — drunkedness.amount >= 128
 *                'tipsy'    — drunkedness.amount >= 64 (exclusive with drunk)
 *                'exhausted' — energy < 25 (sleeps even in daytime)
 *                'tired'    — energy < 60 (exclusive with exhausted)
 *                'starving' — hunger < 15
 *                'hungry'   — hunger < 70 (exclusive with starving)
 *
 * Game code should read conditions (not statuses) for behaviour checks.
 * Write to statuses when changing state; conditions update next tick.
 */
export function refreshConditions(member: Actor, crew: Actor[]): void {
  member.conditions.clear();
  // Copy raw status keys. This is what surfaces flag-style statuses as conditions —
  // e.g. 'pregnant', 'baby', 'postpartum' (animal reproduction) become readable
  // conditions (used for behaviour gating + the crew-panel tooltip) for free.
  for (const key of member.statuses.keys()) {
    member.conditions.add(key);
  }
  // Derived: drunkedness levels
  const drunkedness = (member.statuses.get('drunkedness') as { amount: number } | null)?.amount ?? 0;
  if (drunkedness >= 128) {
    member.conditions.add('drunk');
  } else if (drunkedness >= 64) {
    member.conditions.add('tipsy');
  }
  // Derived: lust levels
  const lustAmount = (member.statuses.get('lust') as { amount: number } | null)?.amount ?? 0;
  if (lustAmount > 160) member.conditions.add('lustful');
  // Derived: needs
  if (member.profile.energy < 25) member.conditions.add('exhausted');
  else if (member.profile.energy < 60) member.conditions.add('tired');
  if (member.profile.hunger < 15) member.conditions.add('starving');
  else if (member.profile.hunger < 70) member.conditions.add('hungry');
  // Derived: health
  if (member.health < 32) member.conditions.add('injured');
  // 'bruised' is a tracked status ({ since }) copied above; it expires ~1 in-game
  // day after a fist fight (see BRUISED_DURATION decay in updateActors).
  // Derived: morale levels
  if (member.profile.morale >= 192) member.conditions.add('happy');
  else if (member.profile.morale >= 128) member.conditions.add('content');
  else if (member.profile.morale < 32) member.conditions.add('mutinous');
  else if (member.profile.morale < 64) member.conditions.add('miserable');
  else if (member.profile.morale < 96) member.conditions.add('grumbling');
  // Derived: dog proximity
  if (member.actorType === 'human') {
    const hasFriendlyDog = crew.some(c =>
      c.actorType === 'dog' && c.deck === member.deck &&
      (member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128
    );
    if (hasFriendlyDog) member.conditions.add('near_friendly_dog');
    const hasNearbyUnfriendlyDog = member.conditions.has('doghater') && crew.some(c => {
      if (c.actorType !== 'dog' || c.deck !== member.deck) return false;
      if ((member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128) return false;
      const dx = (c.pixelX - member.pixelX) / TILE_SIZE;
      const dy = (c.pixelY - member.pixelY) / TILE_SIZE;
      return dx * dx + dy * dy <= DOGHATER_PROXIMITY * DOGHATER_PROXIMITY;
    });
    if (hasNearbyUnfriendlyDog) member.conditions.add('despises_nearby_dog');
  }
}

function getWalkableTiles(deck: Deck, deckIndex: number): DeckPoint[] {
  const tiles: DeckPoint[] = [];
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      if (WALKABLE.has(deck.tiles[y][x])) {
        tiles.push({ x, y, deck: deckIndex });
      }
    }
  }
  return tiles;
}

function findTilesOfType(decks: Deck[], type: TileType): DeckPoint[] {
  const results: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === type) {
          results.push({ x, y, deck: d });
        }
      }
    }
  }
  return results;
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function currentTile(member: Actor): DeckPoint {
  return {
    x: Math.floor(member.pixelX / TILE_SIZE),
    y: Math.floor(member.pixelY / TILE_SIZE),
    deck: member.deck,
  };
}

/** Can this actor access the given deck? Crow's nest (deck 0) requires climber status. */
function canAccessDeck(member: Actor, deckIndex: number): boolean {
  if (deckIndex === 0 && !member.statuses.has('climber')) return false;
  return true;
}

/** Distance (leagues) from the ship to the nearest island, or Infinity if no map.
 * Local approximation — a shared deep-water helper lands later with Storms. */
function shipDistanceToNearestIsland(worldMap?: WorldMap): number {
  if (!worldMap || worldMap.islands.length === 0) return Infinity;
  let best = Infinity;
  for (const island of worldMap.islands) {
    const dx = worldMap.shipX - island.x;
    const dy = worldMap.shipY - island.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}

/** Items in barrels that crew can eat (restore hunger). Counts stackable quantities.
 * Excludes Semen (a copulation by-product, not real provisions). */
function countEdibleSupply(barrelInventory: Map<string, Item[]>): number {
  let count = 0;
  for (const items of barrelInventory.values()) {
    for (const item of items) {
      if (item.hungerRestore > 0 && item.name !== 'Semen') count += item.stackable ? item.quantity : 1;
    }
  }
  return count;
}

/** Nearest barrel (deck-x-y) to the actor for depositing a catch. Prefers same deck. */
function findNearestBarrel(member: Actor, decks: Deck[]): DeckPoint | null {
  let best: DeckPoint | null = null;
  let bestScore = Infinity;
  const mx = Math.floor(member.pixelX / TILE_SIZE);
  const my = Math.floor(member.pixelY / TILE_SIZE);
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] !== TileType.BARREL) continue;
        const deckPenalty = d === member.deck ? 0 : 1000;
        const score = deckPenalty + Math.abs(x - mx) + Math.abs(y - my);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, deck: d };
        }
      }
    }
  }
  return best;
}

/** Pick which fish is caught based on where the ship currently is. */
function pickFishKind(worldMap?: WorldMap): FishKind {
  const distToIsland = shipDistanceToNearestIsland(worldMap);
  const roll = Math.random();
  // Deep water: chance of a rare swordfish
  if (distToIsland > DEEP_WATER_DISTANCE && roll < 0.15) return 'swordfish';
  // Near a warm island: chance of a tropical fish
  if (distToIsland <= WARM_ISLAND_DISTANCE && roll < 0.30) return 'tropical';
  // Pufferfish lurk in shallows near land
  if (distToIsland <= WARM_ISLAND_DISTANCE && roll < 0.40) return 'pufferfish';
  return 'common';
}

// ---------------------------------------------------------------------------
// Baby animals / reproduction (dogs & monkeys). Parrots (eggs) intentionally skipped.
// ---------------------------------------------------------------------------

/** True if this actor can carry a pregnancy / is a breedable animal type. */
function isBreedableAnimal(actorType: ActorType): boolean {
  return GESTATION_DAYS[actorType] !== undefined;
}

/**
 * On a successful same-species animal copulation, make one of the pair pregnant.
 * Chooses the female if the sexes differ, otherwise an arbitrary one. Skips if the
 * chosen mother is already pregnant or postpartum, or if the species is not breedable.
 */
function tryConceive(a: Actor, b: Actor, gameTime: number, activityLog: ActivityLogEntry[]): void {
  if (a.actorType !== b.actorType) return;
  if (!isBreedableAnimal(a.actorType)) return;
  // Pick the mother: female if sexes differ, else arbitrary.
  let mother = a;
  let father = b;
  if (a.profile.sex !== b.profile.sex) {
    if (a.profile.sex === 'F') { mother = a; father = b; }
    else { mother = b; father = a; }
  }
  if (mother.statuses.has('pregnant') || mother.statuses.has('postpartum')) return;
  mother.statuses.set('pregnant', { fatherId: father.id, since: gameTime, animalType: mother.actorType });
  activityLog.push({ text: `${mother.profile.name} is expecting a litter`, time: gameTime });
}

/** Find a walkable tile at/adjacent to the mother (same deck) for a newborn to spawn on. */
function findBirthTile(mother: Actor, decks: Deck[]): DeckPoint | null {
  const deck = decks[mother.deck];
  if (!deck) return null;
  const mx = Math.floor(mother.pixelX / TILE_SIZE);
  const my = Math.floor(mother.pixelY / TILE_SIZE);
  const candidates: DeckPoint[] = [
    { x: mx, y: my, deck: mother.deck },
    { x: mx, y: my - 1, deck: mother.deck },
    { x: mx, y: my + 1, deck: mother.deck },
    { x: mx - 1, y: my, deck: mother.deck },
    { x: mx + 1, y: my, deck: mother.deck },
  ];
  for (const c of candidates) {
    if (c.x < 0 || c.y < 0 || c.x >= deck.width || c.y >= deck.height) continue;
    if (!WALKABLE.has(deck.tiles[c.y][c.x])) continue;
    return c;
  }
  return null;
}

/** Build a newborn animal actor (mirrors recruitSailor's full Actor shape). */
function createBabyAnimal(
  id: number, actorType: ActorType, mother: Actor, fatherId: number,
  spawnTile: DeckPoint, gameTime: number, crew: Actor[],
): Actor {
  const sex: 'M' | 'F' = Math.random() < 0.5 ? 'M' : 'F';
  const usedNames = new Set(crew.map(a => a.profile.name));
  const pool = BABY_NAMES[actorType] ?? ['Pup'];
  let name = pool[Math.floor(Math.random() * pool.length)];
  for (const n of pool) { if (!usedNames.has(n)) { name = n; break; } }
  const color = BABY_ANIMAL_COLORS[actorType] ?? '#cccccc';

  const baby: Actor = {
    id,
    actorType,
    profile: {
      name, sex, color,
      spriteIndex: id,
      numberOfHands: 0,
      hunger: BABY_START_STAT,
      energy: BABY_START_STAT,
      morale: 200,
      inventory: [],
      hands: [],
    },
    health: 50,
    maxHealth: 50,
    carryingCorpseId: null,
    statuses: new Map<string, Record<string, any> | null>(),
    conditions: new Set(),
    skills: {},
    pixelX: spawnTile.x * TILE_SIZE + TILE_SIZE / 2,
    pixelY: spawnTile.y * TILE_SIZE + TILE_SIZE / 2,
    facing: 'south',
    deck: spawnTile.deck,
    state: CrewState.IDLE,
    targetState: CrewState.IDLE,
    path: [],
    stateTimer: 0,
    idleTimer: 1 + Math.random() * 2,
    copulationTarget: null,
    relations: [],
    thoughtBubble: null,
    thoughtBubbleTimer: 0,
    conversationPartnerId: null,
    conversationExchangesLeft: 0,
    conversationPositive: true,
    conversationScript: [],
    conversationCooldown: 0,
    conversationMyTurn: false,
    speechBubbleText: null,
    speechBubbleTimer: 0,
    takeTarget: null,
    consumingItem: null,
    lustSeekCooldown: 0,
    commandQueue: [],
    shantyInitiatorId: null,
  };

  // Newborn status. mother/father ids recorded so behaviour/leash can find them.
  baby.statuses.set('baby', { since: gameTime, motherId: mother.id, fatherId });
  // Non-dogs climb; dogs do not (matches factory). No lust while a baby (added on growth).
  if (actorType !== 'dog') baby.statuses.set('climber', { skill: 128 });

  // Relations — bidirectional, with every existing (non-NPC) actor.
  for (const other of crew) {
    if (other.statuses.has('npc')) continue;
    const isParent = other.id === mother.id || other.id === fatherId;
    const babyToOther = isParent ? BABY_PARENT_FRIENDSHIP : 64 + Math.floor(Math.random() * 128);
    const otherToBaby = isParent ? PARENT_BABY_FRIENDSHIP : 64 + Math.floor(Math.random() * 128);
    const sameSpecies = other.actorType === actorType;
    baby.relations.push({ actorId: other.id, friendship: babyToOther, attraction: sameSpecies ? Math.floor(Math.random() * 80) : 0 });
    other.relations.push({ actorId: baby.id, friendship: otherToBaby, attraction: sameSpecies ? Math.floor(Math.random() * 80) : 0 });
  }
  return baby;
}

/**
 * Per-actor breeding tick: gestation → birth, baby growth, postpartum cooldown.
 * Newborns are pushed onto `crew` (and world.actors via the same array). The caller's
 * loop iterates backwards, so newborns appended this tick are not processed until next.
 */
function updateBreeding(member: Actor, crew: Actor[], decks: Deck[], gameTime: number, activityLog: ActivityLogEntry[], world?: World): void {
  // --- Baby growth: become an adult after BABY_DURATION ---
  const babyStatus = member.statuses.get('baby') as { since: number } | undefined;
  if (babyStatus && gameTime - babyStatus.since >= BABY_DURATION) {
    member.statuses.delete('baby');
    // Grant adult lust now that the baby has grown up (matches factory init).
    if (LUST_ACTOR_TYPES.has(member.actorType) && !member.statuses.has('lust')) {
      if (member.profile.sex === 'M') {
        member.statuses.set('lust', { amount: Math.floor(Math.random() * 129) });
      } else {
        member.statuses.set('lust', { amount: 64 + Math.floor(Math.random() * 65), cycleTimer: Math.floor(Math.random() * LUST_CYCLE_LENGTH) });
      }
    }
    activityLog.push({ text: `${member.profile.name} has grown up`, time: gameTime });
  }

  // --- Postpartum cooldown expiry ---
  const ppStatus = member.statuses.get('postpartum') as { since: number } | undefined;
  if (ppStatus && gameTime - ppStatus.since >= POSTPARTUM_DURATION) {
    member.statuses.delete('postpartum');
  }

  // --- Gestation → birth ---
  const pregnant = member.statuses.get('pregnant') as { fatherId: number; since: number; animalType: ActorType } | undefined;
  if (pregnant) {
    const gestDays = GESTATION_DAYS[pregnant.animalType] ?? 2;
    if (gameTime - pregnant.since >= gestDays * DAY) {
      const spawnTile = findBirthTile(member, decks);
      if (!spawnTile) return; // no room — retry next tick (keep pregnant status)
      member.statuses.delete('pregnant');
      // Mother enters postpartum, lust zeroed.
      member.statuses.set('postpartum', { since: gameTime });
      const motherLust = member.statuses.get('lust') as { amount: number } | undefined;
      if (motherLust) motherLust.amount = 0;

      const [lo, hi] = LITTER_SIZE[pregnant.animalType] ?? [1, 1];
      const litter = lo + Math.floor(Math.random() * (hi - lo + 1));
      let maxId = 0;
      for (const a of crew) { if (a.id > maxId) maxId = a.id; }
      for (let i = 0; i < litter; i++) {
        const baby = createBabyAnimal(maxId + 1 + i, pregnant.animalType, member, pregnant.fatherId, spawnTile, gameTime, crew);
        crew.push(baby);
        if (world && world.actors !== crew) world.actors.push(baby);
      }
      const noun = pregnant.animalType === 'dog' ? (litter === 1 ? 'a puppy' : `${litter} puppies`) : 'a baby monkey';
      activityLog.push({ text: `${member.profile.name} gave birth to ${noun}!`, time: gameTime });
    }
  }
}

// ---------------------------------------------------------------------------
// Monkey mischief: idle monkeys pinch an item and stash it somewhere random.
// Emergent, comedic, low-stakes. Items are relocated, never destroyed.
// State lives in statuses: 'thief' { item, since, victimName? } while carrying,
// 'mischiefCooldown' { until } to space out thieving.
// ---------------------------------------------------------------------------

/** Can a monkey pinch this item? Excludes blocked/gross items. */
function isStealableItem(item: Item): boolean {
  return !MISCHIEF_BLOCKED_ITEMS.has(item.name);
}

/** Pick the index of the "best" item to steal from a list — prefers shiny loot. */
function pickStealIndex(items: Item[]): number {
  let shinyIdx = -1;
  let anyIdx = -1;
  for (let i = 0; i < items.length; i++) {
    if (!isStealableItem(items[i])) continue;
    if (anyIdx === -1) anyIdx = i;
    if (MISCHIEF_SHINY_ITEMS.has(items[i].name)) { shinyIdx = i; break; }
  }
  return shinyIdx !== -1 ? shinyIdx : anyIdx;
}

/** Remove one unit of items[idx] and return it as a standalone Item (splits stacks). */
function takeOneUnit(items: Item[], idx: number): Item {
  const src = items[idx];
  if (src.stackable && src.quantity > 1) {
    src.quantity -= 1;
    src.weight = Math.max(0, src.weight - Math.round(src.weight / (src.quantity + 1)));
    return { ...src, quantity: 1 };
  }
  return items.splice(idx, 1)[0];
}

/**
 * A monkey carrying loot ('thief' status) stashes it: into a random barrel, or
 * dropped onto the floor (its own inventory) if no barrel is reachable. Clears
 * the status and starts the mischief cooldown.
 */
function monkeyStashLoot(member: Actor, decks: Deck[], barrelInventory: Map<string, Item[]>, gameTime: number, activityLog: ActivityLogEntry[], audio?: AudioManager): void {
  const thief = member.statuses.get('thief') as { item: Item; since: number } | undefined;
  if (!thief) return;
  const item = thief.item;
  // Pick a random barrel to stash into (any deck), else drop on the monkey's own tile.
  const barrels = findTilesOfType(decks, TileType.BARREL);
  const barrel = pickRandom(barrels);
  if (barrel) {
    const key = `${barrel.deck}-${barrel.x}-${barrel.y}`;
    const items = barrelInventory.get(key) || [];
    if (item.stackable) {
      const existing = items.find(i => i.name === item.name && i.stackable);
      if (existing) { existing.quantity += item.quantity; existing.weight += item.weight; }
      else items.push(item);
    } else {
      items.push(item);
    }
    barrelInventory.set(key, items);
    activityLog.push({ text: `${member.profile.name} stashed a pilfered ${item.name.toLowerCase()} in a barrel`, time: gameTime });
  } else {
    // Nowhere to hide it — drop it (held in the monkey's own inventory as "dropped" goods).
    member.profile.inventory.push(item);
    activityLog.push({ text: `${member.profile.name} dropped a pilfered ${item.name.toLowerCase()}`, time: gameTime });
  }
  member.statuses.delete('thief');
  member.statuses.set('mischiefCooldown', { until: gameTime + MISCHIEF_COOLDOWN });
  member.speechBubbleText = MISCHIEF_STASH_LINES[Math.floor(Math.random() * MISCHIEF_STASH_LINES.length)];
  member.speechBubbleTimer = 3;
  member.thoughtBubble = 'mischief';
  member.thoughtBubbleTimer = 3;
  if (audio) audio.play('monkey_mischief', member.deck);
}

/**
 * Idle-monkey mischief. Returns true if the monkey took an action this tick
 * (so the caller should not fall through to normal wander logic).
 * Two phases: stash whatever it carries (after a delay), or pinch something new.
 */
function tryMonkeyMischief(member: Actor, decks: Deck[], allActors: Actor[], barrelInventory: Map<string, Item[]>, gameTime: number, activityLog: ActivityLogEntry[], audio?: AudioManager): boolean {
  // Phase 1: already carrying loot → stash it once the carry timer elapses.
  const thief = member.statuses.get('thief') as { item: Item; since: number } | undefined;
  if (thief) {
    if (gameTime - thief.since >= MISCHIEF_CARRY_TIME) {
      monkeyStashLoot(member, decks, barrelInventory, gameTime, activityLog, audio);
    } else {
      // Still scampering about with the loot — keep a cheeky bubble up, then wander.
      if (Math.random() < 0.2) { member.thoughtBubble = 'mischief'; member.thoughtBubbleTimer = 2; }
      return false; // fall through to normal wandering while carrying
    }
    return true;
  }

  // Phase 2: maybe start a new theft (gated by cooldown + a small chance).
  const cd = member.statuses.get('mischiefCooldown') as { until: number } | undefined;
  if (cd) {
    if (gameTime < cd.until) return false;
    member.statuses.delete('mischiefCooldown');
  }
  if (Math.random() >= MISCHIEF_CHANCE) return false;

  const mx = Math.floor(member.pixelX / TILE_SIZE);
  const my = Math.floor(member.pixelY / TILE_SIZE);

  // Prefer pinching from a crew member standing right beside the monkey (funnier).
  const victims = allActors.filter(c =>
    c.id !== member.id && c.actorType === 'human' && !c.statuses.has('npc') &&
    c.deck === member.deck && c.profile.inventory.some(isStealableItem) &&
    Math.abs(Math.floor(c.pixelX / TILE_SIZE) - mx) + Math.abs(Math.floor(c.pixelY / TILE_SIZE) - my) <= MISCHIEF_STEAL_RANGE
  );
  const victim = pickRandom(victims);
  if (victim) {
    const idx = pickStealIndex(victim.profile.inventory);
    if (idx !== -1) {
      const item = takeOneUnit(victim.profile.inventory, idx);
      member.statuses.set('thief', { item, since: gameTime, victimName: victim.profile.name });
      member.speechBubbleText = MISCHIEF_THIEF_LINES[Math.floor(Math.random() * MISCHIEF_THIEF_LINES.length)];
      member.speechBubbleTimer = 3;
      member.thoughtBubble = 'mischief';
      member.thoughtBubbleTimer = 3;
      // Victim is annoyed: small morale dip + a grumble.
      victim.profile.morale = Math.max(0, victim.profile.morale - MISCHIEF_VICTIM_MORALE_DIP);
      victim.speechBubbleText = MISCHIEF_VICTIM_LINES[Math.floor(Math.random() * MISCHIEF_VICTIM_LINES.length)];
      victim.speechBubbleTimer = 3;
      activityLog.push({ text: `${member.profile.name} the monkey snatched ${victim.profile.name}'s ${item.name.toLowerCase()}!`, time: gameTime });
      if (audio) audio.play('monkey_mischief', member.deck);
      return true;
    }
  }

  // Otherwise raid a barrel that has loot in it.
  const stockedBarrels: { tile: DeckPoint; items: Item[] }[] = [];
  for (const tile of findTilesOfType(decks, TileType.BARREL)) {
    const items = barrelInventory.get(`${tile.deck}-${tile.x}-${tile.y}`);
    if (items && items.some(isStealableItem)) stockedBarrels.push({ tile, items });
  }
  const pick = pickRandom(stockedBarrels);
  if (pick) {
    const idx = pickStealIndex(pick.items);
    if (idx !== -1) {
      const item = takeOneUnit(pick.items, idx);
      const key = `${pick.tile.deck}-${pick.tile.x}-${pick.tile.y}`;
      if (pick.items.length === 0) barrelInventory.delete(key); else barrelInventory.set(key, pick.items);
      member.statuses.set('thief', { item, since: gameTime });
      member.speechBubbleText = MISCHIEF_THIEF_LINES[Math.floor(Math.random() * MISCHIEF_THIEF_LINES.length)];
      member.speechBubbleTimer = 3;
      member.thoughtBubble = 'mischief';
      member.thoughtBubbleTimer = 3;
      activityLog.push({ text: `${member.profile.name} the monkey raided a barrel and made off with a ${item.name.toLowerCase()}!`, time: gameTime });
      if (audio) audio.play('monkey_mischief', member.deck);
      return true;
    }
  }

  // Nothing to pinch — short cooldown so it doesn't re-roll every tick.
  member.statuses.set('mischiefCooldown', { until: gameTime + MISCHIEF_COOLDOWN / 3 });
  return false;
}

export function updateActors(crew: Actor[], decks: Deck[], dt: number, barrelInventory: Map<string, Item[]>, gameTime: number, lanternOil: Map<string, number> = new Map(), brightness: number = 1.0, activityLog: ActivityLogEntry[] = [], worldMap?: WorldMap, spottedIslands?: Set<number>, world?: World, audio?: AudioManager): void {
  // Reset spotted islands when ship moves far from all spotted islands
  if (worldMap && spottedIslands && spottedIslands.size > 0) {
    let allFar = true;
    for (const islandId of spottedIslands) {
      const island = worldMap.islands.find(i => i.id === islandId);
      if (island) {
        const dx = worldMap.shipX - island.x;
        const dy = worldMap.shipY - island.y;
        if (Math.sqrt(dx * dx + dy * dy) < ISLAND_SPOT_RESET) {
          allFar = false;
          break;
        }
      }
    }
    if (allFar) spottedIslands.clear();
  }

  for (let ci = crew.length - 1; ci >= 0; ci--) {
    const member = crew[ci];
    const isNPC = member.statuses.has('npc');

    // NPCs don't decay needs
    if (!isNPC) {
    // Babies grow fast → burn through hunger quicker (eat more often)
    const hungerRate = member.conditions.has('baby') ? HUNGER_RATE * BABY_HUNGER_MULT : HUNGER_RATE;
    member.profile.hunger = Math.max(0, member.profile.hunger - hungerRate * dt);
    member.profile.energy = Math.max(0, member.profile.energy - ENERGY_RATE * dt);

    // Drunkedness decay via statuses
    const drunkStatus = member.statuses.get('drunkedness') as { amount: number } | undefined;
    if (drunkStatus) {
      drunkStatus.amount = Math.max(0, drunkStatus.amount - DRUNKEDNESS_RATE * dt);
      if (drunkStatus.amount <= 0) member.statuses.delete('drunkedness');
    }

    // Bruised expiry — fades ~1 in-game day after a fist fight
    const bruisedStatus = member.statuses.get('bruised') as { since: number } | undefined;
    if (bruisedStatus && gameTime - bruisedStatus.since >= BRUISED_DURATION) {
      member.statuses.delete('bruised');
    }

    // Sick expiry — pufferfish poisoning clears ~1 in-game day after eating it
    const sickStatus = member.statuses.get('sick') as { since: number } | undefined;
    if (sickStatus && gameTime - sickStatus.since >= SICK_DURATION) {
      member.statuses.delete('sick');
      activityLog.push({ text: `${member.profile.name} recovered from sickness`, time: gameTime });
    }

    // Lust tick
    const lustStatus = member.statuses.get('lust') as { amount: number; cycleTimer?: number } | undefined;
    if (lustStatus) {
      if (member.profile.sex === 'M') {
        lustStatus.amount = Math.min(255, lustStatus.amount + LUST_RATE_MALE * dt);
      } else {
        // Women's cycle: 6-day period, first half grows, second half decays
        lustStatus.cycleTimer = ((lustStatus.cycleTimer ?? 0) + dt) % LUST_CYCLE_LENGTH;
        if (lustStatus.cycleTimer < LUST_CYCLE_LENGTH / 2) {
          lustStatus.amount = Math.min(255, lustStatus.amount + LUST_RATE_FEMALE * dt);
        } else {
          lustStatus.amount = Math.max(0, lustStatus.amount - LUST_RATE_FEMALE * dt);
        }
      }
    }

    // Tick lust seek cooldown
    if (member.lustSeekCooldown > 0) {
      member.lustSeekCooldown = Math.max(0, member.lustSeekCooldown - dt);
    }

    // Morale tick — drift toward target derived from needs/relations
    // TODO: combat victory bonus
    // TODO: storm survival / loot share / idle boredom
    {
      const hungerContrib = member.profile.hunger;
      const energyContrib = member.profile.energy;
      let avgFriendship = 128;
      if (member.relations.length > 0) {
        let sum = 0;
        for (const r of member.relations) sum += r.friendship;
        avgFriendship = sum / member.relations.length;
      }
      const dogMoraleAdj = getDogMoraleAdj(member, crew);
      const injuryPenalty = member.conditions.has('injured') ? -40 : 0;
      // Harbor morale boost: +20 when docked at harbor
      const harborBonus = (world?.docking?.phase === 'docked') ? 20 : 0;
      const target = Math.min(255, Math.max(0, (hungerContrib + energyContrib + avgFriendship) / 3 + dogMoraleAdj + injuryPenalty + harborBonus));
      const diff = target - member.profile.morale;
      const step = MORALE_RATE * dt;
      if (Math.abs(diff) < step) {
        member.profile.morale = target;
      } else {
        member.profile.morale += Math.sign(diff) * step;
      }

      // Night fear: crew lose extra morale in the dark when not near a lit lantern
      if (brightness < 0.5 && member.profile.morale < NIGHT_FEAR_MORALE_THRESHOLD) {
        const mx = Math.floor(member.pixelX / TILE_SIZE);
        const my = Math.floor(member.pixelY / TILE_SIZE);
        let nearLitLantern = false;
        for (const [key, oil] of lanternOil) {
          if (oil <= 0) continue;
          const prefix = `${member.deck}-`;
          if (!key.startsWith(prefix)) continue;
          const parts = key.slice(prefix.length).split('-');
          const lx = parseInt(parts[0]);
          const ly = parseInt(parts[1]);
          if (Math.abs(mx - lx) + Math.abs(my - ly) <= LANTERN_SAFE_RADIUS) {
            nearLitLantern = true;
            break;
          }
        }
        if (!nearLitLantern) {
          member.profile.morale = Math.max(0, member.profile.morale - NIGHT_FEAR_RATE * dt);
        }
      }
    }

    // Starvation health drain
    if (member.conditions.has('starving')) {
      const starvDmg = (member.maxHealth / 400) * dt;
      const wasFull = member.health >= member.maxHealth;
      member.health = Math.max(0, member.health - starvDmg);
      if (wasFull) {
        activityLog.push({ text: `${member.profile.name} is losing health due to starvation!`, time: gameTime });
      }
      // Occasional complaint (every ~120s on average)
      if (Math.random() < dt / 120) {
        const complaints = [
          'I\'m starving...', 'Need food...', 'So hungry...',
          'Me belly is empty!', 'I\'ll waste away...', 'Feed me, for pity\'s sake!',
        ];
        member.speechBubbleText = complaints[Math.floor(Math.random() * complaints.length)];
        member.speechBubbleTimer = 3;
      }
    }
    } // end if (!isNPC) — NPCs skip needs decay, morale, starvation

    // Reproduction: gestation/birth, baby growth, postpartum cooldown (dogs & monkeys)
    if (!isNPC) updateBreeding(member, crew, decks, gameTime, activityLog, world);

    refreshConditions(member, crew);

    // Death check — remove actor if health <= 0 (not NPCs)
    if (!isNPC && world && checkDeath(world, member)) continue;

    tickConversationCooldown(member, dt);

    // Tick down thought bubble
    if (member.thoughtBubble) {
      member.thoughtBubbleTimer -= dt;
      if (member.thoughtBubbleTimer <= 0) {
        member.thoughtBubble = null;
        member.thoughtBubbleTimer = 0;
      }
    }

    // Tick down non-conversation speech bubbles (NPC ambient lines, starvation complaints)
    if (member.speechBubbleText && member.state !== CrewState.TALKING) {
      member.speechBubbleTimer -= dt;
      if (member.speechBubbleTimer <= 0) {
        member.speechBubbleText = null;
        member.speechBubbleTimer = 0;
      }
    }

    // Sick (pufferfish poisoning): can't work. Eject from work states, retch
    // periodically. Eating/sleeping/drinking are allowed so they can recover.
    if (member.conditions.has('sick') && !isNPC) {
      const SICK_BLOCKED_STATES = new Set<CrewState>([
        CrewState.STEERING, CrewState.MANNING_CANNON, CrewState.NAVIGATING,
        CrewState.LOOKOUT, CrewState.FISHING, CrewState.LIGHTING_LANTERN,
        CrewState.EXTINGUISHING_LANTERN, CrewState.CARRYING_CORPSE, CrewState.BURYING_AT_SEA,
      ]);
      if (SICK_BLOCKED_STATES.has(member.state) ||
          (member.state === CrewState.WALKING && SICK_BLOCKED_STATES.has(member.targetState))) {
        member.path = [];
        member.copulationTarget = null;
        member.commandQueue.length = 0; // drop the order — too sick to carry it out
        member.state = CrewState.IDLE;
        member.idleTimer = 1 + Math.random() * 2;
      }
      // Occasional vomit (every ~SICK_VOMIT_INTERVAL seconds on average)
      if (Math.random() < dt / SICK_VOMIT_INTERVAL) {
        const retches = ['*vomits*', 'Bleurgh...', 'I feel awful...', '*retches over the side*', 'Me guts...'];
        member.speechBubbleText = retches[Math.floor(Math.random() * retches.length)];
        member.speechBubbleTimer = 3;
      }
    }

    switch (member.state) {
      case CrewState.IDLE:
        updateIdle(member, decks, dt, crew, lanternOil, brightness, activityLog, gameTime, world, audio);
        break;
      case CrewState.WALKING:
        updateWalking(member, dt, crew, brightness, barrelInventory, decks);
        break;
      case CrewState.EATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          if (member.actorType === 'human') member.skills.cooking = Math.min(255, (member.skills.cooking ?? 0) + 4);
          const hungerRestore = (member.actorType === 'human' && (member.skills.cooking ?? 0) >= SKILL_MASTERY) ? 270 : 180;
          member.profile.hunger = Math.min(255, member.profile.hunger + hungerRestore);
          activityLog.push({ text: `${member.profile.name} finished eating`, time: gameTime });
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.SLEEPING:
        member.profile.energy = Math.min(255, member.profile.energy + ENERGY_RESTORE_RATE * dt);
        if (member.profile.energy >= 255) {
          activityLog.push({ text: `${member.profile.name} woke up`, time: gameTime });
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.STEERING:
        if (member.actorType === 'human') member.skills.sailing = Math.min(255, (member.skills.sailing ?? 0) + 0.05 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.MANNING_CANNON:
        if (member.actorType === 'human') member.skills.gunnery = Math.min(255, (member.skills.gunnery ?? 0) + 0.2 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.NAVIGATING:
        if (member.actorType === 'human') member.skills.navigation = Math.min(255, (member.skills.navigation ?? 0) + 0.05 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LOOKOUT:
        member.stateTimer -= dt;
        // Tick speech bubble (updateTalking only runs for TALKING state)
        if (member.speechBubbleTimer > 0) {
          member.speechBubbleTimer -= dt;
          if (member.speechBubbleTimer <= 0) {
            member.speechBubbleText = null;
            member.speechBubbleTimer = 0;
          }
        }
        if (worldMap && spottedIslands) {
          checkForIslandSpotting(member, crew, worldMap, spottedIslands, activityLog, gameTime);
        }
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LIGHTING_LANTERN:
      case CrewState.EXTINGUISHING_LANTERN:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          // Find the lantern tile adjacent to this crew member
          const ct = currentTile(member);
          const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]];
          for (const [dx, dy] of DIRS) {
            const lx = ct.x + dx;
            const ly = ct.y + dy;
            if (ly >= 0 && ly < decks[ct.deck].height && lx >= 0 && lx < decks[ct.deck].width) {
              if (decks[ct.deck].tiles[ly][lx] === TileType.LANTERN) {
                const key = `${ct.deck}-${lx}-${ly}`;
                lanternOil.set(key, member.state === CrewState.LIGHTING_LANTERN ? 100 : 0);
                break;
              }
            }
          }
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.KISSING:
        member.stateTimer -= dt;
        // Pull in crew partner on first frame
        if (member.copulationTarget?.type === 'crew') {
          const target = member.copulationTarget;
          const partner = crew.find(c => c.id === target.actorId);
          if (partner && partner.state !== CrewState.KISSING) {
            partner.state = CrewState.KISSING;
            partner.stateTimer = member.stateTimer;
            partner.copulationTarget = { type: 'crew', actorId: member.id };
            partner.path = [];
          }
          // Slow lean-in: both drift toward each other until ~6px apart
          if (partner && partner.state === CrewState.KISSING) {
            const kdx = partner.pixelX - member.pixelX;
            const kdy = partner.pixelY - member.pixelY;
            const kdist = Math.sqrt(kdx * kdx + kdy * kdy);
            if (kdist > 8) {
              const lean = Math.min(20 * dt, (kdist - 8) / 2);
              member.pixelX += (kdx / kdist) * lean;
              member.pixelY += (kdy / kdist) * lean;
              partner.pixelX -= (kdx / kdist) * lean;
              partner.pixelY -= (kdy / kdist) * lean;
            }
          }
        }
        if (member.stateTimer <= 0) {
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const partner = crew.find(c => c.id === target.actorId);
            if (partner) {
              const myRelation = member.relations.find(r => r.actorId === partner.id);
              const theirRelation = partner.relations.find(r => r.actorId === member.id);
              if (myRelation && theirRelation) {
                if ((myRelation.attraction >= 64) && (theirRelation.attraction >= 64)) {
                  // Both attracted — positive kiss
                  myRelation.attraction = Math.min(255, myRelation.attraction + 32);
                  theirRelation.attraction = Math.min(255, theirRelation.attraction + 32);
                  member.thoughtBubble = 'heart';
                  member.thoughtBubbleTimer = 3;
                  activityLog.push({ text: `${member.profile.name} kissed ${partner.profile.name}`, time: gameTime });
                } else {
                  // Unwelcome kiss — negative outcome
                  myRelation.attraction = Math.max(0, myRelation.attraction - 32);
                  myRelation.friendship = Math.max(0, myRelation.friendship - 32);
                  theirRelation.attraction = Math.max(0, theirRelation.attraction - 32);
                  theirRelation.friendship = Math.max(0, theirRelation.friendship - 32);
                  member.thoughtBubble = 'broken_heart';
                  member.thoughtBubbleTimer = 3;
                  activityLog.push({ text: `${member.profile.name} kissed ${partner.profile.name} (unwelcome)`, time: gameTime });
                }
                // Kiss boosts lust for both
                const myLust = member.statuses.get('lust') as { amount: number } | undefined;
                if (myLust) myLust.amount = Math.min(255, myLust.amount + 20);
                const partnerLust = partner.statuses.get('lust') as { amount: number } | undefined;
                if (partnerLust) partnerLust.amount = Math.min(255, partnerLust.amount + 20);
              }
              if (partner.state === CrewState.KISSING) {
                partner.state = CrewState.IDLE;
                partner.idleTimer = 1 + Math.random() * 2;
                partner.copulationTarget = null;
              }
            }
          }
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.COPULATING:
        member.profile.energy = Math.max(0, member.profile.energy - 4.0 * dt);
        member.stateTimer -= dt;
        // Pull in crew partner on first frame
        if (member.copulationTarget?.type === 'crew') {
          const target = member.copulationTarget;
          const partner = crew.find(c => c.id === target.actorId);
          if (partner && partner.state !== CrewState.COPULATING) {
            partner.state = CrewState.COPULATING;
            partner.stateTimer = member.stateTimer;
            partner.copulationTarget = { type: 'crew', actorId: member.id };
            partner.path = [];
          }
        }
        if (member.stateTimer <= 0) {
          // Male + barrel → produce semen
          if (member.profile.sex === 'M' && member.copulationTarget?.type === 'barrel') {
            const t = member.copulationTarget;
            const key = `${t.deck}-${t.x}-${t.y}`;
            const items = barrelInventory.get(key) || [];
            const existing = items.find(i => i.name === 'Semen' && i.stackable);
            if (existing) {
              existing.quantity += 1;
              existing.weight += 5;
            } else {
              items.push(createSemen(gameTime));
            }
            barrelInventory.set(key, items);
          }
          // Reduce lust after copulation
          const copLust = member.statuses.get('lust') as { amount: number } | undefined;
          if (copLust) copLust.amount = Math.max(0, copLust.amount - 128);
          // End partner's copulation
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const partner = crew.find(c => c.id === target.actorId);
            if (partner && partner.state === CrewState.COPULATING) {
              const partnerCopLust = partner.statuses.get('lust') as { amount: number } | undefined;
              if (partnerCopLust) partnerCopLust.amount = Math.max(0, partnerCopLust.amount - 128);
              partner.state = CrewState.IDLE;
              partner.idleTimer = 1 + Math.random() * 2;
              partner.copulationTarget = null;
            }
            activityLog.push({ text: `${member.profile.name} copulated with ${partner?.profile.name ?? 'someone'}`, time: gameTime });
            // Animal conception: same-species animal couple → mother becomes pregnant
            if (partner) tryConceive(member, partner, gameTime, activityLog);
          } else if (member.copulationTarget?.type === 'barrel') {
            activityLog.push({ text: `${member.profile.name} copulated with a barrel`, time: gameTime });
          }
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.DRINKING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          if (member.consumingItem) {
            const verb = (member.consumingItem.hungerRestore > 0 && member.consumingItem.name !== 'Grog ration') ? 'ate' : 'drank';
            activityLog.push({ text: `${member.profile.name} ${verb} ${member.consumingItem.name.toLowerCase()}`, time: gameTime });
            if (member.consumingItem.name === 'Grog ration') {
              const cur = (member.statuses.get('drunkedness') as { amount: number } | undefined)?.amount ?? 0;
              member.statuses.set('drunkedness', { amount: Math.min(255, cur + 140) });
              member.profile.morale = Math.min(255, member.profile.morale + 20);
            }
            if (member.consumingItem.hungerRestore > 0) {
              member.profile.hunger = Math.min(255, member.profile.hunger + member.consumingItem.hungerRestore);
            }
            // Pufferfish poisoning: eating it makes the crew sick for ~1 in-game day.
            if (member.consumingItem.name === 'Pufferfish') {
              member.statuses.set('sick', { since: gameTime });
              member.profile.morale = Math.max(0, member.profile.morale - 20);
              member.speechBubbleText = 'Ugh... bad fish...';
              member.speechBubbleTimer = 3;
              activityLog.push({ text: `${member.profile.name} fell ill from eating pufferfish!`, time: gameTime });
            }
            member.consumingItem = null;
          }
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.TALKING:
        updateTalking(member, crew, dt, brightness);
        break;
      case CrewState.PETTING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          // Apply friendship gains to both petter and pet
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const pet = crew.find(c => c.id === target.actorId);
            if (pet) {
              const myRel = member.relations.find(r => r.actorId === pet.id);
              const theirRel = pet.relations.find(r => r.actorId === member.id);
              if (myRel) myRel.friendship = Math.min(255, myRel.friendship + PET_FRIENDSHIP_GAIN);
              if (theirRel) theirRel.friendship = Math.min(255, theirRel.friendship + PET_FRIENDSHIP_GAIN);
              pet.thoughtBubble = 'heart';
              pet.thoughtBubbleTimer = 3;
              pet.copulationTarget = null;
              pet.idleTimer = 1 + Math.random() * 2;
              activityLog.push({ text: `${member.profile.name} petted ${pet.profile.name}`, time: gameTime });
              if (pet.actorType === 'cat' && audio) audio.play('cat_meow', member.deck);
            }
          }
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.DANCING: {
        if (member.actorType === 'human') member.skills.dancing = Math.min(255, (member.skills.dancing ?? 0) + 0.3 * dt);
        member.profile.energy = Math.max(0, member.profile.energy - 3.0 * dt);
        member.stateTimer -= dt;
        // Dance animation: distinct moves cycling every ~2.5s
        // Each move: stepping, spinning (pause-spin-pause), or moonwalking
        // Drunk dancers are sloppier — bigger amplitude, wobblier
        const danceT = DANCE_DURATION - member.stateTimer;
        const dancePhase = member.id * 1.7;
        const drunk = member.conditions.has('drunk');
        const tipsy = member.conditions.has('tipsy');
        const danceAmp = drunk ? 9 : tipsy ? 7 : 5;
        const danceW = drunk ? 4 : 5; // drunk = slower, lurchier
        const danceFacings: Array<Actor['facing']> = ['south', 'east', 'north', 'west'];
        const moveCycle = 2.9;
        const moveIdx = Math.floor((danceT + dancePhase) / moveCycle) % 3;
        const moveT = ((danceT + dancePhase) % moveCycle); // time within current move
        // Drunk wobble: random perpendicular drift
        if (drunk || tipsy) {
          const wobble = (drunk ? 15 : 8) * (Math.sin(danceT * 11 + dancePhase * 3) * 0.5 + Math.sin(danceT * 7) * 0.5);
          member.pixelY += wobble * dt;
        }
        if (moveIdx === 0) {
          // Spinning: pause 0.5s → spin 1.5s → clap + pause 0.5s
          if (moveT < 0.5 || moveT > 2.0) {
            member.facing = 'south'; // stand still facing south
          } else {
            const spinDir = Math.sin(dancePhase) > 0 ? 1 : -1;
            const spinSpeed = drunk ? 5 : 8; // drunk spins slower
            member.facing = danceFacings[((Math.floor((moveT - 0.5) * spinSpeed) * spinDir) % 4 + 4) % 4];
          }
          // Clap at the end of the spin (moveT crosses 2.0)
          const prevMoveT = (((danceT - dt) + dancePhase) % moveCycle);
          const prevMoveIdx = Math.floor(((danceT - dt) + dancePhase) / moveCycle) % 3;
          if (prevMoveIdx === 0 && prevMoveT < 2.0 && moveT >= 2.0) {
            if (audio) audio.play('dance_clap', member.deck);
          }
        } else if (moveIdx === 1) {
          // Moonwalk — move one way, face the other
          member.pixelX += danceAmp * danceW * Math.cos(danceW * danceT + dancePhase) * dt;
          const vx = Math.cos(danceW * danceT + dancePhase);
          member.facing = vx > 0 ? 'west' : 'east';
        } else {
          // Stepping — move back and forth, face movement direction
          member.pixelX += danceAmp * danceW * Math.cos(danceW * danceT + dancePhase) * dt;
          member.pixelY += (danceAmp * 0.6) * danceW * Math.cos(0.7 * danceW * danceT + dancePhase + 2) * dt;
          const vx = Math.cos(danceW * danceT + dancePhase);
          member.facing = vx > 0.3 ? 'east' : vx < -0.3 ? 'west' : 'south';
        }
        if (member.stateTimer <= 0) {
          const danceMorale = (member.actorType === 'human' && (member.skills.dancing ?? 0) >= SKILL_MASTERY) ? DANCE_MORALE_GAIN * 2 : DANCE_MORALE_GAIN;
          member.profile.morale = Math.min(255, member.profile.morale + danceMorale);
          // Lust boost from dancing
          const danceLust = member.statuses.get('lust') as { amount: number } | undefined;
          if (danceLust) danceLust.amount = Math.min(255, danceLust.amount + DANCE_LUST_GAIN);
          // Nearby watchers get attracted to this dancer (within 3 tiles)
          const dmx = Math.floor(member.pixelX / TILE_SIZE);
          const dmy = Math.floor(member.pixelY / TILE_SIZE);
          for (const watcher of crew) {
            if (watcher.id === member.id || watcher.deck !== member.deck) continue;
            if (member.shantyInitiatorId !== null && watcher.shantyInitiatorId === member.shantyInitiatorId) continue;
            const wx = Math.floor(watcher.pixelX / TILE_SIZE);
            const wy = Math.floor(watcher.pixelY / TILE_SIZE);
            if (Math.abs(dmx - wx) + Math.abs(dmy - wy) <= DANCE_ATTRACTION_RADIUS) {
              const watcherRel = watcher.relations.find(r => r.actorId === member.id);
              if (watcherRel) watcherRel.attraction = Math.min(255, watcherRel.attraction + DANCE_ATTRACTION_GAIN);
            }
          }
          if (member.shantyInitiatorId !== null) {
            for (const other of crew) {
              if (other.id === member.id || other.shantyInitiatorId !== member.shantyInitiatorId) continue;
              const rel = member.relations.find(r => r.actorId === other.id);
              if (rel) {
                rel.friendship = Math.min(255, rel.friendship + DANCE_FRIENDSHIP_GAIN);
                rel.attraction = Math.min(255, rel.attraction + DANCE_ATTRACTION_GAIN);
              }
            }
            if (member.id === member.shantyInitiatorId) {
              activityLog.push({ text: `${member.profile.name} led a merry dance`, time: gameTime });
              if (world) world.danceCooldown = DANCE_COOLDOWN;
            }
          }
          member.shantyInitiatorId = null;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.conversationCooldown = 30;
        }
        break;
      }
      case CrewState.SINGING:
        if (member.actorType === 'human') member.skills.singing = Math.min(255, (member.skills.singing ?? 0) + 0.3 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.profile.morale = Math.min(255, member.profile.morale + SHANTY_MORALE_GAIN);
          // Friendship gain with all other singers (same shantyInitiatorId)
          if (member.shantyInitiatorId !== null) {
            for (const other of crew) {
              if (other.id === member.id || other.shantyInitiatorId !== member.shantyInitiatorId) continue;
              const rel = member.relations.find(r => r.actorId === other.id);
              if (rel) rel.friendship = Math.min(255, rel.friendship + SHANTY_FRIENDSHIP_GAIN);
            }
            // Initiator logs
            if (member.id === member.shantyInitiatorId) {
              activityLog.push({ text: `${member.profile.name} led the crew in a sea shanty`, time: gameTime });
              if (world) world.shantyCooldown = SHANTY_COOLDOWN;
              if (audio) audio.stopShanty();
            }
          }
          member.shantyInitiatorId = null;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.conversationCooldown = 30;
        }
        break;
      case CrewState.CARRYING_CORPSE:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          // Remove corpse from world
          if (member.carryingCorpseId !== null && world) {
            const cIdx = world.corpses.findIndex(c => c.actorId === member.carryingCorpseId);
            if (cIdx !== -1) world.corpses.splice(cIdx, 1);
          }
          // Find nearest hull-adjacent walkable tile
          if (world) {
            const hullTile = findNearestHullAdjacentTile(member, decks);
            if (hullTile) {
              const from = currentTile(member);
              const pathFn = member.conditions.has('flyer') ? findPathFlying : findPath;
              const path = pathFn(decks, from, hullTile);
              if (path && path.length > 0) {
                member.path = path;
                member.state = CrewState.WALKING;
                member.targetState = CrewState.BURYING_AT_SEA;
                break;
              }
            }
          }
          // No hull tile reachable — drop to idle, re-add corpse
          dropCorpse(member, world);
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.BURYING_AT_SEA:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          activityLog.push({ text: `${member.profile.name} buried a crewmate at sea`, time: gameTime });
          member.carryingCorpseId = null;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.FISHING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          const kind = pickFishKind(worldMap);
          const fish = createFish(kind, gameTime);
          // Deposit into the nearest barrel; fall back to the angler's own inventory.
          const barrel = findNearestBarrel(member, decks);
          if (barrel) {
            const key = `${barrel.deck}-${barrel.x}-${barrel.y}`;
            const items = barrelInventory.get(key) || [];
            items.push(fish);
            barrelInventory.set(key, items);
          } else {
            member.profile.inventory.push(fish);
          }
          activityLog.push({ text: `${member.profile.name} caught a ${fish.name.toLowerCase()}!`, time: gameTime });
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
    }
  }

  // Tavern brawl: when docked, two drunk idle crew near each other may brawl
  if (world?.docking?.phase === 'docked' && Math.random() < 0.001 * dt) {
    const drunkIdle = crew.filter(c =>
      c.actorType === 'human' && !c.statuses.has('npc') &&
      c.conditions.has('drunk') &&
      (c.state === CrewState.IDLE || c.state === CrewState.WALKING) &&
      !isOnShipCheck(Math.floor(c.pixelX / TILE_SIZE), Math.floor(c.pixelY / TILE_SIZE))
    );
    if (drunkIdle.length >= 2) {
      // Find two drunk crew within 3 tiles of each other
      outer:
      for (let i = 0; i < drunkIdle.length; i++) {
        for (let j = i + 1; j < drunkIdle.length; j++) {
          const a = drunkIdle[i], b = drunkIdle[j];
          const dx = a.pixelX - b.pixelX;
          const dy = a.pixelY - b.pixelY;
          if (dx * dx + dy * dy < (3 * TILE_SIZE) * (3 * TILE_SIZE)) {
            // Brawl!
            const dmg = 5 + Math.floor(Math.random() * 10);
            a.health = Math.max(1, a.health - dmg);
            b.health = Math.max(1, b.health - dmg);
            // Friendship drops
            const relA = a.relations.find(r => r.actorId === b.id);
            const relB = b.relations.find(r => r.actorId === a.id);
            if (relA) relA.friendship = Math.max(0, relA.friendship - 20);
            if (relB) relB.friendship = Math.max(0, relB.friendship - 20);
            // But both get morale boost (fun fight!)
            a.profile.morale = Math.min(255, a.profile.morale + 15);
            b.profile.morale = Math.min(255, b.profile.morale + 15);
            // Speech bubbles
            const brawlLines = ['Take that!', 'Arrr!', 'Fight me!', 'Ye scallywag!', 'Have at ye!'];
            a.speechBubbleText = brawlLines[Math.floor(Math.random() * brawlLines.length)];
            a.speechBubbleTimer = 3;
            b.speechBubbleText = brawlLines[Math.floor(Math.random() * brawlLines.length)];
            b.speechBubbleTimer = 3;
            activityLog.push({ text: `${a.profile.name} and ${b.profile.name} got into a tavern brawl!`, time: gameTime });
            if (audio) audio.play('tavern_brawl', a.deck);
            break outer;
          }
        }
      }
    }
  }

  // Drunk fighting at sea: two drunk crew with low mutual friendship near each
  // other may throw fists. Mirrors the harbor tavern brawl but fires anywhere on
  // the ship, any time. Comedic and non-lethal.
  if (Math.random() < DRUNK_FIGHT_CHANCE * dt) {
    const drunks = crew.filter(c =>
      c.actorType === 'human' && !c.statuses.has('npc') &&
      c.conditions.has('drunk') &&
      (c.state === CrewState.IDLE || c.state === CrewState.WALKING)
    );
    if (drunks.length >= 2) {
      const rangeSq = (DRUNK_FIGHT_RANGE * TILE_SIZE) * (DRUNK_FIGHT_RANGE * TILE_SIZE);
      outer:
      for (let i = 0; i < drunks.length; i++) {
        for (let j = i + 1; j < drunks.length; j++) {
          const a = drunks[i], b = drunks[j];
          if (a.deck !== b.deck) continue;
          const dx = a.pixelX - b.pixelX;
          const dy = a.pixelY - b.pixelY;
          if (dx * dx + dy * dy >= rangeSq) continue;
          // Mutual friendship must be low
          const relA = a.relations.find(r => r.actorId === b.id);
          const relB = b.relations.find(r => r.actorId === a.id);
          const friendA = relA?.friendship ?? 128;
          const friendB = relB?.friendship ?? 128;
          if (friendA >= DRUNK_FIGHT_FRIENDSHIP_MAX || friendB >= DRUNK_FIGHT_FRIENDSHIP_MAX) continue;
          // Cooldown: don't let the same pair refight instantly (stored on bruised payload)
          const bruisedA = a.statuses.get('bruised') as { since: number; fightCooldownUntil?: number } | undefined;
          const bruisedB = b.statuses.get('bruised') as { since: number; fightCooldownUntil?: number } | undefined;
          if ((bruisedA?.fightCooldownUntil ?? 0) > gameTime || (bruisedB?.fightCooldownUntil ?? 0) > gameTime) continue;

          // Fight! Both take non-lethal damage, lose friendship, gain morale (good scrap).
          const cooldownUntil = gameTime + DRUNK_FIGHT_COOLDOWN;
          a.statuses.set('bruised', { since: gameTime, fightCooldownUntil: cooldownUntil });
          b.statuses.set('bruised', { since: gameTime, fightCooldownUntil: cooldownUntil });
          const dmgA = 5 + Math.floor(Math.random() * 11); // 5-15
          const dmgB = 5 + Math.floor(Math.random() * 11);
          a.health = Math.max(DRUNK_FIGHT_MIN_HEALTH, a.health - dmgA);
          b.health = Math.max(DRUNK_FIGHT_MIN_HEALTH, b.health - dmgB);
          if (relA) relA.friendship = Math.max(0, relA.friendship - DRUNK_FIGHT_FRIENDSHIP_LOSS);
          if (relB) relB.friendship = Math.max(0, relB.friendship - DRUNK_FIGHT_FRIENDSHIP_LOSS);
          a.profile.morale = Math.min(255, a.profile.morale + DRUNK_FIGHT_MORALE_GAIN);
          b.profile.morale = Math.min(255, b.profile.morale + DRUNK_FIGHT_MORALE_GAIN);
          const fightLines = ['Take that!', 'Ye scallywag!', 'Arrr!', 'Have at ye!', 'Put up yer dukes!'];
          a.speechBubbleText = fightLines[Math.floor(Math.random() * fightLines.length)];
          a.speechBubbleTimer = 3;
          b.speechBubbleText = fightLines[Math.floor(Math.random() * fightLines.length)];
          b.speechBubbleTimer = 3;
          activityLog.push({ text: `${a.profile.name} and ${b.profile.name} threw fists in a drunken brawl!`, time: gameTime });
          if (audio) audio.play('fist_fight', a.deck);
          break outer;
        }
      }
    }
  }

  // Mutiny detection (after per-actor loop)
  if (world) {
    const humans = crew.filter(c => c.actorType === 'human');
    const mutinousCount = humans.filter(c => c.conditions.has('mutinous')).length;
    const threshold = Math.ceil(humans.length * 0.6);

    if (world.mutinyState === 'none') {
      if (mutinousCount >= threshold && humans.length > 0) {
        world.mutinyState = 'ultimatum';
        world.mutinyTimer = 720; // 720 seconds = 1 in-game day
        activityLog.push({ text: 'The crew issues an ultimatum!', time: gameTime });
      }
    } else if (world.mutinyState === 'ultimatum') {
      world.mutinyTimer -= dt;
      if (mutinousCount < threshold) {
        world.mutinyState = 'none';
        world.mutinyTimer = 0;
        activityLog.push({ text: 'The crew calms down — mutiny averted.', time: gameTime });
      } else if (world.mutinyTimer <= 0) {
        world.mutinyState = 'game_over';
        activityLog.push({ text: 'MUTINY! The crew has seized the ship.', time: gameTime });
      }
    }
  }
}

function checkForIslandSpotting(lookout: Actor, crew: Actor[], worldMap: WorldMap, spottedIslands: Set<number>, activityLog: ActivityLogEntry[], gameTime: number): void {
  const spotDistance = lookout.conditions.has('eagle_eye') ? 5 : ISLAND_SPOT_DISTANCE;
  for (const island of worldMap.islands) {
    if (spottedIslands.has(island.id)) continue;
    const dx = worldMap.shipX - island.x;
    const dy = worldMap.shipY - island.y;
    if (Math.sqrt(dx * dx + dy * dy) <= spotDistance) {
      spottedIslands.add(island.id);
      lookout.speechBubbleText = 'Land ho!';
      lookout.speechBubbleTimer = LAND_HO_SPEECH_DURATION;
      for (const member of crew) {
        member.profile.morale = Math.min(255, member.profile.morale + LAND_HO_MORALE_BOOST);
      }
      activityLog.push({ text: `${lookout.profile.name} spotted ${island.name}: "Land ho!" - the crew's spirits soar!`, time: gameTime });
      return; // one island per tick
    }
  }
}

function updateIdle(member: Actor, decks: Deck[], dt: number, crew: Actor[], lanternOil: Map<string, number>, brightness: number, activityLog: ActivityLogEntry[] = [], gameTime: number = 0, world?: World, audio?: AudioManager): void {
  // Waiting for copulation partner — don't wander
  if (member.copulationTarget) return;

  member.idleTimer -= dt;
  if (member.idleTimer > 0) return;

  // Process command queue first
  if (tryExecuteCommand(member, decks, crew, activityLog, gameTime, world, audio)) return;

  // NPC idle: wander within building, try conversations
  if (member.statuses.has('npc')) {
    updateIdleNPC(member, decks, dt, crew, brightness);
    return;
  }

  if (member.actorType === 'human') {
    updateIdleHuman(member, decks, dt, crew, lanternOil, brightness, world, audio);
  } else {
    updateIdleAnimal(member, decks, dt, crew, brightness, gameTime, activityLog, world, audio);
  }
}

function isOnShipCheck(tileX: number, tileY: number): boolean {
  return tileX >= DECK_X_SHIFT && tileX < DECK_X_SHIFT + SHIP_WIDTH &&
         tileY >= DECK_Y_SHIFT && tileY < DECK_Y_SHIFT + SHIP_HEIGHT;
}

function updateIdleHuman(member: Actor, decks: Deck[], dt: number, crew: Actor[], lanternOil: Map<string, number>, brightness: number, world?: World, audio?: AudioManager): void {
  const from = currentTile(member);
  const isSick = member.conditions.has('sick');

  // Hungry? Eat a fish from inventory first (eat it before it spoils), else go to a stove.
  if (member.conditions.has('hungry') || member.conditions.has('starving')) {
    const FISH_NAMES = new Set(['Fish', 'Tropical fish', 'Swordfish', 'Pufferfish']);
    const fishIdx = member.profile.inventory.findIndex(i => i.hungerRestore > 0 && FISH_NAMES.has(i.name));
    if (fishIdx !== -1) {
      const item = member.profile.inventory.splice(fishIdx, 1)[0];
      member.state = CrewState.DRINKING; // shared item-consume path applies hungerRestore + pufferfish effect
      member.stateTimer = 5;
      member.consumingItem = item;
      member.path = [];
      return;
    }
    let stoves = findTilesOfType(decks, TileType.STOVE);
    if (world?.docking?.phase === 'docked' && Math.random() < 0.6) {
      const harborStoves = stoves.filter(s => !isOnShipCheck(s.x, s.y));
      if (harborStoves.length > 0) stoves = harborStoves;
    }
    const gangplanksForPath = world?.gangplanks;
    const target = pickRandom(stoves);
    if (target) {
      const path = findPath(decks, from, target, gangplanksForPath);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.EATING;
        return;
      }
    }
  }

  // Lustful? Seek a partner
  if (member.conditions.has('lustful') && member.lustSeekCooldown <= 0) {
    if (trySeekLustPartner(member, crew, decks)) return;
  }

  // Tired? Go sleep (daytime restriction: only if dark or exhausted)
  if ((member.conditions.has('tired') || member.conditions.has('exhausted')) && (brightness < 0.7 || member.conditions.has('exhausted'))) {
    let beds = findTilesOfType(decks, TileType.BED);
    // When docked, prefer harbor beds (inn) — they're outside the ship
    if (world?.docking?.phase === 'docked' && Math.random() < 0.6) {
      const harborBeds = beds.filter(b => !isOnShipCheck(b.x, b.y));
      if (harborBeds.length > 0) beds = harborBeds;
    }
    const gangplanksForPath = world?.gangplanks;
    const target = pickRandom(beds);
    if (target) {
      const path = findPath(decks, from, target, gangplanksForPath);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.SLEEPING;
        return;
      }
    }
  }

  // Low on food? Go fishing to replenish supplies. Autonomous economy:
  // crew fish when few edible items remain in the barrels (and they aren't sick).
  // Skip while docked — they'd rather buy/eat in town.
  if (!isSick && world?.docking?.phase !== 'docked' &&
      countEdibleSupply(world?.barrelInventory ?? new Map()) < LOW_FOOD_THRESHOLD &&
      Math.random() < AUTO_FISH_CHANCE) {
    const spots = findTilesOfType(decks, TileType.FISHING_SPOT).filter(s =>
      // don't crowd a spot another crew is already heading to / using
      !crew.some(c => c.id !== member.id &&
        ((c.state === CrewState.FISHING && Math.floor(c.pixelX / TILE_SIZE) === s.x && Math.floor(c.pixelY / TILE_SIZE) === s.y && c.deck === s.deck) ||
         (c.state === CrewState.WALKING && c.targetState === CrewState.FISHING && c.path.length > 0 && c.path[c.path.length - 1].x === s.x && c.path[c.path.length - 1].y === s.y && c.path[c.path.length - 1].deck === s.deck)))
    );
    const target = pickRandom(spots);
    if (target) {
      const path = findPath(decks, from, target, world?.gangplanks);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.FISHING;
        return;
      }
    }
  }

  // Light unlit lanterns when dark
  if (!isSick && brightness < 0.7) {
    const lanterns = findTilesOfType(decks, TileType.LANTERN);
    const unlit = lanterns.filter(l => {
      const key = `${l.deck}-${l.x}-${l.y}`;
      const oil = lanternOil.get(key) ?? 0;
      if (oil > 0) return false;
      return !crew.some(c => c.id !== member.id && c.targetState === CrewState.LIGHTING_LANTERN && c.state === CrewState.WALKING && c.path.length > 0 && c.path[c.path.length - 1].x === l.x && c.path[c.path.length - 1].y === l.y && c.path[c.path.length - 1].deck === l.deck);
    });
    const target = pickRandom(unlit);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.LIGHTING_LANTERN;
        return;
      }
    }
  }

  // Extinguish lit lanterns when bright
  if (!isSick && brightness > 0.9) {
    const lanterns = findTilesOfType(decks, TileType.LANTERN);
    const lit = lanterns.filter(l => {
      const key = `${l.deck}-${l.x}-${l.y}`;
      const oil = lanternOil.get(key) ?? 0;
      if (oil <= 0) return false;
      return !crew.some(c => c.id !== member.id && c.targetState === CrewState.EXTINGUISHING_LANTERN && c.state === CrewState.WALKING && c.path.length > 0 && c.path[c.path.length - 1].x === l.x && c.path[c.path.length - 1].y === l.y && c.path[c.path.length - 1].deck === l.deck);
    });
    const target = pickRandom(lit);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.EXTINGUISHING_LANTERN;
        return;
      }
    }
  }

  // Autonomously drink grog from inventory when idle
  if (Math.random() < 0.004) {
    const grogIdx = member.profile.inventory.findIndex(i => i.name === 'Grog ration');
    if (grogIdx !== -1) {
      const item = member.profile.inventory.splice(grogIdx, 1)[0];
      member.state = CrewState.DRINKING;
      member.stateTimer = 5;
      member.consumingItem = item;
      member.path = [];
      return;
    }
  }

  // When docked, occasionally take grog from harbor barrels (visit tavern)
  if (world?.docking?.phase === 'docked' && Math.random() < 0.05) {
    // Find a harbor barrel with grog (outside the ship)
    if (world.barrelInventory) {
      for (const [key, items] of world.barrelInventory) {
        const [d, bx, by] = key.split('-').map(Number);
        if (d !== 1 || isOnShipCheck(bx, by)) continue;
        const grogIdx = items.findIndex(i => i.name === 'Grog ration');
        if (grogIdx === -1) continue;
        const target: DeckPoint = { x: bx, y: by, deck: d };
        member.takeTarget = { barrelKey: key, itemName: 'Grog ration' };
        if (orderCrewBesideTile(member, target, decks, CrewState.TAKING_ITEM, world.gangplanks)) {
          return;
        }
        member.takeTarget = null;
        break;
      }
    }
  }

  // Try to start a conversation with nearby idle crew
  if (tryStartConversation(member, crew, brightness)) return;

  // Shanty singing: nighttime, high average morale, 3+ idle humans on same deck
  if (world && brightness < 0.5 && world.shantyCooldown <= 0 && member.conversationCooldown <= 0 && Math.random() < SHANTY_CHANCE) {
    const humans = crew.filter(c => c.actorType === 'human');
    const avgMorale = humans.reduce((sum, c) => sum + c.profile.morale, 0) / humans.length;
    if (avgMorale >= SHANTY_MORALE_THRESHOLD) {
      const candidates = humans.filter(c =>
        c.deck === member.deck && c.id !== member.id &&
        (c.state === CrewState.IDLE || (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE)) &&
        c.conversationCooldown <= 0
      );
      if (candidates.length >= SHANTY_MIN_SINGERS - 1) {
        const singers = [member, ...candidates.slice(0, SHANTY_MAX_SINGERS - 1)];
        const duration = audio?.shantyDuration || SHANTY_DEFAULT_DURATION;
        const maleCount = singers.filter(s => s.profile.sex === 'M').length;
        const femaleCount = singers.filter(s => s.profile.sex === 'F').length;

        for (const singer of singers) {
          singer.state = CrewState.SINGING;
          singer.stateTimer = duration;
          singer.shantyInitiatorId = member.id;
          singer.thoughtBubble = 'music_note';
          singer.thoughtBubbleTimer = duration;
          singer.conversationCooldown = 30;
          singer.path = [];
        }

        if (audio) audio.playShanty({ male: maleCount, female: femaleCount }, member.deck);
        return;
      }
    }
  }

  // Dancing: daytime, high average morale, 2+ idle humans on same deck
  // Drunk/tipsy crew are more likely to dance and need lower morale
  {
  const isDrunk = member.conditions.has('drunk');
  const isTipsy = member.conditions.has('tipsy');
  const danceChance = isDrunk ? DANCE_CHANCE * 3 : isTipsy ? DANCE_CHANCE * 2 : DANCE_CHANCE;
  const danceMoraleReq = isDrunk ? DANCE_MORALE_THRESHOLD - 40 : isTipsy ? DANCE_MORALE_THRESHOLD - 20 : DANCE_MORALE_THRESHOLD;
  if (world && brightness > 0.7 && world.danceCooldown <= 0 && member.conversationCooldown <= 0 && Math.random() < danceChance) {
    const humansForDance = crew.filter(c => c.actorType === 'human');
    const avgMoraleDance = humansForDance.reduce((sum, c) => sum + c.profile.morale, 0) / humansForDance.length;
    if (avgMoraleDance >= danceMoraleReq) {
      const danceCandidates = humansForDance.filter(c =>
        c.deck === member.deck && c.id !== member.id &&
        (c.state === CrewState.IDLE || (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE)) &&
        c.conversationCooldown <= 0
      );
      if (danceCandidates.length >= DANCE_MIN_DANCERS - 1) {
        const dancers = [member, ...danceCandidates.slice(0, 4)];
        for (const dancer of dancers) {
          dancer.state = CrewState.DANCING;
          dancer.stateTimer = DANCE_DURATION;
          dancer.shantyInitiatorId = member.id;
          dancer.thoughtBubble = 'music_note';
          dancer.thoughtBubbleTimer = DANCE_DURATION;
          dancer.conversationCooldown = 30;
          dancer.path = [];
        }
        return;
      }
    }
  }
  }

  // When docked at harbor, sometimes wander to harbor buildings (explore town)
  if (world?.docking?.phase === 'docked' && Math.random() < 0.3) {
    const harborFloorTiles = findTilesOfType(decks, TileType.HARBOR_FLOOR);
    if (harborFloorTiles.length > 0) {
      const target = pickRandom(harborFloorTiles);
      if (target) {
        const path = findPath(decks, from, target, world.gangplanks);
        if (path && path.length > 0) {
          member.path = path;
          member.state = CrewState.WALKING;
          member.targetState = CrewState.IDLE;
          return;
        }
      }
    }
  }

  // Otherwise wander
  wanderRandomly(member, decks);
}

function updateIdleAnimal(member: Actor, decks: Deck[], dt: number, allActors: Actor[], brightness: number, gameTime: number = 0, activityLog: ActivityLogEntry[] = [], world?: World, audio?: AudioManager): void {
  const from = currentTile(member);

  // Hungry? Go eat at stove
  if (member.conditions.has('hungry') || member.conditions.has('starving')) {
    const stoves = findTilesOfType(decks, TileType.STOVE);
    const target = pickRandom(stoves);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.EATING;
        return;
      }
    }
  }

  // Lustful? Seek same-species partner (dogs and monkeys only; never while a baby)
  if (LUST_ACTOR_TYPES.has(member.actorType) && !member.conditions.has('baby') && member.conditions.has('lustful') && member.lustSeekCooldown <= 0) {
    if (trySeekLustPartner(member, allActors, decks)) return;
  }

  // Tired? Find a place to sleep
  if ((member.conditions.has('tired') || member.conditions.has('exhausted')) && (brightness < 0.7 || member.conditions.has('exhausted'))) {
    if (member.actorType === 'parrot') {
      // Parrots sleep in nests, never beds
      const nests = findTilesOfType(decks, TileType.NEST);
      let foundNest = false;
      if (nests.length > 0) {
        const target = pickRandom(nests);
        if (target) {
          const pathFn = findPathFlying;
          const path = pathFn(decks, from, target);
          if (path) {
            member.path = path;
            member.state = CrewState.WALKING;
            member.targetState = CrewState.SLEEPING;
            foundNest = true;
          }
        }
      }
      if (!foundNest) {
        // No nest reachable — find a random floor tile to sleep on
        const floors = findTilesOfType(decks, TileType.FLOOR).filter(f => f.deck === member.deck);
        const target = pickRandom(floors);
        if (target) {
          const path = findPathFlying(decks, from, target);
          if (path && path.length <= 8) {
            member.path = path;
            member.state = CrewState.WALKING;
            member.targetState = CrewState.SLEEPING;
            return;
          }
        }
        // Fallback: sleep in place
        member.state = CrewState.SLEEPING;
      }
      return;
    }

    // Non-parrot animals: try nearby bed, otherwise sleep in place
    const beds = findTilesOfType(decks, TileType.BED);
    const sameDeckBeds = beds.filter(b => b.deck === member.deck);
    let foundBed = false;
    if (sameDeckBeds.length > 0) {
      const target = pickRandom(sameDeckBeds);
      if (target) {
        const path = findPath(decks, from, target);
        if (path && path.length <= 8) {
          member.path = path;
          member.state = CrewState.WALKING;
          member.targetState = CrewState.SLEEPING;
          foundBed = true;
        }
      }
    }
    if (!foundBed) {
      member.state = CrewState.SLEEPING;
      return;
    }
    return;
  }

  // Baby: stick close to mother on a tight leash (overrides normal follow/wander)
  const babyStatus = member.statuses.get('baby') as { motherId?: number } | undefined;
  if (babyStatus) {
    if (tryBabyFollowMother(member, babyStatus.motherId, allActors, decks)) return;
  }

  // Dog: follow liked entity
  if (member.actorType === 'dog') {
    if (tryFollowLikedEntity(member, allActors, decks)) return;
  }

  // Monkey mischief: adult monkeys pinch & stash items (babies are too little).
  if (member.actorType === 'monkey' && !member.statuses.has('baby')) {
    if (tryMonkeyMischief(member, decks, allActors, world?.barrelInventory ?? new Map(), gameTime, activityLog, audio)) return;
  }

  // Rare conversations (1/20th of human chance)
  if (Math.random() < 0.05) { // 5% chance to even attempt (vs always for humans)
    if (tryStartConversation(member, allActors, brightness)) return;
  }

  // Otherwise wander
  wanderRandomly(member, decks);
}

/**
 * Baby behaviour: stay near the mother on a tight leash (BABY_FOLLOW_LEASH).
 * If the mother is sleeping, idle within ~1 tile rather than crowding her bed.
 * Returns true if it set a path / chose to wait, false to fall through to wander.
 */
function tryBabyFollowMother(member: Actor, motherId: number | undefined, allActors: Actor[], decks: Deck[]): boolean {
  if (motherId === undefined) return false;
  const mother = allActors.find(a => a.id === motherId);
  if (!mother || !canAccessDeck(member, mother.deck)) return false;

  // Different deck → always go to her.
  if (mother.deck !== member.deck) {
    const motherTile = { x: Math.floor(mother.pixelX / TILE_SIZE), y: Math.floor(mother.pixelY / TILE_SIZE), deck: mother.deck };
    return orderCrewBesideTile(member, motherTile, decks, CrewState.IDLE);
  }

  const dx = mother.pixelX - member.pixelX;
  const dy = mother.pixelY - member.pixelY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Mother asleep: keep within ~1 tile but don't fuss.
  const leash = mother.state === CrewState.SLEEPING ? TILE_SIZE * 1 : BABY_FOLLOW_LEASH;
  if (dist <= leash) {
    // Close enough — wait a beat near mum.
    member.idleTimer = 0.5 + Math.random();
    return true;
  }
  const motherTile = { x: Math.floor(mother.pixelX / TILE_SIZE), y: Math.floor(mother.pixelY / TILE_SIZE), deck: mother.deck };
  return orderCrewBesideTile(member, motherTile, decks, CrewState.IDLE);
}

/** Dog behavior: follow the entity it likes most, across decks if needed. */
function tryFollowLikedEntity(member: Actor, allActors: Actor[], decks: Deck[]): boolean {
  let bestFriend: Actor | null = null;
  let bestFriendship = 0;
  for (const rel of member.relations) {
    if (rel.friendship > bestFriendship) {
      const other = allActors.find(a => a.id === rel.actorId);
      if (other && other.state !== CrewState.SLEEPING && canAccessDeck(member, other.deck)) {
        bestFriendship = rel.friendship;
        bestFriend = other;
      }
    }
  }
  if (!bestFriend || bestFriendship < 100) return false;

  // On same deck: only follow if far enough away
  if (bestFriend.deck === member.deck) {
    const dx = bestFriend.pixelX - member.pixelX;
    const dy = bestFriend.pixelY - member.pixelY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TILE_SIZE * 2.5) return false;
  }

  const friendTile = { x: Math.floor(bestFriend.pixelX / TILE_SIZE), y: Math.floor(bestFriend.pixelY / TILE_SIZE), deck: bestFriend.deck };
  return orderCrewBesideTile(member, friendTile, decks, CrewState.IDLE);
}

function wanderRandomly(member: Actor, decks: Deck[]): void {
  const from = currentTile(member);
  const allWalkable: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    if (!canAccessDeck(member, d)) continue;
    allWalkable.push(...getWalkableTiles(decks[d], d));
  }
  const target = pickRandom(allWalkable);
  if (target) {
    const pathFn = member.conditions.has('flyer') ? findPathFlying : findPath;
    const path = pathFn(decks, from, target);
    if (path && path.length > 0) {
      member.path = path;
      member.state = CrewState.WALKING;
      member.targetState = CrewState.IDLE;
    } else {
      member.idleTimer = 1 + Math.random() * 2;
    }
  }
}

const NPC_AMBIENT_LINES: Record<string, string[]> = {
  bartender: ['*polishes a mug*', '*wipes the counter*', 'Another round?', '*hums a shanty*'],
  innkeeper: ['*fluffs a pillow*', '*sweeps the floor*', 'Welcome, welcome!', '*checks the ledger*'],
  merchant: ['*arranges wares*', 'Fine goods here!', '*counts coins*', 'Best prices!'],
  blacksmith: ['*hammers metal*', '*pumps the bellows*', '*wipes brow*', 'Hot work today!'],
  townsfolk: ['*whistles*', '*looks at the sea*', 'Nice day...', '*stretches*', '*yawns*', 'Hmm...', '*kicks a pebble*'],
  cat: ['*purring*', '*licks paw*', 'Mew!', '*stretches*', '*naps in sun*', 'Prrr...'],
};

const NPC_GREETINGS: Record<string, string[]> = {
  bartender: ['Welcome!', 'What\'ll it be?', 'Ahoy, sailor!', 'Sit down, have a drink!'],
  innkeeper: ['Welcome, traveler!', 'Need a bed?', 'Come in, come in!', 'Make yourself at home!'],
  merchant: ['Browse freely!', 'Ahoy, buyer!', 'Only the finest wares!', 'Looking for something?'],
  blacksmith: ['Need repairs?', 'Step in!', 'Got steel needs working?', 'Ahoy there!'],
  townsfolk: ['Ahoy!', 'Morning!', 'Welcome, sailor!', 'Ho there!', 'G\'day!'],
};

function updateIdleNPC(member: Actor, decks: Deck[], dt: number, crew: Actor[], brightness: number): void {
  // Try to start a conversation with nearby idle crew
  if (tryStartConversation(member, crew, brightness)) return;

  // Greet nearby crew who just entered the building
  const npcInfo = member.statuses.get('npc') as { role: string; homeX: number; homeY: number } | null;
  if (npcInfo && !member.speechBubbleText && member.conversationCooldown <= 0) {
    const proximityTiles = 3 * TILE_SIZE;
    for (const c of crew) {
      if (c.id === member.id || c.deck !== member.deck || c.statuses.has('npc')) continue;
      if (c.actorType !== 'human') continue;
      const dx = c.pixelX - member.pixelX;
      const dy = c.pixelY - member.pixelY;
      if (dx * dx + dy * dy < proximityTiles * proximityTiles) {
        // Only greet if crew is walking (just arrived) and not already greeted recently
        if (c.state === CrewState.WALKING) {
          const greetings = NPC_GREETINGS[npcInfo.role] ?? ['Ahoy!'];
          member.speechBubbleText = greetings[Math.floor(Math.random() * greetings.length)];
          member.speechBubbleTimer = 3;
          member.conversationCooldown = 15; // don't greet again for 15s
          break;
        }
      }
    }
  }

  // Ambient speech (occasional flavor text)
  if (npcInfo && !member.speechBubbleText && Math.random() < 0.01) {
    const lines = NPC_AMBIENT_LINES[npcInfo.role];
    if (lines) {
      member.speechBubbleText = lines[Math.floor(Math.random() * lines.length)];
      member.speechBubbleTimer = 3;
    }
  }

  // Wander within building (near home position), townsfolk wander more freely
  const npcData = member.statuses.get('npc') as { role: string; homeX: number; homeY: number } | null;
  if (!npcData) return;
  const from = currentTile(member);
  const deck = decks[member.deck];
  if (!deck) return;

  // Townsfolk and cats wander wider (10 tiles), shopkeepers stay close (4 tiles)
  const isFreeRoaming = npcData.role === 'townsfolk' || npcData.role === 'cat';
  const radius = isFreeRoaming ? 10 : 4;
  const candidates: DeckPoint[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = npcData.homeX + dx;
      const ny = npcData.homeY + dy;
      if (ny >= 0 && ny < deck.height && nx >= 0 && nx < deck.width && WALKABLE.has(deck.tiles[ny][nx])) {
        candidates.push({ x: nx, y: ny, deck: member.deck });
      }
    }
  }
  const target = pickRandom(candidates);
  if (target) {
    const path = findPath(decks, from, target);
    if (path && path.length > 0 && path.length <= 8) {
      member.path = path;
      member.state = CrewState.WALKING;
      member.targetState = CrewState.IDLE;
    } else {
      member.idleTimer = 2 + Math.random() * 4;
    }
  } else {
    member.idleTimer = 2 + Math.random() * 4;
  }
}

/** Find nearest walkable tile adjacent to hull/water/off-grid on the actor's deck. */
function findNearestHullAdjacentTile(member: Actor, decks: Deck[]): DeckPoint | null {
  const deck = decks[member.deck];
  if (!deck) return null;
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const mx = Math.floor(member.pixelX / TILE_SIZE);
  const my = Math.floor(member.pixelY / TILE_SIZE);
  let best: DeckPoint | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      if (!WALKABLE.has(deck.tiles[y][x])) continue;
      // Check if adjacent to hull/water/off-grid
      let nearEdge = false;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= deck.width || ny >= deck.height) {
          nearEdge = true; break;
        }
        const tile = deck.tiles[ny][nx];
        if (tile === TileType.HULL || tile === TileType.WATER) {
          nearEdge = true; break;
        }
      }
      if (nearEdge) {
        const dist = Math.abs(x - mx) + Math.abs(y - my);
        if (dist < bestDist) {
          bestDist = dist;
          best = { x, y, deck: member.deck };
        }
      }
    }
  }
  return best;
}

/** Re-add corpse at actor's current position when bury is interrupted. */
function dropCorpse(member: Actor, world: World | undefined): void {
  if (member.carryingCorpseId === null || !world) return;
  // Only re-add if corpse isn't already in the list
  if (!world.corpses.some(c => c.actorId === member.carryingCorpseId)) {
    world.corpses.push({
      actorId: member.carryingCorpseId,
      name: 'Unknown',
      actorType: 'human',
      pixelX: member.pixelX,
      pixelY: member.pixelY,
      deck: member.deck,
      spriteIndex: 0,
      color: '#888888',
      sex: 'M',
      inventory: [],
    });
  }
  member.carryingCorpseId = null;
}
