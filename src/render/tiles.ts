import { TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, TileType, TILE_COLORS, Deck } from '../types';
import { RenderContext } from './context';
import { drawTileIconFallback } from './tile-icons';

const WATER_COLOR_1 = '#1a5276';
const WATER_COLOR_2 = '#1b6090';

export function drawWater(rc: RenderContext, time: number, waterOffset: { x: number; y: number }): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  // Water uses its own effective camera that includes the scroll offset,
  // so water moves independently of the ship tiles
  const effCamX = camera.x + waterOffset.x;
  const effCamY = camera.y + waterOffset.y;
  const startTileX = Math.floor(effCamX / TILE_SIZE);
  const startTileY = Math.floor(effCamY / TILE_SIZE);
  const tilesX = Math.ceil(CANVAS_WIDTH / TILE_SIZE) + 2;
  const tilesY = Math.ceil(CANVAS_HEIGHT / TILE_SIZE) + 2;
  const phase = Math.floor(time * 0.5) % 2;

  if (rc.sprites) {
    const waterImg = rc.sprites.waterFrames[phase];
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const worldTX = startTileX + tx;
        const worldTY = startTileY + ty;
        const sx = worldTX * TILE_SIZE - effCamX;
        const sy = worldTY * TILE_SIZE - effCamY;
        ctx.drawImage(waterImg, sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }
  } else {
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const worldTX = startTileX + tx;
        const worldTY = startTileY + ty;
        const isLight = (worldTX + worldTY + phase) % 2 === 0;
        ctx.fillStyle = isLight ? WATER_COLOR_1 : WATER_COLOR_2;
        const sx = worldTX * TILE_SIZE - effCamX;
        const sy = worldTY * TILE_SIZE - effCamY;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

export function drawDeck(rc: RenderContext, deck: Deck, time: number): void {
  const ctx = rc.ctx;
  const camera = rc.camera;
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      const tile = deck.tiles[y][x];
      if (tile === TileType.WATER) continue;

      const sx = x * TILE_SIZE - camera.x;
      const sy = y * TILE_SIZE - camera.y;
      if (sx + TILE_SIZE < 0 || sx > CANVAS_WIDTH || sy + TILE_SIZE < 0 || sy > CANVAS_HEIGHT) continue;

      const sprite = rc.sprites?.tiles.get(tile);
      if (sprite) {
        // Draw floor underneath furniture/objects with transparent backgrounds
        const needsFloorUnder = tile !== TileType.HULL && tile !== TileType.FLOOR && tile !== TileType.GANGPLANK
          && tile !== TileType.LAND && tile !== TileType.WHARF
          && tile !== TileType.HARBOR_WALL && tile !== TileType.HARBOR_FLOOR;
        if (needsFloorUnder) {
          const floorSprite = rc.sprites?.tiles.get(TileType.FLOOR);
          if (floorSprite) {
            ctx.drawImage(floorSprite, sx, sy, TILE_SIZE, TILE_SIZE);
          }
        }
        // Gangplank: no background — water layer shows through transparency
        ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);
        // Bright glow on lit lantern sprite
        if (tile === TileType.LANTERN) {
          const lKey = `${rc.deckIndex}-${x}-${y}`;
          const lOil = rc.lanternOil.get(lKey) ?? 0;
          if (lOil > 0) {
            const intensity = Math.min(1, lOil / 20);
            const prevComp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';
            const gcx = sx + TILE_SIZE / 2;
            const gcy = sy + TILE_SIZE / 2;
            const grad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, TILE_SIZE * 0.7);
            grad.addColorStop(0, `rgba(255, 220, 100, ${0.6 * intensity})`);
            grad.addColorStop(0.6, `rgba(255, 180, 60, ${0.25 * intensity})`);
            grad.addColorStop(1, 'rgba(255, 160, 40, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(sx - TILE_SIZE * 0.2, sy - TILE_SIZE * 0.2, TILE_SIZE * 1.4, TILE_SIZE * 1.4);
            ctx.globalCompositeOperation = prevComp;
          }
        }
      } else {
        ctx.fillStyle = TILE_COLORS[tile];
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

        if (tile === TileType.FLOOR || tile === TileType.STAIRS || tile === TileType.HELM) {
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }
        if (tile === TileType.HULL) {
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }
        drawTileIconFallback(rc, tile, sx, sy);
      }
    }
  }
}
