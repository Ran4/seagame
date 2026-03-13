import {Camera, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, Actor, Deck, WALKABLE, SELECTABLE_OBJECTS, DeckPoint} from './types';

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

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    state.mouseClick = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    state.rightClick = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.scrollY += Math.sign(e.deltaY) * TILE_SIZE * 4;
  }, {passive: false});

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    state.mousePos = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  });

  return state;
}

export function updateCamera(camera: Camera, input: InputState, dt: number, shipWidth: number, shipHeight: number): void {
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
  camera.x = Math.max(-CANVAS_WIDTH + TILE_SIZE / 2, Math.min(shipWidth * TILE_SIZE - TILE_SIZE / 2, camera.x));
  const maxY = shipHeight * TILE_SIZE - CANVAS_HEIGHT;
  camera.y = Math.max(-TILE_SIZE * 3, Math.min(maxY + TILE_SIZE * 3, camera.y));
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
    // Stairs → switch deck
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
