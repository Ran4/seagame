export type { RenderContext } from './context';
export { drawWater, drawDeck } from './tiles';
export { drawActor } from './actors';
export { drawUI, drawSoundButton, drawActivityLog, drawCompass, drawTooltip, drawItemTooltip, drawBarTooltip, drawItemSlot } from './ui';
export { drawContextMenu } from './menu';
export { drawMapOverlay } from './map';

import { TileType } from '../types';

export const TILE_NAMES: Partial<Record<TileType, string>> = {
  [TileType.STAIRS]: 'Stairs',
  [TileType.HELM]: 'Helm',
  [TileType.MAST]: 'Mast',
  [TileType.CANNON]: 'Cannon',
  [TileType.STOVE]: 'Stove',
  [TileType.BED]: 'Bed',
  [TileType.BARREL]: 'Barrel',
  [TileType.TABLE]: 'Table',
  [TileType.MAP_TABLE]: 'Map Table',
  [TileType.LANTERN]: 'Lantern',
  [TileType.RAISED_FLOOR]: 'Quarterdeck',
  [TileType.NEST]: 'Nest',
};
