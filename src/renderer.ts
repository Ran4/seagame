import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  TileType, CrewState, Item, SECONDS_PER_DAY, NIGHT_BRIGHTNESS,
  World, getShipBrightness, SKILL_MASTERY,
} from './types';
import { SpriteSheet } from './sprites';
import {
  RenderContext,
  drawWater, drawDeck, drawActor, drawActorOverlays, drawCorpse,
  drawUI, drawSoundButton, drawActivityLog, drawCompass,
  drawTooltip, drawItemTooltip, drawBarTooltip,
  drawContextMenu, drawMapOverlay,
  drawSettingsButton, drawSettingsPanel, drawCorpsePanel,
  drawDockButton, drawDockedBar, drawGoldCounter, drawCombatHud,
  drawDigButton,
  drawRainOverlay, drawWeatherIndicator,
  drawTentacles, drawMonsterHud,
  drawDockingToast, drawContractsHud,
} from './render';
import { drawCommandInput } from './command-input';

const WATER_COLOR_1 = '#1a5276';

/** Standalone flooding bar (top-center) shown when the ship is taking on water with no enemy. */
function drawFloodIndicator(ctx: CanvasRenderingContext2D, floodLevel: number, yPos = 38): void {
  const w = 180, h = 22;
  const x = CANVAS_WIDTH / 2 - w / 2;
  const y = yPos;
  ctx.fillStyle = 'rgba(0,10,30,0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = floodLevel > 50 ? '#cc4444' : '#3a78c0';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#88bbdd';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Flooding', x + 6, y + h / 2);
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 58, y + 6, w - 66, 10);
  ctx.fillStyle = floodLevel > 50 ? '#ff4444' : '#3a78c0';
  ctx.fillRect(x + 58, y + 6, (w - 66) * Math.min(1, floodLevel / 100), 10);
  ctx.textBaseline = 'alphabetic';
}

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

  /** Create a RenderContext with camera offset for harbor overlay animation. */
  private createHarborRc(rc: RenderContext, animOffset: number): RenderContext {
    return {
      ...rc,
      camera: {
        x: rc.camera.x,
        y: rc.camera.y - animOffset,
      },
    };
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
      weather: world.weather,
    };

    ctx.fillStyle = WATER_COLOR_1;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawWater(rc, time, waterOffset);

    // Harbor overlay during docking/undocking animation (before/after tiles are merged into the deck)
    const dockingApproach = (world.docking.phase === 'docking' || world.docking.phase === 'undocking') && world.docking.harborTiles.length > 0;
    const harborRc = dockingApproach ? this.createHarborRc(rc, world.docking.harborAnimOffset) : null;
    const harborDeckObj = dockingApproach ? {
      name: 'Harbor',
      tiles: world.docking.harborTiles,
      width: world.docking.harborWidth,
      height: world.docking.harborHeight,
    } : null;

    // Crow's nest: draw upper deck faintly underneath (tiles + crew)
    if (deckIndex === 0 && decks.length > 1) {
      drawDeck(rc, decks[1], time);
      if (harborRc && harborDeckObj) drawDeck(harborRc, harborDeckObj, time);
      for (const corpse of world.corpses) {
        if (corpse.deck === 1) drawCorpse(rc, corpse, corpse.actorId === world.selectedCorpseId);
      }
      for (const member of crew) {
        if (member.deck === 1 && !member.statuses.has('ashore')) {
          drawActor(rc, member, member.id === selectedActorId);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    drawDeck(rc, deck, time);
    // Harbor tiles alongside upper deck (during docking approach only — once docked, tiles are in the deck)
    if (harborRc && harborDeckObj && deckIndex === 1) {
      drawDeck(harborRc, harborDeckObj, time);
    }

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
      // FEATURE 5: a storm further darkens the sky (raise the clamp ceiling so storms
      // can be murkier than the normal night cap).
      const stormAlpha = world.weather.state === 'storm' ? world.weather.intensity * 0.4 : 0;
      // FEATURE 6: the sea darkens ominously as the kraken rises (warning) and stays
      // murky through the attack.
      const monsterAlpha = world.monster
        ? (world.monster.phase === 'warning' ? 0.25 : world.monster.phase === 'attacking' ? 0.18 : 0)
        : 0;
      const totalAlpha = Math.min(0.85, nightAlpha + deckAlpha + stormAlpha + monsterAlpha);
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

    // Rain sheet (storm) — drawn over the world but under crew/UI.
    drawRainOverlay(rc, time);

    // Corpses (drawn after darkness/glow, before living actors)
    for (const corpse of world.corpses) {
      if (corpse.deck === deckIndex) drawCorpse(rc, corpse, corpse.actorId === world.selectedCorpseId);
    }

    // Kraken tentacles (FEATURE 6) — world-space overlay drawn over tiles, under crew.
    if (world.tentacles.length > 0) {
      drawTentacles(rc, world.tentacles, deckIndex, time);
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
      // FEATURE 8 — crew on a shore expedition are hidden from the deck.
      if (member.deck === deckIndex && !member.statuses.has('ashore')) {
        drawActor(rc, member, member.id === selectedActorId);
      }
    }
    // Second pass: draw bubbles and name labels on top of all actors
    for (const member of crew) {
      if (member.deck === deckIndex && !member.statuses.has('ashore')) {
        drawActorOverlays(rc, member, member.id === selectedActorId);
      }
    }

    drawUI(rc, deck, deckIndex, crew, selectedActorId, selectedObject, decks, barrelInventory, time);
    if (world.selectedCorpseId !== null) {
      const corpse = world.corpses.find(c => c.actorId === world.selectedCorpseId);
      if (corpse) drawCorpsePanel(rc, corpse);
    }
    if (worldMap) {
      drawCompass(rc, worldMap.currentHeading, worldMap.currentSpeed > 0, Math.min(3, decks.length), timeOfDay);
    }
    drawSettingsButton(rc, world.settingsOpen);
    drawSoundButton(rc, soundMuted, sfxMuted);
    drawGoldCounter(rc, world.gold);
    drawWeatherIndicator(rc, world.weather);
    // Top-center status HUD: combat takes the slot, else the kraken, else flooding.
    if (world.enemyShip) {
      drawCombatHud(rc, world.enemyShip, world.floodLevel);
    } else if (world.monster) {
      // Kraken phase indicator (FEATURE 6). Flood shown below it if taking on water.
      drawMonsterHud(rc, world.monster, world.tentacles.length);
      if (world.floodLevel > 0) drawFloodIndicator(ctx, world.floodLevel, 96);
    } else if (world.floodLevel > 0) {
      // Show the flood indicator even without an enemy (e.g. storms / lingering breaches)
      drawFloodIndicator(ctx, world.floodLevel);
    }
    if (world.settingsOpen) {
      drawSettingsPanel(rc, world.settings);
    }
    if (activityLog.length > 0) {
      drawActivityLog(rc, activityLog, time);
    }
    drawTooltip(rc, deck);
    if (contextMenu) {
      drawContextMenu(rc, contextMenu, mousePos);
    }
    if (world.commandInput) {
      drawCommandInput(rc, world.commandInput);
    }
    if (mapOverlayOpen && worldMap) {
      drawMapOverlay(rc, worldMap, mousePos, time, hasNavigator, hasHelmsman, hasExpertNavigator, world.enemyShip);
    }
    if (rc.hoveredItem) {
      drawItemTooltip(rc, rc.hoveredItem.item);
    }
    if (rc.hoveredBarTooltip) {
      drawBarTooltip(rc, rc.hoveredBarTooltip);
    }

    // Lightning flash (FEATURE 5) — a brief full-screen white flash that decays in
    // update(). Drawn above the world/UI but below end-state overlays.
    if (world.weather.lightningFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, world.weather.lightningFlash)})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Dock button (approaching harbor island)
    if (world.nearbyHarborIsland && world.docking.phase === 'none') {
      drawDockButton(ctx, world.nearbyHarborIsland, hasHelmsman, mousePos);
    }

    // "Leave harbor" button when docked
    if (world.docking.phase === 'docked') {
      drawDockedBar(ctx, hasHelmsman, mousePos, world.docking.island?.name);
      // FEATURE 8 — "Dig for treasure!" button when docked at a marked island.
      if (world.docking.island && world.treasureIslands.has(world.docking.island.id)) {
        drawDigButton(ctx, mousePos, world.expedition !== null);
      }
    }

    // FEATURE 7 — docking toast ("Docking…" / "Docking completed!") + active contracts.
    if (world.dockingToast) {
      drawDockingToast(rc, world.dockingToast);
    }
    if (!world.enemyShip && !world.monster) {
      // Avoid stacking on top of the combat/kraken HUD (top-center) — contracts list
      // sits top-right, but skip while a combat HUD is fighting for attention.
      drawContractsHud(rc, world.contracts.filter(c => c.status === 'active'));
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

    // Game over overlay \u2014 generalized to display world.gameOverReason.
    // Both mutiny and sinking (flooding) end the game via mutinyState === 'game_over'.
    if (world.mutinyState === 'game_over') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const cx = CANVAS_WIDTH / 2;
      const cy = CANVAS_HEIGHT / 2 - 40;

      // Determine the headline + subtext from the reason (default = mutiny).
      const reason = world.gameOverReason;
      const sank = reason === 'Your ship sank!';
      const headline = sank ? 'SUNK!' : 'MUTINY!';
      const subtext = reason ?? 'The crew has seized the ship.';

      // Icon: skull for mutiny, waves for sinking.
      if (sank) {
        ctx.fillStyle = '#3a78c0';
        ctx.font = '64px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2248', cx, cy); // \u2248 waves
      } else {
        ctx.font = '64px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#cc2222';
        ctx.fillText('\u2620', cx, cy); // skull & crossbones
      }

      ctx.font = 'bold 48px serif';
      ctx.fillStyle = sank ? '#5599dd' : '#cc2222';
      ctx.fillText(headline, cx, cy + 60);

      ctx.font = '18px serif';
      ctx.fillStyle = '#cccccc';
      ctx.fillText(subtext, cx, cy + 100);

      ctx.font = '14px monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText('Refresh to restart', cx, cy + 135);
      ctx.textBaseline = 'alphabetic';
    }

    this.hoveredItem = rc.hoveredItem;
  }
}
