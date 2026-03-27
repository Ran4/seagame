import {Camera, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, Actor, Deck, WALKABLE, SELECTABLE_OBJECTS, DeckPoint} from './types';
import {DECK_X_SHIFT, SHIP_WIDTH} from './harbor';

export interface InputState {
  keysDown: Set<string>;
  keyEvents: string[];  // raw keydown event.key values, consumed each frame
  mouseClick: {x: number; y: number} | null;
  rightClick: {x: number; y: number} | null;
  mousePos: {x: number; y: number};
  scrollY: number; // accumulated scroll in pixels
  hiddenInput: HTMLInputElement;
  commandBarOpen: boolean; // set by game.ts, used to preventDefault in keydown
  commandBarMode: 'html' | 'ingame';
}

export function createInputHandler(canvas: HTMLCanvasElement): InputState {
  const hiddenInput = document.createElement('input');
  hiddenInput.id = 'command-input';
  hiddenInput.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
  hiddenInput.setAttribute('autocomplete', 'off');
  document.body.appendChild(hiddenInput);

  const state: InputState = {
    keysDown: new Set(),
    keyEvents: [],
    mouseClick: null,
    rightClick: null,
    mousePos: {x: 0, y: 0},
    scrollY: 0,
    hiddenInput,
    commandBarOpen: false,
    commandBarMode: 'html',
  };

  window.addEventListener('keydown', (e) => {
    // Prevent Tab from moving focus; prevent Backspace from navigating back (manual mode only —
    // in html mode the hidden input needs to receive Backspace natively)
    if (state.commandBarOpen) {
      if (e.key === 'Tab') e.preventDefault();
      if (e.key === 'Backspace' && state.commandBarMode === 'ingame') e.preventDefault();
    }
    state.keysDown.add(e.key);
    state.keyEvents.push(e.key);
  });

  window.addEventListener('keyup', (e) => {
    state.keysDown.delete(e.key);
  });

  // In 3D mode, map screen coordinates to the overlay canvas dimensions (960x540)
  // so that 2D UI hit testing works correctly
  function screenToOverlay(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    // Map to 960x540 overlay space for UI consistency
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('click', (e) => {
    state.mouseClick = screenToOverlay(e);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    state.rightClick = screenToOverlay(e);
  });

  canvas.addEventListener('wheel', (e) => {
    // In 3D mode, let OrbitControls handle zoom natively
    const is3D = !!(window as any).__renderer3d;
    if (!is3D) {
      e.preventDefault();
      state.scrollY += Math.sign(e.deltaY) * TILE_SIZE * 4;
    }
  }, {passive: false});

  canvas.addEventListener('mousemove', (e) => {
    state.mousePos = screenToOverlay(e);
  });

  return state;
}

export function updateCamera(camera: Camera, input: InputState, dt: number, shipWidth: number, shipHeight: number, isDocked = false): void {
  // In 3D mode, WASD pans the OrbitControls target; scroll is handled by OrbitControls natively
  const renderer3d = (window as any).__renderer3d;
  if (renderer3d) {
    const panSpeed = 6 * dt; // world units per second
    const controls = renderer3d.controls;
    if (input.keysDown.has('ArrowUp') || input.keysDown.has('w')) controls.target.z -= panSpeed;
    if (input.keysDown.has('ArrowDown') || input.keysDown.has('s')) controls.target.z += panSpeed;
    if (input.keysDown.has('ArrowLeft') || input.keysDown.has('a')) controls.target.x -= panSpeed;
    if (input.keysDown.has('ArrowRight') || input.keysDown.has('d')) controls.target.x += panSpeed;
    // Consume scroll (OrbitControls handles zoom via its own wheel listener)
    input.scrollY = 0;
    return;
  }

  const scrollSpeed = 200;

  if (input.keysDown.has('ArrowUp') || input.keysDown.has('w')) camera.y -= scrollSpeed * dt;
  if (input.keysDown.has('ArrowDown') || input.keysDown.has('s')) camera.y += scrollSpeed * dt;
  if (input.keysDown.has('ArrowLeft') || input.keysDown.has('a')) camera.x -= scrollSpeed * dt;
  if (input.keysDown.has('ArrowRight') || input.keysDown.has('d')) camera.x += scrollSpeed * dt;

  // Mouse wheel scroll
  if (input.scrollY !== 0) {
    camera.y += input.scrollY;
    input.scrollY = 0;
  }

  // Clamp X so you can scroll until only half of the ship's outermost tile is visible
  // - we do not want the user to not find the boat...
  // When docked, limit left scroll so at least half of the ship's leftmost tile is visible
  const minX = isDocked
    ? DECK_X_SHIFT * TILE_SIZE + TILE_SIZE / 2 - CANVAS_WIDTH
    : -CANVAS_WIDTH + TILE_SIZE / 2;
  const maxX = isDocked
    ? (DECK_X_SHIFT + SHIP_WIDTH) * TILE_SIZE - TILE_SIZE / 2
    : shipWidth * TILE_SIZE - TILE_SIZE / 2;
  camera.x = Math.max(minX, Math.min(maxX, camera.x));
  const maxY = shipHeight * TILE_SIZE - CANVAS_HEIGHT;
  camera.y = Math.max(0, Math.min(maxY + TILE_SIZE * 3, camera.y));
}

export function handleClick(
  click: {x: number; y: number},
  camera: Camera,
  crew: Actor[],
  activeDeck: number,
  deck: Deck,
): {type: 'selectCrew'; actorId: number}
  | {type: 'moveTo'; target: DeckPoint}
  | {type: 'useStairs'; tileX: number; tileY: number}
  | {type: 'selectObject'; tileType: TileType; x: number; y: number; deck: number}
  | null {
  const worldX = click.x + camera.x;
  const worldY = click.y + camera.y;
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);

  // Check crew members first
  for (const member of crew) {
    if (member.deck !== activeDeck) continue;
    const dx = worldX - member.pixelX;
    const dy = worldY - member.pixelY;
    if (dx * dx + dy * dy < 14 * 14) {
      return {type: 'selectCrew', actorId: member.id};
    }
  }

  // Check tile
  if (tileY >= 0 && tileY < deck.height && tileX >= 0 && tileX < deck.width) {
    const clickedTile = deck.tiles[tileY][tileX];
    // Stairs / Mast → switch deck
    if (clickedTile === TileType.STAIRS || clickedTile === TileType.MAST) {
      return {type: 'useStairs', tileX, tileY};
    }
    if (WALKABLE.has(clickedTile)) {
      return {type: 'moveTo', target: {x: tileX, y: tileY, deck: activeDeck}};
    }
    if (SELECTABLE_OBJECTS.has(clickedTile)) {
      return {type: 'selectObject', tileType: clickedTile, x: tileX, y: tileY, deck: activeDeck};
    }
  }

  return null;
}
