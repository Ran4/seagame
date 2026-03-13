import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  TileType, CrewState, Item, SECONDS_PER_DAY, NIGHT_BRIGHTNESS,
  World, getShipBrightness, SKILL_MASTERY,
} from './types';
import { SpriteSheet } from './sprites';
import {
  RenderContext,
  drawWater, drawDeck, drawActor,
  drawUI, drawSoundButton, drawActivityLog, drawCompass,
  drawTooltip, drawItemTooltip, drawBarTooltip,
  drawContextMenu, drawMapOverlay,
} from './render';

const WATER_COLOR_1 = '#1a5276';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sprites: SpriteSheet | null = null;
  private hoveredItem: { item: Item; x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  setSprites(sprites: SpriteSheet): void {
    this.sprites = sprites;
  }

  getHoveredItem(): Item | null {
    return this.hoveredItem?.item ?? null;
  }

  render(world: World, mousePos: { x: number; y: number }, soundMuted: boolean, sfxMuted: boolean): void {
    const { decks, actors: crew, camera, selectedActorId, selectedObject, time,
            contextMenu, worldMap, mapOverlayOpen, barrelInventory,
            waterOffset, lanternOil, activityLog } = world;
    const deck = decks[world.activeDeck];
    const deckIndex = world.activeDeck;
    const hasNavigator = crew.some(c => c.state === CrewState.NAVIGATING);
    const hasHelmsman = crew.some(c => c.state === CrewState.STEERING);
    const hasExpertNavigator = crew.some(c =>
      c.state === CrewState.NAVIGATING && (c.skills.navigation ?? 0) >= SKILL_MASTERY
    );
    const timeOfDay = (time + world.dayTimeOffset) % SECONDS_PER_DAY;
    const brightness = getShipBrightness(timeOfDay);

    const ctx = this.ctx;

    const rc: RenderContext = {
      ctx,
      sprites: this.sprites,
      mousePos,
      lanternOil,
      brightness,
      camera,
      deckIndex,
      hoveredItem: null,
      hoveredBarTooltip: null,
    };

    ctx.fillStyle = WATER_COLOR_1;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawWater(rc, time, waterOffset);

    // Crow's nest: draw upper deck faintly underneath (tiles + crew)
    if (deckIndex === 0 && decks.length > 1) {
      drawDeck(rc, decks[1], time);
      for (const member of crew) {
        if (member.deck === 1) {
          drawActor(rc, member, member.id === selectedActorId);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    drawDeck(rc, deck, time);

    // Combined darkness overlay: night + deck depth, reduced by lit lanterns
    {
      let litCount = 0;
      for (const [key, oil] of lanternOil) {
        if (oil > 0 && key.startsWith(`${deckIndex}-`)) litCount++;
      }
      const lanternLift = Math.min(0.35, litCount * 0.07);

      const nightDark = (1 - brightness) / (1 - NIGHT_BRIGHTNESS);
      const nightAlpha = Math.max(0, nightDark * 0.55 - lanternLift);
      const deckAlpha = deckIndex > 0 ? 0.125 * deckIndex : 0;
      const totalAlpha = Math.min(0.75, nightAlpha + deckAlpha);
      if (totalAlpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 20, ${totalAlpha})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }

    // Lantern glow (drawn after darkness, before crew)
    {
      const prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (const [key, oil] of lanternOil) {
        if (oil <= 0) continue;
        const parts = key.split('-');
        const d = parseInt(parts[0]);
        if (d !== deckIndex) continue;
        const lx = parseInt(parts[1]);
        const ly = parseInt(parts[2]);
        const sx = lx * TILE_SIZE + TILE_SIZE / 2 - camera.x;
        const sy = ly * TILE_SIZE + TILE_SIZE / 2 - camera.y;
        const intensity = Math.min(1, oil / 20);
        const radius = TILE_SIZE * 3.5;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grad.addColorStop(0, `rgba(255, 200, 80, ${0.35 * intensity})`);
        grad.addColorStop(0.5, `rgba(255, 180, 60, ${0.15 * intensity})`);
        grad.addColorStop(1, 'rgba(255, 160, 40, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
      }
      ctx.globalCompositeOperation = prevComp;
    }

    // Selected object highlight
    if (selectedObject && selectedObject.deck === deckIndex) {
      const ox = selectedObject.x * TILE_SIZE - camera.x;
      const oy = selectedObject.y * TILE_SIZE - camera.y;
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + 1, oy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    for (const member of crew) {
      if (member.deck === deckIndex) {
        drawActor(rc, member, member.id === selectedActorId);
      }
    }

    drawUI(rc, deck, deckIndex, crew, selectedActorId, selectedObject, decks, barrelInventory, time);
    if (worldMap) {
      drawCompass(rc, worldMap.currentHeading, worldMap.currentSpeed > 0, decks.length, timeOfDay);
    }
    drawSoundButton(rc, soundMuted, sfxMuted);
    if (activityLog.length > 0) {
      drawActivityLog(rc, activityLog, time);
    }
    drawTooltip(rc, deck);
    if (contextMenu) {
      drawContextMenu(rc, contextMenu, mousePos);
    }
    if (mapOverlayOpen && worldMap) {
      drawMapOverlay(rc, worldMap, mousePos, time, hasNavigator, hasHelmsman, hasExpertNavigator);
    }
    if (rc.hoveredItem) {
      drawItemTooltip(rc, rc.hoveredItem.item);
    }
    if (rc.hoveredBarTooltip) {
      drawBarTooltip(rc, rc.hoveredBarTooltip);
    }

    // Mutiny ultimatum warning banner
    if (world.mutinyState === 'ultimatum') {
      const remaining = Math.max(0, world.mutinyTimer);
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);

      ctx.fillStyle = `rgba(180, 20, 20, ${0.7 * pulse})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, 32);
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`MUTINY THREATENED — ${timeStr} remaining`, CANVAS_WIDTH / 2, 16);
      ctx.textBaseline = 'alphabetic';
    }

    // Mutiny game over overlay
    if (world.mutinyState === 'game_over') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Skull and crossbones (simple canvas drawing)
      const cx = CANVAS_WIDTH / 2;
      const cy = CANVAS_HEIGHT / 2 - 40;
      ctx.font = '64px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#cc2222';
      ctx.fillText('\u2620', cx, cy);

      // "MUTINY!" header
      ctx.font = 'bold 48px serif';
      ctx.fillStyle = '#cc2222';
      ctx.fillText('MUTINY!', cx, cy + 60);

      // Subtext
      ctx.font = '18px serif';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('The crew has seized the ship.', cx, cy + 100);

      ctx.font = '14px monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText('Refresh to restart', cx, cy + 135);
      ctx.textBaseline = 'alphabetic';
    }

    this.hoveredItem = rc.hoveredItem;
  }
}
