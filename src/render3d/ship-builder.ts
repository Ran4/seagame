import * as THREE from 'three';
import { Deck, TileType } from '../types';
import { createTileMesh } from './tile-meshes';
import { EXPANDED_WIDTH, EXPANDED_HEIGHT } from '../harbor';

export const DECK_HEIGHT = 2.5;

// Offset to center the ship grid at the origin
export const GRID_OFFSET_X = EXPANDED_WIDTH / 2;
export const GRID_OFFSET_Z = EXPANDED_HEIGHT / 2;

export interface ShipScene {
  shipGroup: THREE.Group;
  deckGroups: THREE.Group[];
  // Rebuild a single deck (e.g. after harbor tiles merge in)
  rebuildDeck(deckIndex: number, deck: Deck): void;
}

export function buildShip(decks: Deck[]): ShipScene {
  const shipGroup = new THREE.Group();
  const deckGroups: THREE.Group[] = [];

  for (let d = 0; d < decks.length; d++) {
    const deckGroup = buildDeckGroup(d, decks[d]);
    deckGroups.push(deckGroup);
    shipGroup.add(deckGroup);
  }

  function rebuildDeck(deckIndex: number, deck: Deck): void {
    const oldGroup = deckGroups[deckIndex];
    shipGroup.remove(oldGroup);
    disposeGroup(oldGroup);

    const newGroup = buildDeckGroup(deckIndex, deck);
    deckGroups[deckIndex] = newGroup;
    shipGroup.add(newGroup);
  }

  return { shipGroup, deckGroups, rebuildDeck };
}

function buildDeckGroup(deckIndex: number, deck: Deck): THREE.Group {
  const deckGroup = new THREE.Group();
  deckGroup.name = `deck_${deckIndex}`;
  // Deck 0 (crow's nest) is highest, deck 2 is at water level
  const deckY = (2 - deckIndex) * DECK_HEIGHT;
  deckGroup.position.y = deckY;

  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      const tile = deck.tiles[y][x];
      if (tile === TileType.WATER) continue;

      const mesh = createTileMesh(tile, x, y, deckIndex);
      if (!mesh) continue;

      // Position: center the grid at origin
      mesh.position.x = x - GRID_OFFSET_X;
      mesh.position.z = y - GRID_OFFSET_Z;
      // Hull tiles sit slightly lower so their top edge meets the floor
      if (tile === TileType.HULL) {
        mesh.position.y = -0.175;
      }
      // Harbor walls are taller, position their base on the ground
      if (tile === TileType.HARBOR_WALL) {
        mesh.position.y = 0.75;
      }

      deckGroup.add(mesh);
    }
  }

  return deckGroup;
}

// Dispose all geometries and materials in a group to free GPU memory
function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // Don't dispose shared geometries from GEOM cache
      // (they're reused; Three.js handles shared disposal)
      if (obj.material instanceof THREE.Material) {
        // Don't dispose shared materials from MAT cache either
      }
    }
  });
  group.clear();
}
