export const TILE_SIZE = 32;
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;
export const CREW_SPEED = 64; // pixels per second

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
}

export const WALKABLE = new Set<TileType>([
  TileType.FLOOR,
  TileType.STAIRS,
  TileType.HELM,
  TileType.BED,
  TileType.STOVE,
  TileType.MAST,
  TileType.MAP_TABLE,
]);

export const SELECTABLE_OBJECTS = new Set<TileType>([
  TileType.HELM,
  TileType.CANNON,
  TileType.STOVE,
  TileType.BED,
  TileType.BARREL,
  TileType.TABLE,
  TileType.MAP_TABLE,
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
};

export interface ContextMenuItem {
  label: string;
  targetState: CrewState;
  deckTarget?: number; // send crew to this deck
}

export interface ContextMenu {
  screenX: number;
  screenY: number;
  tileX: number;
  tileY: number;
  deck: number;
  items: ContextMenuItem[];
  crewId?: number; // set when menu targets a crew member (e.g. "stop" actions)
}

export const TILE_ACTIONS: Partial<Record<TileType, ContextMenuItem[]>> = {
  [TileType.BED]: [{ label: 'Sleep', targetState: CrewState.SLEEPING }],
  [TileType.STOVE]: [{ label: 'Eat', targetState: CrewState.EATING }],
  [TileType.HELM]: [{ label: 'Steer', targetState: CrewState.STEERING }],
  [TileType.CANNON]: [{ label: 'Man Cannon', targetState: CrewState.MANNING_CANNON }],
  [TileType.STAIRS]: [{ label: 'Go to stairs', targetState: CrewState.IDLE }],
  [TileType.MAST]: [{ label: 'Lookout', targetState: CrewState.LOOKOUT }],
  [TileType.MAP_TABLE]: [{ label: 'Navigate', targetState: CrewState.NAVIGATING }],
};

export interface CrewMember {
  id: number;
  name: string;
  pixelX: number;
  pixelY: number;
  deck: number;
  hunger: number;  // 0-255, high = full
  energy: number;  // 0-255, high = rested
  state: CrewState;
  targetState: CrewState;
  color: string;
  path: DeckPoint[];
  stateTimer: number;
  idleTimer: number;
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
}

export interface WorldMap {
  shipX: number;
  shipY: number;
  destX: number | null;
  destY: number | null;
  destinationIsland: Island | null;
  islands: Island[];
}
