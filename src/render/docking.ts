import {TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, Island} from '../types';

/** Draw the "Dock at [Island]" popup when approaching a harbor island. */
export function drawDockButton(
  ctx: CanvasRenderingContext2D,
  island: Island,
  hasHelmsman: boolean,
  mousePos: {x: number; y: number},
): void {
  const barY = CANVAS_HEIGHT - 60;

  // Background bar
  ctx.fillStyle = 'rgba(10, 30, 60, 0.88)';
  ctx.fillRect(0, barY, CANVAS_WIDTH, 60);
  ctx.strokeStyle = '#5577aa';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barY);
  ctx.lineTo(CANVAS_WIDTH, barY);
  ctx.stroke();

  // Island name
  ctx.fillStyle = '#aaccee';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Near ${island.name}`, CANVAS_WIDTH / 2, barY + 18);

  const btnW = 120, btnH = 26;
  const btnX = CANVAS_WIDTH / 2 - btnW / 2;
  const btnY = barY + 26;

  if (hasHelmsman) {
    const hover = mousePos.x >= btnX && mousePos.x <= btnX + btnW &&
      mousePos.y >= btnY && mousePos.y <= btnY + btnH;
    ctx.fillStyle = hover ? 'rgba(60, 140, 60, 0.9)' : 'rgba(40, 100, 40, 0.8)';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#55aa55';
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Dock', CANVAS_WIDTH / 2, btnY + 17);
  } else {
    ctx.fillStyle = '#cc6666';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No one is at the helm!', CANVAS_WIDTH / 2, btnY + 17);
  }
}

/** Check if a click hits the dock button. Returns true if the button was clicked and helmsman exists. */
export function isDockButtonClicked(mx: number, my: number, hasHelmsman: boolean): boolean {
  if (!hasHelmsman) return false;
  const barY = CANVAS_HEIGHT - 60;
  const btnW = 120, btnH = 26;
  const btnX = CANVAS_WIDTH / 2 - btnW / 2;
  const btnY = barY + 26;
  return mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH;
}
