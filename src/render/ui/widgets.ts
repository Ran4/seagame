import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  Item, SECONDS_PER_DAY,
  ActivityLogEntry,
  GameSettings, WeatherState, Contract,
} from '../../types';
import { RenderContext } from '../context';

export function drawSoundButton(rc: RenderContext, muted: boolean, sfxMuted: boolean): void {
  const ctx = rc.ctx;
  const size = 24;
  const x = 8 + size + 4; // shifted right to make room for settings cogwheel
  const y = CANVAS_HEIGHT - size - 8;

  // Music button (left)
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  const cx = x + size / 2 - 2;
  const cy = y + size / 2;

  // Music note icon
  ctx.fillStyle = muted ? '#666' : '#ddd';
  ctx.beginPath();
  ctx.arc(cx - 2, cy + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx + 0.5, cy - 6, 2, 10);
  ctx.fillRect(cx + 0.5, cy - 6, 6, 2);

  if (muted) {
    ctx.strokeStyle = '#cc4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 4);
    ctx.lineTo(cx + 9, cy + 4);
    ctx.moveTo(cx + 9, cy - 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.stroke();
  }

  // SFX button (right)
  const sx = x + size + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(sx, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, y + 0.5, size - 1, size - 1);

  const scx = sx + size / 2 - 2;
  const scy = y + size / 2;

  // Speaker body
  ctx.fillStyle = sfxMuted ? '#666' : '#ddd';
  ctx.beginPath();
  ctx.moveTo(scx - 6, scy - 3);
  ctx.lineTo(scx - 3, scy - 3);
  ctx.lineTo(scx + 1, scy - 7);
  ctx.lineTo(scx + 1, scy + 7);
  ctx.lineTo(scx - 3, scy + 3);
  ctx.lineTo(scx - 6, scy + 3);
  ctx.closePath();
  ctx.fill();

  if (sfxMuted) {
    ctx.strokeStyle = '#cc4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scx + 4, scy - 4);
    ctx.lineTo(scx + 9, scy + 4);
    ctx.moveTo(scx + 9, scy - 4);
    ctx.lineTo(scx + 4, scy + 4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(scx + 3, scy, 4, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(scx + 3, scy, 7, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
}

export function drawActivityLog(rc: RenderContext, log: ActivityLogEntry[], currentTime: number): void {
  const ctx = rc.ctx;
  const lineH = 13;
  const maxLines = 8;
  const entries = log.slice(-maxLines);
  const pad = 6;
  const logW = 320;
  const logH = entries.length * lineH + pad * 2;
  const lx = CANVAS_WIDTH - logW - 8;
  const ly = CANVAS_HEIGHT - logH - 8;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(lx, ly, logW, logH);

  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < entries.length; i++) {
    const age = currentTime - entries[i].time;
    const alpha = age < 10 ? 1.0 : Math.max(0.3, 1.0 - (age - 10) / 20);
    ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    ctx.fillText(entries[i].text, lx + pad, ly + pad + (i + 1) * lineH - 2, logW - pad * 2);
  }
}

export function drawCompass(rc: RenderContext, heading: number, moving: boolean, deckCount: number, timeOfDay: number = 0): void {
  const ctx = rc.ctx;
  const panelH = deckCount * 22 + 8;
  const size = panelH;
  const x = 10 + 160 + 8; // right of deck selector
  const y = 10;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 6;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, size, size);

  // Outer ring
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cardinal direction labels
  ctx.fillStyle = '#666666';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r + 5);
  ctx.fillText('S', cx, cy + r - 5);
  ctx.fillText('W', cx - r + 6, cy);
  ctx.fillText('E', cx + r - 6, cy);

  // Needle — heading 0 = east, standard math angles
  // North arrow (red) points toward heading, south arrow (white) opposite
  const needleLen = r - 8;
  // Convert heading: 0=east in math, but compass north is -π/2
  const angle = heading;
  const nx = Math.cos(angle) * needleLen;
  const ny = Math.sin(angle) * needleLen;

  // Red half (direction of travel)
  ctx.strokeStyle = moving ? '#ee4444' : '#884444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + nx, cy + ny);
  ctx.stroke();

  // White half (opposite)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - nx, cy - ny);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = '#cccccc';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  // Clock display below compass
  // timeOfDay 0 = midnight (00:00), 360 = noon (12:00)
  const totalHours = (timeOfDay / SECONDS_PER_DAY) * 24;
  const hours = Math.floor(totalHours);
  const minutes = Math.floor((totalHours - hours) * 60);
  const clockStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const clockW = 50;
  const clockH = 18;
  const clockX = x + (size - clockW) / 2;
  const clockY = y + size + 4;
  ctx.fillRect(clockX, clockY, clockW, clockH);
  ctx.fillStyle = '#cccccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockStr, clockX + clockW / 2, clockY + clockH / 2);

  ctx.textBaseline = 'alphabetic';
}

export function drawBar(rc: RenderContext, x: number, y: number, w: number, h: number, fill: number, color: string): void {
  const ctx = rc.ctx;
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fill)), h);
}

/** Gold treasury counter, top-left under the deck selector. */
export function drawGoldCounter(rc: RenderContext, gold: number): void {
  const ctx = rc.ctx;
  const x = 10, y = 14 + 3 * 22 + 6; // below the (up to 3) deck-selector rows
  const w = 92, h = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#665522';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // Coin
  ctx.fillStyle = '#ffcc44';
  ctx.beginPath();
  ctx.arc(x + 12, y + h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#aa8822';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + 12, y + h / 2, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${gold}`, x + 24, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

/** FEATURE 7 — transient docking banner ("Docking…" / "Docking completed!"). */
export function drawDockingToast(rc: RenderContext, toast: { text: string; timer: number }): void {
  const ctx = rc.ctx;
  // Fade the completion toast out over its last second.
  const alpha = toast.timer === Infinity ? 1 : Math.max(0, Math.min(1, toast.timer));
  const w = Math.max(180, ctx.measureText(toast.text).width + 48);
  const h = 30;
  const x = CANVAS_WIDTH / 2 - w / 2;
  const y = 46;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(10, 30, 60, 0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#88bbee';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#cce6ff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(toast.text, CANVAS_WIDTH / 2, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/** FEATURE 7 — small active-contracts list, top-right under the activity-log area. */
export function drawContractsHud(rc: RenderContext, contracts: Contract[]): void {
  if (contracts.length === 0) return;
  const ctx = rc.ctx;
  const rows = contracts.slice(0, 4);
  const w = 240, lineH = 14;
  const h = 18 + rows.length * lineH + 4;
  const x = CANVAS_WIDTH - w - 8;
  const y = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.66)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#665522';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('⚓ Contracts', x + 6, y + 13);
  ctx.font = '10px monospace';
  ctx.fillStyle = '#d8d0b8';
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    let label = `${c.description} (${c.reward}g)`;
    if (label.length > 36) label = label.slice(0, 35) + '…';
    ctx.fillText(label, x + 6, y + 13 + (i + 1) * lineH);
  }
}

/** Top-center combat HUD: enemy name, HP bar, distance, and our flood/damage indicator. */
export function drawCombatHud(rc: RenderContext, enemy: { name: string; hp: number; maxHp: number; distance: number; hostile: boolean }, floodLevel: number): void {
  const ctx = rc.ctx;
  const w = 260, h = 70;
  const x = CANVAS_WIDTH / 2 - w / 2;
  const y = 38;

  ctx.fillStyle = 'rgba(20,0,0,0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#aa3333';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Enemy name + distance
  ctx.fillStyle = '#ffaaaa';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`☠ ${enemy.name}`, x + 8, y + 18);
  ctx.fillStyle = '#ddccaa';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  const distStr = enemy.distance <= 1 ? 'ALONGSIDE' : `${enemy.distance.toFixed(1)} lg`;
  ctx.fillText(distStr, x + w - 8, y + 18);

  // Enemy HP bar
  const barX = x + 8, barW = w - 16;
  drawBar(rc, barX, y + 24, barW, 10, enemy.hp / enemy.maxHp, '#cc3333');
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, y + 24 + 0.5, barW - 1, 9);
  ctx.fillStyle = '#fff';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Hull ${Math.ceil(enemy.hp)}/${enemy.maxHp}`, x + w / 2, y + 32);

  // Our flood / damage indicator
  ctx.fillStyle = floodLevel > 50 ? '#ff6666' : '#88bbdd';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Flooding', barX, y + 50);
  drawBar(rc, barX + 56, y + 42, barW - 56, 9, floodLevel / 100, floodLevel > 50 ? '#ff4444' : '#3a78c0');
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 56 + 0.5, y + 42 + 0.5, barW - 56 - 1, 8);

  // Hint
  ctx.fillStyle = '#bbaa88';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const hint = enemy.distance <= 1.2 ? 'Right-click: Board' : 'Cannons to fire • Map: click ☠ to chase / sail off to flee';
  ctx.fillText(hint, x + w / 2, y + h - 4);
  ctx.textAlign = 'left';
}

// --- FEATURE 5: Storms & Weather ---

const RAIN_DROPS = 220;  // streak count at full intensity

/**
 * Animated rain overlay — diagonal streaks scaled by storm intensity. Screen-space
 * (ignores camera) so the rain sheets across the whole view. Cheap pseudo-random
 * placement seeded per-drop so streaks fall steadily instead of flickering randomly.
 */
export function drawRainOverlay(rc: RenderContext, time: number): void {
  const intensity = rc.weather.intensity;
  if (rc.weather.state !== 'storm' && intensity <= 0.02) return;
  const ctx = rc.ctx;
  const count = Math.floor(RAIN_DROPS * intensity);
  if (count <= 0) return;

  ctx.save();
  ctx.strokeStyle = `rgba(180, 200, 230, ${0.25 + 0.25 * intensity})`;
  ctx.lineWidth = 1;
  const len = 14 + 8 * intensity;     // streak length
  const slant = 4;                    // horizontal drift (wind)
  const fall = (CANVAS_HEIGHT + 40);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    // Per-drop deterministic phase so each streak falls smoothly.
    const seedX = (i * 73) % 100 / 100;
    const speed = 320 + (i % 5) * 80;
    const px = (seedX * (CANVAS_WIDTH + 60) - 30 + (time * slant * 10) % (CANVAS_WIDTH + 60));
    const py = ((i * 137 + time * speed) % fall) - 20;
    const x = px % CANVAS_WIDTH;
    ctx.moveTo(x, py);
    ctx.lineTo(x + slant, py + len);
  }
  ctx.stroke();
  ctx.restore();
}

/** Small weather indicator in the HUD (top-left, below the gold counter). */
export function drawWeatherIndicator(rc: RenderContext, weather: WeatherState): void {
  const ctx = rc.ctx;
  // Below the gold counter (which sits under the deck selector).
  const x = 10, y = 14 + 3 * 22 + 6 + 20 + 4;
  const w = 92, h = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, w, h);
  const border = weather.state === 'storm' ? '#4466aa' : weather.state === 'cloudy' ? '#666' : '#665522';
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const icon = weather.state === 'storm' ? '⛈' : weather.state === 'cloudy' ? '☁' : '☀';
  const label = weather.state === 'storm' ? 'Storm' : weather.state === 'cloudy' ? 'Cloudy' : 'Clear';
  ctx.fillStyle = weather.state === 'storm' ? '#aaccff' : weather.state === 'cloudy' ? '#cccccc' : '#ffe9a8';
  ctx.font = '13px serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x + 6, y + h / 2 + 1);
  ctx.font = '11px monospace';
  ctx.fillText(label, x + 26, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

export function drawItemSlot(rc: RenderContext, x: number, y: number, size: number, item: Item | null): void {
  const ctx = rc.ctx;
  // Slot background
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  if (!item) return;

  // Try sprite
  const spriteKey = item.name.toLowerCase().replace(/ /g, '_');
  const sprite = rc.sprites?.items.get(spriteKey);
  if (sprite) {
    // Sprites are 1024x1024 with 32x32 pixel art centered — crop to inner ~60%
    const inset = Math.floor(sprite.width * 0.2);
    const srcSize = sprite.width - inset * 2;
    ctx.drawImage(sprite, inset, inset, srcSize, srcSize, x + 2, y + 2, size - 4, size - 4);
  } else {
    // Fallback: first 2 letters
    ctx.fillStyle = '#cccccc';
    ctx.font = `bold ${Math.floor(size * 0.4)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name.slice(0, 2), x + size / 2, y + size / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // Quantity badge
  if (item.quantity > 1) {
    const label = `${item.quantity}`;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const tw = ctx.measureText(label).width + 4;
    ctx.fillRect(x + size - tw, y + size - 12, tw, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + size - 2, y + size - 3);
  }

  // Hover detection
  const mp = rc.mousePos;
  if (mp.x >= x && mp.x <= x + size && mp.y >= y && mp.y <= y + size) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    rc.hoveredItem = { item, x: mp.x, y: mp.y };
  }
}

export function drawSettingsButton(rc: RenderContext, settingsOpen: boolean): void {
  const ctx = rc.ctx;
  const size = 24;
  const x = 8;
  const y = CANVAS_HEIGHT - size - 8;

  // Button background
  ctx.fillStyle = settingsOpen ? 'rgba(60,60,60,0.8)' : 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = settingsOpen ? '#888' : '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  // Cogwheel icon
  const cx = x + size / 2;
  const cy = y + size / 2;
  const outerR = 8;
  const innerR = 5;
  const teeth = 6;
  ctx.fillStyle = settingsOpen ? '#ddd' : '#aaa';
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (i * Math.PI) / teeth - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Center hole
  ctx.fillStyle = settingsOpen ? 'rgba(60,60,60,0.8)' : 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSettingsPanel(rc: RenderContext, settings: GameSettings): void {
  const ctx = rc.ctx;
  const btnSize = 24;
  const panelW = 200;
  const panelH = 50;
  const panelX = 8;
  const panelY = CANVAS_HEIGHT - btnSize - 8 - panelH - 4;

  // Panel background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

  // Label
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#999';
  ctx.fillText('Input mode:', panelX + 8, panelY + 8);

  // Pills
  const pillY = panelY + 24;
  const pillH = 18;
  const pillR = 3;

  const drawPill = (px: number, pw: number, label: string, active: boolean) => {
    ctx.fillStyle = active ? '#4a7a4a' : 'rgba(255,255,255,0.08)';
    // Rounded rect
    ctx.beginPath();
    ctx.moveTo(px + pillR, pillY);
    ctx.lineTo(px + pw - pillR, pillY);
    ctx.arcTo(px + pw, pillY, px + pw, pillY + pillR, pillR);
    ctx.lineTo(px + pw, pillY + pillH - pillR);
    ctx.arcTo(px + pw, pillY + pillH, px + pw - pillR, pillY + pillH, pillR);
    ctx.lineTo(px + pillR, pillY + pillH);
    ctx.arcTo(px, pillY + pillH, px, pillY + pillH - pillR, pillR);
    ctx.lineTo(px, pillY + pillR);
    ctx.arcTo(px, pillY, px + pillR, pillY, pillR);
    ctx.closePath();
    ctx.fill();

    if (active) {
      ctx.strokeStyle = '#6a6';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = active ? '#fff' : '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + pw / 2, pillY + pillH / 2);
  };

  const htmlPillX = panelX + 78;
  const htmlPillW = 38;
  drawPill(htmlPillX, htmlPillW, 'Html', settings.inputMode === 'html');

  const ingamePillX = htmlPillX + htmlPillW + 4;
  const ingamePillW = 62;
  drawPill(ingamePillX, ingamePillW, 'In-game', settings.inputMode === 'ingame');

  ctx.textBaseline = 'alphabetic';
}
