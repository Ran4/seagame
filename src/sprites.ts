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

export interface SpriteSheet {
  tiles: Map<TileType, HTMLImageElement>;
  waterFrames: HTMLImageElement[];
  crew: HTMLImageElement[];
  animals: Map<string, HTMLImageElement | DirectionalSprite>;
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
  const directionalAnimals = new Set(['dog']);
  const animalLoads = await Promise.all(
    animalTypes.map(name => {
      const file = directionalAnimals.has(name) ? `animal_${name}__south` : `animal_${name}`;
      return loadImage(`/sprites/${file}.png`).catch(() => null);
    }),
  );
  // Load directional variants (north, west) for directional animals
  const animalDirLoads = await Promise.all(
    animalTypes.filter(n => directionalAnimals.has(n)).flatMap(name => [
      loadImage(`/sprites/animal_${name}__north.png`).catch(() => null),
      loadImage(`/sprites/animal_${name}__west.png`).catch(() => null),
    ]),
  );

  // Bubble sprites (optional)
  const bubbleLoads = await Promise.all(
    bubbleNames.map(name => loadImage(`/sprites/bubble_${name}.png`).catch(() => null)),
  );

  const tiles = new Map<TileType, HTMLImageElement>();
  for (let i = 0; i < tileNames.length; i++) {
    const img = tileLoads[i];
    if (img) tiles.set(tileNames[i][0], downscale(img));
  }

  const water2 = downscale(otherCoreLoads[0]);
  const crewSprites = otherCoreLoads.slice(1).map(img => downscale(img));

  const items = new Map<string, HTMLImageElement>();
  for (let i = 0; i < itemNames.length; i++) {
    const img = itemLoads[i];
    if (img) {
      items.set(itemNames[i], downscale(img));
    } else {
      console.warn(`Item sprite not loaded: ${itemNames[i]}`);
    }
  }
  console.log('Item sprites loaded:', [...items.keys()]);

  const animals = new Map<string, HTMLImageElement | DirectionalSprite>();
  let dirIdx = 0;
  for (let i = 0; i < animalTypes.length; i++) {
    const img = animalLoads[i];
    const name = animalTypes[i];
    if (!img) continue;
    if (directionalAnimals.has(name)) {
      const north = animalDirLoads[dirIdx++];
      const west = animalDirLoads[dirIdx++];
      animals.set(name, {
        south: downscale(img),
        north: north ? downscale(north) : null,
        west: west ? downscale(west) : null,
      });
    } else {
      animals.set(name, downscale(img));
    }
  }

  const bubbles = new Map<string, HTMLImageElement>();
  for (let i = 0; i < bubbleNames.length; i++) {
    const img = bubbleLoads[i];
    if (img) bubbles.set(bubbleNames[i], downscale(img));
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
