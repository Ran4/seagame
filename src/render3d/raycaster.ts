import * as THREE from 'three';
import { TileType, Actor, Corpse, WALKABLE, SELECTABLE_OBJECTS, DeckPoint, TILE_SIZE } from '../types';
import { DECK_HEIGHT, GRID_OFFSET_X, GRID_OFFSET_Z } from './ship-builder';
import type { TileMeshUserData } from './tile-meshes';

export type RaycastResult =
  | { type: 'selectCrew'; actorId: number }
  | { type: 'selectCorpse'; corpseActorId: number }
  | { type: 'moveTo'; target: DeckPoint }
  | { type: 'useStairs'; tileX: number; tileY: number }
  | { type: 'selectObject'; tileType: TileType; x: number; y: number; deck: number }
  | null;

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

export function raycastWorld(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  camera: THREE.PerspectiveCamera,
  actorGroup: THREE.Group,
  deckGroups: THREE.Group[],
  activeDeck: number,
): RaycastResult {
  // Convert screen coords to normalized device coordinates (-1 to +1)
  mouseNDC.x = (screenX / canvasWidth) * 2 - 1;
  mouseNDC.y = -(screenY / canvasHeight) * 2 + 1;

  raycaster.setFromCamera(mouseNDC, camera);

  // 1. Check actors first (crew selection takes priority)
  const actorHits = raycaster.intersectObjects(actorGroup.children, false);
  for (const hit of actorHits) {
    const ud = hit.object.userData;
    if (ud.isActor && typeof ud.actorId === 'number') {
      return { type: 'selectCrew', actorId: ud.actorId };
    }
    if (ud.isCorpse && typeof ud.corpseActorId === 'number') {
      return { type: 'selectCorpse', corpseActorId: ud.corpseActorId };
    }
  }

  // 2. Check tile meshes on all visible decks (prefer active deck)
  // Raycast against the active deck group first, then others
  const orderedDecks = [activeDeck, ...Array.from({ length: deckGroups.length }, (_, i) => i).filter(i => i !== activeDeck)];

  for (const deckIdx of orderedDecks) {
    const deckGroup = deckGroups[deckIdx];
    if (!deckGroup || !deckGroup.visible) continue;

    const hits = raycaster.intersectObjects(deckGroup.children, true);
    for (const hit of hits) {
      // Walk up to find the object with tile userData
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData?.tileType && obj.userData?.tileType !== 0) {
        obj = obj.parent;
      }
      if (!obj) continue;

      const ud = obj.userData as TileMeshUserData;
      if (ud.tileType === undefined) continue;

      const tile = ud.tileType as TileType;
      const tileX = ud.tileX;
      const tileY = ud.tileY;
      const deck = ud.deck;

      // Stairs / Mast → switch deck
      if (tile === TileType.STAIRS || tile === TileType.MAST) {
        return { type: 'useStairs', tileX, tileY };
      }

      // Walkable → move to
      if (WALKABLE.has(tile)) {
        return { type: 'moveTo', target: { x: tileX, y: tileY, deck } };
      }

      // Selectable object
      if (SELECTABLE_OBJECTS.has(tile)) {
        return { type: 'selectObject', tileType: tile, x: tileX, y: tileY, deck };
      }
    }
  }

  return null;
}

// Project a 3D world position to screen coordinates (for context menu / overlay positioning)
export function projectToScreen(
  worldPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const projected = worldPos.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * canvasWidth,
    y: (-projected.y * 0.5 + 0.5) * canvasHeight,
  };
}

// Convert tile coordinates to a 3D world position (for projecting to screen)
export function tileToWorldPos(tileX: number, tileY: number, deck: number): THREE.Vector3 {
  return new THREE.Vector3(
    tileX - GRID_OFFSET_X,
    (2 - deck) * DECK_HEIGHT + 0.1,
    tileY - GRID_OFFSET_Z,
  );
}

// Convert actor pixel position to 3D world position
export function actorToWorldPos(pixelX: number, pixelY: number, deck: number): THREE.Vector3 {
  return new THREE.Vector3(
    pixelX / TILE_SIZE - GRID_OFFSET_X,
    (2 - deck) * DECK_HEIGHT + 0.3,
    pixelY / TILE_SIZE - GRID_OFFSET_Z,
  );
}
