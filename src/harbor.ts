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

// Tile offset: harbor tile (hx, hy) appears at ship tile (hx + X_OFFSET, hy + Y_OFFSET) when docked
// Gangplank sits in the gap at expanded x = DECK_X_SHIFT - 1, between wharf(12) and ship hull(14)
export const HARBOR_X_TILE_OFFSET = -14;
export const HARBOR_Y_TILE_OFFSET = -7;

// When docking completes, all decks expand. Ship tiles shift right/down by these amounts.
export const DECK_X_SHIFT = 14;
export const DECK_Y_SHIFT = 7;

// Docking animation: harborAnimOffset starts negative and increases to 0
export const HARBOR_ANIM_START = -21 * TILE_SIZE; // -672

// Docking speed in pixels/sec
export const DOCKING_SPEED = 80;

// Undocking ends when harborAnimOffset reaches this (harbor fully off-screen)
export const UNDOCKING_END = -26 * TILE_SIZE;

// Gangplank positions (in original, pre-expansion coordinates)
const HARBOR_GANGPLANK_X = 12;
const HARBOR_GANGPLANK_Y = 15;
const SHIP_GANGPLANK_X = 0;
const SHIP_GANGPLANK_Y = 8;

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
    originalWidth: 0,
    originalHeight: 0,
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

/** Complete docking — expand all decks to include harbor tiles as part of upper deck. */
export function completeDocking(world: World): void {
  const docking = world.docking;

  // Save original dimensions before expanding (needed for undocking)
  docking.originalWidth = world.decks[0].width;
  docking.originalHeight = world.decks[0].height;

  docking.phase = 'docked';
  docking.harborAnimOffset = 0;

  const newWidth = docking.harborWidth;   // 26
  const newHeight = docking.harborHeight; // 30

  // Expand all decks: ship tiles shift right/down, fill rest with water
  for (let d = 0; d < world.decks.length; d++) {
    const oldDeck = world.decks[d];
    const newTiles: TileType[][] = [];
    for (let y = 0; y < newHeight; y++) {
      const row: TileType[] = [];
      for (let x = 0; x < newWidth; x++) {
        const oldX = x - DECK_X_SHIFT;
        const oldY = y - DECK_Y_SHIFT;
        if (oldX >= 0 && oldX < oldDeck.width && oldY >= 0 && oldY < oldDeck.height) {
          row.push(oldDeck.tiles[oldY][oldX]);
        } else {
          row.push(TileType.WATER);
        }
      }
      newTiles.push(row);
    }

    // Upper deck (d=1): fill harbor tiles where ship has water, then place gangplank
    if (d === 1) {
      for (let y = 0; y < docking.harborHeight; y++) {
        for (let x = 0; x < docking.harborWidth; x++) {
          const tile = docking.harborTiles[y][x];
          if (tile !== TileType.WATER && newTiles[y][x] === TileType.WATER) {
            newTiles[y][x] = tile;
          }
        }
      }
      // Gangplank in the gap between wharf and ship hull
      newTiles[SHIP_GANGPLANK_Y + DECK_Y_SHIFT][DECK_X_SHIFT - 1] = TileType.GANGPLANK;
      // Convert adjacent ship hull to floor so crew can walk onto the gangplank
      newTiles[SHIP_GANGPLANK_Y + DECK_Y_SHIFT][DECK_X_SHIFT] = TileType.FLOOR;
    }

    world.decks[d] = {
      name: oldDeck.name,
      tiles: newTiles,
      width: newWidth,
      height: newHeight,
    };
  }

  // Shift all actor positions and clear paths
  for (const actor of world.actors) {
    actor.pixelX += DECK_X_SHIFT * TILE_SIZE;
    actor.pixelY += DECK_Y_SHIFT * TILE_SIZE;
    actor.path = [];
    if (actor.state === CrewState.WALKING) {
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }
  }

  // Shift corpses
  for (const corpse of world.corpses) {
    corpse.pixelX += DECK_X_SHIFT * TILE_SIZE;
    corpse.pixelY += DECK_Y_SHIFT * TILE_SIZE;
  }

  // Shift camera
  world.camera.x += DECK_X_SHIFT * TILE_SIZE;
  world.camera.y += DECK_Y_SHIFT * TILE_SIZE;

  // Shift lantern oil keys (deck-x-y)
  const newLanternOil = new Map<string, number>();
  for (const [key, oil] of world.lanternOil) {
    const [d, x, y] = key.split('-').map(Number);
    newLanternOil.set(`${d}-${x + DECK_X_SHIFT}-${y + DECK_Y_SHIFT}`, oil);
  }
  // Add harbor lanterns (on upper deck, at their harbor-space positions)
  for (let y = 0; y < docking.harborHeight; y++) {
    for (let x = 0; x < docking.harborWidth; x++) {
      if (docking.harborTiles[y][x] === TileType.LANTERN) {
        newLanternOil.set(`1-${x}-${y}`, 0);
      }
    }
  }
  world.lanternOil = newLanternOil;

  // Shift barrel inventory keys (deck-x-y)
  const newBarrelInventory = new Map<string, Item[]>();
  for (const [key, items] of world.barrelInventory) {
    const [d, x, y] = key.split('-').map(Number);
    newBarrelInventory.set(`${d}-${x + DECK_X_SHIFT}-${y + DECK_Y_SHIFT}`, items);
  }
  world.barrelInventory = newBarrelInventory;

  world.activityLog.push({text: `Docked at ${docking.island?.name ?? 'harbor'}`, time: world.time});
}

/** Start undocking — shrink decks back to original size and begin undocking animation. */
export function startUndocking(world: World): void {
  const docking = world.docking;
  if (docking.phase !== 'docked') return;

  const origW = docking.originalWidth;
  const origH = docking.originalHeight;

  // Shrink all decks back to original dimensions (extract ship-only tiles)
  for (let d = 0; d < world.decks.length; d++) {
    const expanded = world.decks[d];
    const newTiles: TileType[][] = [];
    for (let y = 0; y < origH; y++) {
      const row: TileType[] = [];
      for (let x = 0; x < origW; x++) {
        row.push(expanded.tiles[y + DECK_Y_SHIFT][x + DECK_X_SHIFT]);
      }
      newTiles.push(row);
    }
    // Restore gangplank back to hull on upper deck
    if (d === 1) {
      newTiles[SHIP_GANGPLANK_Y][SHIP_GANGPLANK_X] = TileType.HULL;
    }
    world.decks[d] = {
      name: expanded.name,
      tiles: newTiles,
      width: origW,
      height: origH,
    };
  }

  // Shift actors back and handle out-of-bounds
  for (const actor of world.actors) {
    actor.pixelX -= DECK_X_SHIFT * TILE_SIZE;
    actor.pixelY -= DECK_Y_SHIFT * TILE_SIZE;
    actor.path = [];
    if (actor.state === CrewState.WALKING) {
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }

    // Check if actor is in a valid position
    const tileX = Math.floor(actor.pixelX / TILE_SIZE);
    const tileY = Math.floor(actor.pixelY / TILE_SIZE);
    const deckTiles = world.decks[actor.deck];
    const valid = tileX >= 0 && tileX < deckTiles.width &&
                  tileY >= 0 && tileY < deckTiles.height &&
                  WALKABLE.has(deckTiles.tiles[tileY][tileX]);

    if (!valid) {
      // Teleport to first floor tile on same deck
      outer:
      for (let sy = 0; sy < deckTiles.height; sy++) {
        for (let sx = 0; sx < deckTiles.width; sx++) {
          if (deckTiles.tiles[sy][sx] === TileType.FLOOR) {
            actor.pixelX = sx * TILE_SIZE + TILE_SIZE / 2;
            actor.pixelY = sy * TILE_SIZE + TILE_SIZE / 2;
            break outer;
          }
        }
      }
      actor.state = CrewState.IDLE;
      actor.idleTimer = 0;
    }
  }

  // Shift corpses back
  for (const corpse of world.corpses) {
    corpse.pixelX -= DECK_X_SHIFT * TILE_SIZE;
    corpse.pixelY -= DECK_Y_SHIFT * TILE_SIZE;
  }

  // Shift camera back
  world.camera.x -= DECK_X_SHIFT * TILE_SIZE;
  world.camera.y -= DECK_Y_SHIFT * TILE_SIZE;

  // Shift lanternOil keys back (drop harbor lanterns)
  const newLanternOil = new Map<string, number>();
  for (const [key, oil] of world.lanternOil) {
    const [d, x, y] = key.split('-').map(Number);
    const origX = x - DECK_X_SHIFT;
    const origY = y - DECK_Y_SHIFT;
    if (origX >= 0 && origX < origW && origY >= 0 && origY < origH) {
      newLanternOil.set(`${d}-${origX}-${origY}`, oil);
    }
  }
  world.lanternOil = newLanternOil;

  // Shift barrelInventory keys back
  const newBarrelInventory = new Map<string, Item[]>();
  for (const [key, items] of world.barrelInventory) {
    const [d, x, y] = key.split('-').map(Number);
    const origX = x - DECK_X_SHIFT;
    const origY = y - DECK_Y_SHIFT;
    if (origX >= 0 && origX < origW && origY >= 0 && origY < origH) {
      newBarrelInventory.set(`${d}-${origX}-${origY}`, items);
    }
  }
  world.barrelInventory = newBarrelInventory;

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
    originalWidth: 0,
    originalHeight: 0,
  };
}
