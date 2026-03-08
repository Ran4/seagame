import { Deck, CrewMember, Camera, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from './types';
import { createShip } from './ship';
import { createCrew, updateCrew, orderCrewTo } from './crew';
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
    // Deck switching (2 = upper deck, 3 = lower deck; 1 & 4 reserved for future)
    if (this.input.keysDown.has('2')) {
      this.activeDeck = 0;
      this.input.keysDown.delete('2');
    }
    if (this.input.keysDown.has('3')) {
      this.activeDeck = 1;
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
          this.audio.play('click');
        } else if (result.type === 'useStairs') {
          this.activeDeck = this.activeDeck === 0 ? 1 : 0;
          this.audio.play('stairs');
        } else if (result.type === 'moveTo' && this.selectedCrewId !== null) {
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          if (member) {
            orderCrewTo(member, result.target, this.decks);
          }
        }
      } else {
        this.selectedCrewId = null;
      }
      this.input.mouseClick = null;
    }

    // Crew AI
    updateCrew(this.crew, this.decks, dt);
  }

  private render(): void {
    this.renderer.render(
      this.decks[this.activeDeck],
      this.activeDeck,
      this.crew,
      this.camera,
      this.selectedCrewId,
      this.time,
      this.input.mousePos,
    );
  }
}
