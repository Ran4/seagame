import { TileType } from './types';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface SpriteSheet {
  tiles: Map<TileType, HTMLImageElement>;
  waterFrames: HTMLImageElement[];
  crew: HTMLImageElement[];
  items: Map<string, HTMLImageElement>;
}

export async function loadSprites(): Promise<SpriteSheet> {
  const tileNames: [TileType, string][] = [
    [TileType.WATER, 'water'],
    [TileType.HULL, 'hull'],
    [TileType.FLOOR, 'floor'],
    [TileType.STAIRS, 'stairs'],
    [TileType.HELM, 'helm'],
    [TileType.MAST, 'mast'],
    [TileType.CANNON, 'cannon'],
    [TileType.STOVE, 'stove'],
    [TileType.BED, 'bed'],
    [TileType.BARREL, 'barrel'],
    [TileType.TABLE, 'table'],
  ];

  const itemNames = ['cutlass', 'semen'];

  const coreLoads = await Promise.all([
    // Tile sprites
    ...tileNames.map(([, name]) => loadImage(`/sprites/${name}.png`)),
    // Water frame 2
    loadImage('/sprites/water2.png'),
    // Crew sprites
    loadImage('/sprites/crew_red.png'),
    loadImage('/sprites/crew_blue.png'),
    loadImage('/sprites/crew_green.png'),
    loadImage('/sprites/crew_yellow.png'),
  ]);

  // Item sprites loaded separately (optional, may not exist)
  const itemLoads = await Promise.all(
    itemNames.map(name => loadImage(`/sprites/item_${name}.png`).catch(() => null)),
  );

  const tiles = new Map<TileType, HTMLImageElement>();
  for (let i = 0; i < tileNames.length; i++) {
    tiles.set(tileNames[i][0], coreLoads[i]);
  }

  const water2 = coreLoads[tileNames.length];
  const crewStart = tileNames.length + 1;

  const items = new Map<string, HTMLImageElement>();
  for (let i = 0; i < itemNames.length; i++) {
    const img = itemLoads[i];
    if (img) {
      items.set(itemNames[i], img);
    } else {
      console.warn(`Item sprite not loaded: ${itemNames[i]}`);
    }
  }
  console.log('Item sprites loaded:', [...items.keys()]);

  return {
    tiles,
    waterFrames: [tiles.get(TileType.WATER)!, water2],
    crew: coreLoads.slice(crewStart),
    items,
  };
}
