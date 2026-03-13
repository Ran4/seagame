import { CANVAS_WIDTH, CANVAS_HEIGHT, WorldMap, SECONDS_PER_DAY } from '../types';
import { RenderContext } from './context';

export function drawMapOverlay(rc: RenderContext, worldMap: WorldMap, mousePos: { x: number; y: number }, time: number, hasNavigator: boolean, hasHelmsman: boolean, hasExpertNavigator?: boolean): void {
  const ctx = rc.ctx;
  const ox = 40, oy = 40, ow = 880, oh = 460;

  // Dark blue overlay background
  ctx.fillStyle = 'rgba(10, 20, 50, 0.92)';
  ctx.fillRect(ox, oy, ow, oh);
  ctx.strokeStyle = '#5577aa';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, ow, oh);

  // Title
  ctx.fillStyle = '#aaccee';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('World Map', ox + ow / 2, oy + 22);

  // Grid lines
  ctx.strokeStyle = 'rgba(80, 120, 180, 0.15)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= 100; gx += 10) {
    const sx = ox + (gx / 100) * ow;
    ctx.beginPath();
    ctx.moveTo(sx, oy + 30);
    ctx.lineTo(sx, oy + oh - 20);
    ctx.stroke();
  }
  for (let gy = 0; gy <= 80; gy += 10) {
    const sy = oy + 30 + ((gy / 80) * (oh - 50));
    ctx.beginPath();
    ctx.moveTo(ox, sy);
    ctx.lineTo(ox + ow, sy);
    ctx.stroke();
  }

  const toScreenX = (wx: number) => ox + (wx / 100) * ow;
  const toScreenY = (wy: number) => oy + 30 + ((wy / 80) * (oh - 50));

  // Dashed line from ship to destination island
  if (worldMap.destinationIsland) {
    const sx = toScreenX(worldMap.shipX);
    const sy = toScreenY(worldMap.shipY);
    const dx = toScreenX(worldMap.destinationIsland.x);
    const dy = toScreenY(worldMap.destinationIsland.y);
    ctx.strokeStyle = '#88aacc';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Islands
  let hoveredIsland: typeof worldMap.islands[0] | null = null;
  for (const island of worldMap.islands) {
    if (island.hidden && !hasExpertNavigator) continue;
    const ix = toScreenX(island.x);
    const iy = toScreenY(island.y);
    const radius = 8;

    // Check hover
    const hdx = mousePos.x - ix;
    const hdy = mousePos.y - iy;
    if (hdx * hdx + hdy * hdy < (radius + 4) * (radius + 4)) {
      hoveredIsland = island;
    }

    // Destination highlight (golden ring)
    if (worldMap.destinationIsland && worldMap.destinationIsland.id === island.id) {
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ix, iy, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Island dot
    ctx.fillStyle = island.hasHarbor ? '#44aa55' : '#8b6644';
    ctx.beginPath();
    ctx.arc(ix, iy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ix, iy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Name label
    ctx.fillStyle = '#ccddee';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(island.name, ix, iy - radius - 4);
  }

  // Ship (red triangle, rotated to currentHeading)
  const shipSX = toScreenX(worldMap.shipX);
  const shipSY = toScreenY(worldMap.shipY);
  ctx.save();
  ctx.translate(shipSX, shipSY);
  // heading 0 = right (east), triangle points up by default, so rotate heading + π/2
  ctx.rotate(worldMap.currentHeading + Math.PI / 2);
  ctx.fillStyle = '#ee4444';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(-5, 5);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(-5, 5);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Hovered island tooltip
  if (hoveredIsland) {
    const ix = toScreenX(hoveredIsland.x);
    const iy = toScreenY(hoveredIsland.y);
    ctx.font = '11px monospace';
    const desc = hoveredIsland.description;
    const tw = ctx.measureText(desc).width + 12;
    let ttx = ix - tw / 2;
    const tty = iy + 18;
    if (ttx < ox + 4) ttx = ox + 4;
    if (ttx + tw > ox + ow - 4) ttx = ox + ow - tw - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(ttx, tty, tw, 20);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(desc, ttx + 6, tty + 14);
  }

  // Bottom info
  ctx.textAlign = 'center';
  ctx.font = '11px monospace';
  ctx.fillStyle = '#667788';
  // Close button (X) in top-right corner
  const closeX = ox + ow - 28;
  const closeY = oy + 8;
  const closeSize = 20;
  // Hover highlight
  const hoverClose = mousePos.x >= closeX && mousePos.x <= closeX + closeSize &&
                     mousePos.y >= closeY && mousePos.y <= closeY + closeSize;
  if (hoverClose) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(closeX - 2, closeY - 2, closeSize + 4, closeSize + 4);
  }
  ctx.strokeStyle = hoverClose ? '#ffffff' : '#8899aa';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(closeX, closeY);
  ctx.lineTo(closeX + closeSize, closeY + closeSize);
  ctx.moveTo(closeX + closeSize, closeY);
  ctx.lineTo(closeX, closeY + closeSize);
  ctx.stroke();

  ctx.fillText('ESC / M to close', ox + ow / 2, oy + oh - 6);

  // Role status indicators (bottom-left of overlay)
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  const statusX = ox + 12;
  const statusY = oy + oh - 30;
  ctx.fillStyle = hasNavigator ? '#44cc66' : '#cc4444';
  ctx.fillText('●', statusX, statusY);
  ctx.fillStyle = '#aabbcc';
  ctx.fillText(`Navigator: ${hasNavigator ? 'Active' : 'None'}`, statusX + 14, statusY);
  ctx.fillStyle = hasHelmsman ? '#44cc66' : '#cc4444';
  ctx.fillText('●', statusX, statusY + 16);
  ctx.fillStyle = '#aabbcc';
  ctx.fillText(`Helmsman: ${hasHelmsman ? 'Active' : 'None'}`, statusX + 14, statusY + 16);

  ctx.textAlign = 'center';

  if (worldMap.destinationIsland) {
    const dx = worldMap.destinationIsland.x - worldMap.shipX;
    const dy = worldMap.destinationIsland.y - worldMap.shipY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let etaStr: string;
    if (worldMap.currentSpeed > 0) {
      const etaSec = dist / worldMap.currentSpeed;
      const etaDays = etaSec / SECONDS_PER_DAY;
      const days = Math.floor(etaDays);
      const hours = Math.round((etaDays - days) * 24);
      etaStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    } else {
      etaStr = 'Ship stopped';
    }
    ctx.fillStyle = '#aabbcc';
    ctx.fillText(`Sailing to ${worldMap.destinationIsland.name} — ${Math.round(dist)} leagues — ETA: ${etaStr}`, ox + ow / 2, oy + oh - 22);

    // Stop Sailing button
    const btnW = 100;
    const btnH = 22;
    const btnX = ox + ow - btnW - 10;
    const btnY = oy + oh - btnH - 8;
    const hoverStop = mousePos.x >= btnX && mousePos.x <= btnX + btnW &&
                      mousePos.y >= btnY && mousePos.y <= btnY + btnH;
    ctx.fillStyle = hoverStop ? 'rgba(180, 60, 60, 0.9)' : 'rgba(120, 40, 40, 0.8)';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#aa5555';
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Stop Sailing', btnX + btnW / 2, btnY + 15);
  }
}
