import {TileType, Deck} from './types';

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
....___....
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
..#__W__#..
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
#_________#
.#_______#.
.#_______#.
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

export function createShip(): Deck[] {
  const crowsNestTiles = parseLayout(CROWS_NEST);
  const upperTiles = parseLayout(UPPER_DECK);
  const lowerTiles = parseLayout(LOWER_DECK);

  return [
    {
      name: "Crow's Nest",
      tiles: crowsNestTiles,
      width: crowsNestTiles[0].length,
      height: crowsNestTiles.length,
    },
    {
      name: 'Upper Deck',
      tiles: upperTiles,
      width: upperTiles[0].length,
      height: upperTiles.length,
    },
    {
      name: 'Lower Deck',
      tiles: lowerTiles,
      width: lowerTiles[0].length,
      height: lowerTiles.length,
    },
  ];
}
