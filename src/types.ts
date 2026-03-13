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
]);

export const OBJECT_MAX_HP: Partial<Record<TileType, number>> = {
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
};

export type ActorType = 'human' | 'dog' | 'parrot' | 'monkey';

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

export interface Island {
  id: number;
  name: string;
  x: number;
  y: number;
  hasHarbor: boolean;
  description: string;
  hidden?: boolean;
}

export interface WorldMap {
  shipX: number;
  shipY: number;
  currentHeading: number;   // radians, actual ship direction
  currentSpeed: number;     // actual speed (0 to SHIP_SPEED)
  targetHeading: number | null; // navigator's orders (null = no order)
  targetSpeed: 'full' | 'stop';  // navigator's orders
  destinationIsland: Island | null;
  islands: Island[];
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

export type ThoughtBubble = 'heart' | 'broken_heart' | 'music_note';

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
  | { name: 'Stop' }
  | { name: 'Tell';              actorId: number; text?: string }
  | { name: 'Order';             actorId: number; order: Command };

export interface ActivityLogEntry {
  text: string;
  time: number;  // game time when logged
}

// All game simulation state — the "world" struct that free functions operate on
export interface World {
  decks: Deck[];
  actors: Actor[];
  camera: Camera;
  activeDeck: number;
  selectedActorId: number | null;
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
}
