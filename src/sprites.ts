import { TileType, ActorType } from './types';

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
  animals: Map<string, HTMLImageElement>;
  items: Map<string, HTMLImageElement>;
  bubbles: Map<string, HTMLImageElement>;
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
    [TileType.LANTERN, 'lantern'],
    [TileType.RAISED_FLOOR, 'raised_floor'],
  ];

  const itemNames = ['cutlass', 'semen', 'grog_ration'];
  const bubbleNames = ['heart', 'broken_heart'];

  // Tile sprites (individually fault-tolerant so missing ones don't break everything)
  const tileLoads = await Promise.all(
    tileNames.map(([, name]) => loadImage(`/sprites/${name}.png`).catch(() => null)),
  );

  const otherCoreLoads = await Promise.all([
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

  // Animal sprites (optional)
  const animalTypes = ['dog', 'parrot', 'monkey'];
  const animalLoads = await Promise.all(
    animalTypes.map(name => loadImage(`/sprites/animal_${name}.png`).catch(() => null)),
  );

  // Bubble sprites (optional)
  const bubbleLoads = await Promise.all(
    bubbleNames.map(name => loadImage(`/sprites/bubble_${name}.png`).catch(() => null)),
  );

  const tiles = new Map<TileType, HTMLImageElement>();
  for (let i = 0; i < tileNames.length; i++) {
    const img = tileLoads[i];
    if (img) tiles.set(tileNames[i][0], img);
  }

  const water2 = otherCoreLoads[0];
  const crewSprites = otherCoreLoads.slice(1);

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

  const animals = new Map<string, HTMLImageElement>();
  for (let i = 0; i < animalTypes.length; i++) {
    const img = animalLoads[i];
    if (img) animals.set(animalTypes[i], img);
  }

  const bubbles = new Map<string, HTMLImageElement>();
  for (let i = 0; i < bubbleNames.length; i++) {
    const img = bubbleLoads[i];
    if (img) bubbles.set(bubbleNames[i], img);
  }

  return {
    tiles,
    waterFrames: [tiles.get(TileType.WATER)!, water2],
    crew: crewSprites,
    animals,
    items,
    bubbles,
  };
}
