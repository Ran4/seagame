import { TILE_SIZE, TileType, WALKABLE, SELECTABLE_OBJECTS, DeckPoint, Actor, Corpse } from './types';
import { raycastWorld, type RaycastResult } from './render3d/raycaster';
import type { Renderer3D } from './renderer3d';

// Translate a screen-space click to a world-space result using 3D raycasting.
// Returns the same result types as the 2D handleClick() in input.ts.
export function handleClick3D(
  click: { x: number; y: number },
  renderer: Renderer3D,
  activeDeck: number,
): RaycastResult {
  return raycastWorld(
    click.x,
    click.y,
    renderer.overlayWidth,
    renderer.overlayHeight,
    renderer.camera,
    renderer.actorGroup,
    renderer.deckGroups,
    activeDeck,
  );
}

// For right-click context menus, we need to determine which tile/actor was right-clicked
// and convert back to the 2D tile coordinates that buildContextMenu expects.
export interface RightClickWorldInfo {
  // The tile coordinates that were hit
  tileX: number;
  tileY: number;
  deck: number;
  // The actor that was hit, if any
  clickedActorId: number | null;
  // The corpse that was hit, if any
  clickedCorpseId: number | null;
  // Screen position for menu placement
  screenX: number;
  screenY: number;
}

export function resolveRightClick3D(
  click: { x: number; y: number },
  renderer: Renderer3D,
  activeDeck: number,
): RightClickWorldInfo | null {
  const result = raycastWorld(
    click.x,
    click.y,
    renderer.overlayWidth,
    renderer.overlayHeight,
    renderer.camera,
    renderer.actorGroup,
    renderer.deckGroups,
    activeDeck,
  );

  if (!result) return null;

  switch (result.type) {
    case 'selectCrew':
      return {
        tileX: 0, tileY: 0, deck: activeDeck,
        clickedActorId: result.actorId,
        clickedCorpseId: null,
        screenX: click.x, screenY: click.y,
      };
    case 'selectCorpse':
      return {
        tileX: 0, tileY: 0, deck: activeDeck,
        clickedActorId: null,
        clickedCorpseId: result.corpseActorId,
        screenX: click.x, screenY: click.y,
      };
    case 'moveTo':
      return {
        tileX: result.target.x, tileY: result.target.y, deck: result.target.deck,
        clickedActorId: null,
        clickedCorpseId: null,
        screenX: click.x, screenY: click.y,
      };
    case 'useStairs':
      return {
        tileX: result.tileX, tileY: result.tileY, deck: activeDeck,
        clickedActorId: null,
        clickedCorpseId: null,
        screenX: click.x, screenY: click.y,
      };
    case 'selectObject':
      return {
        tileX: result.x, tileY: result.y, deck: result.deck,
        clickedActorId: null,
        clickedCorpseId: null,
        screenX: click.x, screenY: click.y,
      };
    default:
      return null;
  }
}
