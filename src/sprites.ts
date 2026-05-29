import {TileType, ActorType} from './types';

// Downscale sprites on load for crisp pixel art.
// Set to 0 to skip downscaling and use the raw high-res sprites.
// export const SPRITE_RESOLUTION = 64;
export const SPRITE_RESOLUTION = 0;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Downscale an image to SPRITE_RESOLUTION×SPRITE_RESOLUTION using nearest-neighbor, returns a new HTMLImageElement */
function downscale(img: HTMLImageElement): HTMLImageElement {
  const targetSize = SPRITE_RESOLUTION;
  if (!targetSize || img.width <= targetSize) return img;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, targetSize, targetSize);
  const out = new Image();
  out.src = canvas.toDataURL();
  return out;
}

export interface DirectionalSprite {
  south: HTMLImageElement;
  north: HTMLImageElement | null;
  west: HTMLImageElement | null;  // east is west flipped at render time
}

async function loadDirectionalSprite(basePath: string): Promise<DirectionalSprite | null> {
  const south = await loadImage(`${basePath}__south.png`).catch(() => null);
  if (!south) return null;
  const [north, west] = await Promise.all([
    loadImage(`${basePath}__north.png`).catch(() => null),
    loadImage(`${basePath}__west.png`).catch(() => null),
  ]);
  return {
    south: downscale(south),
    north: north ? downscale(north) : null,
    west: west ? downscale(west) : null,
  };
}

export interface SpriteSheet {
  tiles: Map<TileType, HTMLImageElement>;
  waterFrames: HTMLImageElement[];
  crew: DirectionalSprite[];
  animals: Map<string, DirectionalSprite>;
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
    [TileType.NEST, 'nest'],
    [TileType.LAND, 'land'],
    [TileType.WHARF, 'wharf'],
    [TileType.GANGPLANK, 'gangplank'],
    [TileType.HARBOR_WALL, 'harbor_wall'],
    [TileType.HARBOR_FLOOR, 'harbor_floor'],
    [TileType.NOTICE_BOARD, 'notice_board'],
    [TileType.FISHING_SPOT, 'fishing_spot'],
  ];

  const itemNames = ['cutlass', 'semen', 'grog_ration', 'fish'];
  const bubbleNames = ['heart', 'broken_heart', 'music_note', 'mischief'];

  // Tile sprites (individually fault-tolerant so missing ones don't break everything)
  const tileLoads = await Promise.all(
    tileNames.map(([, name]) => loadImage(`/sprites/tiles/tiles__${name}.png`).catch(() => null)),
  );

  // Water frame 2
  const water2Load = loadImage('/sprites/tiles/tiles__water2.png');

  // Crew sprites (directional)
  const crewNames = ['crew_red', 'crew_blue', 'crew_green', 'crew_yellow'];
  const crewLoads = Promise.all(
    crewNames.map(name => loadDirectionalSprite(`/sprites/actors/actor__${name}`)),
  );

  // Animal sprites (directional)
  const animalTypes = ['dog', 'parrot', 'monkey', 'cat'];
  const animalLoads = Promise.all(
    animalTypes.map(name => loadDirectionalSprite(`/sprites/actors/actor__animal_${name}`)),
  );

  // Item sprites loaded separately (optional, may not exist)
  const itemLoads = Promise.all(
    itemNames.map(name => loadImage(`/sprites/items/item__${name}.png`).catch(() => null)),
  );

  // Bubble sprites (optional)
  const bubbleLoads = Promise.all(
    bubbleNames.map(name => loadImage(`/sprites/bubbles/bubble__${name}.png`).catch(() => null)),
  );

  const [water2, crewResults, animalResults, itemResults, bubbleResults] = await Promise.all([
    water2Load, crewLoads, animalLoads, itemLoads, bubbleLoads,
  ]);

  const tiles = new Map<TileType, HTMLImageElement>();
  for (let i = 0; i < tileNames.length; i++) {
    const img = tileLoads[i];
    if (img) tiles.set(tileNames[i][0], downscale(img));
  }

  const crewSprites: DirectionalSprite[] = crewResults.filter((s): s is DirectionalSprite => s !== null);

  const items = new Map<string, HTMLImageElement>();
  for (let i = 0; i < itemNames.length; i++) {
    const img = itemResults[i];
    if (img) {
      items.set(itemNames[i], downscale(img));
    } else {
      console.warn(`Item sprite not loaded: ${itemNames[i]}`);
    }
  }
  console.log('Item sprites loaded:', [...items.keys()]);

  const animals = new Map<string, DirectionalSprite>();
  for (let i = 0; i < animalTypes.length; i++) {
    const ds = animalResults[i];
    if (ds) animals.set(animalTypes[i], ds);
  }

  const bubbles = new Map<string, HTMLImageElement>();
  for (let i = 0; i < bubbleNames.length; i++) {
    const img = bubbleResults[i];
    if (img) bubbles.set(bubbleNames[i], downscale(img));
  }

  return {
    tiles,
    waterFrames: [tiles.get(TileType.WATER)!, downscale(water2)],
    crew: crewSprites,
    animals,
    items,
    bubbles,
  };
}
