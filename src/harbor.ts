import {TileType, Deck, DockingState, Island, TILE_SIZE, CrewState, WALKABLE, Item} from './types';
import {stopSailing} from './worldmap';
import type {World} from './types';

// Harbor layout: 26 wide × 33 tall
// L = Land, W = Wharf, l = Lantern (on wharf), . = Water
// Wharf: 5-wide pier (cols 8-12), 7-row platform top (cols 8-23)
// Gangplank junction: harbor (12,15) ↔ ship (0,8)
const HARBOR_LAYOUT = `\
LLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLWWWWWWWWWWWWWWWW..
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWlW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLLWWWWW.............
LLLLLLLL..................
LLLLLLLL..................
LLLLLLLL..................
..........................
..........................
..........................
..........................
..........................
..........................
..........................
..........................`;

const HARBOR_CHAR_TO_TILE: Record<string, TileType> = {
  '.': TileType.WATER,
  'L': TileType.LAND,
  'W': TileType.WHARF,
  'l': TileType.LANTERN,
};

function parseHarborLayout(layout: string): TileType[][] {
  return layout.trim().split('\n')
    .map(row => [...row].map(ch => HARBOR_CHAR_TO_TILE[ch] ?? TileType.WATER));
}

// Ship is embedded at this offset within the expanded grid.
// The grid is always this size — harbor tiles fill in around the ship when docked.
export const DECK_X_SHIFT = 14;
export const DECK_Y_SHIFT = 7;
export const EXPANDED_WIDTH = 26;
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
const GANGPLANK_X = DECK_X_SHIFT - 1;  // 13
const GANGPLANK_Y = 8 + DECK_Y_SHIFT;  // 15 (ship row 8 + offset)
const GANGPLANK_HULL_X = DECK_X_SHIFT; // 14 (hull tile converted to floor for walkability)

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

  // Add harbor lantern oil entries
  for (let y = 0; y < docking.harborHeight; y++) {
    for (let x = 0; x < docking.harborWidth; x++) {
      if (docking.harborTiles[y][x] === TileType.LANTERN) {
        world.lanternOil.set(`1-${x}-${y}`, 0);
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

  // Separate actors on ship vs on land
  const islandId = docking.island?.id;
  const shipActors: typeof world.actors = [];
  const landActors: typeof world.actors = [];
  for (const actor of world.actors) {
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

  // Remove harbor lantern keys
  for (const key of [...world.lanternOil.keys()]) {
    const [d, x, y] = key.split('-').map(Number);
    if (d === 1 && !isOnShip(x, y)) {
      world.lanternOil.delete(key);
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
