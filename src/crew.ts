import { CrewMember, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, CREW_SPEED } from './types';
import { findPath } from './pathfinding';

const HUNGER_RATE = 0.7;
const ENERGY_RATE = 0.4;
const HUNGER_THRESHOLD = 80;
const ENERGY_THRESHOLD = 60;
const EAT_DURATION = 8;
const SLEEP_DURATION = 15;

const PIRATE_NAMES = [
  'Anne', 'Jack', 'Mary', 'Flint',
  'Morgan', 'Pete', 'Jane', 'Bones',
];

const CREW_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

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

function currentTile(member: CrewMember): DeckPoint {
  return {
    x: Math.floor(member.pixelX / TILE_SIZE),
    y: Math.floor(member.pixelY / TILE_SIZE),
    deck: member.deck,
  };
}

export function createCrew(count: number, decks: Deck[]): CrewMember[] {
  const crew: CrewMember[] = [];
  const walkable = getWalkableTiles(decks[0], 0);

  for (let i = 0; i < count; i++) {
    const spawn = walkable[Math.floor(Math.random() * walkable.length)];
    crew.push({
      id: i,
      name: PIRATE_NAMES[i % PIRATE_NAMES.length],
      pixelX: spawn.x * TILE_SIZE + TILE_SIZE / 2,
      pixelY: spawn.y * TILE_SIZE + TILE_SIZE / 2,
      deck: 0,
      hunger: 200 + Math.random() * 55,
      energy: 200 + Math.random() * 55,
      state: CrewState.IDLE,
      targetState: CrewState.IDLE,
      color: CREW_COLORS[i % CREW_COLORS.length],
      path: [],
      stateTimer: 0,
      idleTimer: Math.random() * 3,
    });
  }
  return crew;
}

export function updateCrew(crew: CrewMember[], decks: Deck[], dt: number): void {
  for (const member of crew) {
    member.hunger = Math.max(0, member.hunger - HUNGER_RATE * dt);
    member.energy = Math.max(0, member.energy - ENERGY_RATE * dt);

    switch (member.state) {
      case CrewState.IDLE:
        updateIdle(member, decks, dt);
        break;
      case CrewState.WALKING:
        updateWalking(member, dt);
        break;
      case CrewState.EATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.hunger = Math.min(255, member.hunger + 180);
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.SLEEPING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.energy = Math.min(255, member.energy + 180);
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
    }
  }
}

function updateIdle(member: CrewMember, decks: Deck[], dt: number): void {
  member.idleTimer -= dt;
  if (member.idleTimer > 0) return;

  const from = currentTile(member);

  // Hungry? Go eat
  if (member.hunger < HUNGER_THRESHOLD) {
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

  // Tired? Go sleep
  if (member.energy < ENERGY_THRESHOLD) {
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

  // Otherwise wander
  const allWalkable: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    allWalkable.push(...getWalkableTiles(decks[d], d));
  }
  const target = pickRandom(allWalkable);
  if (target) {
    const path = findPath(decks, from, target);
    if (path && path.length > 0) {
      member.path = path;
      member.state = CrewState.WALKING;
      member.targetState = CrewState.IDLE;
    } else {
      member.idleTimer = 1 + Math.random() * 2;
    }
  }
}

function updateWalking(member: CrewMember, dt: number): void {
  if (member.path.length === 0) {
    member.state = member.targetState;
    if (member.state === CrewState.EATING) {
      member.stateTimer = EAT_DURATION;
    } else if (member.state === CrewState.SLEEPING) {
      member.stateTimer = SLEEP_DURATION;
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

  if (dist < 2) {
    member.pixelX = targetX;
    member.pixelY = targetY;
    member.path.shift();
  } else {
    const move = CREW_SPEED * dt;
    member.pixelX += (dx / dist) * Math.min(move, dist);
    member.pixelY += (dy / dist) * Math.min(move, dist);
  }
}

export function orderCrewTo(member: CrewMember, target: DeckPoint, decks: Deck[]): boolean {
  const from = currentTile(member);
  const path = findPath(decks, from, target);
  if (path && path.length > 0) {
    member.path = path;
    member.state = CrewState.WALKING;
    member.targetState = CrewState.IDLE;
    return true;
  }
  return false;
}
