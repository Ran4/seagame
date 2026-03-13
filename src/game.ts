import { Deck, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, WALKABLE, CrewState, Item, SECONDS_PER_DAY, getShipBrightness, LANTERN_BURNOUT_RATE, Command, World, SKILL_MASTERY, InputMode, GameSettings } from './types';
import { createSemen, createGrogRation, updateSpoilage } from './items';
import { createShip } from './ship';
import { createActors, updateActors, issueCommand } from './crew';
import { createInputHandler, updateCamera, handleClick, InputState } from './input';
import { updateSailing, updateNavigator, updateHelmsman, createWorldMap, SHIP_SPEED, handleMapOverlayClick } from './worldmap';
import { buildContextMenu, handleMenuClick, menuItemToCommand } from './menu';
import { AudioManager } from './audio';
import { getAutocomplete, submitCommandInput } from './command-input';

function loadSettings(): GameSettings {
  try {
    const stored = localStorage.getItem('seagame_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.inputMode === 'html' || parsed.inputMode === 'ingame') {
        return { inputMode: parsed.inputMode };
      }
    }
  } catch {}
  return { inputMode: 'html' };
}

function saveSettings(settings: GameSettings): void {
  try { localStorage.setItem('seagame_settings', JSON.stringify(settings)); } catch {}
}

export function createWorld(): World {
  const decks = createShip();
  const actors = createActors(4, decks);
  const worldMap = createWorldMap();
  const barrelInventory = new Map<string, Item[]>();
  const lanternOil = new Map<string, number>();

  // Seed barrels with starting items
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === TileType.BARREL) {
          const semen = createSemen(0);
          semen.quantity = 2;
          semen.weight = 10;
          barrelInventory.set(`${d}-${x}-${y}`, [semen]);
        }
      }
    }
  }

  // Seed first barrel on lower deck with grog rations
  const lowerDeckIndex = decks.length - 1;
  const lowerDeck = decks[lowerDeckIndex];
  outer:
  for (let y = 0; y < lowerDeck.height; y++) {
    for (let x = 0; x < lowerDeck.width; x++) {
      if (lowerDeck.tiles[y][x] === TileType.BARREL) {
        const key = `${lowerDeckIndex}-${x}-${y}`;
        const items = barrelInventory.get(key) || [];
        for (let g = 0; g < 4; g++) items.push(createGrogRation());
        barrelInventory.set(key, items);
        break outer;
      }
    }
  }

  // Init lantern oil to 0 (crew will light them if it's night)
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === TileType.LANTERN) {
          lanternOil.set(`${d}-${x}-${y}`, 0);
        }
      }
    }
  }

  // Center camera on ship (upper deck)
  const deck = decks[1];

  return {
    decks,
    actors,
    camera: {
      x: (deck.width * TILE_SIZE - CANVAS_WIDTH) / 2,
      y: (deck.height * TILE_SIZE - CANVAS_HEIGHT) / 2,
    },
    activeDeck: 1,
    selectedActorId: null,
    selectedObject: null,
    contextMenu: null,
    worldMap,
    barrelInventory,
    lanternOil,
    dayTimeOffset: Math.random() * SECONDS_PER_DAY,
    mapOverlayOpen: false,
    wasNavigating: false,
    navTimer: 0,
    time: 0,
    waterOffset: { x: 0, y: 0 },
    activityLog: [],
    orderPollTimer: 0,
    spottedIslands: new Set(),
    shantyCooldown: 0,
    danceCooldown: 0,
    mutinyState: 'none',
    mutinyTimer: 0,
    commandInput: null,
    settingsOpen: false,
    settings: loadSettings(),
  };
}

export function update(world: World, input: InputState, audio: AudioManager, hoveredItem: Item | null, dt: number): void {
  audio.activeDeck = world.activeDeck;

  // Game over — skip simulation updates, only handle input for restart
  if (world.mutinyState === 'game_over') return;

  // --- Command input bar ---
  input.commandBarOpen = world.commandInput !== null;
  if (world.commandInput) input.commandBarMode = world.commandInput.mode;
  if (world.commandInput) {
    for (const key of input.keyEvents) {
      if (key === 'Escape') {
        world.commandInput = null;
        input.hiddenInput.blur();
        break;
      } else if (key === 'Enter') {
        // Autocomplete partial command name before submitting
        const match = getAutocomplete(world.commandInput.text);
        if (match && world.commandInput.text.indexOf(' ') < 0) {
          world.commandInput.text = match.commandName;
        }
        submitCommandInput(world);
        input.hiddenInput.blur();
        break;
      } else if (key === 'Tab') {
        const match = getAutocomplete(world.commandInput.text);
        if (match && world.commandInput.text.indexOf(' ') < 0) {
          world.commandInput.text = match.commandName;
          world.commandInput.cursorPos = match.commandName.length;
          if (world.commandInput.mode === 'html') {
            input.hiddenInput.value = match.commandName;
          }
        }
      } else if (world.commandInput.mode === 'ingame') {
        const ci = world.commandInput;
        if (key === 'Backspace') {
          if (ci.cursorPos > 0) {
            ci.text = ci.text.slice(0, ci.cursorPos - 1) + ci.text.slice(ci.cursorPos);
            ci.cursorPos--;
          }
        } else if (key === 'ArrowLeft') {
          if (ci.cursorPos > 0) ci.cursorPos--;
        } else if (key === 'ArrowRight') {
          if (ci.cursorPos < ci.text.length) ci.cursorPos++;
        } else if (key === 'Delete') {
          if (ci.cursorPos < ci.text.length) {
            ci.text = ci.text.slice(0, ci.cursorPos) + ci.text.slice(ci.cursorPos + 1);
          }
        } else if (key.length === 1) {
          ci.text = ci.text.slice(0, ci.cursorPos) + key + ci.text.slice(ci.cursorPos);
          ci.cursorPos++;
        }
      }
    }
    // Sync from hidden input in html mode
    if (world.commandInput && world.commandInput.mode === 'html') {
      world.commandInput.text = input.hiddenInput.value;
      world.commandInput.cursorPos = input.hiddenInput.selectionStart ?? input.hiddenInput.value.length;
    }
    // Suppress all other input while command bar is open
    input.keyEvents.length = 0;
    input.keysDown.clear();
    // Close on click outside
    if (input.mouseClick) {
      world.commandInput = null;
      input.hiddenInput.blur();
      input.mouseClick = null;
    }
  } else {
    // Open command input bar on Enter (mode from settings)
    if (world.selectedActorId !== null && !world.contextMenu && !world.mapOverlayOpen && !world.settingsOpen) {
      for (const key of input.keyEvents) {
        if (key === 'Enter') {
          const mode = world.settings.inputMode;
          world.commandInput = { text: '', mode, cursorPos: 0 };
          if (mode === 'html') {
            input.hiddenInput.value = '';
            input.hiddenInput.focus();
          }
          input.keysDown.delete('Enter');
          break;
        }
      }
    }
  }
  input.keyEvents.length = 0;

  // Tick shanty/dance cooldowns
  if (world.shantyCooldown > 0) world.shantyCooldown = Math.max(0, world.shantyCooldown - dt);
  if (world.danceCooldown > 0) world.danceCooldown = Math.max(0, world.danceCooldown - dt);

  // Three-step sailing: navigator sets orders, helmsman executes, physics always runs
  const anyNavigating = world.actors.some(c => c.state === CrewState.NAVIGATING);
  const anySteering = world.actors.some(c => c.state === CrewState.STEERING);
  world.navTimer += dt;
  if (anyNavigating && world.navTimer >= 0.5) {
    updateNavigator(world.worldMap);
    world.navTimer = 0;
  }
  if (anySteering) updateHelmsman(world.worldMap);
  updateSailing(world.worldMap, dt);

  // Scroll water downward (always Y-axis only — the ship sprite always faces up,
  // so heading-based scrolling would look wrong and be disorienting)
  if (world.worldMap.currentSpeed > 0) {
    const WATER_SCROLL_SPEED = 32; // pixels/sec at full speed
    const speedRatio = world.worldMap.currentSpeed / SHIP_SPEED;
    world.waterOffset.y -= WATER_SCROLL_SPEED * speedRatio * dt;
  }

  // Auto-open overlay on transition into navigating; auto-close when nobody is
  if (anyNavigating && !world.wasNavigating) {
    world.mapOverlayOpen = true;
  } else if (!anyNavigating && world.mapOverlayOpen) {
    world.mapOverlayOpen = false;
  }
  world.wasNavigating = anyNavigating;

  // Escape closes overlay, settings, or context menu
  if (input.keysDown.has('Escape')) {
    if (world.settingsOpen) {
      world.settingsOpen = false;
    } else if (world.mapOverlayOpen) {
      world.mapOverlayOpen = false;
    } else {
      world.contextMenu = null;
    }
    input.keysDown.delete('Escape');
  }

  // M key toggles overlay (only when someone is navigating)
  if (input.keysDown.has('m') || input.keysDown.has('M')) {
    if (anyNavigating) {
      world.mapOverlayOpen = !world.mapOverlayOpen;
    }
    input.keysDown.delete('m');
    input.keysDown.delete('M');
  }

  // Deck switching (1 = crow's nest, 2 = upper deck, 3 = lower deck)
  for (let d = 0; d < world.decks.length; d++) {
    const key = String(d + 1);
    if (input.keysDown.has(key)) {
      world.activeDeck = d;
      world.contextMenu = null;
      input.keysDown.delete(key);
    }
  }

  // Camera
  updateCamera(world.camera, input, dt, world.decks[world.activeDeck].width, world.decks[world.activeDeck].height);

  // Map overlay click interception
  if (input.mouseClick && world.mapOverlayOpen) {
    const hasExpertNavigator = world.actors.some(c =>
      c.state === CrewState.NAVIGATING && (c.skills.navigation ?? 0) >= SKILL_MASTERY
    );
    const result = handleMapOverlayClick(world.worldMap, input.mouseClick.x, input.mouseClick.y, hasExpertNavigator);
    if (result === 'close') {
      world.mapOverlayOpen = false;
    } else if (result === 'click') {
      audio.play('click', world.activeDeck);
    }
    input.mouseClick = null;
  }

  // Clicks
  if (input.mouseClick) {
    const mx = input.mouseClick.x;
    const my = input.mouseClick.y;

    // Bottom-left buttons: cogwheel (8), music (36), sfx (64) — all 24x24, 4px gap
    const btnSize = 24;
    const btnY = CANVAS_HEIGHT - btnSize - 8;

    // Settings cogwheel
    if (mx >= 8 && mx <= 8 + btnSize && my >= btnY && my <= btnY + btnSize) {
      world.settingsOpen = !world.settingsOpen;
      audio.play('click', world.activeDeck);
      input.mouseClick = null;
    }
    // Music toggle
    const musicBtnX = 8 + btnSize + 4;
    if (input.mouseClick && mx >= musicBtnX && mx <= musicBtnX + btnSize && my >= btnY && my <= btnY + btnSize) {
      audio.toggleMute();
      input.mouseClick = null;
    }
    // SFX toggle
    const sfxBtnX = musicBtnX + btnSize + 4;
    if (input.mouseClick && mx >= sfxBtnX && mx <= sfxBtnX + btnSize && my >= btnY && my <= btnY + btnSize) {
      audio.toggleSfxMute();
      input.mouseClick = null;
    }

    // Settings panel click handling
    if (input.mouseClick && world.settingsOpen) {
      // Panel is drawn above the cogwheel: x=8, y=btnY-panelH-4
      const panelW = 200;
      const panelH = 50;
      const panelX = 8;
      const panelY = btnY - panelH - 4;
      if (mx >= panelX && mx <= panelX + panelW && my >= panelY && my <= panelY + panelH) {
        // Pill hit detection: pills are at y=panelY+26, "Html" at x=panelX+80, "In-game" at x after
        const pillY = panelY + 24;
        const pillH = 18;
        if (my >= pillY && my <= pillY + pillH) {
          const htmlPillX = panelX + 78;
          const htmlPillW = 38;
          const ingamePillX = htmlPillX + htmlPillW + 4;
          const ingamePillW = 62;
          if (mx >= htmlPillX && mx <= htmlPillX + htmlPillW) {
            world.settings.inputMode = 'html';
            saveSettings(world.settings);
          } else if (mx >= ingamePillX && mx <= ingamePillX + ingamePillW) {
            world.settings.inputMode = 'ingame';
            saveSettings(world.settings);
          }
        }
        input.mouseClick = null;
      }
    }

    // Check deck selector panel (x:10-170, y:14 + i*22, h:22, 2 entries)
    if (input.mouseClick && mx >= 10 && mx <= 170 && my >= 14 && my < 14 + world.decks.length * 22) {
      const clicked = Math.floor((my - 14) / 22);
      if (clicked >= 0 && clicked < world.decks.length && clicked !== world.activeDeck) {
        world.activeDeck = clicked;
        audio.play('deck_change', world.activeDeck);
      }
      audio.startMusicOnInteraction();
      input.mouseClick = null;
    }
  }

  // Context menu click handling (before normal click processing)
  if (input.mouseClick && world.contextMenu) {
    const menuItem = handleMenuClick(world.contextMenu, input.mouseClick);
    if (menuItem) {
      // "Open Map" action — UI-only, not a crew command
      if (menuItem.label === 'Open Map') {
        world.mapOverlayOpen = true;
        audio.play('click', world.activeDeck);
        world.contextMenu = null;
        input.mouseClick = null;
      } else {
        // All other menu items dispatch as commands
        const command = menuItemToCommand(world.contextMenu, world.decks, menuItem);
        if (command) {
          const actorId = menuItem.targetActorId !== undefined
            ? world.selectedActorId
            : (world.contextMenu.actorId ?? world.selectedActorId);
          const member = actorId !== null ? world.actors.find(c => c.id === actorId) : null;
          if (member) {
            issueCommand(member, command, world.actors);
          }
        }

        audio.play('click', world.activeDeck);
        world.contextMenu = null;
        input.mouseClick = null;
      }
    } else if (menuItem === null) {
      // Clicked outside menu — close it, let click fall through
      world.contextMenu = null;
    } else {
      // undefined = clicked on submenu parent or disabled submenu item, keep menu open
      input.mouseClick = null;
    }
  }

  // Right-click on barrel item slot in context menu → select it (show "Take" flyout)
  if (input.rightClick && world.contextMenu?.barrelItems) {
    const menuItem = handleMenuClick(world.contextMenu, input.rightClick);
    if (menuItem) {
      // "Take" clicked via right-click flyout — dispatch as command
      const command = menuItemToCommand(world.contextMenu, world.decks, menuItem);
      if (command) {
        const member = world.actors.find(c => c.id === world.selectedActorId);
        if (member) {
          issueCommand(member, command, world.actors);
        }
        audio.play('click', world.activeDeck);
        world.contextMenu = null;
      }
      input.rightClick = null;
    } else if (menuItem === undefined) {
      // Barrel slot selected or flyout area — consume right-click, keep menu
      input.rightClick = null;
    }
    // menuItem === null means outside menu — let right-click fall through to open new menu
  }

  // Left-click on crew panel → close menus, consume click (don't deselect)
  if (input.mouseClick && world.selectedActorId !== null) {
    const cpx = CANVAS_WIDTH - 210;
    if (input.mouseClick.x >= cpx && input.mouseClick.x <= cpx + 200 && input.mouseClick.y >= 10) {
      world.contextMenu = null;
      input.mouseClick = null;
    }
  }

  if (input.mouseClick) {
    const result = handleClick(
      input.mouseClick,
      world.camera,
      world.actors,
      world.activeDeck,
      world.decks[world.activeDeck],
    );

    audio.startMusicOnInteraction();

    if (result) {
      if (result.type === 'selectCrew') {
        world.selectedActorId = result.actorId;
        world.selectedObject = null;
        audio.play('click', world.activeDeck);
      } else if (result.type === 'selectObject') {
        world.selectedObject = result;
        world.selectedActorId = null;
        world.contextMenu = null;
        audio.play('click', world.activeDeck);
      } else if (result.type === 'useStairs') {
        // Find connected deck — stairs at same (x,y) on adjacent deck
        for (const d of [world.activeDeck - 1, world.activeDeck + 1]) {
          if (d >= 0 && d < world.decks.length) {
            const otherDeck = world.decks[d];
            if (result.tileY < otherDeck.height && result.tileX < otherDeck.width &&
                (otherDeck.tiles[result.tileY][result.tileX] === TileType.STAIRS || otherDeck.tiles[result.tileY][result.tileX] === TileType.MAST)) {
              world.activeDeck = d;
              break;
            }
          }
        }
        world.contextMenu = null;
        audio.play('stairs', world.activeDeck);
      }
    } else {
      world.selectedActorId = null;
      world.selectedObject = null;
      world.contextMenu = null;
    }
    input.mouseClick = null;
  }

  // Right-click → open context menu
  if (input.rightClick) {
    audio.startMusicOnInteraction();
    const result = buildContextMenu(world, input.rightClick, hoveredItem);
    if (result !== undefined) {
      world.contextMenu = result;
    }
    if (result) {
      audio.play('click', world.activeDeck);
    }
    input.rightClick = null;
  }

  // Burn lantern oil
  for (const [key, oil] of world.lanternOil) {
    if (oil > 0) {
      world.lanternOil.set(key, Math.max(0, oil - LANTERN_BURNOUT_RATE * dt));
    }
  }

  // Time of day + brightness
  const brightness = getShipBrightness((world.time + world.dayTimeOffset) % SECONDS_PER_DAY);

  // Poll for external order files
  world.orderPollTimer += dt;
  if (world.orderPollTimer >= 1) {
    world.orderPollTimer = 0;
    pollOrders(world);
  }

  // Trim activity log to last 50 entries
  if (world.activityLog.length > 50) {
    world.activityLog.splice(0, world.activityLog.length - 50);
  }

  updateSpoilage(world.barrelInventory, world.actors, world.time, world.activityLog);

  // Crew AI — track state transitions to play sounds
  const prevStates = world.actors.map(c => c.state);
  updateActors(world.actors, world.decks, dt, world.barrelInventory, world.time, world.lanternOil, brightness, world.activityLog, world.worldMap, world.spottedIslands, world, audio);
  for (let i = 0; i < world.actors.length; i++) {
    const deck = world.actors[i].deck;
    if (prevStates[i] === CrewState.LIGHTING_LANTERN && world.actors[i].state !== CrewState.LIGHTING_LANTERN) {
      audio.play('lantern_light', deck);
    } else if (prevStates[i] === CrewState.EXTINGUISHING_LANTERN && world.actors[i].state !== CrewState.EXTINGUISHING_LANTERN) {
      audio.play('lantern_extinguish', deck);
    }
    if (prevStates[i] !== CrewState.KISSING && world.actors[i].state === CrewState.KISSING) {
      audio.play('kiss', deck);
    }
    if (prevStates[i] !== CrewState.DRINKING && world.actors[i].state === CrewState.DRINKING) {
      audio.play(world.actors[i].profile.sex === 'F' ? 'glug_female' : 'glug_male', deck);
    }
    // Refresh context menu items if the associated crew member's state changed (stale busy labels)
    if (world.contextMenu?.actorId === world.actors[i].id && prevStates[i] !== world.actors[i].state) {
      const member = world.actors[i];
      const canDrink = member.state === CrewState.IDLE || member.state === CrewState.WALKING;
      for (const item of world.contextMenu.items) {
        if (item.targetState === CrewState.DRINKING && item.itemData) {
          const drinkLabel = `Drink ${item.itemData.itemName.toLowerCase()}`;
          item.label = canDrink ? drinkLabel : `${drinkLabel} (busy)`;
          item.disabled = !canDrink;
        }
      }
    }
  }
}

async function pollOrders(world: World): Promise<void> {
  try {
    const resp = await fetch('/api/orders');
    if (!resp.ok) return;
    const orders: { actorName: string; commands: Command[] }[] = await resp.json();
    for (const { actorName, commands } of orders) {
      const actor = world.actors.find(a => a.profile.name.toLowerCase() === actorName.toLowerCase());
      if (!actor) {
        world.activityLog.push({ text: `Orders for unknown actor "${actorName}"`, time: world.time });
        continue;
      }
      actor.commandQueue.length = 0; // clear existing queue
      actor.commandQueue.push(...commands);
      // Force idle so commands execute immediately (also interrupt wandering)
      if (actor.state === CrewState.IDLE) {
        actor.idleTimer = 0;
      } else if (actor.state === CrewState.WALKING && actor.targetState === CrewState.IDLE) {
        actor.state = CrewState.IDLE;
        actor.path = [];
        actor.idleTimer = 0;
      }
      const names = commands.map(c => c.name);
      let cmdText: string;
      if (names.length === 1) {
        cmdText = `received ${names[0]} command`;
      } else if (names.length <= 5) {
        cmdText = `received commands ${names.join(', ')}`;
      } else {
        const shown = names.slice(0, 5).join(', ');
        cmdText = `received ${names.length} commands: ${shown} and ${names.length - 5} more`;
      }
      world.activityLog.push({ text: `${actor.profile.name}: ${cmdText}`, time: world.time });
    }
  } catch {
    // Server not available or no orders — silent
  }
}
