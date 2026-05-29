import { Deck, TileType, TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, WALKABLE, CrewState, Item, SECONDS_PER_DAY, getShipBrightness, LANTERN_BURNOUT_RATE, Command, World, SKILL_MASTERY, InputMode, GameSettings } from './types';
import { createSemen, createGrogRation, createWood, createCannonball, updateSpoilage } from './items';
import { updateFlooding, hasIntactMast, hasIntactHelm, fireFriendlyVolley, enemyVolley, CANNON_RANGE } from './combat';
import { isInDeepWater } from './worldmap';
import { updateWeather, WEATHER_CLEAR_DURATION } from './weather';
import { updateMonster } from './monster';
import { CONFIG } from './config';
import type { EnemyShip } from './types';
import { createShip } from './ship';
import { createActors, updateActors, issueCommand } from './crew';
import { createInputHandler, updateCamera, handleClick, InputState } from './input';
import { updateSailing, updateNavigator, updateHelmsman, createWorldMap, SHIP_SPEED, handleMapOverlayClick, getNearbyHarborIsland } from './worldmap';
import { buildContextMenu, handleMenuClick, menuItemToCommand } from './menu';
import { AudioManager } from './audio';
import { getAutocomplete, submitCommandInput } from './command-input';
import { readNoticeBoard } from './notices';
import { startDocking, completeDocking, startUndocking, completeUndocking, DOCKING_SPEED, UNDOCKING_END, DECK_X_SHIFT, DECK_Y_SHIFT, SHIP_WIDTH, SHIP_HEIGHT } from './harbor';
import { isDockButtonClicked, isLeaveHarborClicked } from './render/docking';
import type { Actor, Sex } from './types';

const RECRUIT_NAMES_M = ['Hank', 'Barney', 'Sven', 'Diego', 'Rufus', 'Ollie', 'Claude', 'Finn'];
const RECRUIT_NAMES_F = ['Rosa', 'Elsa', 'Nora', 'Greta', 'Molly', 'Faye', 'Astrid', 'Lena'];
const RECRUIT_COLORS = ['#e67e22', '#1abc9c', '#e91e63', '#8e44ad', '#16a085', '#d35400'];

function recruitSailor(world: World): void {
  let maxId = 0;
  for (const a of world.actors) { if (a.id > maxId) maxId = a.id; }
  const id = maxId + 1;
  const sex: Sex = Math.random() < 0.5 ? 'M' : 'F';
  const names = sex === 'M' ? RECRUIT_NAMES_M : RECRUIT_NAMES_F;
  const usedNames = new Set(world.actors.map(a => a.profile.name));
  let name = names[Math.floor(Math.random() * names.length)];
  // Avoid duplicate names
  for (const n of names) { if (!usedNames.has(n)) { name = n; break; } }
  const color = RECRUIT_COLORS[Math.floor(Math.random() * RECRUIT_COLORS.length)];

  // Spawn on upper deck near the gangplank
  const spawnX = DECK_X_SHIFT * TILE_SIZE + 2 * TILE_SIZE;
  const spawnY = (DECK_Y_SHIFT + 8) * TILE_SIZE + TILE_SIZE / 2;

  const recruit: Actor = {
    id,
    actorType: 'human',
    profile: {
      name, sex, color,
      spriteIndex: id % 4,
      numberOfHands: 2,
      hunger: 200 + Math.random() * 55,
      energy: 200 + Math.random() * 55,
      morale: 160 + Math.random() * 40,
      inventory: [],
      hands: [],
    },
    health: 100,
    maxHealth: 100,
    carryingCorpseId: null,
    statuses: new Map<string, Record<string, any> | null>(),
    conditions: new Set(),
    skills: {
      sailing: 10 + Math.floor(Math.random() * 51),
      gunnery: 10 + Math.floor(Math.random() * 51),
      combat: 10 + Math.floor(Math.random() * 51),
      cooking: 10 + Math.floor(Math.random() * 51),
      navigation: 10 + Math.floor(Math.random() * 51),
      singing: 10 + Math.floor(Math.random() * 51),
      dancing: 10 + Math.floor(Math.random() * 51),
    },
    pixelX: spawnX,
    pixelY: spawnY,
    facing: 'south',
    deck: 1,
    state: CrewState.IDLE,
    targetState: CrewState.IDLE,
    path: [],
    stateTimer: 0,
    idleTimer: 1 + Math.random() * 2,
    copulationTarget: null,
    relations: [],
    thoughtBubble: null,
    thoughtBubbleTimer: 0,
    conversationPartnerId: null,
    conversationExchangesLeft: 0,
    conversationPositive: true,
    conversationScript: [],
    conversationCooldown: 0,
    conversationMyTurn: false,
    speechBubbleText: null,
    speechBubbleTimer: 0,
    takeTarget: null,
    consumingItem: null,
    lustSeekCooldown: 0,
    commandQueue: [],
    shantyInitiatorId: null,
  };

  // Initialize climber status
  recruit.statuses.set('climber', { skill: 128 });
  // Mark as recruited this visit (prevents multiple recruits)
  recruit.statuses.set('recruited_this_visit', null);
  // Initialize lust
  if (sex === 'M') {
    recruit.statuses.set('lust', { amount: Math.floor(Math.random() * 129) });
  } else {
    recruit.statuses.set('lust', { amount: 64 + Math.floor(Math.random() * 65), cycleTimer: Math.floor(Math.random() * 4320) });
  }

  // Initialize relations with all existing actors
  for (const actor of world.actors) {
    if (actor.statuses.has('npc')) continue; // skip NPC relations (temporary)
    recruit.relations.push({ actorId: actor.id, friendship: 96 + Math.floor(Math.random() * 64), attraction: Math.floor(Math.random() * 80) });
    actor.relations.push({ actorId: recruit.id, friendship: 96 + Math.floor(Math.random() * 64), attraction: Math.floor(Math.random() * 80) });
  }

  world.actors.push(recruit);
  world.activityLog.push({ text: `${name} joined the crew!`, time: world.time });
}


// --- Ship-to-ship combat (FEATURE 4) ---
const ENEMY_NAMES = ['Black Gull', 'Sea Wraith', 'Crimson Maw', 'Salt Reaver', 'Gallows Wind', 'Drowned Lady', 'Iron Barracuda', 'Storm Vulture'];
const ENCOUNTER_TICK = 4;             // seconds between encounter rolls while sailing
const ENCOUNTER_BASE_CHANCE = 0.012;  // per roll in normal waters
const ENCOUNTER_DEEP_CHANCE = 0.05;   // per roll in deep water
const ENCOUNTER_PIRATE_CHANCE = 0.09; // per roll near pirate islands (Tortuga / Skull Rock)
const ENEMY_APPROACH_SPEED = 0.9;     // leagues/sec the enemy closes when chasing & player slow/stopped
const ENEMY_CHASE_WHILE_SAILING = 0.25; // leagues/sec the enemy still closes while player is at full sail
const ENEMY_WRECK_DRIFT = 0.18;       // leagues/sec a crippled (hp 0) wreck drifts away if not boarded
const ESCAPE_DISTANCE = 14;           // leagues — beyond this the enemy gives up
const ESCAPE_CHANCE = 0.06;           // per encounter tick while sailing & out of cannon range
const ENEMY_FIRE_INTERVAL = 6;        // seconds between enemy volleys
const CANNON_RELOAD = 5;              // seconds between auto-fired friendly volleys
const PIRATE_ISLAND_IDS = new Set([0, 3]); // Tortuga, Skull Rock

let combatEncounterTimer = 0;
let friendlyFireTimer = 0;

/** Roll for a new enemy encounter while sailing. Higher odds in deep water / near pirate isles. */
function maybeSpawnEnemy(world: World, audio: AudioManager): void {
  if (world.enemyShip) return;
  const map = world.worldMap;
  if (map.currentSpeed <= 0) return; // only while the ship is actually moving

  let chance = ENCOUNTER_BASE_CHANCE;
  if (isInDeepWater(map)) chance = ENCOUNTER_DEEP_CHANCE;
  // Near a pirate island (within ~10 leagues) bumps the odds further.
  for (const isl of map.islands) {
    if (!PIRATE_ISLAND_IDS.has(isl.id)) continue;
    const dx = map.shipX - isl.x, dy = map.shipY - isl.y;
    if (Math.sqrt(dx * dx + dy * dy) < 10) { chance = Math.max(chance, ENCOUNTER_PIRATE_CHANCE); break; }
  }

  // Test aid: forceEncounter config guarantees the first encounter once sailing.
  if (CONFIG.forceEncounter) { chance = 1; CONFIG.forceEncounter = false; }

  if (Math.random() >= chance) return;

  const hp = 80 + Math.floor(Math.random() * 120); // 80..200
  const enemy: EnemyShip = {
    name: ENEMY_NAMES[Math.floor(Math.random() * ENEMY_NAMES.length)],
    hp,
    maxHp: hp,
    crewCount: 2 + Math.floor(Math.random() * 5), // 2..6
    distance: 8 + Math.random() * 4,              // appears 8..12 leagues off
    hostile: true,
    fireTimer: ENEMY_FIRE_INTERVAL,
  };
  world.enemyShip = enemy;
  world.activityLog.push({ text: `Enemy ship sighted: the ${enemy.name}! It bears down on us.`, time: world.time });
  audio.play('cannon_fire', world.activeDeck);
}

/** Per-frame combat update: enemy movement, auto-cannon fire, enemy volleys, escape. */
function updateCombat(world: World, audio: AudioManager, dt: number): void {
  // Roll for new encounters on a throttle while sailing.
  combatEncounterTimer += dt;
  if (combatEncounterTimer >= ENCOUNTER_TICK) {
    combatEncounterTimer = 0;
    maybeSpawnEnemy(world, audio);
  }

  const enemy = world.enemyShip;
  if (!enemy) { friendlyFireTimer = 0; return; }

  const map = world.worldMap;
  const moving = map.currentSpeed > 0;

  const crippled = enemy.hp <= 0;

  // A hostile enemy chases: it closes fast when the player is slow/stopped (standing to
  // fight), and slowly even while the player is at full sail (the player can outrun it
  // over time — see the escape roll below).
  if (enemy.hostile && !crippled) {
    const closeRate = moving ? ENEMY_CHASE_WHILE_SAILING : ENEMY_APPROACH_SPEED;
    enemy.distance = Math.max(0, enemy.distance - closeRate * dt);
  }

  // A crippled (hp 0) wreck is dead in the water: it drifts away under its own momentum
  // unless the player deliberately sails up to board it for loot. This drift runs at ANY
  // distance (not just beyond cannon range) so a mid-range kill can never freeze in place
  // and soft-lock the encounter — it will eventually drift off and clear via the escape
  // path below. The player can still close the gap to board while it lingers.
  if (crippled) {
    enemy.hostile = false;
    enemy.distance += ENEMY_WRECK_DRIFT * dt;
  }

  // Fleeing: while under full sail and out of cannon range, a chance each encounter tick
  // to shake the enemy. Distance also slowly grows past the escape threshold over time.
  if (moving && !crippled && enemy.distance > CANNON_RANGE) {
    enemy.distance += ENEMY_CHASE_WHILE_SAILING * 1.5 * dt; // net outpace while running
    if (Math.random() < ESCAPE_CHANCE * dt) enemy.distance = ESCAPE_DISTANCE; // clean getaway
  }

  // Escaped / wreck drifted off?
  if (enemy.distance >= ESCAPE_DISTANCE) {
    const text = crippled
      ? `The wreck of the ${enemy.name} drifts away on the current.`
      : `Lost the ${enemy.name} in our wake — we've escaped!`;
    world.activityLog.push({ text, time: world.time });
    world.enemyShip = null;
    return;
  }

  // In cannon range: friendly cannons auto-fire on a reload timer — but never on a wreck
  // (hp 0), which would waste cannonballs and spam the log every reload forever.
  if (enemy.distance <= CANNON_RANGE) {
    if (!crippled) {
      const gunners = world.actors.filter(c => c.state === CrewState.MANNING_CANNON && c.actorType === 'human');
      if (gunners.length > 0) {
        friendlyFireTimer += dt;
        if (friendlyFireTimer >= CANNON_RELOAD) {
          friendlyFireTimer = 0;
          fireFriendlyVolley(world, audio, gunners);
        }
      }

      // Enemy fires back periodically (only while it still has hull).
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = ENEMY_FIRE_INTERVAL;
        enemyVolley(world, audio);
      }
    }
  }
}

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
        // Combat supplies: spare timber for repairs + cannon ammunition.
        const wood = createWood(0); wood.quantity = 6; wood.weight = 2000 * 6;
        const balls = createCannonball(0); balls.quantity = 12; balls.weight = 5000 * 12;
        items.push(wood, balls);
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

  // Center camera on ship region within expanded grid
  return {
    decks,
    actors,
    corpses: [],
    camera: {
      x: DECK_X_SHIFT * TILE_SIZE + (SHIP_WIDTH * TILE_SIZE - CANVAS_WIDTH) / 2,
      y: DECK_Y_SHIFT * TILE_SIZE + (SHIP_HEIGHT * TILE_SIZE - CANVAS_HEIGHT) / 2,
    },
    activeDeck: 1,
    selectedActorId: null,
    selectedCorpseId: null,
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
    docking: {
      phase: 'none',
      island: null,
      harborTiles: [],
      harborWidth: 0,
      harborHeight: 0,
      harborAnimOffset: 0,
    },
    gangplanks: [],
    nearbyHarborIsland: null,
    strandedActors: new Map(),
    strandedCorpses: new Map(),
    objectHp: new Map(),
    floodLevel: 0,
    gameOverReason: null,
    enemyShip: null,
    gold: 100,
    weather: { state: 'clear', timer: WEATHER_CLEAR_DURATION, intensity: 0, lightningFlash: 0 },
    monster: null,
    tentacles: [],
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

  // --- Docking state machine ---
  const anySteering = world.actors.some(c => c.state === CrewState.STEERING);

  // Detect nearby harbor island (for dock button)
  world.nearbyHarborIsland = world.docking.phase === 'none'
    ? getNearbyHarborIsland(world.worldMap)
    : null;

  // Dock button click
  if (world.nearbyHarborIsland && input.mouseClick) {
    if (isDockButtonClicked(input.mouseClick.x, input.mouseClick.y, anySteering)) {
      startDocking(world);
      audio.play('click', world.activeDeck);
      input.mouseClick = null;
    }
  }

  // Leave harbor button click (docked bar)
  if (world.docking.phase === 'docked' && input.mouseClick) {
    if (isLeaveHarborClicked(input.mouseClick.x, input.mouseClick.y, anySteering)) {
      startUndocking(world);
      audio.play('click', world.activeDeck);
      input.mouseClick = null;
    }
  }

  // Docking animation: harbor slides into position
  if (world.docking.phase === 'docking') {
    if (anySteering) {
      world.docking.harborAnimOffset += DOCKING_SPEED * dt;
      if (world.docking.harborAnimOffset >= 0) {
        world.docking.harborAnimOffset = 0;
        completeDocking(world);
        audio.play('harbor_arrive', world.activeDeck);
      }
    }
  }

  // Undocking animation: harbor slides away
  if (world.docking.phase === 'undocking') {
    if (anySteering) {
      world.docking.harborAnimOffset -= DOCKING_SPEED * dt;
      if (world.docking.harborAnimOffset <= UNDOCKING_END) {
        completeUndocking(world);
      }
    }
  }

  // Three-step sailing: navigator sets orders, helmsman executes, physics always runs
  // Skip sailing updates during docking
  const anyNavigating = world.actors.some(c => c.state === CrewState.NAVIGATING);
  if (world.docking.phase === 'none') {
    world.navTimer += dt;
    if (anyNavigating && world.navTimer >= 0.5) {
      updateNavigator(world.worldMap);
      world.navTimer = 0;
    }
    // A destroyed helm/mast disables steering / caps sailing.
    const canSteer = hasIntactHelm(world);
    const canSail = hasIntactMast(world);
    if (anySteering && canSteer) updateHelmsman(world.worldMap);
    if (!canSteer || !canSail) {
      // No working helm → cannot answer the wheel; no mast → no canvas to drive the ship.
      world.worldMap.currentSpeed = 0;
    }
    updateSailing(world.worldMap, dt);

    // Ship-to-ship combat only runs at sea (not docked).
    updateCombat(world, audio, dt);

    // Weather state machine + storm effects (FEATURE 5) — only at sea.
    updateWeather(world, dt, audio);

    // Sea-monster / kraken encounters (FEATURE 6) — only at sea, deep water.
    updateMonster(world, dt, audio);
  }

  // Hull flooding always ticks: at sea breaches let water rise; in port the bilge
  // pumps keep draining (never rises) so the flood level can't freeze while docked
  // and harbor hull repairs can clear breaches.
  updateFlooding(world, dt, world.docking.phase === 'none');

  // Scroll water downward (always Y-axis only — the ship sprite always faces up,
  // so heading-based scrolling would look wrong and be disorienting)
  if (world.docking.phase === 'none' && world.worldMap.currentSpeed > 0) {
    const WATER_SCROLL_SPEED = 32; // pixels/sec at full speed
    const speedRatio = world.worldMap.currentSpeed / SHIP_SPEED;
    world.waterOffset.y -= WATER_SCROLL_SPEED * speedRatio * dt;
  }
  // Scroll water during docking (forward) / undocking (backward) — match harbor animation speed
  if (world.docking.phase === 'docking' && anySteering) {
    world.waterOffset.y -= DOCKING_SPEED * dt;
  }
  if (world.docking.phase === 'undocking' && anySteering) {
    world.waterOffset.y += DOCKING_SPEED * dt;
  }

  // Auto-open overlay on transition into navigating; auto-close when nobody is
  if (world.docking.phase === 'none') {
    if (anyNavigating && !world.wasNavigating) {
      world.mapOverlayOpen = true;
    } else if (!anyNavigating && world.mapOverlayOpen) {
      world.mapOverlayOpen = false;
    }
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

  // M key toggles overlay (only when someone is navigating, not during docking)
  if (input.keysDown.has('m') || input.keysDown.has('M')) {
    if (anyNavigating && world.docking.phase === 'none') {
      world.mapOverlayOpen = !world.mapOverlayOpen;
    }
    input.keysDown.delete('m');
    input.keysDown.delete('M');
  }

  // Deck switching (1 = crow's nest, 2 = upper deck, 3 = lower deck) — harbor only via gangplank click
  const switchableDeckCount = Math.min(3, world.decks.length);
  for (let d = 0; d < switchableDeckCount; d++) {
    const key = String(d + 1);
    if (input.keysDown.has(key)) {
      world.activeDeck = d;
      world.contextMenu = null;
      input.keysDown.delete(key);
    }
  }

  // Camera
  updateCamera(world.camera, input, dt, world.decks[world.activeDeck].width, world.decks[world.activeDeck].height, world.docking.phase === 'docked');

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

    // Check deck selector panel (x:10-170, y:14 + i*22, h:22 — ship decks only)
    const selectorDeckCount = Math.min(3, world.decks.length);
    if (input.mouseClick && mx >= 10 && mx <= 170 && my >= 14 && my < 14 + selectorDeckCount * 22) {
      const clicked = Math.floor((my - 14) / 22);
      if (clicked >= 0 && clicked < selectorDeckCount && clicked !== world.activeDeck) {
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
      } else if (menuItem.action === 'leave_harbor') {
        startUndocking(world);
        audio.play('click', world.activeDeck);
        world.contextMenu = null;
        input.mouseClick = null;
      } else if (menuItem.action === 'buy_grog') {
        // Buy grog from bartender — give selected crew member a grog ration
        const member = world.selectedActorId !== null ? world.actors.find(c => c.id === world.selectedActorId) : null;
        if (member) {
          member.profile.inventory.push(createGrogRation());
          world.activityLog.push({ text: `${member.profile.name} bought a grog ration`, time: world.time });
        }
        audio.play('click', world.activeDeck);
        world.contextMenu = null;
        input.mouseClick = null;
      } else if (menuItem.action === 'recruit_sailor') {
        recruitSailor(world);
        audio.play('recruit', world.activeDeck);
        world.contextMenu = null;
        input.mouseClick = null;
      } else if (menuItem.action === 'browse_wares') {
        world.activityLog.push({ text: '--- Merchant\'s Wares ---', time: world.time });
        world.activityLog.push({ text: 'Grog ration — keeps the crew happy', time: world.time });
        world.activityLog.push({ text: 'Hardtack — cheap but filling', time: world.time });
        world.activityLog.push({ text: 'Hemp rope — essential for rigging', time: world.time });
        world.activityLog.push({ text: 'Gunpowder — for the cannons', time: world.time });
        world.activityLog.push({ text: '(Trading not yet available)', time: world.time });
        audio.play('click', world.activeDeck);
        world.contextMenu = null;
        input.mouseClick = null;
      } else if (menuItem.action === 'read_notices') {
        readNoticeBoard(world);
        audio.play('notice_board', world.activeDeck);
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
    audio.startMusicOnInteraction();

    // Check corpses first (before handleClick, since corpses sit on walkable tiles)
    const clickWorldX = input.mouseClick.x + world.camera.x;
    const clickWorldY = input.mouseClick.y + world.camera.y;
    let clickedCorpse: typeof world.corpses[0] | null = null;
    for (const corpse of world.corpses) {
      if (corpse.deck !== world.activeDeck) continue;
      const cdx = clickWorldX - corpse.pixelX;
      const cdy = clickWorldY - corpse.pixelY;
      if (cdx * cdx + cdy * cdy < 14 * 14) {
        clickedCorpse = corpse;
        break;
      }
    }

    const result = handleClick(
      input.mouseClick,
      world.camera,
      world.actors,
      world.activeDeck,
      world.decks[world.activeDeck],
    );

    if (result && result.type === 'selectCrew') {
      // Crew takes priority over corpse
      world.selectedActorId = result.actorId;
      world.selectedCorpseId = null;
      world.selectedObject = null;
      audio.play('click', world.activeDeck);
    } else if (clickedCorpse) {
      world.selectedCorpseId = clickedCorpse.actorId;
      world.selectedActorId = null;
      world.selectedObject = null;
      world.contextMenu = null;
      audio.play('click', world.activeDeck);
    } else if (result) {
      world.selectedCorpseId = null;
      if (result.type === 'selectObject') {
        world.selectedObject = result;
        world.selectedActorId = null;
        world.contextMenu = null;
        audio.play('click', world.activeDeck);
      } else if (result.type === 'useStairs') {
        // Check gangplank connections first
        let switched = false;
        for (const conn of world.gangplanks) {
          if (conn.deckA === world.activeDeck && conn.xA === result.tileX && conn.yA === result.tileY) {
            world.activeDeck = conn.deckB;
            switched = true;
            break;
          }
          if (conn.deckB === world.activeDeck && conn.xB === result.tileX && conn.yB === result.tileY) {
            world.activeDeck = conn.deckA;
            switched = true;
            break;
          }
        }
        // Regular stair logic (require matching tile type on other deck)
        if (!switched) {
          const clickedTile = world.decks[world.activeDeck].tiles[result.tileY]?.[result.tileX];
          for (let d = 0; d < world.decks.length; d++) {
            if (d === world.activeDeck) continue;
            const otherDeck = world.decks[d];
            if (result.tileY >= otherDeck.height || result.tileX >= otherDeck.width) continue;
            const otherTile = otherDeck.tiles[result.tileY][result.tileX];
            if (clickedTile === TileType.STAIRS ? otherTile === TileType.STAIRS : otherTile === TileType.MAST) {
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
      world.selectedCorpseId = null;
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
  const prevStates = new Map(world.actors.map(c => [c.id, c.state]));
  updateActors(world.actors, world.decks, dt, world.barrelInventory, world.time, world.lanternOil, brightness, world.activityLog, world.worldMap, world.spottedIslands, world, audio);
  for (const member of world.actors) {
    const prev = prevStates.get(member.id);
    if (prev === undefined) continue; // new actor (shouldn't happen)
    const deck = member.deck;
    if (prev === CrewState.LIGHTING_LANTERN && member.state !== CrewState.LIGHTING_LANTERN) {
      audio.play('lantern_light', deck);
    } else if (prev === CrewState.EXTINGUISHING_LANTERN && member.state !== CrewState.EXTINGUISHING_LANTERN) {
      audio.play('lantern_extinguish', deck);
    }
    if (prev !== CrewState.KISSING && member.state === CrewState.KISSING) {
      audio.play('kiss', deck);
    }
    if (prev !== CrewState.DRINKING && member.state === CrewState.DRINKING) {
      audio.play(member.profile.sex === 'F' ? 'glug_female' : 'glug_male', deck);
    }
    // Refresh context menu items if the associated crew member's state changed (stale busy labels)
    if (world.contextMenu?.actorId === member.id && prev !== member.state) {
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
