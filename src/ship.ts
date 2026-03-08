import { TileType, Deck } from './types';

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
};

function parseLayout(layout: string): TileType[][] {
  return layout
    .trim()
    .split('\n')
    .map(row => [...row].map(ch => CHAR_TO_TILE[ch] ?? TileType.WATER));
}

const UPPER_DECK = `\
.....##.....
....#__#....
...#____#...
..#______#..
.#________#.
.#___M____#.
#__________#
#__________#
#_C______C_#
#__________#
#_____M____#
#__________#
#_C______C_#
#__________#
#__________#
#__________#
#____S_____#
#__________#
.#________#.
.#___W____#.
..########..`;

const LOWER_DECK = `\
.....##.....
....#__#....
...#____#...
..#__RR__#..
.#___RR___#.
.#________#.
#_BBB__BBB_#
#__________#
#_BBB__BBB_#
#__________#
#__________#
#___TTTT___#
#___TTTT___#
#__________#
#__________#
#__K_______#
#____S_____#
#__________#
.#________#.
.#________#.
..########..`;

export function createShip(): Deck[] {
  const upperTiles = parseLayout(UPPER_DECK);
  const lowerTiles = parseLayout(LOWER_DECK);

  return [
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
