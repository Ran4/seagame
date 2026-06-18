import { TILE_SIZE, TileType } from '../types';
import { RenderContext } from './context';

export function drawTileIconFallback(rc: RenderContext, tile: TileType, sx: number, sy: number): void {
  const ctx = rc.ctx;
  const cx = sx + TILE_SIZE / 2;
  const cy = sy + TILE_SIZE / 2;

  switch (tile) {
    case TileType.STAIRS: {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + 8, cy + i * 5);
        ctx.lineTo(sx + TILE_SIZE - 8, cy + i * 5);
        ctx.stroke();
      }
      break;
    }
    case TileType.HELM: {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 6, cy + Math.sin(angle) * 6);
        ctx.lineTo(cx + Math.cos(angle) * 10, cy + Math.sin(angle) * 10);
        ctx.stroke();
      }
      break;
    }
    case TileType.MAST: {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1f14';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case TileType.CANNON: {
      ctx.fillStyle = '#555';
      ctx.fillRect(cx - 4, cy - 8, 8, 16);
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case TileType.STOVE: {
      ctx.fillStyle = '#661a00';
      ctx.fillRect(sx + 6, sy + 6, TILE_SIZE - 12, TILE_SIZE - 12);
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
      break;
    }
    case TileType.BED: {
      ctx.fillStyle = '#4a6a8a';
      ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#8ab4d4';
      ctx.fillRect(sx + 6, sy + 4, TILE_SIZE - 12, 8);
      break;
    }
    case TileType.BARREL: {
      ctx.fillStyle = '#6b4f0a';
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case TileType.TABLE: {
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      break;
    }
    case TileType.LANTERN: {
      const litKey = getLanternKeyFromScreen(rc, sx, sy);
      const litOil = litKey ? (rc.lanternOil.get(litKey) ?? 0) : 0;
      // Base/handle
      ctx.fillStyle = '#8a6820';
      ctx.fillRect(cx - 2, sy + 4, 4, 4);   // handle top
      ctx.fillRect(cx - 1, sy + 3, 2, 2);   // handle tip
      // Glass body
      ctx.fillStyle = litOil > 0 ? 'rgba(255,200,60,0.5)' : 'rgba(180,180,180,0.3)';
      ctx.fillRect(cx - 5, sy + 8, 10, 14);
      // Brass frame
      ctx.strokeStyle = '#b8892e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 5, sy + 8, 10, 14);
      ctx.fillStyle = '#b8892e';
      ctx.fillRect(cx - 6, sy + 7, 12, 2);  // top rim
      ctx.fillRect(cx - 6, sy + 21, 12, 3); // bottom base
      // Flame when lit
      if (litOil > 0) {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.ellipse(cx, sy + 15, 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.ellipse(cx, sy + 14, 1, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case TileType.MAP_TABLE: {
      // Green table with parchment + compass cross
      ctx.fillStyle = '#3a5a34';
      ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      // Parchment
      ctx.fillStyle = '#d4c49a';
      ctx.fillRect(sx + 7, sy + 7, TILE_SIZE - 14, TILE_SIZE - 14);
      // Compass cross
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, sy + 9);
      ctx.lineTo(cx, sy + TILE_SIZE - 9);
      ctx.moveTo(sx + 9, cy);
      ctx.lineTo(sx + TILE_SIZE - 9, cy);
      ctx.stroke();
      // Compass circle
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case TileType.WHARF: {
      // Brown wooden planks
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Horizontal plank lines
      ctx.strokeStyle = 'rgba(90, 60, 30, 0.3)';
      for (let py = 8; py < TILE_SIZE; py += 8) {
        ctx.beginPath();
        ctx.moveTo(sx + 1, sy + py);
        ctx.lineTo(sx + TILE_SIZE - 1, sy + py);
        ctx.stroke();
      }
      break;
    }
    case TileType.LAND: {
      // Green grass with subtle texture
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Grass dots
      ctx.fillStyle = 'rgba(60, 100, 40, 0.3)';
      ctx.fillRect(sx + 8, sy + 6, 2, 3);
      ctx.fillRect(sx + 20, sy + 14, 2, 3);
      ctx.fillRect(sx + 14, sy + 24, 2, 3);
      break;
    }
    case TileType.GANGPLANK: {
      // Wooden plank bridge (horizontal)
      ctx.fillStyle = '#a08050';
      ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      // Cross-planks (vertical)
      ctx.strokeStyle = 'rgba(80, 50, 20, 0.3)';
      for (let px = 6; px < TILE_SIZE - 4; px += 6) {
        ctx.beginPath();
        ctx.moveTo(sx + px, sy + 3);
        ctx.lineTo(sx + px, sy + TILE_SIZE - 3);
        ctx.stroke();
      }
      // Railings (top and bottom)
      ctx.strokeStyle = 'rgba(100, 70, 30, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 2);
      ctx.lineTo(sx + TILE_SIZE, sy + 2);
      ctx.moveTo(sx, sy + TILE_SIZE - 2);
      ctx.lineTo(sx + TILE_SIZE, sy + TILE_SIZE - 2);
      ctx.stroke();
      break;
    }
    case TileType.HARBOR_WALL: {
      // Stone/brick wall
      ctx.fillStyle = '#8b7765';
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Brick pattern
      ctx.strokeStyle = 'rgba(60, 40, 30, 0.25)';
      for (let py = 0; py < TILE_SIZE; py += 8) {
        const offset = (Math.floor(py / 8) % 2) * 10;
        ctx.beginPath();
        ctx.moveTo(sx, sy + py);
        ctx.lineTo(sx + TILE_SIZE, sy + py);
        ctx.stroke();
        for (let px = offset; px < TILE_SIZE; px += 20) {
          ctx.beginPath();
          ctx.moveTo(sx + px, sy + py);
          ctx.lineTo(sx + px, sy + py + 8);
          ctx.stroke();
        }
      }
      break;
    }
    case TileType.NOTICE_BOARD: {
      // Wooden notice board on a post
      ctx.fillStyle = '#b0a08a'; // cobblestone base
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      // Post
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(cx - 2, sy + 16, 4, 16);
      // Board
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(sx + 4, sy + 2, TILE_SIZE - 8, 16);
      ctx.strokeStyle = '#3a2a00';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 4, sy + 2, TILE_SIZE - 8, 16);
      // Paper scraps
      ctx.fillStyle = '#e8dcc8';
      ctx.fillRect(sx + 7, sy + 5, 8, 10);
      ctx.fillRect(sx + 17, sy + 4, 7, 11);
      break;
    }
    case TileType.FISHING_SPOT: {
      // Deck plank base with a railing gap + a fishing rod leaning over the side
      ctx.fillStyle = '#c4a46c'; // wooden deck
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Railing posts (broken — the fishing gap)
      ctx.strokeStyle = '#5c3d2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy + 4);
      ctx.lineTo(sx + 4, sy + TILE_SIZE - 4);
      ctx.moveTo(sx + TILE_SIZE - 4, sy + 4);
      ctx.lineTo(sx + TILE_SIZE - 4, sy + TILE_SIZE - 4);
      ctx.stroke();
      // Fishing rod (diagonal pole) + line
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 8, sy + TILE_SIZE - 8);
      ctx.lineTo(sx + TILE_SIZE - 6, sy + 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + TILE_SIZE - 6, sy + 6);
      ctx.lineTo(sx + TILE_SIZE - 6, sy + TILE_SIZE - 4);
      ctx.stroke();
      break;
    }
    case TileType.BREACH: {
      // A jagged hole in the hull with dark seawater sloshing through.
      // Splintered hull frame around the edge.
      ctx.fillStyle = '#3a261a';
      ctx.beginPath();
      ctx.moveTo(sx + 2, sy + 2);
      ctx.lineTo(sx + 11, sy + 6);
      ctx.lineTo(sx + 6, sy + 14);
      ctx.lineTo(sx + 13, sy + 22);
      ctx.lineTo(sx + 4, sy + TILE_SIZE - 2);
      ctx.lineTo(sx + 2, sy + TILE_SIZE - 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx + TILE_SIZE - 2, sy + 2);
      ctx.lineTo(sx + TILE_SIZE - 11, sy + 7);
      ctx.lineTo(sx + TILE_SIZE - 5, sy + 16);
      ctx.lineTo(sx + TILE_SIZE - 12, sy + 24);
      ctx.lineTo(sx + TILE_SIZE - 3, sy + TILE_SIZE - 2);
      ctx.lineTo(sx + TILE_SIZE - 2, sy + TILE_SIZE - 2);
      ctx.closePath();
      ctx.fill();
      // Dark water in the centre.
      ctx.fillStyle = '#0a1c2a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      // A glint of water highlight (animated by tile position would need time; static is fine).
      ctx.fillStyle = 'rgba(80,140,180,0.5)';
      ctx.fillRect(cx - 5, cy - 2, 4, 2);
      ctx.fillRect(cx + 1, cy + 4, 5, 2);
      break;
    }
    case TileType.RUBBLE: {
      // Grey splintered debris pile.
      ctx.fillStyle = '#4a463f';
      ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.fillStyle = '#6b665c';
      // Scattered chunks.
      ctx.fillRect(sx + 5, sy + 6, 8, 6);
      ctx.fillRect(sx + 16, sy + 9, 7, 5);
      ctx.fillRect(sx + 8, sy + 17, 6, 7);
      ctx.fillRect(sx + 18, sy + 19, 8, 6);
      // Dark cracks.
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy + 14);
      ctx.lineTo(sx + 14, sy + 16);
      ctx.moveTo(sx + 20, sy + 6);
      ctx.lineTo(sx + 24, sy + 18);
      ctx.stroke();
      break;
    }
    case TileType.HARBOR_FLOOR: {
      // Stone floor tiles
      ctx.fillStyle = '#b0a08a';
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Cross pattern for stone tiles
      ctx.strokeStyle = 'rgba(80, 60, 40, 0.15)';
      ctx.beginPath();
      ctx.moveTo(sx + TILE_SIZE / 2, sy);
      ctx.lineTo(sx + TILE_SIZE / 2, sy + TILE_SIZE);
      ctx.moveTo(sx, sy + TILE_SIZE / 2);
      ctx.lineTo(sx + TILE_SIZE, sy + TILE_SIZE / 2);
      ctx.stroke();
      break;
    }
  }
}

function getLanternKeyFromScreen(rc: RenderContext, sx: number, sy: number): string {
  const tileX = Math.floor((sx + rc.camera.x) / TILE_SIZE);
  const tileY = Math.floor((sy + rc.camera.y) / TILE_SIZE);
  return `${rc.deckIndex}-${tileX}-${tileY}`;
}
