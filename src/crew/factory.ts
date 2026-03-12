import { Actor, ActorType, ActorRelation, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, Sex, Item } from '../types';
import { createCutlass, createGrogRation, createSemen } from '../items';

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

const PIRATE_NAMES = [
  'Anne', 'Jack', 'Mary', 'Flint',
  'Morgan', 'Pete', 'Jane', 'Bones',
];

const CREW_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

const PIRATE_SEXES: Record<string, Sex> = {
  'Anne': 'F', 'Jack': 'M', 'Mary': 'F', 'Flint': 'M',
  'Morgan': 'M', 'Pete': 'M', 'Jane': 'F', 'Bones': 'M',
};

// Actor types that have lust mechanics
export const LUST_ACTOR_TYPES: Set<ActorType> = new Set(['human', 'dog', 'monkey']);

const LUST_CYCLE_LENGTH = 6 * 720;   // 6 in-game days = 4320s

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
      morale: 128 + Math.random() * 32,
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
    if (member.actorType === 'parrot') {
      member.statuses.set('flyer', null);
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
