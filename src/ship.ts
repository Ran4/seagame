import {TileType, Deck} from './types';
import {DECK_X_SHIFT, DECK_Y_SHIFT, EXPANDED_WIDTH, EXPANDED_HEIGHT} from './harbor';

const CHAR_TO_TILE: Record<string, TileType> = {
  '.': TileType.WATER,
  '#': TileType.HULL,
  '_': TileType.FLOOR,
  'S': TileType.STAIRS,
  'W': TileType.HELM,
  'M': TileType.MAST,
  'C': TileType.CANNON,
  'K': TileType.STOVE,
  'B': TileType.BED,
  'R': TileType.BARREL,
  'T': TileType.TABLE,
  'N': TileType.MAP_TABLE,
  'L': TileType.LANTERN,
  '-': TileType.RAISED_FLOOR,
  '°': TileType.NEST,
};

function parseLayout(layout: string): TileType[][] {
  return layout
    .trim()
    .split('\n')
    .map(row => [...row].map(ch => CHAR_TO_TILE[ch] ?? TileType.WATER));
}

const CROWS_NEST = `\
...........
...........
...........
....___....
....___....
...._M_....
...._°_....
...........
...........
...........
...........
...........
...........
...........
...........
...........
...........
...........
...........
...........
...........`;

const UPPER_DECK = `\
.....#.....
....#_#....
...#___#...
..#_____#..
.#_______#.
.#___M___#.
#_________#
#L_______L#
#_________#
#C_______C#
#____M____#
#C_______C#
#_________#
#_________#
#L_______L#
#_________#
#____S____#
#----W----#
.#-------#.
.#-------#.
..#######..`;

const LOWER_DECK = `\
.....#.....
....#_#....
...#___#...
..#_____#..
.#__RRR__#.
.###RRR__#.
#BBB#_____#
#_L_______#
#BBB#_____#
####______#
#_________#
#___N_T___#
#___TTT___#
#L_______L#
#_________#
#_K_______#
#____S#####
#___#_____#
.#__#__L_#.
.#__#____#.
..#######..`;

/** Embed ship tiles at (DECK_X_SHIFT, DECK_Y_SHIFT) inside the expanded grid. */
function expandTiles(shipTiles: TileType[][]): TileType[][] {
  const expanded: TileType[][] = [];
  for (let y = 0; y < EXPANDED_HEIGHT; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < EXPANDED_WIDTH; x++) {
      const sx = x - DECK_X_SHIFT;
      const sy = y - DECK_Y_SHIFT;
      if (sx >= 0 && sx < shipTiles[0].length && sy >= 0 && sy < shipTiles.length) {
        row.push(shipTiles[sy][sx]);
      } else {
        row.push(TileType.WATER);
      }
    }
    expanded.push(row);
  }
  return expanded;
}

export function createShip(): Deck[] {
  const crowsNestTiles = expandTiles(parseLayout(CROWS_NEST));
  const upperTiles = expandTiles(parseLayout(UPPER_DECK));
  const lowerTiles = expandTiles(parseLayout(LOWER_DECK));

  return [
    {
      name: "Crow's Nest",
      tiles: crowsNestTiles,
      width: EXPANDED_WIDTH,
      height: EXPANDED_HEIGHT,
    },
    {
      name: 'Upper Deck',
      tiles: upperTiles,
      width: EXPANDED_WIDTH,
      height: EXPANDED_HEIGHT,
    },
    {
      name: 'Lower Deck',
      tiles: lowerTiles,
      width: EXPANDED_WIDTH,
      height: EXPANDED_HEIGHT,
    },
  ];
}
