import {TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, Island} from '../types';

/** Draw the "Dock at [Island]" popup when approaching a harbor island. */
export function drawDockButton(
  ctx: CanvasRenderingContext2D,
  island: Island,
  hasHelmsman: boolean,
  mousePos: {x: number; y: number},
): void {
  const barY = CANVAS_HEIGHT - 60;

  // Background bar — only 12 tiles wide, centered, so it doesn't cover the
  // bottom-left GUI buttons.
  const barW = TILE_SIZE * 12;
  const barX = (CANVAS_WIDTH - barW) / 2;
  ctx.fillStyle = 'rgba(10, 30, 60, 0.88)';
  ctx.fillRect(barX, barY, barW, 60);
  ctx.strokeStyle = '#5577aa';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, 60);

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
    ctx.fillText('Assign a helmsman to dock', CANVAS_WIDTH / 2, btnY + 17);
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

// --- Docked bar: "Docked at X" + "Leave harbor" button ---

const LEAVE_BTN_W = 100;
const LEAVE_BTN_H = 20;
const LEAVE_BTN_Y = CANVAS_HEIGHT - LEAVE_BTN_H - 11;

// Position to the left of the activity log (logW=320, 8px margin)
const LEAVE_BTN_X = CANVAS_WIDTH - LEAVE_BTN_W - 8 - 320 - 8;

/** Draw a small "Leave harbor" button at the bottom of the screen. */
export function drawDockedBar(
  ctx: CanvasRenderingContext2D,
  hasHelmsman: boolean,
  mousePos: {x: number; y: number},
  islandName?: string,
): void {
  const btnX = LEAVE_BTN_X;

  // "Docked at X" label
  if (islandName) {
    ctx.fillStyle = '#aaccee';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Docked at ${islandName}`, btnX - 8, LEAVE_BTN_Y + LEAVE_BTN_H / 2 + 3);
  }

  // "Leave harbor" button
  const inBtn = mousePos.x >= btnX && mousePos.x <= btnX + LEAVE_BTN_W &&
    mousePos.y >= LEAVE_BTN_Y && mousePos.y <= LEAVE_BTN_Y + LEAVE_BTN_H;
  const hover = hasHelmsman && inBtn;

  ctx.fillStyle = hasHelmsman
    ? (hover ? 'rgba(140, 60, 60, 0.9)' : 'rgba(100, 40, 40, 0.8)')
    : 'rgba(60, 60, 60, 0.6)';
  ctx.fillRect(btnX, LEAVE_BTN_Y, LEAVE_BTN_W, LEAVE_BTN_H);
  ctx.strokeStyle = hasHelmsman ? '#aa5555' : '#666666';
  ctx.lineWidth = 1;
  ctx.strokeRect(btnX, LEAVE_BTN_Y, LEAVE_BTN_W, LEAVE_BTN_H);
  ctx.fillStyle = hasHelmsman ? '#ffffff' : '#888888';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Leave harbor', btnX + LEAVE_BTN_W / 2, LEAVE_BTN_Y + LEAVE_BTN_H / 2 + 4);

  // Tooltip when hovering disabled button
  if (!hasHelmsman && inBtn) {
    const tip = '(missing helmsman)';
    ctx.font = '10px monospace';
    const tw = ctx.measureText(tip).width;
    const tx = btnX + (LEAVE_BTN_W - tw) / 2 - 4;
    const ty = LEAVE_BTN_Y - 18;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(tx, ty, tw + 8, 16);
    ctx.fillStyle = '#cc6666';
    ctx.textAlign = 'center';
    ctx.fillText(tip, btnX + LEAVE_BTN_W / 2, ty + 12);
  }
}

/** Check if a click hits the "Leave harbor" button. Returns true only if helmsman exists. */
export function isLeaveHarborClicked(mx: number, my: number, hasHelmsman: boolean): boolean {
  if (!hasHelmsman) return false;
  return mx >= LEAVE_BTN_X && mx <= LEAVE_BTN_X + LEAVE_BTN_W &&
    my >= LEAVE_BTN_Y && my <= LEAVE_BTN_Y + LEAVE_BTN_H;
}

// --- FEATURE 8: "Dig for treasure!" button (shown when docked at a marked island) ---

const DIG_BTN_W = 130;
const DIG_BTN_H = 20;
const DIG_BTN_Y = CANVAS_HEIGHT - DIG_BTN_H - 11;
// Sits just left of the "Leave harbor" button.
const DIG_BTN_X = LEAVE_BTN_X - DIG_BTN_W - 8;

/** Draw a "Dig for treasure!" button (only call when docked at a treasure-marked island). */
export function drawDigButton(
  ctx: CanvasRenderingContext2D,
  mousePos: { x: number; y: number },
  busy: boolean,
): void {
  const inBtn = mousePos.x >= DIG_BTN_X && mousePos.x <= DIG_BTN_X + DIG_BTN_W &&
    mousePos.y >= DIG_BTN_Y && mousePos.y <= DIG_BTN_Y + DIG_BTN_H;
  const hover = !busy && inBtn;
  ctx.fillStyle = busy
    ? 'rgba(60, 60, 60, 0.6)'
    : (hover ? 'rgba(180, 150, 50, 0.95)' : 'rgba(140, 110, 30, 0.85)');
  ctx.fillRect(DIG_BTN_X, DIG_BTN_Y, DIG_BTN_W, DIG_BTN_H);
  ctx.strokeStyle = busy ? '#666666' : '#ddbb55';
  ctx.lineWidth = 1;
  ctx.strokeRect(DIG_BTN_X, DIG_BTN_Y, DIG_BTN_W, DIG_BTN_H);
  ctx.fillStyle = busy ? '#888888' : '#fff8e0';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(busy ? 'Party ashore...' : 'Dig for treasure!', DIG_BTN_X + DIG_BTN_W / 2, DIG_BTN_Y + DIG_BTN_H / 2 + 4);
}

/** Check if a click hits the "Dig for treasure!" button. */
export function isDigButtonClicked(mx: number, my: number): boolean {
  return mx >= DIG_BTN_X && mx <= DIG_BTN_X + DIG_BTN_W &&
    my >= DIG_BTN_Y && my <= DIG_BTN_Y + DIG_BTN_H;
}
