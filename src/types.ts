export const TILE_SIZE = 32;
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;
export const CREW_SPEED = 64; // pixels per second

// Time-of-day system
// 1 in-game day = 12 minutes IRL (720 seconds)
export const SECONDS_PER_DAY = 720;
// Dawn: 0–60s, Day: 60–420s, Dusk: 420–480s, Night: 480–720s
export const DAWN_START = 0;
export const DAY_START = 60;
export const DUSK_START = 420;
export const NIGHT_START = 480;

export const NIGHT_BRIGHTNESS = 0.3;
export const NIGHT_FEAR_MORALE_THRESHOLD = 192;
export const SKILL_MASTERY = 192;
const BRIGHTNESS_RANGE = 1.0 - NIGHT_BRIGHTNESS;

// TODO: when seasons exist, make this change over the seasons!
export function getShipBrightness(timeOfDay: number): number {
  if (timeOfDay < DAWN_START) return NIGHT_BRIGHTNESS;
  if (timeOfDay < DAY_START) return NIGHT_BRIGHTNESS + BRIGHTNESS_RANGE * (timeOfDay - DAWN_START) / (DAY_START - DAWN_START);
  if (timeOfDay < DUSK_START) return 1.0;
  if (timeOfDay < NIGHT_START) return 1.0 - BRIGHTNESS_RANGE * (timeOfDay - DUSK_START) / (NIGHT_START - DUSK_START);
  return NIGHT_BRIGHTNESS;
}

// Lantern constants
export const LANTERN_SAFE_RADIUS = 5;
export const LANTERN_BURNOUT_RATE = 0.4;
export const LIGHT_LANTERN_DURATION = 3;
export const EXTINGUISH_LANTERN_DURATION = 0.5;

export enum TileType {
  WATER,
  HULL,
  FLOOR,
  STAIRS,
  HELM,
  MAST,
  CANNON,
  STOVE,
  BED,
  BARREL,
  TABLE,
  MAP_TABLE,
  LANTERN,
  RAISED_FLOOR,
  NEST,
  WHARF,
  LAND,
  GANGPLANK,
  HARBOR_WALL,
  HARBOR_FLOOR,
  NOTICE_BOARD,
  FISHING_SPOT,
  BREACH,
  RUBBLE,
}

export const WALKABLE = new Set<TileType>([
  TileType.FLOOR,
  TileType.STAIRS,
  TileType.HELM,
  TileType.BED,
  TileType.STOVE,
  TileType.MAST,
  TileType.MAP_TABLE,
  TileType.LANTERN,
  TileType.RAISED_FLOOR,
  TileType.NEST,
  TileType.WHARF,
  TileType.LAND,
  TileType.GANGPLANK,
  TileType.HARBOR_FLOOR,
  TileType.FISHING_SPOT,
]);

export const SELECTABLE_OBJECTS = new Set<TileType>([
  TileType.HELM,
  TileType.CANNON,
  TileType.STOVE,
  TileType.BED,
  TileType.BARREL,
  TileType.TABLE,
  TileType.MAP_TABLE,
  TileType.LANTERN,
  TileType.NOTICE_BOARD,
]);

export const OBJECT_MAX_HP: Partial<Record<TileType, number>> = {
  [TileType.HULL]: 120,
  [TileType.HELM]: 100,
  [TileType.MAST]: 150,
  [TileType.CANNON]: 80,
  [TileType.STOVE]: 60,
  [TileType.BED]: 40,
  [TileType.BARREL]: 30,
  [TileType.TABLE]: 30,
  [TileType.MAP_TABLE]: 60,
  [TileType.LANTERN]: 30,
};

export const TILE_COLORS: Record<TileType, string> = {
  [TileType.WATER]: '#1a5276',
  [TileType.HULL]: '#5c3d2e',
  [TileType.FLOOR]: '#c4a46c',
  [TileType.STAIRS]: '#a08050',
  [TileType.HELM]: '#8b7355',
  [TileType.MAST]: '#3e2723',
  [TileType.CANNON]: '#333333',
  [TileType.STOVE]: '#8b2500',
  [TileType.BED]: '#6b8cae',
  [TileType.BARREL]: '#8b6914',
  [TileType.TABLE]: '#6d4c2e',
  [TileType.MAP_TABLE]: '#4a6644',
  [TileType.LANTERN]: '#c89b3c',
  [TileType.RAISED_FLOOR]: '#b89458',
  [TileType.NEST]: '#8b7355',
  [TileType.WHARF]: '#8b6f47',
  [TileType.LAND]: '#7a9b57',
  [TileType.GANGPLANK]: '#a08050',
  [TileType.HARBOR_WALL]: '#8b7765',
  [TileType.HARBOR_FLOOR]: '#b0a08a',
  [TileType.NOTICE_BOARD]: '#6b5b3a',
  [TileType.FISHING_SPOT]: '#4a6f8a',
  [TileType.BREACH]: '#0d2233',     // dark sea-water showing through a hole in the hull
  [TileType.RUBBLE]: '#555048',     // grey splintered debris
};

export interface Point {
  x: number;
  y: number;
}

export interface DeckPoint extends Point {
  deck: number;
}

export enum CrewState {
  IDLE = 'idle',
  WALKING = 'walking',
  EATING = 'eating',
  SLEEPING = 'sleeping',
  STEERING = 'steering',
  MANNING_CANNON = 'manning_cannon',
  LOOKOUT = 'lookout',
  NAVIGATING = 'navigating',
  COPULATING = 'copulating',
  KISSING = 'kissing',
  LIGHTING_LANTERN = 'lighting_lantern',
  EXTINGUISHING_LANTERN = 'extinguishing_lantern',
  TALKING = 'talking',
  DRINKING = 'drinking',
  TAKING_ITEM = 'taking_item',
  PETTING = 'petting',
  SINGING = 'singing',
  DANCING = 'dancing',
  CARRYING_CORPSE = 'carrying_corpse',
  BURYING_AT_SEA = 'burying_at_sea',
  FISHING = 'fishing',
  REPAIRING = 'repairing',
  FIGHTING = 'fighting',
  FLEEING = 'fleeing',
  PRAYING = 'praying',
}

export const STATE_NAMES: Record<CrewState, string> = {
  [CrewState.IDLE]: 'Idle',
  [CrewState.WALKING]: 'Walking',
  [CrewState.EATING]: 'Eating',
  [CrewState.SLEEPING]: 'Sleeping',
  [CrewState.STEERING]: 'Steering',
  [CrewState.MANNING_CANNON]: 'Manning cannon',
  [CrewState.LOOKOUT]: 'Lookout',
  [CrewState.NAVIGATING]: 'Navigating',
  [CrewState.COPULATING]: 'Copulating',
  [CrewState.KISSING]: 'Kissing',
  [CrewState.LIGHTING_LANTERN]: 'Lighting lantern',
  [CrewState.EXTINGUISHING_LANTERN]: 'Extinguishing lantern',
  [CrewState.TALKING]: 'Talking',
  [CrewState.DRINKING]: 'Drinking',
  [CrewState.TAKING_ITEM]: 'Taking item',
  [CrewState.PETTING]: 'Petting',
  [CrewState.SINGING]: 'Singing',
  [CrewState.DANCING]: 'Dancing',
  [CrewState.CARRYING_CORPSE]: 'Carrying corpse',
  [CrewState.BURYING_AT_SEA]: 'Burying at sea',
  [CrewState.FISHING]: 'Fishing',
  [CrewState.REPAIRING]: 'Repairing',
  [CrewState.FIGHTING]: 'Fighting',
  [CrewState.FLEEING]: 'Fleeing below deck',
  [CrewState.PRAYING]: 'Praying',
};

export interface ContextMenuItem {
  label: string;
  targetState: CrewState;
  deckTarget?: number; // send crew to this deck
  targetActorId?: number; // for actor-actor interactions
  disabled?: boolean;
  submenu?: ContextMenuItem[];
  action?: string;           // e.g. 'take_item'
  itemData?: { barrelKey: string; itemName: string };
  corpseActorId?: number;
}

export interface ContextMenu {
  screenX: number;
  screenY: number;
  tileX: number;
  tileY: number;
  deck: number;
  items: ContextMenuItem[];
  actorId?: number; // set when menu targets an actor (e.g. "stop" actions)
  barrelItems?: { items: Item[]; barrelKey: string }; // visual item grid for barrel contents
  selectedBarrelSlot?: number; // which barrel item slot was clicked (shows "Take" flyout)
  barrelSlotClickPos?: { x: number; y: number }; // where the slot was clicked
}

/** Compute menu panel width from label lengths (monospace 12px ≈ 7.2px per char). */
export function computeMenuWidth(labels: string[], minWidth = 0): number {
  const charW = 7.22; // 12px monospace character width
  let maxChars = 0;
  for (const label of labels) {
    if (label.length > maxChars) maxChars = label.length;
  }
  return Math.max(Math.ceil(maxChars * charW) + 20, minWidth); // 10px padding each side
}

export const TILE_ACTIONS: Partial<Record<TileType, ContextMenuItem[]>> = {
  [TileType.BED]: [{ label: 'Sleep', targetState: CrewState.SLEEPING }],
  [TileType.STOVE]: [{ label: 'Eat', targetState: CrewState.EATING }],
  [TileType.HELM]: [{ label: 'Steer', targetState: CrewState.STEERING }],
  [TileType.CANNON]: [{ label: 'Man Cannon', targetState: CrewState.MANNING_CANNON }],
  [TileType.STAIRS]: [{ label: 'Go to stairs', targetState: CrewState.IDLE }],
  [TileType.MAST]: [{ label: 'Lookout', targetState: CrewState.LOOKOUT }],
  [TileType.MAP_TABLE]: [{ label: 'Navigate', targetState: CrewState.NAVIGATING }],
  [TileType.BARREL]: [{ label: 'Copulate', targetState: CrewState.COPULATING }],
  [TileType.LANTERN]: [],
  [TileType.NOTICE_BOARD]: [{ label: 'Read notices', targetState: CrewState.IDLE, action: 'read_notices' }],
  [TileType.FISHING_SPOT]: [{ label: 'Fish', targetState: CrewState.FISHING }],
};

export type ActorType = 'human' | 'dog' | 'parrot' | 'monkey' | 'cat';

export interface ActorProfile {
  name: string;
  sex: Sex;
  color: string;
  spriteIndex: number;
  numberOfHands: number;
  hunger: number;   // 0-255
  energy: number;   // 0-255
  morale: number;   // 0-255
  inventory: Item[];
  hands: Item[];    // length <= numberOfHands
}

export interface ActorRelation {
  actorId: number;
  friendship: number;  // 0-255, >=128 friend, <64 dislike
  attraction: number;  // 0-255, >=128 both = willing to copulate
}

export interface Actor {
  id: number;
  actorType: ActorType;
  profile: ActorProfile;
  health: number;       // 0–255, current
  maxHealth: number;    // 0–255, cap
  carryingCorpseId: number | null;
  statuses: Map<string, Record<string, any> | null>;
  conditions: Set<string>;
  skills: Record<string, number>;
  pixelX: number;
  pixelY: number;
  facing: 'north' | 'south' | 'east' | 'west';
  deck: number;
  state: CrewState;
  targetState: CrewState;
  path: DeckPoint[];
  stateTimer: number;
  idleTimer: number;
  copulationTarget: CopulationTarget | null;
  relations: ActorRelation[];
  thoughtBubble: ThoughtBubble | null;
  thoughtBubbleTimer: number;
  conversationPartnerId: number | null;
  conversationExchangesLeft: number;
  conversationPositive: boolean;
  conversationScript: string[];
  conversationCooldown: number;
  conversationMyTurn: boolean;
  speechBubbleText: string | null;
  speechBubbleTimer: number;
  takeTarget: { barrelKey: string; itemName: string } | null;
  consumingItem: Item | null;
  lustSeekCooldown: number;
  commandQueue: Command[];
  shantyInitiatorId: number | null;
}

export interface Corpse {
  actorId: number;
  name: string;
  actorType: ActorType;
  pixelX: number;
  pixelY: number;
  deck: number;
  spriteIndex: number;
  color: string;
  sex: Sex;
  inventory: Item[];
}

export interface Deck {
  name: string;
  tiles: TileType[][];
  width: number;
  height: number;
}

export interface Camera {
  x: number;
  y: number;
}

// FEATURE 7 — per-island personality / economy descriptor. Drives trade prices and
// flavour at the docked harbour. Optional: islands without it use neutral defaults.
export interface IslandEconomy {
  flavor: string;        // one-line personality blurb shown on the docked bar / notice board
  priceBuyMult: number;  // multiplier on the base price when the crew BUYS goods (>1 = expensive)
  priceSellMult: number; // multiplier on the base price when the crew SELLS loot (>1 = pays well)
  lawless?: boolean;     // pirate haven: cheap crew, pricier goods
  blackMarket?: boolean; // buys stolen loot/treasure high, fewer honest goods
}

export interface Island {
  id: number;
  name: string;
  x: number;
  y: number;
  hasHarbor: boolean;
  description: string;
  hidden?: boolean;
  economy?: IslandEconomy;  // FEATURE 7 — personality/pricing (undefined = neutral)
  // FEATURE 8 — set when a treasure map for this island has been read; draws an X
  // on the world-map overlay. Cleared after a successful shore dig.
  treasureMarker?: boolean;
}

export interface WorldMap {
  shipX: number;
  shipY: number;
  currentHeading: number;   // radians, actual ship direction
  currentSpeed: number;     // actual speed (0 to SHIP_SPEED)
  targetHeading: number | null; // navigator's orders (null = no order)
  targetSpeed: 'full' | 'stop';  // navigator's orders
  destinationIsland: Island | null;
  chaseEnemy: boolean;      // when true, the helm steers straight at the current enemy ship instead of an island
  islands: Island[];
}

/** An enemy ship encountered while sailing. A lightweight World-level entity — we
 * do not simulate its decks/crew individually; HP + crew count are abstract. */
export interface EnemyShip {
  name: string;
  hp: number;
  maxHp: number;
  crewCount: number;
  x: number;              // world-map position (leagues), same coordinate space as the player ship
  y: number;
  heading: number;        // radians — direction it's moving (toward the player while hunting; frozen on cripple so a wreck coasts)
  distance: number;       // leagues to the player ship — DERIVED from positions each tick (0 = adjacent / boardable)
  hostile: boolean;
  fireTimer: number;      // seconds until the enemy fires its next volley
}

export type Sex = 'M' | 'F';

export interface Item {
  name: string;
  createdAt: number;      // game time in seconds when created
  weight: number;         // grams per unit (integer)
  description: string;
  stackable: boolean;
  quantity: number;        // 1 for non-stackable items
  spoilAfter: number | null; // seconds until spoiled (null = never)
  hungerRestore: number;     // hunger added when consumed (0-255 scale)
  // FEATURE 8 — treasure-map payload: which island it points to + whether it's a fake.
  // Only present on 'Treasure map' items.
  mapData?: { islandId: number; fake: boolean };
  // FEATURE 8 — cursed loot can't be dropped or sold and saps morale while carried.
  cursed?: boolean;
}

export type InputMode = 'html' | 'ingame';

export interface CommandInput {
  text: string;
  mode: 'html' | 'ingame';
  cursorPos: number;
}

export interface GameSettings {
  inputMode: InputMode;
}

export type ThoughtBubble = 'heart' | 'broken_heart' | 'music_note' | 'mischief' | 'prayer';

// --- FEATURE 5: Storms & Weather ---
// Weather lives on the World and is ticked in the sailing block of update().
//   state          — current sky: clear / cloudy / storm.
//   timer          — seconds remaining in the current state before a transition roll.
//   intensity      — 0..1 ramp; rises toward 1 during a storm, falls back toward 0 otherwise.
//                    Drives rain density + extra darkness + how harsh storm effects hit.
//   lightningFlash — 0..~1, spikes to ~1 on a flash and decays each frame (white screen flash).
export interface WeatherState {
  state: 'clear' | 'cloudy' | 'storm';
  timer: number;
  intensity: number;
  lightningFlash: number;
}

// --- FEATURE 6: Sea Monsters / Kraken ---
// A kraken encounter lives on the World while it lasts (one at a time, like enemyShip).
//   phase            — 'none' (no monster) → 'warning' (foreshadow ~30s) → 'attacking'
//                      (tentacles + rams) → 'retreating' (brief wind-down → cleared).
//   timer            — seconds remaining in the current phase (warning/retreating); also
//                      throttles the ram cadence during 'attacking'.
//   tentaclesSevered — running count; the kraken retreats once enough are cut.
export interface MonsterState {
  phase: 'none' | 'warning' | 'attacking' | 'retreating';
  timer: number;
  tentaclesSevered: number;
}

// A single kraken tentacle: a temporary HP-bearing overlay anchored to a ship-edge tile.
// Crew hack it with the Fight action; it can grab a crew member and drag them overboard.
export interface Tentacle {
  id: number;
  deck: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  grabbedActorId: number | null; // id of a seized crew member, or null
  grabTimer: number;             // seconds until a grabbed crew is dragged overboard
}

export type CopulationTarget =
  | { type: 'barrel'; x: number; y: number; deck: number }
  | { type: 'crew'; actorId: number };

// Command system — serializable actions for actors (discriminated union on `name`)
export type Command =
  | { name: 'Sleep';              deck?: number; x?: number; y?: number }
  | { name: 'Eat';               deck?: number; x?: number; y?: number }
  | { name: 'Steer';             deck?: number; x?: number; y?: number }
  | { name: 'Navigate';          deck?: number; x?: number; y?: number }
  | { name: 'ManCannon';         deck?: number; x?: number; y?: number }
  | { name: 'Lookout';           deck?: number; x?: number; y?: number }
  | { name: 'Fish';              deck?: number; x?: number; y?: number }
  | { name: 'Repair';            deck: number; x: number; y: number }
  | { name: 'FireCannon' }
  | { name: 'BoardEnemy' }
  | { name: 'Fight';             deck: number; x: number; y: number }
  | { name: 'UseMap';            itemName?: string }
  | { name: 'SendExpedition' }
  | { name: 'Pray' }
  | { name: 'GoTo';              deck?: number; x: number; y: number }
  | { name: 'GoToDeck';          deck: number }
  | { name: 'CopulateBarrel';    deck: number; x: number; y: number }
  | { name: 'LightLantern';      deck: number; x: number; y: number }
  | { name: 'ExtinguishLantern'; deck: number; x: number; y: number }
  | { name: 'Kiss';              actorId: number }
  | { name: 'Copulate';          actorId: number }
  | { name: 'Pet';               actorId: number }
  | { name: 'Converse';          actorId: number }
  | { name: 'TakeItem';          barrelKey: string; itemName: string }
  | { name: 'Drink';             itemName?: string }
  | { name: 'Sing' }
  | { name: 'Dance' }
  | { name: 'GroupDance' }
  | { name: 'BuryAtSea';         corpseActorId: number }
  | { name: 'SetHealth';         amount: number }
  | { name: 'Stop' }
  | { name: 'Tell';              actorId: number; text?: string }
  | { name: 'Order';             actorId: number; order: Command };

export interface ActivityLogEntry {
  text: string;
  time: number;  // game time when logged
}

// FEATURE 7 — harbour contracts (delivery / hunt missions taken from an NPC).
//   'deliver' — completes when the ship later docks at island `targetIslandId`.
//   'hunt'    — completes when an enemy ship named `targetShipName` is defeated.
export interface Contract {
  id: number;
  kind: 'deliver' | 'hunt';
  description: string;
  targetIslandId?: number;   // for 'deliver'
  targetShipName?: string;   // for 'hunt'
  reward: number;            // gold paid on completion
  status: 'active' | 'completed';
}

// FEATURE 8 — a shore expedition: a party of crew sent ashore at a treasure island.
// While active the party get the 'ashore' status (hidden from the deck, needs paused);
// on returnTime an outcome is rolled and the party reappears at the gangplank.
export interface Expedition {
  islandId: number;
  returnTime: number;     // world.time (seconds) at which the party returns
  crewIds: number[];      // ids of the crew sent ashore
}

export interface GangplankConnection {
  deckA: number; xA: number; yA: number;
  deckB: number; xB: number; yB: number;
}

export interface DockingState {
  phase: 'none' | 'docking' | 'docked' | 'undocking';
  island: Island | null;
  harborTiles: TileType[][];
  harborWidth: number;
  harborHeight: number;
  harborAnimOffset: number;       // Y pixel offset during docking/undocking animation
  gangplankHullTile?: TileType;   // ship tile overwritten by the gangplank walkway, restored on undock
}

// All game simulation state — the "world" struct that free functions operate on
export interface World {
  decks: Deck[];
  actors: Actor[];
  nextActorId: number;            // monotonic id allocator — never reuse ids (stranded actors keep theirs)
  corpses: Corpse[];
  camera: Camera;
  activeDeck: number;
  selectedActorId: number | null;
  selectedCorpseId: number | null;
  selectedObject: { tileType: TileType; x: number; y: number; deck: number } | null;
  contextMenu: ContextMenu | null;
  worldMap: WorldMap;
  barrelInventory: Map<string, Item[]>;
  lanternOil: Map<string, number>;
  dayTimeOffset: number;
  mapOverlayOpen: boolean;
  wasNavigating: boolean;
  navTimer: number;
  time: number;
  waterOffset: { x: number; y: number };
  activityLog: ActivityLogEntry[];
  orderPollTimer: number;
  spottedIslands: Set<number>;
  shantyCooldown: number;
  danceCooldown: number;
  mutinyState: 'none' | 'ultimatum' | 'game_over';
  mutinyTimer: number;
  commandInput: CommandInput | null;
  settingsOpen: boolean;
  settings: GameSettings;
  docking: DockingState;
  gangplanks: GangplankConnection[];
  nearbyHarborIsland: Island | null;
  strandedActors: Map<number, Actor[]>;  // island ID → actors left on that island
  strandedCorpses: Map<number, Corpse[]>;  // island ID → corpses left on that island
  // --- SHARED SYSTEM A: object/hull damage + combat ---
  objectHp: Map<string, number>;   // "deck-x-y" → current HP of a damageable tile (absent = full)
  floodLevel: number;              // 0..100, rises while hull breaches exist on any deck
  gameOverReason: string | null;   // generalized game-over text (mutiny also sets mutinyState)
  enemyShip: EnemyShip | null;     // current ship-to-ship combat target (one at a time)
  gold: number;                    // ship treasury (SHARED SYSTEM B; loot/treasure add, buying subtracts)
  // --- FEATURE 7: Harbor towns — contracts + offers + docking toast ---
  contracts: Contract[];           // active/completed delivery & hunt missions
  contractOffers: Contract[];      // 1-3 offers available at the current harbour (regenerated per dock)
  nextContractId: number;          // monotonically increasing id allocator for contracts
  dockingToast: { text: string; timer: number } | null; // transient "Docking…/completed!" banner
  // --- FEATURE 5: Storms & Weather ---
  weather: WeatherState;           // sky state machine: clear <-> cloudy <-> storm (see WeatherState)
  // --- FEATURE 6: Sea Monsters / Kraken ---
  monster: MonsterState | null;    // current kraken encounter (null = none); see MonsterState
  tentacles: Tentacle[];           // active kraken tentacles gripping the ship's edges
  // --- FEATURE 8: Treasure Maps & Exploration ---
  treasureIslands: Set<number>;    // island ids that have a treasure marker (set when a map is read)
  expedition: Expedition | null;   // a crew party currently ashore digging for treasure (one at a time)
}
