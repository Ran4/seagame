export type { RenderContext } from './context';
export { drawWater, drawDeck } from './tiles';
export { drawActor, drawActorOverlays, drawCorpse } from './actors';
export { drawUI, drawSoundButton, drawActivityLog, drawCompass, drawTooltip, drawItemTooltip, drawBarTooltip, drawItemSlot, drawSettingsButton, drawSettingsPanel, drawCorpsePanel } from './ui';
export { drawContextMenu } from './menu';
export { drawMapOverlay } from './map';
export { drawDockButton, isDockButtonClicked, drawDockedBar, isLeaveHarborClicked } from './docking';

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
  [TileType.WHARF]: 'Wharf',
  [TileType.LAND]: 'Land',
  [TileType.GANGPLANK]: 'Gangplank',
  [TileType.HARBOR_WALL]: 'Wall',
  [TileType.HARBOR_FLOOR]: 'Floor',
  [TileType.NOTICE_BOARD]: 'Notice Board',
};
