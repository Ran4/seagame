import { Actor, ActorType, ActorRelation, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, CREW_SPEED, Sex, Item, LIGHT_LANTERN_DURATION, EXTINGUISH_LANTERN_DURATION, Command, ActivityLogEntry } from './types';
import { findPath, findPathFlying } from './pathfinding';
import { createCutlass, createGrogRation, createSemen } from './items';
import { tryStartConversation, tryStartConversationWhileWalking, updateTalking, tickConversationCooldown, beginConversation, stopConversation } from './conversation';

const HUNGER_RATE = 0.7;
const ENERGY_RATE = 0.4;
const PET_DURATION = 3;
const PET_FRIENDSHIP_GAIN = 2;

// Actor types that have lust mechanics
const LUST_ACTOR_TYPES: Set<ActorType> = new Set(['human', 'dog', 'monkey']);

// Actor types that can do human work (steer, man cannons, navigate, etc.)
const WORK_ACTOR_TYPES: Set<ActorType> = new Set(['human']);

const ANIMAL_NAMES: Record<string, string[]> = {
  dog: ['Biscuit', 'Salty', 'Barnacle', 'Patches'],
  parrot: ['Polly', 'Squawk', 'Captain', 'Feathers'],
  monkey: ['Chips', 'Bananas', 'Rascal', 'Noodle'],
};

const ANIMAL_COLORS: Record<string, string> = {
  dog: '#f5f5dc',    // bichon frise white/cream
  parrot: '#2ecc71', // green
  monkey: '#c68c53',  // brown
};
const HUNGER_THRESHOLD = 80;
const ENERGY_THRESHOLD = 60;
const EAT_DURATION = 8;
const ENERGY_RESTORE_RATE = 255 / 240; // full restore in ~240s (8 in-game hours)
const STEER_DURATION = 999999;
const CANNON_DURATION = 15;
const LOOKOUT_DURATION = 30;
const NAVIGATE_DURATION = 999999;
const COPULATE_DURATION = 15;
const KISS_DURATION = 3;
const DRUNKEDNESS_RATE = 255 / 720;
const LUST_RATE_MALE = 0.15;         // 0→255 in ~1700s (~2.4 days)
const LUST_RATE_FEMALE = 0.05;       // +108 over 3-day growth phase
const LUST_CYCLE_LENGTH = 6 * 720;   // 6 in-game days = 4320s
const LUST_SEEK_COOLDOWN_MIN = 30;
const LUST_SEEK_COOLDOWN_MAX = 60;
export const DRINK_DURATION = 5;

const PIRATE_NAMES = [
  'Anne', 'Jack', 'Mary', 'Flint',
  'Morgan', 'Pete', 'Jane', 'Bones',
];

const CREW_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

const PIRATE_SEXES: Record<string, Sex> = {
  'Anne': 'F', 'Jack': 'M', 'Mary': 'F', 'Flint': 'M',
  'Morgan': 'M', 'Pete': 'M', 'Jane': 'F', 'Bones': 'M',
};

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
export function refreshConditions(member: Actor): void {
  member.conditions.clear();
  // Copy raw status keys
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

function createActor(id: number, actorType: ActorType, name: string, sex: Sex, color: string, spriteIndex: number, decks: Deck[]): Actor {
  const spawnDeck = 1 + Math.floor(Math.random() * Math.min(2, decks.length - 1));
  const walkable = getWalkableTiles(decks[spawnDeck], spawnDeck);
  const spawn = walkable[Math.floor(Math.random() * walkable.length)];
  const numberOfHands = actorType === 'human'
    ? (Math.random() < 0.001 ? 0 : Math.random() < 0.005 ? 1 : 2)
    : 0;

  return {
    id,
    actorType,
    profile: {
      name, sex, color, spriteIndex, numberOfHands,
      hunger: 200 + Math.random() * 55,
      energy: 200 + Math.random() * 55,
      inventory: [],
      hands: [],
    },
    statuses: new Map<string, Record<string, any> | null>(),
    conditions: new Set(),
    pixelX: spawn.x * TILE_SIZE + TILE_SIZE / 2,
    pixelY: spawn.y * TILE_SIZE + TILE_SIZE / 2,
    facing: 'south',
    deck: spawnDeck,
    state: CrewState.IDLE,
    targetState: CrewState.IDLE,
    path: [],
    stateTimer: 0,
    idleTimer: Math.random() * 3,
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
  };
}

export function createActors(humanCount: number, decks: Deck[]): Actor[] {
  const actors: Actor[] = [];
  let nextId = 0;

  // Create humans
  for (let i = 0; i < humanCount; i++) {
    const name = PIRATE_NAMES[i % PIRATE_NAMES.length];
    const sex = PIRATE_SEXES[name] ?? (Math.random() < 0.5 ? 'M' : 'F');
    actors.push(createActor(nextId++, 'human', name, sex, CREW_COLORS[i % CREW_COLORS.length], i, decks));
  }

  // Create animals: 2 dogs (1M, 1F), 1 parrot, 1 monkey
  const animalSpecs: { type: ActorType; sex: Sex }[] = [
    { type: 'dog', sex: 'M' },
    { type: 'dog', sex: 'F' },
    { type: 'parrot', sex: Math.random() < 0.5 ? 'M' : 'F' },
    { type: 'monkey', sex: Math.random() < 0.5 ? 'M' : 'F' },
  ];
  const usedNames: Record<string, number> = {};
  for (const spec of animalSpecs) {
    const nameIdx = usedNames[spec.type] ?? 0;
    usedNames[spec.type] = nameIdx + 1;
    const name = ANIMAL_NAMES[spec.type][nameIdx % ANIMAL_NAMES[spec.type].length];
    actors.push(createActor(nextId++, spec.type, name, spec.sex, ANIMAL_COLORS[spec.type], nextId - 1, decks));
  }

  // Initialize climber status — everyone except dogs
  for (const member of actors) {
    if (member.actorType !== 'dog') {
      member.statuses.set('climber', { skill: 128 });
    }
  }

  // Initialize lust for actors that have it
  for (const member of actors) {
    if (!LUST_ACTOR_TYPES.has(member.actorType)) continue;
    if (member.profile.sex === 'M') {
      member.statuses.set('lust', { amount: Math.floor(Math.random() * 129) });
    } else {
      member.statuses.set('lust', { amount: 64 + Math.floor(Math.random() * 65), cycleTimer: Math.floor(Math.random() * LUST_CYCLE_LENGTH) });
    }
  }

  // Initialize relations between all actors
  for (const member of actors) {
    for (const other of actors) {
      if (other.id === member.id) continue;
      // Animals have lower starting attraction to other species
      const sameSpecies = member.actorType === other.actorType;
      member.relations.push({
        actorId: other.id,
        friendship: 64 + Math.floor(Math.random() * 129), // 64-192
        attraction: sameSpecies ? Math.floor(Math.random() * 161) : 0,
      });
    }
  }

  const jack = actors.find(c => c.profile.name === 'Jack');
  if (jack) {
    jack.profile.hands.push(createCutlass());
  }

  const mary = actors.find(c => c.profile.name === 'Mary');
  if (mary) {
    mary.profile.inventory.push(createGrogRation());
    mary.profile.inventory.push(createGrogRation());
    mary.profile.inventory.push(createSemen(0));
  }

  return actors;
}

export function updateActors(crew: Actor[], decks: Deck[], dt: number, barrelInventory: Map<string, Item[]>, gameTime: number, lanternOil: Map<string, number> = new Map(), brightness: number = 1.0, activityLog: ActivityLogEntry[] = []): void {
  for (const member of crew) {
    member.profile.hunger = Math.max(0, member.profile.hunger - HUNGER_RATE * dt);
    member.profile.energy = Math.max(0, member.profile.energy - ENERGY_RATE * dt);

    // Drunkedness decay via statuses
    const drunkStatus = member.statuses.get('drunkedness') as { amount: number } | undefined;
    if (drunkStatus) {
      drunkStatus.amount = Math.max(0, drunkStatus.amount - DRUNKEDNESS_RATE * dt);
      if (drunkStatus.amount <= 0) member.statuses.delete('drunkedness');
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

    refreshConditions(member);

    tickConversationCooldown(member, dt);

    // Tick down thought bubble
    if (member.thoughtBubble) {
      member.thoughtBubbleTimer -= dt;
      if (member.thoughtBubbleTimer <= 0) {
        member.thoughtBubble = null;
        member.thoughtBubbleTimer = 0;
      }
    }

    switch (member.state) {
      case CrewState.IDLE:
        updateIdle(member, decks, dt, crew, lanternOil, brightness, activityLog, gameTime);
        break;
      case CrewState.WALKING:
        updateWalking(member, dt, crew, brightness, barrelInventory, decks);
        break;
      case CrewState.EATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.profile.hunger = Math.min(255, member.profile.hunger + 180);
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
      case CrewState.MANNING_CANNON:
      case CrewState.NAVIGATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LOOKOUT:
        member.stateTimer -= dt;
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
            activityLog.push({ text: `${member.profile.name} drank ${member.consumingItem.name.toLowerCase()}`, time: gameTime });
            if (member.consumingItem.name === 'Grog ration') {
              const cur = (member.statuses.get('drunkedness') as { amount: number } | undefined)?.amount ?? 0;
              member.statuses.set('drunkedness', { amount: Math.min(255, cur + 140) });
            }
            if (member.consumingItem.hungerRestore > 0) {
              member.profile.hunger = Math.min(255, member.profile.hunger + member.consumingItem.hungerRestore);
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
            }
          }
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
    }
  }
}

function trySeekLustPartner(member: Actor, crew: Actor[], decks: Deck[]): boolean {
  // Find best partner on same deck by highest mutual attraction score
  let bestPartner: Actor | null = null;
  let bestScore = -1;
  for (const other of crew) {
    if (other.id === member.id) continue;
    if (other.deck !== member.deck) continue;
    if (other.actorType !== member.actorType) continue; // same species only
    if (other.copulationTarget) continue;
    if (other.state === CrewState.COPULATING || other.state === CrewState.KISSING) continue;
    const myRel = member.relations.find(r => r.actorId === other.id);
    const theirRel = other.relations.find(r => r.actorId === member.id);
    if (!myRel || !theirRel) continue;
    const score = myRel.attraction + theirRel.attraction;
    if (score > bestScore) {
      bestScore = score;
      bestPartner = other;
    }
  }
  if (!bestPartner) {
    member.lustSeekCooldown = LUST_SEEK_COOLDOWN_MIN + Math.random() * (LUST_SEEK_COOLDOWN_MAX - LUST_SEEK_COOLDOWN_MIN);
    return false;
  }

  const myRel = member.relations.find(r => r.actorId === bestPartner!.id)!;
  const theirRel = bestPartner.relations.find(r => r.actorId === member.id)!;

  // Threshold modifiers: lustful halves, drunk halves again
  const memberDrunk = member.conditions.has('drunk');
  const memberTipsy = memberDrunk || member.conditions.has('tipsy');
  const partnerDrunk = bestPartner.conditions.has('drunk');
  const bothDrunk = memberDrunk && partnerDrunk;
  const eitherDrunk = memberDrunk || partnerDrunk;
  const eitherTipsy = memberTipsy || partnerDrunk || bestPartner.conditions.has('tipsy');

  // Base thresholds (same as game.ts menu)
  let kissThreshold = eitherDrunk ? 32 : eitherTipsy ? 48 : 64;
  let copThreshold = bothDrunk ? 64 : eitherDrunk ? 80 : 128;
  // Lustful halves thresholds
  kissThreshold = Math.floor(kissThreshold / 2);
  copThreshold = Math.floor(copThreshold / 2);

  // Determine interaction type
  let targetState: CrewState;
  const bothLustful = member.conditions.has('lustful') && bestPartner.conditions.has('lustful');
  if (bothLustful && myRel.attraction >= copThreshold && theirRel.attraction >= copThreshold) {
    targetState = CrewState.COPULATING;
  } else if (myRel.friendship >= kissThreshold || myRel.attraction >= kissThreshold) {
    targetState = CrewState.KISSING;
  } else {
    member.lustSeekCooldown = LUST_SEEK_COOLDOWN_MIN + Math.random() * (LUST_SEEK_COOLDOWN_MAX - LUST_SEEK_COOLDOWN_MIN);
    return false;
  }

  // Interrupt busy target
  if (bestPartner.state === CrewState.TALKING) {
    // Reset conversation partner too
    const convPartner = crew.find(c => c.id === bestPartner!.conversationPartnerId);
    if (convPartner && convPartner.state === CrewState.TALKING) {
      convPartner.state = CrewState.IDLE;
      convPartner.idleTimer = 1 + Math.random() * 2;
      convPartner.conversationPartnerId = null;
      convPartner.speechBubbleText = null;
      convPartner.speechBubbleTimer = 0;
    }
    bestPartner.conversationPartnerId = null;
    bestPartner.speechBubbleText = null;
    bestPartner.speechBubbleTimer = 0;
  }
  // Set target to idle and clear their path
  bestPartner.state = CrewState.IDLE;
  bestPartner.path = [];

  // Set copulation targets on both
  member.copulationTarget = { type: 'crew', actorId: bestPartner.id };
  bestPartner.copulationTarget = { type: 'crew', actorId: member.id };
  bestPartner.idleTimer = 999; // freeze target

  // Pathfind initiator to target
  const targetTile = { x: Math.floor(bestPartner.pixelX / TILE_SIZE), y: Math.floor(bestPartner.pixelY / TILE_SIZE), deck: bestPartner.deck };
  let success: boolean;
  if (targetState === CrewState.KISSING) {
    success = orderCrewBesideTile(member, targetTile, decks, targetState);
  } else {
    success = orderCrewToAdjacentTile(member, targetTile, decks, targetState);
  }

  if (!success) {
    // Clean up on pathfinding failure
    member.copulationTarget = null;
    bestPartner.copulationTarget = null;
    bestPartner.idleTimer = 1 + Math.random() * 2;
    member.lustSeekCooldown = 10; // short cooldown on failure
    return false;
  }

  member.lustSeekCooldown = LUST_SEEK_COOLDOWN_MIN + Math.random() * (LUST_SEEK_COOLDOWN_MAX - LUST_SEEK_COOLDOWN_MIN);
  return true;
}

/** Try to execute the next command in the actor's queue. Returns true if a command was executed. */
function findTileOrRandom(decks: Deck[], type: TileType, cmd: Command): DeckPoint | undefined {
  if (cmd.x !== undefined && cmd.y !== undefined) {
    return { x: cmd.x, y: cmd.y, deck: cmd.deck ?? 0 };
  }
  return pickRandom(findTilesOfType(decks, type));
}

function tryExecuteCommand(member: Actor, decks: Deck[], crew: Actor[], activityLog: ActivityLogEntry[], gameTime: number): boolean {
  if (member.commandQueue.length === 0) return false;

  const cmd = member.commandQueue[0];
  const name = member.profile.name;

  const fail = (reason: string) => {
    activityLog.push({ text: `${name}: ${cmd.name} failed — ${reason}`, time: gameTime });
    member.commandQueue.length = 0; // drop entire chain
  };

  const log = (text: string) => {
    activityLog.push({ text: `${name}: ${text}`, time: gameTime });
  };

  // Helper for actor-targeting commands (Kiss, Copulate, Pet, Converse)
  const setupActorTarget = (targetState: CrewState, beside: boolean): boolean => {
    if (cmd.actorId === undefined) { fail('no target actorId'); return true; }
    const target = crew.find(c => c.id === cmd.actorId);
    if (!target) { fail(`actor ${cmd.actorId} not found`); return true; }
    member.copulationTarget = { type: 'crew', actorId: target.id };
    target.copulationTarget = { type: 'crew', actorId: member.id };
    target.state = CrewState.IDLE;
    target.path = [];
    target.idleTimer = 999;
    const targetTile = { x: Math.floor(target.pixelX / TILE_SIZE), y: Math.floor(target.pixelY / TILE_SIZE), deck: target.deck };
    const ok = beside
      ? orderCrewBesideTile(member, targetTile, decks, targetState)
      : orderCrewToAdjacentTile(member, targetTile, decks, targetState);
    if (!ok) {
      member.copulationTarget = null;
      target.copulationTarget = null;
      target.idleTimer = 1 + Math.random() * 2;
      fail(`can't reach ${target.profile.name}`);
    }
    return true;
  };

  // Remove the command we're about to execute
  member.commandQueue.shift();

  switch (cmd.name) {
    case 'Sleep': {
      const target = findTileOrRandom(decks, TileType.BED, cmd);
      if (!target) { fail('no bed found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.SLEEPING)) { fail('can\'t reach bed'); return true; }
      log('going to sleep');
      return true;
    }
    case 'Eat': {
      const target = findTileOrRandom(decks, TileType.STOVE, cmd);
      if (!target) { fail('no stove found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.EATING)) { fail('can\'t reach stove'); return true; }
      log('going to eat');
      return true;
    }
    case 'Steer': {
      const target = findTileOrRandom(decks, TileType.HELM, cmd);
      if (!target) { fail('no helm found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.STEERING)) { fail('can\'t reach helm'); return true; }
      log('going to steer');
      return true;
    }
    case 'Navigate': {
      const target = findTileOrRandom(decks, TileType.MAP_TABLE, cmd);
      if (!target) { fail('no map table found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.NAVIGATING)) { fail('can\'t reach map table'); return true; }
      log('going to navigate');
      return true;
    }
    case 'ManCannon': {
      const target = findTileOrRandom(decks, TileType.CANNON, cmd);
      if (!target) { fail('no cannon found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.MANNING_CANNON)) { fail('can\'t reach cannon'); return true; }
      log('going to man cannon');
      return true;
    }
    case 'Lookout': {
      const masts = findTilesOfType(decks, TileType.MAST);
      const target = (cmd.x !== undefined && cmd.y !== undefined)
        ? { x: cmd.x, y: cmd.y, deck: cmd.deck ?? 0 }
        : pickRandom(masts);
      if (!target) { fail('no mast found'); return true; }
      const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      let reached = false;
      for (const [dx, dy] of DIRS) {
        if (orderCrewTo(member, { x: target.x + dx, y: target.y + dy, deck: target.deck }, decks, CrewState.LOOKOUT)) {
          reached = true;
          break;
        }
      }
      if (!reached) { fail('can\'t reach mast'); return true; }
      log('going to lookout');
      return true;
    }
    case 'Kiss': {
      setupActorTarget(CrewState.KISSING, true);
      if (member.copulationTarget) log(`going to kiss ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'Copulate': {
      setupActorTarget(CrewState.COPULATING, false);
      if (member.copulationTarget) log(`going to copulate with ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'CopulateBarrel': {
      const x = cmd.x ?? 0;
      const y = cmd.y ?? 0;
      const deck = cmd.deck ?? member.deck;
      member.copulationTarget = { type: 'barrel', x, y, deck };
      if (!orderCrewToAdjacentTile(member, { x, y, deck }, decks, CrewState.COPULATING)) {
        member.copulationTarget = null;
        fail('can\'t reach barrel');
        return true;
      }
      log('going to copulate with barrel');
      return true;
    }
    case 'Pet': {
      setupActorTarget(CrewState.PETTING, true);
      if (member.copulationTarget) log(`going to pet ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'Converse': {
      setupActorTarget(CrewState.TALKING, true);
      if (member.copulationTarget) log(`going to talk to ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'GoTo': {
      const x = cmd.x ?? 0;
      const y = cmd.y ?? 0;
      const deck = cmd.deck ?? member.deck;
      if (!orderCrewTo(member, { x, y, deck }, decks)) { fail(`can't reach (${x},${y},${deck})`); return true; }
      log(`going to (${x},${y},${deck})`);
      return true;
    }
    case 'GoToDeck': {
      const targetDeckIdx = cmd.deck ?? 0;
      const targetDeck = decks[targetDeckIdx];
      if (!targetDeck) { fail(`deck ${targetDeckIdx} doesn't exist`); return true; }
      let reached = false;
      for (let y = 0; y < targetDeck.height && !reached; y++) {
        for (let x = 0; x < targetDeck.width && !reached; x++) {
          if (WALKABLE.has(targetDeck.tiles[y][x])) {
            if (orderCrewTo(member, { x, y, deck: targetDeckIdx }, decks)) {
              reached = true;
            }
          }
        }
      }
      if (!reached) { fail(`can't reach deck ${targetDeckIdx}`); return true; }
      log(`going to ${targetDeck.name}`);
      return true;
    }
    case 'TakeItem': {
      if (!cmd.barrelKey || !cmd.itemName) { fail('TakeItem needs barrelKey and itemName'); return true; }
      const parts = cmd.barrelKey.split('-').map(Number);
      const [d, bx, by] = parts;
      member.takeTarget = { barrelKey: cmd.barrelKey, itemName: cmd.itemName };
      if (!orderCrewToAdjacentTile(member, { x: bx, y: by, deck: d }, decks, CrewState.TAKING_ITEM)) {
        member.takeTarget = null;
        fail('can\'t reach barrel');
        return true;
      }
      log(`going to take ${cmd.itemName}`);
      return true;
    }
    case 'Drink': {
      const drinkName = cmd.itemName ?? 'Grog ration';
      const grogIdx = member.profile.inventory.findIndex(i => i.name === drinkName);
      if (grogIdx === -1) { fail(`no ${drinkName} in inventory`); return true; }
      const item = member.profile.inventory.splice(grogIdx, 1)[0];
      member.state = CrewState.DRINKING;
      member.stateTimer = DRINK_DURATION;
      member.consumingItem = item;
      member.path = [];
      log(`drinking ${drinkName}`);
      return true;
    }
    case 'LightLantern': {
      const x = cmd.x ?? 0;
      const y = cmd.y ?? 0;
      const deck = cmd.deck ?? member.deck;
      if (!orderCrewToAdjacentTile(member, { x, y, deck }, decks, CrewState.LIGHTING_LANTERN)) {
        fail('can\'t reach lantern');
        return true;
      }
      log('going to light lantern');
      return true;
    }
    case 'ExtinguishLantern': {
      const x = cmd.x ?? 0;
      const y = cmd.y ?? 0;
      const deck = cmd.deck ?? member.deck;
      if (!orderCrewToAdjacentTile(member, { x, y, deck }, decks, CrewState.EXTINGUISHING_LANTERN)) {
        fail('can\'t reach lantern');
        return true;
      }
      log('going to extinguish lantern');
      return true;
    }
    case 'Stop': {
      // Free conversation partner
      if (member.state === CrewState.TALKING) {
        stopConversation(member, crew);
      }
      // Free copulation/interaction partner
      if (member.copulationTarget?.type === 'crew') {
        const partner = crew.find(c => c.id === (member.copulationTarget as { type: 'crew'; actorId: number }).actorId);
        if (partner) {
          partner.state = CrewState.IDLE;
          partner.idleTimer = 1 + Math.random() * 2;
          partner.copulationTarget = null;
        }
      }
      member.copulationTarget = null;
      member.state = CrewState.IDLE;
      member.path = [];
      member.idleTimer = 1 + Math.random() * 2;
      log('stopped');
      return true;
    }
    case 'Order': {
      if (cmd.actorId === undefined || !cmd.order) { fail('Order needs actorId and order'); return true; }
      const target = crew.find(c => c.id === cmd.actorId);
      if (!target) { fail(`actor ${cmd.actorId} not found`); return true; }
      // Compliance check based on friendship
      const rel = target.relations.find(r => r.actorId === member.id);
      const friendship = rel?.friendship ?? 128;
      if (friendship < 64 && Math.random() > 0.3) {
        log(`ordered ${target.profile.name} to ${cmd.order.name} but they refused`);
        return true;
      }
      target.commandQueue.length = 0; // clear their queue
      target.commandQueue.push(cmd.order);
      log(`ordered ${target.profile.name} to ${cmd.order.name}`);
      return true;
    }
    case 'Tell': {
      if (cmd.actorId === undefined) { fail('Tell needs actorId'); return true; }
      const target = crew.find(c => c.id === cmd.actorId);
      if (!target) { fail(`actor ${cmd.actorId} not found`); return true; }
      log(`told ${target.profile.name}: "${cmd.text ?? '...'}"`);
      // For now Tell is just cosmetic — shows speech bubble
      member.speechBubbleText = cmd.text ?? '...';
      member.speechBubbleTimer = 3;
      return true;
    }
    default:
      fail(`unknown command "${cmd.name}"`);
      return true;
  }
}

// Issue a command from the UI — interrupts current activity and executes immediately
export function issueCommand(actor: Actor, command: Command, allActors: Actor[]): void {
  // Clean up current activity
  if (actor.state === CrewState.TALKING) {
    stopConversation(actor, allActors);
  }
  if (actor.copulationTarget?.type === 'crew') {
    const partnerId = (actor.copulationTarget as { type: 'crew'; actorId: number }).actorId;
    const partner = allActors.find(c => c.id === partnerId);
    if (partner) {
      partner.state = CrewState.IDLE;
      partner.idleTimer = 1 + Math.random() * 2;
      partner.copulationTarget = null;
    }
  }
  actor.copulationTarget = null;
  actor.commandQueue.length = 0;
  actor.commandQueue.push(command);
  actor.state = CrewState.IDLE;
  actor.path = [];
  actor.idleTimer = 0; // execute on next tick
}

function updateIdle(member: Actor, decks: Deck[], dt: number, crew: Actor[], lanternOil: Map<string, number>, brightness: number, activityLog: ActivityLogEntry[] = [], gameTime: number = 0): void {
  // Waiting for copulation partner — don't wander
  if (member.copulationTarget) return;

  member.idleTimer -= dt;
  if (member.idleTimer > 0) return;

  // Process command queue first
  if (tryExecuteCommand(member, decks, crew, activityLog, gameTime)) return;

  if (member.actorType === 'human') {
    updateIdleHuman(member, decks, dt, crew, lanternOil, brightness);
  } else {
    updateIdleAnimal(member, decks, dt, crew, brightness);
  }
}

function updateIdleHuman(member: Actor, decks: Deck[], dt: number, crew: Actor[], lanternOil: Map<string, number>, brightness: number): void {
  const from = currentTile(member);

  // Hungry? Go eat
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

  // Lustful? Seek a partner
  if (member.conditions.has('lustful') && member.lustSeekCooldown <= 0) {
    if (trySeekLustPartner(member, crew, decks)) return;
  }

  // Tired? Go sleep (daytime restriction: only if dark or exhausted)
  if ((member.conditions.has('tired') || member.conditions.has('exhausted')) && (brightness < 0.7 || member.conditions.has('exhausted'))) {
    const beds = findTilesOfType(decks, TileType.BED);
    const target = pickRandom(beds);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.SLEEPING;
        return;
      }
    }
  }

  // Light unlit lanterns when dark
  if (brightness < 0.7) {
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
  if (brightness > 0.9) {
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

  // Try to start a conversation with nearby idle crew
  if (tryStartConversation(member, crew, brightness)) return;

  // Otherwise wander
  wanderRandomly(member, decks);
}

function updateIdleAnimal(member: Actor, decks: Deck[], dt: number, allActors: Actor[], brightness: number): void {
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

  // Lustful? Seek same-species partner (dogs and monkeys only)
  if (LUST_ACTOR_TYPES.has(member.actorType) && member.conditions.has('lustful') && member.lustSeekCooldown <= 0) {
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

  // Dog: follow liked entity
  if (member.actorType === 'dog') {
    if (tryFollowLikedEntity(member, allActors, decks)) return;
  }

  // Rare conversations (1/20th of human chance)
  if (Math.random() < 0.05) { // 5% chance to even attempt (vs always for humans)
    if (tryStartConversation(member, allActors, brightness)) return;
  }

  // Otherwise wander
  wanderRandomly(member, decks);
}

/** Can this actor access the given deck? Crow's nest (deck 0) requires climber status. */
function canAccessDeck(member: Actor, deckIndex: number): boolean {
  if (deckIndex === 0 && !member.statuses.has('climber')) return false;
  return true;
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
    const pathFn = member.actorType === 'parrot' ? findPathFlying : findPath;
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

function performTakeItem(member: Actor, barrelInventory: Map<string, Item[]>): void {
  const target = member.takeTarget;
  if (!target) return;
  member.takeTarget = null;
  const barrelItems = barrelInventory.get(target.barrelKey);
  if (!barrelItems) return;
  const idx = barrelItems.findIndex(i => i.name === target.itemName);
  if (idx === -1) return;
  const barrelItem = barrelItems[idx];
  if (barrelItem.stackable && barrelItem.quantity > 1) {
    const unitWeight = barrelItem.weight / barrelItem.quantity;
    barrelItem.quantity--;
    barrelItem.weight -= unitWeight;
    const existing = member.profile.inventory.find(i => i.name === barrelItem.name && i.stackable);
    if (existing) {
      existing.quantity++;
      existing.weight += unitWeight;
    } else {
      member.profile.inventory.push({ ...barrelItem, quantity: 1, weight: unitWeight });
    }
  } else {
    const [taken] = barrelItems.splice(idx, 1);
    const existing = member.profile.inventory.find(i => i.name === taken.name && i.stackable);
    if (existing) {
      existing.quantity += taken.quantity;
      existing.weight += taken.weight;
    } else {
      member.profile.inventory.push(taken);
    }
  }
  if (barrelItems.length === 0) {
    barrelInventory.delete(target.barrelKey);
  }
}

function updateWalking(member: Actor, dt: number, crew: Actor[], brightness: number, barrelInventory?: Map<string, Item[]>, decks?: Deck[]): void {
  if (member.path.length === 0) {
    member.state = member.targetState;
    if (member.state === CrewState.EATING) {
      member.stateTimer = EAT_DURATION;
    } else if (member.state === CrewState.SLEEPING) {
      // No timer — sleeps until energy is full (rate-based)
    } else if (member.state === CrewState.STEERING) {
      member.stateTimer = STEER_DURATION;
    } else if (member.state === CrewState.MANNING_CANNON) {
      member.stateTimer = CANNON_DURATION;
    } else if (member.state === CrewState.LOOKOUT) {
      member.stateTimer = LOOKOUT_DURATION;
    } else if (member.state === CrewState.NAVIGATING) {
      member.stateTimer = NAVIGATE_DURATION;
    } else if (member.state === CrewState.COPULATING) {
      member.stateTimer = COPULATE_DURATION;
    } else if (member.state === CrewState.KISSING) {
      member.stateTimer = KISS_DURATION;
    } else if (member.state === CrewState.LIGHTING_LANTERN) {
      member.stateTimer = LIGHT_LANTERN_DURATION;
    } else if (member.state === CrewState.EXTINGUISHING_LANTERN) {
      member.stateTimer = EXTINGUISH_LANTERN_DURATION;
    } else if (member.state === CrewState.TALKING) {
      // Player-ordered conversation: initiator arrived at target
      const target = member.copulationTarget;
      const partner = target?.type === 'crew' ? crew.find(c => c.id === target.actorId) : undefined;
      member.copulationTarget = null;
      if (partner) {
        partner.copulationTarget = null;
        beginConversation(member, partner, brightness);
      } else {
        member.state = CrewState.IDLE;
        member.idleTimer = 1 + Math.random() * 2;
      }
    } else if (member.state === CrewState.TAKING_ITEM) {
      if (barrelInventory) performTakeItem(member, barrelInventory);
      member.state = CrewState.IDLE;
      member.idleTimer = 1 + Math.random() * 2;
    } else if (member.state === CrewState.PETTING) {
      member.stateTimer = PET_DURATION;
    } else {
      member.idleTimer = 2 + Math.random() * 4;
    }
    return;
  }

  const target = member.path[0];
  const targetX = target.x * TILE_SIZE + TILE_SIZE / 2;
  const targetY = target.y * TILE_SIZE + TILE_SIZE / 2;

  if (target.deck !== member.deck) {
    member.deck = target.deck;
  }

  const dx = targetX - member.pixelX;
  const dy = targetY - member.pixelY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Update facing direction based on dominant axis
  if (dist > 2) {
    if (Math.abs(dx) > Math.abs(dy)) {
      member.facing = dx > 0 ? 'east' : 'west';
    } else {
      member.facing = dy > 0 ? 'south' : 'north';
    }
  }

  if (dist < 2) {
    member.pixelX = targetX;
    member.pixelY = targetY;
    member.path.shift();

    // Wobbly movement: drunk crew may deviate perpendicular
    if (member.path.length > 0) {
      const wobbleChance = member.conditions.has('drunk') ? 0.25 : member.conditions.has('tipsy') ? 0.08 : 0;
      if (wobbleChance > 0 && Math.random() < wobbleChance) {
        const next = member.path[0];
        const ndx = next.x - target.x;
        const ndy = next.y - target.y;
        // Perpendicular offset: swap dx/dy and randomly negate
        const sign = Math.random() < 0.5 ? -1 : 1;
        const wobbleX = target.x + (-ndy * sign || sign);
        const wobbleY = target.y + (ndx * sign || 0);
        // Only wobble if the tile is walkable and on the same deck
        const deck = decks?.[target.deck];
        if (deck && wobbleY >= 0 && wobbleY < deck.height && wobbleX >= 0 && wobbleX < deck.width && WALKABLE.has(deck.tiles[wobbleY][wobbleX])) {
          member.path.unshift({ x: wobbleX, y: wobbleY, deck: target.deck });
        }
      }
    }
  } else {
    const move = CREW_SPEED * dt;
    member.pixelX += (dx / dist) * Math.min(move, dist);
    member.pixelY += (dy / dist) * Math.min(move, dist);
  }

  // Wandering crew can stop and chat when passing someone
  if (member.state === CrewState.WALKING) {
    tryStartConversationWhileWalking(member, crew, brightness);
  }
}

export function orderCrewTo(member: Actor, target: DeckPoint, decks: Deck[], targetState: CrewState = CrewState.IDLE): boolean {
  const from = currentTile(member);
  const path = findPath(decks, from, target);
  if (path && path.length > 0) {
    member.path = path;
    member.state = CrewState.WALKING;
    member.targetState = targetState;
    return true;
  }
  return false;
}

export function orderCrewToAdjacentTile(member: Actor, target: DeckPoint, decks: Deck[], targetState: CrewState): boolean {
  // Try direct path first (works for walkable tiles like BED, STOVE, HELM)
  if (orderCrewTo(member, target, decks, targetState)) return true;

  // Try adjacent walkable tiles (for non-walkable targets like CANNON)
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of DIRS) {
    const adj: DeckPoint = { x: target.x + dx, y: target.y + dy, deck: target.deck };
    if (orderCrewTo(member, adj, decks, targetState)) return true;
  }
  return false;
}

/** Walk to a tile beside the target, preferring the side closest to the member's current position. */
export function orderCrewBesideTile(member: Actor, target: DeckPoint, decks: Deck[], targetState: CrewState): boolean {
  const from = currentTile(member);
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const candidates = DIRS.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy, deck: target.deck }));
  candidates.sort((a, b) => {
    const da = Math.abs(a.x - from.x) + Math.abs(a.y - from.y);
    const db = Math.abs(b.x - from.x) + Math.abs(b.y - from.y);
    return da - db;
  });
  for (const adj of candidates) {
    if (orderCrewTo(member, adj, decks, targetState)) return true;
  }
  // Fallback: stand on the same tile if no adjacent tile reachable
  return orderCrewTo(member, target, decks, targetState);
}
