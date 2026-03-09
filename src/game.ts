import { Deck, CrewMember, Camera, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, WALKABLE, CrewState, ContextMenu, ContextMenuItem, TILE_ACTIONS, STATE_NAMES, WorldMap, Item, SECONDS_PER_DAY, getShipBrightness, LANTERN_BURNOUT_RATE } from './types';
import { createSemen, createGrogRation } from './items';
import { createShip } from './ship';
import { createCrew, updateCrew, orderCrewTo, orderCrewToAdjacentTile, orderCrewBesideTile, DRINK_DURATION } from './crew';
import { Renderer } from './renderer';
import { createInputHandler, updateCamera, handleClick, InputState } from './input';
import { loadSprites } from './sprites';
import { AudioManager } from './audio';
import { createWorldMap, updateSailing, updateNavigator, updateHelmsman, setDestination, stopSailing, SHIP_SPEED } from './worldmap';
import { stopConversation } from './conversation';

export class Game {
  private decks: Deck[];
  private crew: CrewMember[];
  private camera: Camera;
  private activeDeck = 1;
  private selectedCrewId: number | null = null;
  private selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null = null;
  private contextMenu: ContextMenu | null = null;
  private renderer: Renderer;
  private input: InputState;
  private audio: AudioManager;
  private worldMap: WorldMap;
  private barrelInventory: Map<string, Item[]> = new Map();
  private lanternOil: Map<string, number> = new Map();
  private dayTimeOffset = Math.random() * SECONDS_PER_DAY;
  private mapOverlayOpen = false;
  private wasNavigating = false;
  private navTimer = 0;
  private time = 0;
  private lastTime = 0;
  private waterOffset = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.decks = createShip();
    this.crew = createCrew(4, this.decks);
    this.renderer = new Renderer(canvas);
    this.input = createInputHandler(canvas);
    this.audio = new AudioManager();
    this.worldMap = createWorldMap();

    // Seed barrels with starting items
    for (let d = 0; d < this.decks.length; d++) {
      const deck = this.decks[d];
      for (let y = 0; y < deck.height; y++) {
        for (let x = 0; x < deck.width; x++) {
          if (deck.tiles[y][x] === TileType.BARREL) {
            const semen = createSemen(0);
            semen.quantity = 2;
            semen.weight = 10;
            this.barrelInventory.set(`${d}-${x}-${y}`, [semen]);
          }
        }
      }
    }

    // Seed first barrel on lower deck with grog rations
    for (let y = 0; y < this.decks[2].height; y++) {
      for (let x = 0; x < this.decks[2].width; x++) {
        if (this.decks[2].tiles[y][x] === TileType.BARREL) {
          const key = `2-${x}-${y}`;
          const items = this.barrelInventory.get(key) || [];
          for (let g = 0; g < 4; g++) items.push(createGrogRation());
          this.barrelInventory.set(key, items);
          break; // only seed first barrel
        }
      }
      // Check if we already seeded one
      if ([...this.barrelInventory.values()].some(items => items.some(i => i.name === 'Grog ration'))) break;
    }

    // Init lantern oil to 0 (crew will light them if it's night)
    for (let d = 0; d < this.decks.length; d++) {
      const deck = this.decks[d];
      for (let y = 0; y < deck.height; y++) {
        for (let x = 0; x < deck.width; x++) {
          if (deck.tiles[y][x] === TileType.LANTERN) {
            this.lanternOil.set(`${d}-${x}-${y}`, 0);
          }
        }
      }
    }

    // Center camera on ship (upper deck)
    const deck = this.decks[1];
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
    this.audio.activeDeck = this.activeDeck;
    // Three-step sailing: navigator sets orders, helmsman executes, physics always runs
    const anyNavigating = this.crew.some(c => c.state === CrewState.NAVIGATING);
    const anySteering = this.crew.some(c => c.state === CrewState.STEERING);
    this.navTimer += dt;
    if (anyNavigating && this.navTimer >= 0.5) {
      updateNavigator(this.worldMap);
      this.navTimer = 0;
    }
    if (anySteering) updateHelmsman(this.worldMap);
    updateSailing(this.worldMap, dt);

    // Scroll water downward to visualize ship movement
    if (this.worldMap.currentSpeed > 0) {
      const WATER_SCROLL_SPEED = 32; // pixels/sec at full speed
      const speedRatio = this.worldMap.currentSpeed / SHIP_SPEED;
      this.waterOffset.y -= WATER_SCROLL_SPEED * speedRatio * dt;
    }

    // Auto-open overlay on transition into navigating; auto-close when nobody is
    if (anyNavigating && !this.wasNavigating) {
      this.mapOverlayOpen = true;
    } else if (!anyNavigating && this.mapOverlayOpen) {
      this.mapOverlayOpen = false;
    }
    this.wasNavigating = anyNavigating;

    // Escape closes overlay or context menu
    if (this.input.keysDown.has('Escape')) {
      if (this.mapOverlayOpen) {
        this.mapOverlayOpen = false;
      } else {
        this.contextMenu = null;
      }
      this.input.keysDown.delete('Escape');
    }

    // M key toggles overlay (only when someone is navigating)
    if (this.input.keysDown.has('m') || this.input.keysDown.has('M')) {
      if (anyNavigating) {
        this.mapOverlayOpen = !this.mapOverlayOpen;
      }
      this.input.keysDown.delete('m');
      this.input.keysDown.delete('M');
    }

    // Deck switching (1 = crow's nest, 2 = upper deck, 3 = lower deck)
    for (let d = 0; d < this.decks.length; d++) {
      const key = String(d + 1);
      if (this.input.keysDown.has(key)) {
        this.activeDeck = d;
        this.contextMenu = null;
        this.input.keysDown.delete(key);
      }
    }

    // Camera
    updateCamera(this.camera, this.input, dt, this.decks[this.activeDeck].height);

    // Map overlay click interception
    if (this.input.mouseClick && this.mapOverlayOpen) {
      const mx = this.input.mouseClick.x;
      const my = this.input.mouseClick.y;
      const ox = 40, oy = 40, ow = 880, oh = 460;

      // Close button (top-right X)
      const closeX = ox + ow - 28;
      const closeY = oy + 8;
      const closeSize = 20;
      if (mx >= closeX && mx <= closeX + closeSize && my >= closeY && my <= closeY + closeSize) {
        this.mapOverlayOpen = false;
        this.input.mouseClick = null;
      } else if (mx >= ox && mx <= ox + ow && my >= oy && my <= oy + oh) {
        // Stop Sailing button (bottom-right of overlay)
        if (this.worldMap.destinationIsland) {
          const btnW = 100, btnH = 22;
          const btnX = ox + ow - btnW - 10;
          const btnY = oy + oh - btnH - 8;
          if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
            stopSailing(this.worldMap);
            this.audio.play('click', this.activeDeck);
            this.input.mouseClick = null;
            return;
          }
        }
        // Check if clicked on an island
        const toScreenX = (wx: number) => ox + (wx / 100) * ow;
        const toScreenY = (wy: number) => oy + 30 + ((wy / 80) * (oh - 50));

        let clickedIsland = false;
        for (const island of this.worldMap.islands) {
          const ix = toScreenX(island.x);
          const iy = toScreenY(island.y);
          const dx = mx - ix;
          const dy = my - iy;
          if (dx * dx + dy * dy < 14 * 14) {
            setDestination(this.worldMap, island);
            this.audio.play('click', this.activeDeck);
            clickedIsland = true;
            break;
          }
        }
        if (!clickedIsland) {
          // Clicked inside overlay but not on island — do nothing
        }
      } else {
        // Clicked outside overlay — close it
        this.mapOverlayOpen = false;
      }
      this.input.mouseClick = null;
    }

    // Clicks
    if (this.input.mouseClick) {
      const mx = this.input.mouseClick.x;
      const my = this.input.mouseClick.y;

      // Sound toggle button (bottom-left, 24x24 with 8px margin)
      const btnSize = 24;
      const btnX = 8;
      const btnY = CANVAS_HEIGHT - btnSize - 8;
      if (mx >= btnX && mx <= btnX + btnSize && my >= btnY && my <= btnY + btnSize) {
        this.audio.toggleMute();
        this.input.mouseClick = null;
      }

      // Check deck selector panel (x:10-170, y:14 + i*22, h:22, 2 entries)
      if (this.input.mouseClick && mx >= 10 && mx <= 170 && my >= 14 && my < 14 + this.decks.length * 22) {
        const clicked = Math.floor((my - 14) / 22);
        if (clicked >= 0 && clicked < this.decks.length && clicked !== this.activeDeck) {
          this.activeDeck = clicked;
          this.audio.play('deck_change', this.activeDeck);
        }
        this.audio.startMusicOnInteraction();
        this.input.mouseClick = null;
      }
    }

    // Context menu click handling (before normal click processing)
    if (this.input.mouseClick && this.contextMenu) {
      const menuItem = this.handleMenuClick(this.input.mouseClick);
      if (menuItem) {
        // "Take item" from barrel — walk to barrel, then take
        if (menuItem.action === 'take_item' && menuItem.itemData) {
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          if (member) {
            member.takeTarget = menuItem.itemData;
            orderCrewToAdjacentTile(
              member,
              { x: this.contextMenu.tileX, y: this.contextMenu.tileY, deck: this.contextMenu.deck },
              this.decks,
              CrewState.TAKING_ITEM,
            );
          }
          this.audio.play('click', this.activeDeck);
          this.contextMenu = null;
          this.input.mouseClick = null;
          return;
        }
        // "Open Map" action — open overlay, not a crew order
        if (menuItem.label === 'Open Map') {
          this.mapOverlayOpen = true;
          this.audio.play('click', this.activeDeck);
          this.contextMenu = null;
          this.input.mouseClick = null;
          return;
        }
        if (menuItem.targetCrewId !== undefined) {
          // Crew-crew interaction (kiss or copulate)
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          const target = this.crew.find(c => c.id === menuItem.targetCrewId);
          if (member && target) {
            member.copulationTarget = { type: 'crew', crewId: target.id };
            // Stop target and make them wait
            target.copulationTarget = { type: 'crew', crewId: member.id };
            target.state = CrewState.IDLE;
            target.path = [];
            target.idleTimer = 999;
            const targetTile = { x: Math.floor(target.pixelX / TILE_SIZE), y: Math.floor(target.pixelY / TILE_SIZE), deck: target.deck };
            if (menuItem.targetState === CrewState.TALKING || menuItem.targetState === CrewState.KISSING) {
              orderCrewBesideTile(member, targetTile, this.decks, menuItem.targetState);
            } else {
              orderCrewToAdjacentTile(member, targetTile, this.decks, menuItem.targetState);
            }
          }
        } else if (this.contextMenu.crewId !== undefined && menuItem.deckTarget !== undefined) {
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
          const member = this.crew.find(c => c.id === this.contextMenu!.crewId);
          if (member) {
            if (menuItem.targetState === CrewState.DRINKING) {
              // Drink item — consume from inventory immediately
              const drinkName = menuItem.itemData?.itemName ?? 'Grog ration';
              const grogIdx = member.profile.inventory.findIndex(i => i.name === drinkName);
              if (grogIdx !== -1) {
                const item = member.profile.inventory.splice(grogIdx, 1)[0];
                member.state = CrewState.DRINKING;
                member.stateTimer = DRINK_DURATION;
                member.consumingItem = item;
                member.path = [];
                this.audio.play(member.profile.sex === 'F' ? 'glug_female' : 'glug_male', member.deck);
              }
            } else {
              // "Stop" action
              // If talking, free the conversation partner
              if (member.state === CrewState.TALKING) {
                stopConversation(member, this.crew);
              }
              // If has copulation partner (walking toward or actively copulating), free them
              if (member.copulationTarget?.type === 'crew') {
                const partnerTarget = member.copulationTarget;
                const partner = this.crew.find(c => c.id === partnerTarget.crewId);
                if (partner) {
                  partner.state = CrewState.IDLE;
                  partner.idleTimer = 1 + Math.random() * 2;
                  partner.copulationTarget = null;
                }
              }
              member.copulationTarget = null;
              member.state = menuItem.targetState;
              member.path = [];
              member.idleTimer = 1 + Math.random() * 2;
            }
          }
        } else {
          // Tile-targeted menu (e.g. "sleep in this bed")
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          if (member) {
            let targetDeck = this.contextMenu.deck;
            // Mast actions: send crew to the connected deck
            const clickedTile = this.decks[this.contextMenu.deck].tiles[this.contextMenu.tileY]?.[this.contextMenu.tileX];
            if (clickedTile === TileType.MAST || clickedTile === TileType.STAIRS) {
              for (let d = 0; d < this.decks.length; d++) {
                if (d === this.contextMenu.deck) continue;
                const other = this.decks[d];
                if (this.contextMenu.tileY < other.height && this.contextMenu.tileX < other.width &&
                    (clickedTile === TileType.STAIRS
                      ? WALKABLE.has(other.tiles[this.contextMenu.tileY][this.contextMenu.tileX])
                      : other.tiles[this.contextMenu.tileY][this.contextMenu.tileX] === TileType.MAST)) {
                  targetDeck = d;
                  break;
                }
              }
            }
            if (menuItem.targetState === CrewState.LOOKOUT) {
              // Go to a tile next to the mast, not onto it
              const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
              for (const [dx, dy] of DIRS) {
                if (orderCrewTo(member, { x: this.contextMenu.tileX + dx, y: this.contextMenu.tileY + dy, deck: targetDeck }, this.decks, menuItem.targetState)) break;
              }
            } else {
              orderCrewToAdjacentTile(
                member,
                { x: this.contextMenu.tileX, y: this.contextMenu.tileY, deck: targetDeck },
                this.decks,
                menuItem.targetState,
              );
            }
            // Set copulation target for barrel
            if (menuItem.targetState === CrewState.COPULATING) {
              member.copulationTarget = { type: 'barrel', x: this.contextMenu.tileX, y: this.contextMenu.tileY, deck: this.contextMenu.deck };
            }
          }
        }
        this.audio.play('click', this.activeDeck);
        this.contextMenu = null;
        this.input.mouseClick = null;
      } else if (menuItem === null) {
        // Clicked outside menu — close it, let click fall through
        this.contextMenu = null;
      } else {
        // undefined = clicked on submenu parent or disabled submenu item, keep menu open
        this.input.mouseClick = null;
      }
    }

    // Right-click on barrel item slot in context menu → select it (show "Take" flyout)
    if (this.input.rightClick && this.contextMenu?.barrelItems) {
      const menuItem = this.handleMenuClick(this.input.rightClick);
      if (menuItem) {
        // "Take" clicked via right-click flyout — same dispatch as left-click
        if (menuItem.action === 'take_item' && menuItem.itemData) {
          const member = this.crew.find(c => c.id === this.selectedCrewId);
          if (member) {
            member.takeTarget = menuItem.itemData;
            orderCrewToAdjacentTile(
              member,
              { x: this.contextMenu.tileX, y: this.contextMenu.tileY, deck: this.contextMenu.deck },
              this.decks,
              CrewState.TAKING_ITEM,
            );
          }
          this.audio.play('click', this.activeDeck);
          this.contextMenu = null;
        }
        this.input.rightClick = null;
      } else if (menuItem === undefined) {
        // Barrel slot selected or flyout area — consume right-click, keep menu
        this.input.rightClick = null;
      }
      // menuItem === null means outside menu — let right-click fall through to open new menu
    }

    // Left-click on crew panel → close menus, consume click (don't deselect)
    if (this.input.mouseClick && this.selectedCrewId !== null) {
      const cpx = CANVAS_WIDTH - 210;
      if (this.input.mouseClick.x >= cpx && this.input.mouseClick.x <= cpx + 200 && this.input.mouseClick.y >= 10) {
        this.contextMenu = null;
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
          this.selectedObject = null;
          this.audio.play('click', this.activeDeck);
        } else if (result.type === 'selectObject') {
          this.selectedObject = result;
          this.selectedCrewId = null;
          this.contextMenu = null;
          this.audio.play('click', this.activeDeck);
        } else if (result.type === 'useStairs') {
          // Find connected deck — stairs at same (x,y) on adjacent deck
          for (const d of [this.activeDeck - 1, this.activeDeck + 1]) {
            if (d >= 0 && d < this.decks.length) {
              const otherDeck = this.decks[d];
              if (result.tileY < otherDeck.height && result.tileX < otherDeck.width &&
                  (otherDeck.tiles[result.tileY][result.tileX] === TileType.STAIRS || otherDeck.tiles[result.tileY][result.tileX] === TileType.MAST)) {
                this.activeDeck = d;
                break;
              }
            }
          }
          this.contextMenu = null;
          this.audio.play('stairs', this.activeDeck);
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

      // Right-click in crew panel → show self-actions or close menu
      const panelX = CANVAS_WIDTH - 210;
      if (this.selectedCrewId !== null && click.x >= panelX && click.x <= panelX + 200 && click.y >= 10) {
        const member = this.crew.find(c => c.id === this.selectedCrewId);
        if (member) {
          const panelItems: ContextMenuItem[] = [];
          const hovered = this.renderer.getHoveredItem();
          const clickedItem = hovered && member.profile.inventory.includes(hovered) ? hovered : null;
          if (clickedItem) {
            const canDrink = member.state === CrewState.IDLE || member.state === CrewState.WALKING;
            const drinkLabel = `Drink ${clickedItem.name.toLowerCase()}`;
            panelItems.push({ label: canDrink ? drinkLabel : `${drinkLabel} (busy)`, targetState: CrewState.DRINKING, disabled: !canDrink, itemData: { barrelKey: '', itemName: clickedItem.name } });
          }
          if (panelItems.length > 0) {
            this.contextMenu = {
              screenX: click.x + 16,
              screenY: click.y,
              tileX: 0, tileY: 0,
              deck: member.deck,
              items: panelItems,
              crewId: member.id,
            };
            this.audio.play('click', this.activeDeck);
          } else {
            this.contextMenu = null;
          }
        }
        this.input.rightClick = null;
        return;
      }

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

      {
        const tileX = Math.floor(worldX / TILE_SIZE);
        const tileY = Math.floor(worldY / TILE_SIZE);
        const deck = this.decks[this.activeDeck];
        const items: ContextMenuItem[] = [];

        // Crew member actions
        if (clickedCrew) {
          if (clickedCrew.state !== CrewState.IDLE) {
            items.push({ label: `Stop ${STATE_NAMES[clickedCrew.state].toLowerCase()}`, targetState: CrewState.IDLE });
          }
          for (let d = 0; d < this.decks.length; d++) {
            if (d !== clickedCrew.deck) {
              items.push({ label: `Go to ${this.decks[d].name}`, targetState: CrewState.WALKING, deckTarget: d });
            }
          }
          // Drink actions (self-action: right-click on selected crew)
          if (clickedCrew.id === this.selectedCrewId) {
            const seen = new Set<string>();
            for (const inv of clickedCrew.profile.inventory) {
              if (seen.has(inv.name)) continue;
              seen.add(inv.name);
              const canDrink = clickedCrew.state === CrewState.IDLE || clickedCrew.state === CrewState.WALKING;
              const drinkLabel = `Drink ${inv.name.toLowerCase()}`;
              items.push({ label: canDrink ? drinkLabel : `${drinkLabel} (busy)`, targetState: CrewState.DRINKING, disabled: !canDrink, itemData: { barrelKey: '', itemName: inv.name } });
            }
          }
          // Interact submenu (requires a different crew selected)
          if (this.selectedCrewId !== null && this.selectedCrewId !== clickedCrew.id) {
            const selected = this.crew.find(c => c.id === this.selectedCrewId);
            if (selected) {
              const selRelation = selected.relations.find(r => r.crewId === clickedCrew!.id);
              const targetRelation = clickedCrew.relations.find(r => r.crewId === selected.id);
              const selFriendship = selRelation?.friendship ?? 0;
              const selAttraction = selRelation?.attraction ?? 0;
              const targetAttraction = targetRelation?.attraction ?? 0;
              // Lower inhibitions when drunk/tipsy
              const eitherDrunk = selected.conditions.has('drunk') || clickedCrew.conditions.has('drunk');
              const bothDrunk = selected.conditions.has('drunk') && clickedCrew.conditions.has('drunk');
              const eitherTipsy = eitherDrunk || selected.conditions.has('tipsy') || clickedCrew.conditions.has('tipsy');
              const kissThreshold = eitherDrunk ? 32 : eitherTipsy ? 48 : 64;
              const canKiss = selFriendship >= kissThreshold || selAttraction >= kissThreshold;
              const copThreshold = bothDrunk ? 64 : eitherDrunk ? 80 : 128;
              const mutualAttraction = selAttraction >= copThreshold && targetAttraction >= copThreshold;

              const submenu: ContextMenuItem[] = [
                { label: 'Converse', targetState: CrewState.TALKING, targetCrewId: clickedCrew.id },
                canKiss
                  ? { label: 'Kiss', targetState: CrewState.KISSING, targetCrewId: clickedCrew.id }
                  : { label: 'Kiss (not friendly)', targetState: CrewState.KISSING, targetCrewId: clickedCrew.id, disabled: true },
                mutualAttraction
                  ? { label: 'Copulate', targetState: CrewState.COPULATING, targetCrewId: clickedCrew.id }
                  : { label: 'Copulate (low attraction)', targetState: CrewState.COPULATING, targetCrewId: clickedCrew.id, disabled: true },
              ];
              items.push({ label: 'Interact \u25B6', targetState: CrewState.IDLE, submenu });
            }
          }
        }

        // Tile actions from the tile under the click (or under the crew member)
        let pendingBarrelItems: { items: Item[]; barrelKey: string } | undefined;
        if (tileY >= 0 && tileY < deck.height && tileX >= 0 && tileX < deck.width) {
          const tileType = deck.tiles[tileY][tileX];
          // Tile order actions only if a crew member is selected
          if (this.selectedCrewId !== null && !clickedCrew) {
            let tileActions = TILE_ACTIONS[tileType] ? [...TILE_ACTIONS[tileType]!] : undefined;
            if (tileType === TileType.MAST) {
              const hasConnection = this.decks.some((d, i) =>
                i !== this.activeDeck && tileY < d.height && tileX < d.width && d.tiles[tileY][tileX] === TileType.MAST
              );
              if (!hasConnection) {
                tileActions = undefined;
              } else if (this.activeDeck === 0) {
                tileActions = [{ label: 'Climb down', targetState: CrewState.IDLE }];
              }
            }
            // Only male crew can copulate with barrels
            if (tileActions && tileType === TileType.BARREL) {
              const selected = this.crew.find(c => c.id === this.selectedCrewId);
              if (selected?.profile.sex !== 'M') {
                tileActions = tileActions.filter(a => a.targetState !== CrewState.COPULATING);
              }
              // Barrel inventory shown as visual item grid on context menu
              const barrelKey = `${this.activeDeck}-${tileX}-${tileY}`;
              const barrelItemsList = this.barrelInventory.get(barrelKey);
              if (barrelItemsList && barrelItemsList.length > 0) {
                pendingBarrelItems = { items: barrelItemsList, barrelKey };
              }
            }
            // Dynamic lantern actions based on oil state
            if (tileType === TileType.LANTERN) {
              const lanternKey = `${this.activeDeck}-${tileX}-${tileY}`;
              const oil = this.lanternOil.get(lanternKey) ?? 0;
              if (oil <= 0) {
                tileActions = [{ label: 'Light', targetState: CrewState.LIGHTING_LANTERN }];
              } else {
                tileActions = [{ label: 'Extinguish', targetState: CrewState.EXTINGUISHING_LANTERN }];
              }
            }
            if (tileActions) items.push(...tileActions);
          }
          // "Open Map" on map table when someone is navigating
          if (tileType === TileType.MAP_TABLE && anyNavigating) {
            items.push({ label: 'Open Map', targetState: CrewState.NAVIGATING });
          }
        }

        if (items.length > 0 || pendingBarrelItems) {
          this.contextMenu = {
            screenX: click.x + 16,
            screenY: click.y,
            tileX,
            tileY,
            deck: clickedCrew ? clickedCrew.deck : this.activeDeck,
            items,
            crewId: clickedCrew?.id,
            barrelItems: pendingBarrelItems,
          };
          this.audio.play('click', this.activeDeck);
        }
      }
      this.input.rightClick = null;
    }

    // Burn lantern oil
    for (const [key, oil] of this.lanternOil) {
      if (oil > 0) {
        this.lanternOil.set(key, Math.max(0, oil - LANTERN_BURNOUT_RATE * dt));
      }
    }

    // Time of day + brightness
    const timeOfDay = (this.time + this.dayTimeOffset) % SECONDS_PER_DAY;
    const brightness = getShipBrightness(timeOfDay);

    // Crew AI — track state transitions to play sounds
    const prevStates = this.crew.map(c => c.state);
    updateCrew(this.crew, this.decks, dt, this.barrelInventory, this.time, this.lanternOil, brightness);
    for (let i = 0; i < this.crew.length; i++) {
      const deck = this.crew[i].deck;
      if (prevStates[i] === CrewState.LIGHTING_LANTERN && this.crew[i].state !== CrewState.LIGHTING_LANTERN) {
        this.audio.play('lantern_light', deck);
      } else if (prevStates[i] === CrewState.EXTINGUISHING_LANTERN && this.crew[i].state !== CrewState.EXTINGUISHING_LANTERN) {
        this.audio.play('lantern_extinguish', deck);
      }
      if (prevStates[i] !== CrewState.KISSING && this.crew[i].state === CrewState.KISSING) {
        this.audio.play('kiss', deck);
      }
      // Refresh context menu items if the associated crew member's state changed (stale busy labels)
      if (this.contextMenu?.crewId === this.crew[i].id && prevStates[i] !== this.crew[i].state) {
        const member = this.crew[i];
        const canDrink = member.state === CrewState.IDLE || member.state === CrewState.WALKING;
        for (const item of this.contextMenu.items) {
          if (item.targetState === CrewState.DRINKING && item.itemData) {
            const drinkLabel = `Drink ${item.itemData.itemName.toLowerCase()}`;
            item.label = canDrink ? drinkLabel : `${drinkLabel} (busy)`;
            item.disabled = !canDrink;
          }
        }
      }
    }
  }

  // Returns the clicked menu item, or undefined to mean "click was on menu, don't close"
  private handleMenuClick(click: { x: number; y: number }): ContextMenuItem | null | undefined {
    if (!this.contextMenu) return null;

    const itemW = 200;
    const itemH = 24;
    const pad = 4;

    // Barrel item grid dimensions (must match renderer)
    const bSlot = 28, bGap = 4, bCols = 5, bMargin = 10;
    let barrelGridH = 0, barrelSepH = 0;
    const bItems = this.contextMenu.barrelItems?.items;
    if (bItems && bItems.length > 0) {
      const bRows = Math.ceil(bItems.length / bCols);
      barrelGridH = bRows * (bSlot + bGap);
      barrelSepH = this.contextMenu.items.length > 0 ? 8 : 0;
    }

    const totalH = barrelGridH + barrelSepH + this.contextMenu.items.length * itemH + pad * 2;
    const textY0 = barrelGridH + barrelSepH; // offset for text items

    // Must match the clamping logic in renderer.drawContextMenu
    let mx = this.contextMenu.screenX;
    let my = this.contextMenu.screenY;
    if (mx + itemW > CANVAS_WIDTH) mx = mx - itemW - 4;
    if (my + totalH > CANVAS_HEIGHT) my = CANVAS_HEIGHT - totalH - 4;
    if (mx < 0) mx = 4;
    if (my < 0) my = 4;

    // Check barrel item "Take" flyout click (only when a slot is selected)
    if (bItems && bItems.length > 0) {
      const selSlot = this.contextMenu.selectedBarrelSlot;
      const clickPos = this.contextMenu.barrelSlotClickPos;
      if (selSlot !== undefined && selSlot >= 0 && selSlot < bItems.length && clickPos) {
        const flyW = 80;
        const flyH = itemH + pad * 2;
        let flyX = clickPos.x + 16;
        let flyY = clickPos.y;
        if (flyX + flyW > CANVAS_WIDTH) flyX = clickPos.x - flyW - 4;
        if (flyY + flyH > CANVAS_HEIGHT) flyY = CANVAS_HEIGHT - flyH - 2;
        if (click.x >= flyX && click.x <= flyX + flyW &&
            click.y >= flyY && click.y <= flyY + flyH) {
          const takeY = flyY + pad;
          if (click.y >= takeY && click.y <= takeY + itemH) {
            return {
              label: 'Take',
              targetState: CrewState.TAKING_ITEM,
              action: 'take_item',
              itemData: { barrelKey: this.contextMenu.barrelItems!.barrelKey, itemName: bItems[selSlot].name },
            };
          }
          return undefined;
        }
      }

      // Check barrel item slot clicks → select that slot (toggle)
      for (let i = 0; i < bItems.length; i++) {
        const col = i % bCols;
        const row = Math.floor(i / bCols);
        const sx = mx + bMargin + col * (bSlot + bGap);
        const sy = my + pad + row * (bSlot + bGap);
        if (click.x >= sx && click.x <= sx + bSlot &&
            click.y >= sy && click.y <= sy + bSlot) {
          if (selSlot === i) {
            this.contextMenu.selectedBarrelSlot = undefined;
          } else {
            this.contextMenu.selectedBarrelSlot = i;
            this.contextMenu.barrelSlotClickPos = { x: click.x, y: click.y };
          }
          return undefined;
        }
      }
    }

    // Check sub-submenu (level 3) clicks first (deepest first)
    for (let i = 0; i < this.contextMenu.items.length; i++) {
      const item = this.contextMenu.items[i];
      if (!item.submenu) continue;
      const parentY = my + pad + textY0 + i * itemH;
      const subX = mx + itemW;
      const subY = parentY;

      for (let j = 0; j < item.submenu.length; j++) {
        const subItem = item.submenu[j];
        if (!subItem.submenu) continue;
        const sjy = subY + pad + j * itemH;
        let sub2X = subX + itemW;
        const sub2Y = sjy;
        const sub2H = subItem.submenu.length * itemH + pad * 2;
        if (sub2X + itemW > CANVAS_WIDTH) sub2X = subX - itemW;

        if (click.x >= sub2X && click.x <= sub2X + itemW &&
            click.y >= sub2Y && click.y <= sub2Y + sub2H) {
          for (let k = 0; k < subItem.submenu.length; k++) {
            const sky = sub2Y + pad + k * itemH;
            if (click.y >= sky && click.y <= sky + itemH) {
              if (subItem.submenu[k].disabled) return undefined;
              return subItem.submenu[k];
            }
          }
          return undefined;
        }
      }
    }

    // Check submenu (level 2) clicks
    for (let i = 0; i < this.contextMenu.items.length; i++) {
      const item = this.contextMenu.items[i];
      if (!item.submenu) continue;
      const parentY = my + pad + textY0 + i * itemH;
      const subX = mx + itemW;
      const subY = parentY;
      const subH = item.submenu.length * itemH + pad * 2;

      if (click.x >= subX && click.x <= subX + itemW &&
          click.y >= subY && click.y <= subY + subH) {
        for (let j = 0; j < item.submenu.length; j++) {
          const sjy = subY + pad + j * itemH;
          if (click.y >= sjy && click.y <= sjy + itemH) {
            if (item.submenu[j].disabled) return undefined;
            if (item.submenu[j].submenu) return undefined;
            return item.submenu[j];
          }
        }
        return undefined;
      }
    }

    for (let i = 0; i < this.contextMenu.items.length; i++) {
      const iy = my + pad + textY0 + i * itemH;
      if (click.x >= mx && click.x <= mx + itemW &&
          click.y >= iy && click.y <= iy + itemH) {
        if (this.contextMenu.items[i].disabled) return undefined;
        if (this.contextMenu.items[i].submenu) return undefined;
        return this.contextMenu.items[i];
      }
    }
    return null;
  }

  private render(): void {
    const hasNavigator = this.crew.some(c => c.state === CrewState.NAVIGATING);
    const hasHelmsman = this.crew.some(c => c.state === CrewState.STEERING);
    const timeOfDay = (this.time + this.dayTimeOffset) % SECONDS_PER_DAY;
    const brightness = getShipBrightness(timeOfDay);
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
      this.decks,
      this.audio.muted,
      this.worldMap,
      this.mapOverlayOpen,
      hasNavigator,
      hasHelmsman,
      this.barrelInventory,
      this.waterOffset,
      brightness,
      this.lanternOil,
      timeOfDay,
    );
  }
}
