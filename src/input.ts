import { Camera, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, CrewMember, Deck, WALKABLE, DeckPoint } from './types';

export interface InputState {
  keysDown: Set<string>;
  mouseClick: { x: number; y: number } | null;
  mousePos: { x: number; y: number };
}

export function createInputHandler(canvas: HTMLCanvasElement): InputState {
  const state: InputState = {
    keysDown: new Set(),
    mouseClick: null,
    mousePos: { x: 0, y: 0 },
  };

  window.addEventListener('keydown', (e) => {
    state.keysDown.add(e.key);
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

export function updateCamera(camera: Camera, input: InputState, dt: number, shipHeight: number): void {
  const scrollSpeed = 200;

  if (input.keysDown.has('ArrowUp') || input.keysDown.has('w')) camera.y -= scrollSpeed * dt;
  if (input.keysDown.has('ArrowDown') || input.keysDown.has('s')) camera.y += scrollSpeed * dt;
  if (input.keysDown.has('ArrowLeft') || input.keysDown.has('a')) camera.x -= scrollSpeed * dt;
  if (input.keysDown.has('ArrowRight') || input.keysDown.has('d')) camera.x += scrollSpeed * dt;

  const maxY = shipHeight * TILE_SIZE - CANVAS_HEIGHT;
  camera.y = Math.max(-TILE_SIZE * 3, Math.min(maxY + TILE_SIZE * 3, camera.y));
}

export function handleClick(
  click: { x: number; y: number },
  camera: Camera,
  crew: CrewMember[],
  activeDeck: number,
  deck: Deck,
): { type: 'selectCrew'; crewId: number } | { type: 'moveTo'; target: DeckPoint } | { type: 'useStairs' } | null {
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
      return { type: 'selectCrew', crewId: member.id };
    }
  }

  // Check tile
  if (tileY >= 0 && tileY < deck.height && tileX >= 0 && tileX < deck.width) {
    const clickedTile = deck.tiles[tileY][tileX];
    // Stairs → switch deck
    if (clickedTile === TileType.STAIRS) {
      return { type: 'useStairs' };
    }
    if (WALKABLE.has(clickedTile)) {
      return { type: 'moveTo', target: { x: tileX, y: tileY, deck: activeDeck } };
    }
  }

  return null;
}
