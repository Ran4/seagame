import { Deck, CrewMember, Camera, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, WALKABLE, CrewState, ContextMenu, ContextMenuItem, TILE_ACTIONS, STATE_NAMES } from './types';
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
        if (this.contextMenu.crewId !== undefined && menuItem.deckTarget !== undefined) {
          // "Go to deck" action
          const member = this.crew.find(c => c.id === this.contextMenu!.crewId);
          if (member) {
            const targetDeck = this.decks[menuItem.deckTarget];
            // Find a walkable tile on the target deck
            for (let y = 0; y < targetDeck.height; y++) {
              for (let x = 0; x < targetDeck.width; x++) {
                if (WALKABLE.has(targetDeck.tiles[y][x])) {
                  if (orderCrewTo(member, { x, y, deck: menuItem.deckTarget }, this.decks)) {
                    break;
                  }
                }
              }
              if (member.state === CrewState.WALKING) break;
            }
          }
        } else if (this.contextMenu.crewId !== undefined) {
          // "Stop" action
          const member = this.crew.find(c => c.id === this.contextMenu!.crewId);
          if (member) {
            member.state = menuItem.targetState;
            member.path = [];
            member.idleTimer = 1 + Math.random() * 2;
          }
        } else {
          // Tile-targeted menu (e.g. "sleep in this bed")
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          if (member) {
            orderCrewToAdjacentTile(
              member,
              { x: this.contextMenu.tileX, y: this.contextMenu.tileY, deck: this.contextMenu.deck },
              this.decks,
              menuItem.targetState,
            );
          }
        }
        this.audio.play('click');
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
      const click = this.input.rightClick;
      const worldX = click.x + this.camera.x;
      const worldY = click.y + this.camera.y;

      // Check if right-clicked a crew member
      let clickedCrew: CrewMember | null = null;
      for (const member of this.crew) {
        if (member.deck !== this.activeDeck) continue;
        const dx = worldX - member.pixelX;
        const dy = worldY - member.pixelY;
        if (dx * dx + dy * dy < 14 * 14) {
          clickedCrew = member;
          break;
        }
      }

      if (clickedCrew) {
        const items: ContextMenuItem[] = [];
        // "Stop" option if busy
        if (clickedCrew.state !== CrewState.IDLE) {
          items.push({ label: `Stop ${STATE_NAMES[clickedCrew.state].toLowerCase()}`, targetState: CrewState.IDLE });
        }
        // "Go to [deck]" options for other decks
        for (let d = 0; d < this.decks.length; d++) {
          if (d !== clickedCrew.deck) {
            items.push({ label: `Go to ${this.decks[d].name}`, targetState: CrewState.WALKING, deckTarget: d });
          }
        }
        if (items.length > 0) {
          this.contextMenu = {
            screenX: click.x + 16,
            screenY: click.y,
            tileX: Math.floor(clickedCrew.pixelX / TILE_SIZE),
            tileY: Math.floor(clickedCrew.pixelY / TILE_SIZE),
            deck: clickedCrew.deck,
            items,
            crewId: clickedCrew.id,
          };
          this.audio.play('click');
        }
      } else if (this.selectedCrewId !== null && !clickedCrew) {
        // Right-click on tile → show tile actions
        const tileX = Math.floor(worldX / TILE_SIZE);
        const tileY = Math.floor(worldY / TILE_SIZE);
        const deck = this.decks[this.activeDeck];

        if (tileY >= 0 && tileY < deck.height && tileX >= 0 && tileX < deck.width) {
          const tileType = deck.tiles[tileY][tileX];
          const actions = TILE_ACTIONS[tileType];
          if (actions && actions.length > 0) {
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
