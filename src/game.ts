import { Deck, CrewMember, Camera, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, ContextMenu, ContextMenuItem, TILE_ACTIONS } from './types';
import { createShip } from './ship';
import { createCrew, updateCrew, orderCrewTo, orderCrewToAdjacentTile } from './crew';
import { Renderer } from './renderer';
import { createInputHandler, updateCamera, handleClick, InputState } from './input';
import { loadSprites } from './sprites';
import { AudioManager } from './audio';

export class Game {
  private decks: Deck[];
  private crew: CrewMember[];
  private camera: Camera;
  private activeDeck = 0;
  private selectedCrewId: number | null = null;
  private selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null = null;
  private contextMenu: ContextMenu | null = null;
  private renderer: Renderer;
  private input: InputState;
  private audio: AudioManager;
  private time = 0;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.decks = createShip();
    this.crew = createCrew(4, this.decks);
    this.renderer = new Renderer(canvas);
    this.input = createInputHandler(canvas);
    this.audio = new AudioManager();

    // Center camera on ship
    const deck = this.decks[0];
    this.camera = {
      x: (deck.width * TILE_SIZE - CANVAS_WIDTH) / 2,
      y: (deck.height * TILE_SIZE - CANVAS_HEIGHT) / 2,
    };

    // Load sprites in background
    loadSprites().then(sprites => {
      this.renderer.setSprites(sprites);
      console.log('Sprites loaded');
    }).catch(() => {
      console.log('Sprites not found, using fallback rendering');
    });
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    this.time += dt;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number): void {
    // Escape closes context menu
    if (this.input.keysDown.has('Escape')) {
      this.contextMenu = null;
      this.input.keysDown.delete('Escape');
    }

    // Deck switching (2 = upper deck, 3 = lower deck; 1 & 4 reserved for future)
    if (this.input.keysDown.has('2')) {
      this.activeDeck = 0;
      this.contextMenu = null;
      this.input.keysDown.delete('2');
    }
    if (this.input.keysDown.has('3')) {
      this.activeDeck = 1;
      this.contextMenu = null;
      this.input.keysDown.delete('3');
    }

    // Camera
    updateCamera(this.camera, this.input, dt, this.decks[this.activeDeck].height);

    // Clicks
    if (this.input.mouseClick) {
      // Check deck selector panel (x:10-170, y:14 + i*22, h:22, 2 entries)
      const mx = this.input.mouseClick.x;
      const my = this.input.mouseClick.y;
      if (mx >= 10 && mx <= 170 && my >= 14 && my < 14 + 2 * 22) {
        const clicked = Math.floor((my - 14) / 22);
        if (clicked >= 0 && clicked < this.decks.length && clicked !== this.activeDeck) {
          this.activeDeck = clicked;
          this.audio.play('deck_change');
        }
        this.audio.startMusicOnInteraction();
        this.input.mouseClick = null;
      }
    }

    // Context menu click handling (before normal click processing)
    if (this.input.mouseClick && this.contextMenu) {
      const menuItem = this.handleMenuClick(this.input.mouseClick);
      if (menuItem) {
        const member = this.crew.find(c => c.id === this.selectedCrewId);
        if (member) {
          orderCrewToAdjacentTile(
            member,
            { x: this.contextMenu.tileX, y: this.contextMenu.tileY, deck: this.contextMenu.deck },
            this.decks,
            menuItem.targetState,
          );
          this.audio.play('click');
        }
        this.contextMenu = null;
        this.input.mouseClick = null;
      } else {
        // Clicked outside menu — close it, let click fall through
        this.contextMenu = null;
      }
    }

    if (this.input.mouseClick) {
      const result = handleClick(
        this.input.mouseClick,
        this.camera,
        this.crew,
        this.activeDeck,
        this.decks[this.activeDeck],
      );

      this.audio.startMusicOnInteraction();

      if (result) {
        if (result.type === 'selectCrew') {
          this.selectedCrewId = result.crewId;
          this.selectedObject = null;
          this.audio.play('click');
        } else if (result.type === 'selectObject') {
          this.selectedObject = result;
          this.selectedCrewId = null;
          this.contextMenu = null;
          this.audio.play('click');
        } else if (result.type === 'useStairs') {
          this.activeDeck = this.activeDeck === 0 ? 1 : 0;
          this.contextMenu = null;
          this.audio.play('stairs');
        } else if (result.type === 'moveTo' && this.selectedCrewId !== null) {
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          if (member) {
            orderCrewTo(member, result.target, this.decks);
          }
        }
      } else {
        this.selectedCrewId = null;
        this.selectedObject = null;
        this.contextMenu = null;
      }
      this.input.mouseClick = null;
    }

    // Right-click → open context menu
    if (this.input.rightClick) {
      this.audio.startMusicOnInteraction();
      if (this.selectedCrewId !== null) {
        const click = this.input.rightClick;
        const worldX = click.x + this.camera.x;
        const worldY = click.y + this.camera.y;
        const tileX = Math.floor(worldX / TILE_SIZE);
        const tileY = Math.floor(worldY / TILE_SIZE);
        const deck = this.decks[this.activeDeck];

        if (tileY >= 0 && tileY < deck.height && tileX >= 0 && tileX < deck.width) {
          const tileType = deck.tiles[tileY][tileX];
          const actions = TILE_ACTIONS[tileType];
          if (actions && actions.length > 0) {
            // Position menu next to the tile
            const screenX = tileX * TILE_SIZE - this.camera.x + TILE_SIZE;
            const screenY = tileY * TILE_SIZE - this.camera.y;
            this.contextMenu = {
              screenX,
              screenY,
              tileX,
              tileY,
              deck: this.activeDeck,
              items: actions,
            };
            this.audio.play('click');
          }
        }
      }
      this.input.rightClick = null;
    }

    // Crew AI
    updateCrew(this.crew, this.decks, dt);
  }

  private handleMenuClick(click: { x: number; y: number }): ContextMenuItem | null {
    if (!this.contextMenu) return null;

    const itemW = 140;
    const itemH = 24;
    const pad = 4;
    const totalH = this.contextMenu.items.length * itemH + pad * 2;

    // Must match the clamping logic in renderer.drawContextMenu
    let mx = this.contextMenu.screenX;
    let my = this.contextMenu.screenY;
    if (mx + itemW > CANVAS_WIDTH) mx = mx - itemW - 4;
    if (my + totalH > CANVAS_HEIGHT) my = CANVAS_HEIGHT - totalH - 4;
    if (mx < 0) mx = 4;
    if (my < 0) my = 4;

    for (let i = 0; i < this.contextMenu.items.length; i++) {
      const iy = my + pad + i * itemH;
      if (click.x >= mx && click.x <= mx + itemW &&
          click.y >= iy && click.y <= iy + itemH) {
        return this.contextMenu.items[i];
      }
    }
    return null;
  }

  private render(): void {
    this.renderer.render(
      this.decks[this.activeDeck],
      this.activeDeck,
      this.crew,
      this.camera,
      this.selectedCrewId,
      this.selectedObject,
      this.time,
      this.input.mousePos,
      this.contextMenu,
    );
  }
}
