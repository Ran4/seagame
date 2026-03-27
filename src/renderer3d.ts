import * as THREE from 'three';
import {
  TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT,
  TileType, CrewState, Item, SECONDS_PER_DAY, NIGHT_BRIGHTNESS,
  World, getShipBrightness, SKILL_MASTERY,
} from './types';
import { SpriteSheet } from './sprites';
import {
  RenderContext,
  drawUI, drawSoundButton, drawActivityLog, drawCompass,
  drawTooltip, drawItemTooltip, drawBarTooltip,
  drawContextMenu, drawMapOverlay,
  drawSettingsButton, drawSettingsPanel, drawCorpsePanel,
  drawDockButton, drawDockedBar,
} from './render';
import { drawCommandInput } from './command-input';
import {
  createSceneContext, resizeSceneContext,
  createWater,
  buildShip,
  createActorRenderer,
  createLightingSystem,
  DECK_HEIGHT, GRID_OFFSET_X, GRID_OFFSET_Z,
} from './render3d';
import { projectToScreen, actorToWorldPos } from './render3d/raycaster';
import type { SceneContext } from './render3d/scene-setup';
import type { ShipScene } from './render3d/ship-builder';
import type { WaterPlane } from './render3d/water';
import type { ActorRenderer } from './render3d/actor-renderer';
import type { LightingSystem } from './render3d/lighting';

export class Renderer3D {
  private sceneCtx: SceneContext;
  private shipScene: ShipScene | null = null;
  private water: WaterPlane;
  private actorRenderer: ActorRenderer;
  private lighting: LightingSystem;

  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private sprites: SpriteSheet | null = null;
  private hoveredItem: { item: Item; x: number; y: number } | null = null;

  // Track deck tile state hash for rebuilding when harbor docks/undocks
  private lastDeckHashes: number[] = [];
  private lastActiveDeck: number = 1;
  // Camera animation
  private cameraAnimating = false;
  private cameraGoalPos = new THREE.Vector3(12, 14, 12);
  private cameraGoalTarget = new THREE.Vector3(0, 1.0, 0);

  // Expose for raycasting from game.ts
  get camera(): THREE.PerspectiveCamera { return this.sceneCtx.camera; }
  get deckGroups(): THREE.Group[] { return this.shipScene?.deckGroups ?? []; }
  get actorGroup(): THREE.Group { return this.actorRenderer.group; }
  get controls() { return this.sceneCtx.controls; }

  constructor(container: HTMLElement) {
    // 3D canvas
    const canvas3d = document.createElement('canvas');
    canvas3d.id = 'game-3d';
    container.appendChild(canvas3d);

    // 2D overlay canvas
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'game-ui';
    this.overlayCanvas.width = CANVAS_WIDTH;
    this.overlayCanvas.height = CANVAS_HEIGHT;
    this.overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;width:100%;height:100%';
    container.appendChild(this.overlayCanvas);

    const ctx2d = this.overlayCanvas.getContext('2d');
    if (!ctx2d) throw new Error('Failed to get 2D overlay context');
    this.overlayCtx = ctx2d;
    this.overlayCtx.imageSmoothingEnabled = false;

    // Scene setup
    const rect = container.getBoundingClientRect();
    this.sceneCtx = createSceneContext(canvas3d, rect.width || CANVAS_WIDTH, rect.height || CANVAS_HEIGHT);

    // Water
    this.water = createWater();
    this.sceneCtx.scene.add(this.water.mesh);

    // Actors
    this.actorRenderer = createActorRenderer();
    this.sceneCtx.scene.add(this.actorRenderer.group);

    // Lighting
    this.lighting = createLightingSystem(this.sceneCtx);

    // Handle resize
    window.addEventListener('resize', () => {
      const r = container.getBoundingClientRect();
      resizeSceneContext(this.sceneCtx, r.width, r.height);
    });
  }

  setSprites(sprites: SpriteSheet): void {
    this.sprites = sprites;
  }

  getHoveredItem(): Item | null {
    return this.hoveredItem?.item ?? null;
  }

  // Get the 3D canvas element (for input event binding)
  get canvasElement(): HTMLCanvasElement {
    return this.sceneCtx.renderer.domElement;
  }

  // Get overlay canvas dimensions for screen-coordinate calculations
  get overlayWidth(): number { return CANVAS_WIDTH; }
  get overlayHeight(): number { return CANVAS_HEIGHT; }

  render(world: World, mousePos: { x: number; y: number }, soundMuted: boolean, sfxMuted: boolean): void {
    const { decks, actors: crew, selectedActorId, selectedObject, time,
            contextMenu, worldMap, mapOverlayOpen, barrelInventory,
            waterOffset, lanternOil, activityLog } = world;
    const deckIndex = world.activeDeck;
    const hasNavigator = crew.some(c => c.state === CrewState.NAVIGATING);
    const hasHelmsman = crew.some(c => c.state === CrewState.STEERING);
    const hasExpertNavigator = crew.some(c =>
      c.state === CrewState.NAVIGATING && (c.skills.navigation ?? 0) >= SKILL_MASTERY
    );
    const timeOfDay = (time + world.dayTimeOffset) % SECONDS_PER_DAY;
    const brightness = getShipBrightness(timeOfDay);

    // ── Build/rebuild ship if needed ──
    if (!this.shipScene) {
      this.shipScene = buildShip(decks);
      this.sceneCtx.scene.add(this.shipScene.shipGroup);
      this.lastDeckHashes = decks.map(d => hashDeck(d.tiles));
    } else {
      // Check if any deck tiles changed (harbor docking/undocking)
      for (let i = 0; i < decks.length; i++) {
        const h = hashDeck(decks[i].tiles);
        if (h !== this.lastDeckHashes[i]) {
          this.shipScene.rebuildDeck(i, decks[i]);
          this.lastDeckHashes[i] = h;
        }
      }
    }

    // ── Deck focus / opacity ──
    if (deckIndex !== this.lastActiveDeck) {
      this.lastActiveDeck = deckIndex;
      this.animateToDeck(deckIndex);
    }
    this.updateDeckOpacities(deckIndex);

    // ── Sync actors ──
    this.actorRenderer.syncActors(crew, selectedActorId);
    this.actorRenderer.syncCorpses(world.corpses, world.selectedCorpseId);

    // ── Update water ──
    this.water.update(time, 0, -(waterOffset.y / TILE_SIZE));

    // ── Update lighting ──
    this.lighting.update(brightness, lanternOil, time);

    // ── Camera animation ──
    if (this.cameraAnimating) {
      this.sceneCtx.camera.position.lerp(this.cameraGoalPos, 0.04);
      this.sceneCtx.controls.target.lerp(this.cameraGoalTarget, 0.04);
      if (this.sceneCtx.camera.position.distanceTo(this.cameraGoalPos) < 0.05) {
        this.cameraAnimating = false;
      }
    }
    this.sceneCtx.controls.update();

    // ── Render 3D scene ──
    this.sceneCtx.renderer.render(this.sceneCtx.scene, this.sceneCtx.camera);

    // ── Render 2D overlay ──
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const rc: RenderContext = {
      ctx,
      sprites: this.sprites,
      mousePos,
      lanternOil,
      brightness,
      camera: world.camera,
      deckIndex,
      hoveredItem: null,
      hoveredBarTooltip: null,
    };

    // Actor name labels and speech bubbles projected to 2D
    this.drawActorOverlays(rc, crew, world.corpses, selectedActorId);

    // Selected object highlight (projected to screen)
    if (selectedObject && selectedObject.deck === deckIndex) {
      this.drawSelectedObjectHighlight(rc, selectedObject);
    }

    // All 2D UI elements
    const deck = decks[deckIndex];
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
      drawMapOverlay(rc, worldMap, mousePos, time, hasNavigator, hasHelmsman, hasExpertNavigator);
    }
    if (rc.hoveredItem) {
      drawItemTooltip(rc, rc.hoveredItem.item);
    }
    if (rc.hoveredBarTooltip) {
      drawBarTooltip(rc, rc.hoveredBarTooltip);
    }

    // Dock button
    if (world.nearbyHarborIsland && world.docking.phase === 'none') {
      drawDockButton(ctx, world.nearbyHarborIsland, hasHelmsman, mousePos);
    }
    if (world.docking.phase === 'docked') {
      drawDockedBar(ctx, hasHelmsman, mousePos, world.docking.island?.name);
    }

    // Mutiny warning/game over
    this.drawMutinyOverlays(ctx, world, time);

    this.hoveredItem = rc.hoveredItem;
  }

  private animateToDeck(deckIndex: number): void {
    const deckY = (2 - deckIndex) * DECK_HEIGHT;
    // Camera presets per deck
    const presets = [
      { pos: new THREE.Vector3(6, deckY + 8, 6), target: new THREE.Vector3(0, deckY + 0.5, 0) },   // crow's nest
      { pos: new THREE.Vector3(12, deckY + 10, 12), target: new THREE.Vector3(0, deckY + 0.5, 0) },  // upper deck
      { pos: new THREE.Vector3(10, deckY + 6, 10), target: new THREE.Vector3(0, deckY + 0.5, 0) },   // lower deck
    ];
    const preset = presets[deckIndex] ?? presets[1];
    this.cameraGoalPos.copy(preset.pos);
    this.cameraGoalTarget.copy(preset.target);
    this.cameraAnimating = true;
  }

  private updateDeckOpacities(activeDeck: number): void {
    if (!this.shipScene) return;
    for (let d = 0; d < this.shipScene.deckGroups.length; d++) {
      const group = this.shipScene.deckGroups[d];
      // All decks visible, but decks above active get hidden for cutaway view
      group.visible = d >= activeDeck;
    }
  }

  private drawActorOverlays(rc: RenderContext, actors: readonly any[], corpses: readonly any[], selectedActorId: number | null): void {
    const ctx = rc.ctx;
    const cam = this.sceneCtx.camera;

    for (const member of actors) {
      const worldPos = actorToWorldPos(member.pixelX, member.pixelY, member.deck);
      const screen = projectToScreen(worldPos, cam, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Check if behind camera
      const v = worldPos.clone().project(cam);
      if (v.z > 1) continue; // behind camera

      const sx = screen.x;
      const sy = screen.y;

      // Speech bubble
      if (member.speechBubbleText) {
        this.drawSpeechBubble(ctx, member.speechBubbleText, sx, sy - 30);
      } else if (member.thoughtBubble) {
        const bubbleSprite = rc.sprites?.bubbles.get(member.thoughtBubble);
        const bubbleSize = 24;
        const bx = sx - bubbleSize / 2;
        const by = sy - 50;
        if (bubbleSprite) {
          ctx.drawImage(bubbleSprite, bx, by, bubbleSize, bubbleSize);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(bx + bubbleSize / 2, by + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
          ctx.fill();
          const bubbleColor = member.thoughtBubble === 'heart' ? '#e74c3c'
            : member.thoughtBubble === 'music_note' ? '#3498db' : '#666666';
          const bubbleChar = member.thoughtBubble === 'heart' ? '\u2665'
            : member.thoughtBubble === 'music_note' ? '\u266A' : '\uD83D\uDC94';
          ctx.fillStyle = bubbleColor;
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(bubbleChar, bx + bubbleSize / 2, by + bubbleSize / 2 + 5);
        }
      }

      // Name label (always for humans, selected-only for animals)
      if (member.actorType === 'human' || member.id === selectedActorId) {
        const npcData = member.statuses?.get?.('npc') as { role: string } | null;
        const label = npcData
          ? `${member.profile.name} (${npcData.role})`
          : member.profile.name;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.strokeText(label, sx, sy - 20);
        ctx.fillStyle = npcData ? '#ffdd88' : '#ffffff';
        ctx.fillText(label, sx, sy - 20);
        ctx.textBaseline = 'alphabetic';
      }

      // State indicator
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      const indicatorMap: Partial<Record<CrewState, string>> = {
        [CrewState.SLEEPING]: 'z',
        [CrewState.EATING]: '~',
        [CrewState.STEERING]: '*',
        [CrewState.MANNING_CANNON]: '!',
        [CrewState.LOOKOUT]: '?',
        [CrewState.NAVIGATING]: 'N',
        [CrewState.COPULATING]: '\u2665',
        [CrewState.KISSING]: '\u2665',
        [CrewState.LIGHTING_LANTERN]: 'L',
        [CrewState.EXTINGUISHING_LANTERN]: 'L',
        [CrewState.TALKING]: '...',
        [CrewState.SINGING]: '\u266A',
        [CrewState.DANCING]: '\u266B',
      };
      const indicator = indicatorMap[member.state as CrewState];
      if (indicator) {
        ctx.fillText(indicator, sx + 14, sy - 12);
      }
    }
  }

  private drawSpeechBubble(ctx: CanvasRenderingContext2D, text: string, sx: number, sy: number): void {
    ctx.font = 'bold 9px sans-serif';
    const metrics = ctx.measureText(text);
    const padX = 6;
    const bubbleW = metrics.width + padX * 2;
    const bubbleH = 16;
    const bubbleX = sx - bubbleW / 2;
    const bubbleY = sy - 22;
    const radius = 4;
    const tailSize = 4;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(bubbleX + radius, bubbleY);
    ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
    ctx.arcTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + radius, radius);
    ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
    ctx.arcTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - radius, bubbleY + bubbleH, radius);
    ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
    ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius, radius);
    ctx.lineTo(bubbleX, bubbleY + radius);
    ctx.arcTo(bubbleX, bubbleY, bubbleX + radius, bubbleY, radius);
    ctx.closePath();
    ctx.fill();

    // Tail
    ctx.beginPath();
    ctx.moveTo(sx - tailSize, bubbleY + bubbleH);
    ctx.lineTo(sx, bubbleY + bubbleH + tailSize + 2);
    ctx.lineTo(sx + tailSize, bubbleY + bubbleH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx, bubbleY + bubbleH / 2);
    ctx.textBaseline = 'alphabetic';
  }

  private drawSelectedObjectHighlight(rc: RenderContext, obj: { x: number; y: number; deck: number }): void {
    const worldPos = new THREE.Vector3(
      obj.x - GRID_OFFSET_X,
      (2 - obj.deck) * DECK_HEIGHT + 0.1,
      obj.y - GRID_OFFSET_Z,
    );
    const screen = projectToScreen(worldPos, this.sceneCtx.camera, CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = rc.ctx;
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x - 16, screen.y - 16, 32, 32);
  }

  private drawMutinyOverlays(ctx: CanvasRenderingContext2D, world: World, time: number): void {
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

    if (world.mutinyState === 'game_over') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const cx = CANVAS_WIDTH / 2;
      const cy = CANVAS_HEIGHT / 2 - 40;
      ctx.font = '64px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#cc2222';
      ctx.fillText('\u2620', cx, cy);
      ctx.font = 'bold 48px serif';
      ctx.fillText('MUTINY!', cx, cy + 60);
      ctx.font = '18px serif';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('The crew has seized the ship.', cx, cy + 100);
      ctx.font = '14px monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText('Refresh to restart', cx, cy + 135);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// Simple hash of deck tiles to detect changes (harbor docking)
function hashDeck(tiles: TileType[][]): number {
  let h = 0;
  for (const row of tiles) {
    for (const t of row) {
      h = (h * 31 + t) | 0;
    }
  }
  return h;
}
