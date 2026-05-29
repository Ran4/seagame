import {
  TileType, Deck, Actor, Item,
} from '../../types';
import { RenderContext } from '../context';
import { drawCrewPanel, drawObjectPanel } from './panels';

export { drawCrewPanel, drawObjectPanel, drawCorpsePanel } from './panels';
export { drawTooltip, drawItemTooltip, drawBarTooltip } from './tooltips';
export { drawSoundButton, drawActivityLog, drawCompass, drawBar, drawItemSlot, drawSettingsButton, drawSettingsPanel, drawGoldCounter, drawCombatHud } from './widgets';

export function drawUI(
  rc: RenderContext,
  deck: Deck, deckIndex: number, crew: Actor[],
  selectedActorId: number | null,
  selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null,
  decks: Deck[],
  barrelInventory: Map<string, Item[]>,
  gameTime: number,
): void {
  const ctx = rc.ctx;

  // Deck selector (only show ship decks, not harbor)
  const shipDeckCount = Math.min(3, decks.length);
  const deckLabels = decks.slice(0, shipDeckCount).map((d, i) => `[${i + 1}] ${d.name}`);
  const lineH = 22;
  const panelW = 160;
  const panelH = deckLabels.length * lineH + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(10, 10, panelW, panelH);
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < deckLabels.length; i++) {
    const active = i === deckIndex;
    if (active) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(12, 14 + i * lineH, panelW - 4, lineH);
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#777777';
    }
    ctx.fillText((active ? '▸ ' : '  ') + deckLabels[i], 18, 28 + i * lineH);
  }

  // Selected crew info
  if (selectedActorId !== null) {
    const member = crew.find(c => c.id === selectedActorId);
    if (member) {
      drawCrewPanel(rc, member);
    }
  }

  // Selected object info
  if (selectedObject) {
    drawObjectPanel(rc, selectedObject, barrelInventory, gameTime);
  }
}
