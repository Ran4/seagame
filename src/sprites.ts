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

  const allLoads = await Promise.all([
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

  const tiles = new Map<TileType, HTMLImageElement>();
  for (let i = 0; i < tileNames.length; i++) {
    tiles.set(tileNames[i][0], allLoads[i]);
  }

  const water2 = allLoads[tileNames.length];
  const crewStart = tileNames.length + 1;

  return {
    tiles,
    waterFrames: [tiles.get(TileType.WATER)!, water2],
    crew: allLoads.slice(crewStart),
  };
}
