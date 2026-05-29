import {TileType, Deck, DockingState, Island, TILE_SIZE, CrewState, WALKABLE, Item, Actor} from './types';
import {stopSailing} from './worldmap';
import type {World} from './types';
import {createGrogRation} from './items';

// Harbor layout: 41 wide × 33 tall
// # = Harbor Wall, _ = Harbor Floor, L = Land, W = Wharf
// T = Table, B = Bed, K = Stove, R = Barrel, P = Lantern (building)
// l = Lantern (wharf), . = Water
//
// Buildings:
//   Tavern (cols 1-9,  rows 5-10)  — tables, barrels, stove
//   Inn    (cols 13-21, rows 5-10)  — beds
//   Market (cols 1-9,  rows 14-19) — barrels, display tables
//   Smithy (cols 13-21, rows 14-19) — work tables, forge
//
// Paths connect building doors to a main east-west road (row 12)
// which leads to the wharf and gangplank.
const HARBOR_LAYOUT = `\
LLLLLLLLLLLLLLLLLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLLLLLLLLLLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLLLLLLLLLLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLLLLLLLLLLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLLLLLLLLLLLLLLLLWWWWWWWWWWWWWWWW..
L#########LLL#########LWWWWWWWWWWWWWWWW..
L#P_TT_R_#LLL#P_B__B_#LWWWWWWWWWWWWWWWW..
L#__TT_R_#LLL#__B__B_#LWWWWWWWWWWWWWWWW..
L#___K___#LLL#_______#LWWWWWWWWWWWWWWWW..
L#_______#LLL#_______#LWWWWW.............
L####_####LLL####_####LWWWWW.............
LLLLL_LLLLLLLLLLL_LLLLLWWWWW.............
L_____N________________WWWWW.............
LLLLL_LLLLLLLLLLL_LLLLLWWWWW.............
L####_####LLL####_####LWWWWW.............
L#_______#LLL#_______#LWWWWW.............
L#P_R__R_#LLL#P_T__T_#LWWWWW.............
L#__R__R_#LLL#_______#LWWWWW.............
L#__TT___#LLL#___K___#LWWWWW.............
L#########LLL#########LWWWlW.............
LLLLLLLLLLLLLLLLLLLLLLLWWWWW.............
LLLLLLLLLLLLLLLLLLLLLLLWWWWW.............
LLLLLLLLLLLLLLLLLLLLLLLWWWWW.............
LLLLLLLLLLLLLLLLLLLLLLLWWWWW.............
LLLLLLLLLLLLLLLLLLLLLLLWWWWW.............
LLLLLLLLLLLLLLLLLLLLLLLWWWWW.............
LLLLLLLLLLLLLLLLLLLLLLL..................
LLLLLLLLLLLLLLLLLLLLLLL..................
LLLLLLLLLLLLLLLLLLLLLLL..................
.........................................
.........................................
.........................................
.........................................`;

const HARBOR_CHAR_TO_TILE: Record<string, TileType> = {
  '.': TileType.WATER,
  'L': TileType.LAND,
  'W': TileType.WHARF,
  'l': TileType.LANTERN,
  '#': TileType.HARBOR_WALL,
  '_': TileType.HARBOR_FLOOR,
  'T': TileType.TABLE,
  'B': TileType.BED,
  'K': TileType.STOVE,
  'R': TileType.BARREL,
  'P': TileType.LANTERN,
  'N': TileType.NOTICE_BOARD,
};

function parseHarborLayout(layout: string): TileType[][] {
  return layout.trim().split('\n')
    .map(row => [...row].map(ch => HARBOR_CHAR_TO_TILE[ch] ?? TileType.WATER));
}

// Ship is embedded at this offset within the expanded grid.
// The grid is always this size — harbor tiles fill in around the ship when docked.
export const DECK_X_SHIFT = 29;
export const DECK_Y_SHIFT = 7;
export const EXPANDED_WIDTH = 41;
export const EXPANDED_HEIGHT = 33;

// Original ship dimensions (before expansion padding)
export const SHIP_WIDTH = 11;
export const SHIP_HEIGHT = 21;

// Docking animation: harborAnimOffset starts negative and increases to 0
export const HARBOR_ANIM_START = -21 * TILE_SIZE; // -672

// Docking speed in pixels/sec
export const DOCKING_SPEED = 80;

// Undocking ends when harborAnimOffset reaches this (harbor fully off-screen)
export const UNDOCKING_END = -26 * TILE_SIZE;

// Gangplank position in expanded grid coordinates
const GANGPLANK_X = DECK_X_SHIFT - 1;  // 28
const GANGPLANK_Y = 8 + DECK_Y_SHIFT;  // 15 (ship row 8 + offset)
const GANGPLANK_HULL_X = DECK_X_SHIFT; // 29 (hull tile converted to floor for walkability)

/** Check if a tile is inside a building (has harbor walls on at least 3 sides within 2 tiles). */
function isInsideBuilding(harborTiles: TileType[][], x: number, y: number): boolean {
  let wallCount = 0;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dy] of dirs) {
    for (let d = 1; d <= 2; d++) {
      const nx = x + dx * d;
      const ny = y + dy * d;
      if (ny >= 0 && ny < harborTiles.length && nx >= 0 && nx < harborTiles[0].length) {
        if (harborTiles[ny][nx] === TileType.HARBOR_WALL) {
          wallCount++;
          break;
        }
      }
    }
  }
  return wallCount >= 3;
}

/** Check if a tile position is within the ship region of the expanded grid. */
function isOnShip(tileX: number, tileY: number): boolean {
  return tileX >= DECK_X_SHIFT && tileX < DECK_X_SHIFT + SHIP_WIDTH &&
         tileY >= DECK_Y_SHIFT && tileY < DECK_Y_SHIFT + SHIP_HEIGHT;
}

/** Create the docking state when initiating docking at an island. */
export function createDockingState(island: Island): DockingState {
  const harborTiles = parseHarborLayout(HARBOR_LAYOUT);
  return {
    phase: 'docking',
    island,
    harborTiles,
    harborWidth: harborTiles[0].length,
    harborHeight: harborTiles.length,
    harborAnimOffset: HARBOR_ANIM_START,
  };
}

/** Start docking at an island. */
export function startDocking(world: World): void {
  const island = world.nearbyHarborIsland;
  if (!island) return;

  // Stop normal sailing
  stopSailing(world.worldMap);
  world.worldMap.currentSpeed = 0;
  world.mapOverlayOpen = false;

  // Pulling into the wharf leaves any pursuer (or drifting wreck) behind — clear the
  // combat target so it doesn't stay frozen on the HUD while docked and abruptly
  // resume the moment we undock.
  if (world.enemyShip) {
    world.activityLog.push({ text: `Made the safety of port — shook off the ${world.enemyShip.name}.`, time: world.time });
    world.enemyShip = null;
  }

  // Create docking state
  world.docking = createDockingState(island);
}

/** Complete docking — fill harbor tiles into the existing expanded grid. */
export function completeDocking(world: World): void {
  const docking = world.docking;

  docking.phase = 'docked';
  docking.harborAnimOffset = 0;

  // Fill harbor tiles on upper deck (d=1) where grid currently has water
  const upperDeck = world.decks[1];
  for (let y = 0; y < docking.harborHeight; y++) {
    for (let x = 0; x < docking.harborWidth; x++) {
      const tile = docking.harborTiles[y][x];
      if (tile !== TileType.WATER && upperDeck.tiles[y][x] === TileType.WATER) {
        upperDeck.tiles[y][x] = tile;
      }
    }
  }

  // Place gangplank + convert adjacent hull to floor for walkability
  upperDeck.tiles[GANGPLANK_Y][GANGPLANK_X] = TileType.GANGPLANK;
  upperDeck.tiles[GANGPLANK_Y][GANGPLANK_HULL_X] = TileType.FLOOR;

  // Clear actor paths (walkability changed)
  for (const actor of world.actors) {
    actor.path = [];
    if (actor.state === CrewState.WALKING) {
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }
  }

  // Add harbor lantern oil entries (building lanterns start lit)
  for (let y = 0; y < docking.harborHeight; y++) {
    for (let x = 0; x < docking.harborWidth; x++) {
      if (docking.harborTiles[y][x] === TileType.LANTERN) {
        // Lanterns inside buildings (surrounded by harbor walls) start lit
        const isIndoors = isInsideBuilding(docking.harborTiles, x, y);
        world.lanternOil.set(`1-${x}-${y}`, isIndoors ? 100 : 0);
      }
    }
  }

  // Seed harbor barrels with grog rations
  for (let y = 0; y < docking.harborHeight; y++) {
    for (let x = 0; x < docking.harborWidth; x++) {
      if (docking.harborTiles[y][x] === TileType.BARREL) {
        const key = `1-${x}-${y}`;
        if (!world.barrelInventory.has(key)) {
          const items = [];
          for (let g = 0; g < 3; g++) items.push(createGrogRation());
          world.barrelInventory.set(key, items);
        }
      }
    }
  }

  // Restore stranded actors/corpses from this island
  const islandId = docking.island?.id;
  if (islandId != null) {
    const stranded = world.strandedActors.get(islandId);
    if (stranded && stranded.length > 0) {
      for (const actor of stranded) {
        // Rebuild missing relations bidirectionally
        for (const shipActor of world.actors) {
          if (!shipActor.relations.find(r => r.actorId === actor.id)) {
            shipActor.relations.push({ actorId: actor.id, friendship: 128, attraction: 0 });
          }
          if (!actor.relations.find(r => r.actorId === shipActor.id)) {
            actor.relations.push({ actorId: shipActor.id, friendship: 128, attraction: 0 });
          }
        }
      }
      world.actors.push(...stranded);
      world.strandedActors.delete(islandId);
    }

    const strandedCorpses = world.strandedCorpses.get(islandId);
    if (strandedCorpses && strandedCorpses.length > 0) {
      world.corpses.push(...strandedCorpses);
      world.strandedCorpses.delete(islandId);
    }
  }

  // Spawn harbor NPCs
  spawnHarborNPCs(world);

  // Crew gets happy thought bubbles on arrival
  for (const actor of world.actors) {
    if (actor.actorType === 'human' && !actor.statuses.has('npc')) {
      actor.thoughtBubble = 'heart';
      actor.thoughtBubbleTimer = 4;
    }
  }

  world.activityLog.push({text: `Docked at ${docking.island?.name ?? 'harbor'}`, time: world.time});
}

/** Start undocking — clear harbor tiles and begin undocking animation. */
export function startUndocking(world: World): void {
  const docking = world.docking;
  if (docking.phase !== 'docked') return;

  // Clear harbor tiles on upper deck — set back to water
  const upperDeck = world.decks[1];
  for (let y = 0; y < docking.harborHeight; y++) {
    for (let x = 0; x < docking.harborWidth; x++) {
      if (docking.harborTiles[y][x] !== TileType.WATER && !isOnShip(x, y)) {
        upperDeck.tiles[y][x] = TileType.WATER;
      }
    }
  }

  // Restore gangplank and hull
  upperDeck.tiles[GANGPLANK_Y][GANGPLANK_X] = TileType.WATER;
  upperDeck.tiles[GANGPLANK_Y][GANGPLANK_HULL_X] = TileType.HULL;

  // Separate actors on ship vs on land, filtering out NPCs (they just disappear)
  const islandId = docking.island?.id;
  const shipActors: typeof world.actors = [];
  const landActors: typeof world.actors = [];
  const npcIds = new Set<number>();
  for (const actor of world.actors) {
    if (actor.statuses.has('npc')) {
      npcIds.add(actor.id);
      continue; // NPCs are removed, not stranded
    }
    const tileX = Math.floor(actor.pixelX / TILE_SIZE);
    const tileY = Math.floor(actor.pixelY / TILE_SIZE);
    if (isOnShip(tileX, tileY)) {
      shipActors.push(actor);
    } else {
      landActors.push(actor);
    }
  }

  // Clear paths for ship actors (walkability changed)
  for (const actor of shipActors) {
    actor.path = [];
    if (actor.state === CrewState.WALKING) {
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }
  }

  // Strand land actors on the island
  if (landActors.length > 0 && islandId != null) {
    for (const actor of landActors) {
      actor.path = [];
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
      actor.conversationPartnerId = null;
      actor.speechBubbleText = null;
      actor.copulationTarget = null;
    }
    const existing = world.strandedActors.get(islandId) ?? [];
    existing.push(...landActors);
    world.strandedActors.set(islandId, existing);

    for (const actor of landActors) {
      world.activityLog.push({text: `${actor.profile.name} left behind at ${docking.island?.name ?? 'island'}`, time: world.time});
    }
  }
  world.actors = shipActors;

  // Remove NPC relations from remaining actors
  for (const actor of world.actors) {
    actor.relations = actor.relations.filter(r => !npcIds.has(r.actorId));
  }

  // Deselect if selected actor was left behind
  if (world.selectedActorId != null && landActors.some(a => a.id === world.selectedActorId)) {
    world.selectedActorId = null;
  }

  // Break conversations/interactions where partner was left behind
  const landActorIds = new Set(landActors.map(a => a.id));
  for (const actor of shipActors) {
    if (actor.conversationPartnerId != null && landActorIds.has(actor.conversationPartnerId)) {
      actor.conversationPartnerId = null;
      actor.speechBubbleText = null;
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }
    if (actor.copulationTarget?.type === 'crew' && landActorIds.has(actor.copulationTarget.actorId)) {
      actor.copulationTarget = null;
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }
  }

  // Separate corpses on ship vs on land
  const shipCorpses: typeof world.corpses = [];
  const landCorpses: typeof world.corpses = [];
  for (const corpse of world.corpses) {
    const tileX = Math.floor(corpse.pixelX / TILE_SIZE);
    const tileY = Math.floor(corpse.pixelY / TILE_SIZE);
    if (isOnShip(tileX, tileY)) {
      shipCorpses.push(corpse);
    } else {
      landCorpses.push(corpse);
    }
  }
  if (landCorpses.length > 0 && islandId != null) {
    const existing = world.strandedCorpses.get(islandId) ?? [];
    existing.push(...landCorpses);
    world.strandedCorpses.set(islandId, existing);
  }
  world.corpses = shipCorpses;

  // Remove harbor lantern keys and barrel inventory
  for (const key of [...world.lanternOil.keys()]) {
    const [d, x, y] = key.split('-').map(Number);
    if (d === 1 && !isOnShip(x, y)) {
      world.lanternOil.delete(key);
    }
  }
  for (const key of [...world.barrelInventory.keys()]) {
    const [d, x, y] = key.split('-').map(Number);
    if (d === 1 && !isOnShip(x, y)) {
      world.barrelInventory.delete(key);
    }
  }

  // Clear gangplank connections
  world.gangplanks = [];

  // Start undocking animation
  docking.phase = 'undocking';
  docking.harborAnimOffset = 0;

  world.activityLog.push({text: `Leaving ${docking.island?.name ?? 'harbor'}`, time: world.time});
}

/** Complete undocking — clear all harbor state. */
export function completeUndocking(world: World): void {
  world.docking = {
    phase: 'none',
    island: null,
    harborTiles: [],
    harborWidth: 0,
    harborHeight: 0,
    harborAnimOffset: 0,
  };
}

// --- Harbor NPC system ---

export interface HarborNPCDef {
  name: string;
  role: string;
  color: string;
  tileX: number;
  tileY: number;
  sex: 'M' | 'F';
}

const HARBOR_NPCS: HarborNPCDef[] = [
  // Shopkeepers (confined to their buildings)
  { name: 'Greg',    role: 'bartender',  color: '#cc6633', tileX: 5,  tileY: 8, sex: 'M' },
  { name: 'Betty',   role: 'innkeeper',  color: '#9966cc', tileX: 17, tileY: 8, sex: 'F' },
  { name: 'Walter',  role: 'merchant',   color: '#339966', tileX: 5,  tileY: 16, sex: 'M' },
  { name: 'Ida',     role: 'blacksmith', color: '#cc3333', tileX: 17, tileY: 17, sex: 'F' },
  // Townsfolk (wander the harbor freely)
  { name: 'Old Tom',   role: 'townsfolk', color: '#8b7355', tileX: 8,  tileY: 12, sex: 'M' },
  { name: 'Maggie',    role: 'townsfolk', color: '#cc9966', tileX: 14, tileY: 12, sex: 'F' },
  { name: 'Little Jim', role: 'townsfolk', color: '#6699cc', tileX: 11, tileY: 21, sex: 'M' },
];

function getNextActorId(world: World): number {
  let maxId = 0;
  for (const actor of world.actors) {
    if (actor.id > maxId) maxId = actor.id;
  }
  return maxId + 1;
}

function createNPC(def: HarborNPCDef, id: number): Actor {
  const actor: Actor = {
    id,
    actorType: 'human',
    profile: {
      name: def.name,
      sex: def.sex,
      color: def.color,
      spriteIndex: id % 4,
      numberOfHands: 2,
      hunger: 255,
      energy: 255,
      morale: 200,
      inventory: [],
      hands: [],
    },
    health: 100,
    maxHealth: 100,
    carryingCorpseId: null,
    statuses: new Map<string, Record<string, any> | null>(),
    conditions: new Set(),
    skills: {},
    pixelX: def.tileX * TILE_SIZE + TILE_SIZE / 2,
    pixelY: def.tileY * TILE_SIZE + TILE_SIZE / 2,
    facing: 'south',
    deck: 1, // upper deck (harbor deck)
    state: CrewState.IDLE,
    targetState: CrewState.IDLE,
    path: [],
    stateTimer: 0,
    idleTimer: 2 + Math.random() * 3,
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
  // Mark as NPC with role and home position
  actor.statuses.set('npc', { role: def.role, homeX: def.tileX, homeY: def.tileY });
  return actor;
}

function createHarborCat(id: number): Actor {
  const CAT_NAMES = ['Whiskers', 'Patches', 'Shadow', 'Ginger', 'Socks', 'Smokey'];
  const name = CAT_NAMES[Math.floor(Math.random() * CAT_NAMES.length)];
  const actor: Actor = {
    id,
    actorType: 'cat',
    profile: {
      name,
      sex: Math.random() < 0.5 ? 'M' : 'F',
      color: '#d4a857',
      spriteIndex: 0,
      numberOfHands: 0,
      hunger: 200,
      energy: 200,
      morale: 200,
      inventory: [],
      hands: [],
    },
    health: 30,
    maxHealth: 30,
    carryingCorpseId: null,
    statuses: new Map<string, Record<string, any> | null>(),
    conditions: new Set(),
    skills: {},
    pixelX: 11 * TILE_SIZE + TILE_SIZE / 2,
    pixelY: 12 * TILE_SIZE + TILE_SIZE / 2,
    facing: 'south',
    deck: 1,
    state: CrewState.IDLE,
    targetState: CrewState.IDLE,
    path: [],
    stateTimer: 0,
    idleTimer: 1 + Math.random() * 3,
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
  actor.statuses.set('npc', { role: 'cat', homeX: 11, homeY: 12 });
  return actor;
}

function spawnHarborNPCs(world: World): void {
  let nextId = getNextActorId(world);
  const npcs: Actor[] = [];

  for (const def of HARBOR_NPCS) {
    const npc = createNPC(def, nextId++);
    npcs.push(npc);
  }

  // Spawn a harbor cat
  const cat = createHarborCat(nextId++);
  npcs.push(cat);

  // Initialize relations between NPCs and all existing actors
  for (const npc of npcs) {
    for (const actor of world.actors) {
      npc.relations.push({ actorId: actor.id, friendship: 128, attraction: 0 });
      actor.relations.push({ actorId: npc.id, friendship: 128, attraction: 0 });
    }
    // NPC-NPC relations
    for (const other of npcs) {
      if (other.id !== npc.id) {
        npc.relations.push({ actorId: other.id, friendship: 192, attraction: 0 });
      }
    }
  }

  world.actors.push(...npcs);
}
