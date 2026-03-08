import { DeckPoint, Deck, TileType, WALKABLE } from './types';

interface Node {
  x: number;
  y: number;
  deck: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

function heuristic(a: DeckPoint, b: DeckPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (a.deck !== b.deck ? 2 : 0);
}

function key(x: number, y: number, deck: number): string {
  return `${x},${y},${deck}`;
}

function isWalkable(decks: Deck[], x: number, y: number, deck: number): boolean {
  const d = decks[deck];
  if (!d) return false;
  if (y < 0 || y >= d.height || x < 0 || x >= d.width) return false;
  return WALKABLE.has(d.tiles[y][x]);
}

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export function findPath(
  decks: Deck[],
  from: DeckPoint,
  to: DeckPoint,
): DeckPoint[] | null {
  if (!isWalkable(decks, to.x, to.y, to.deck)) return null;

  const open: Node[] = [];
  const closed = new Set<string>();

  const startNode: Node = {
    x: from.x, y: from.y, deck: from.deck,
    g: 0, h: heuristic(from, to), f: 0, parent: null,
  };
  startNode.f = startNode.h;
  open.push(startNode);

  let iterations = 0;
  const MAX_ITERATIONS = 2000;

  while (open.length > 0 && iterations++ < MAX_ITERATIONS) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    if (current.x === to.x && current.y === to.y && current.deck === to.deck) {
      // Reconstruct path
      const path: DeckPoint[] = [];
      let node: Node | null = current;
      while (node) {
        path.push({ x: node.x, y: node.y, deck: node.deck });
        node = node.parent;
      }
      path.reverse();
      path.shift(); // Remove starting position
      return path;
    }

    const k = key(current.x, current.y, current.deck);
    if (closed.has(k)) continue;
    closed.add(k);

    // Regular neighbors (4-directional)
    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isWalkable(decks, nx, ny, current.deck)) continue;
      const nk = key(nx, ny, current.deck);
      if (closed.has(nk)) continue;

      const g = current.g + 1;
      const h = heuristic({ x: nx, y: ny, deck: current.deck }, to);
      open.push({
        x: nx, y: ny, deck: current.deck,
        g, h, f: g + h, parent: current,
      });
    }

    // Stairs: switch deck
    const currentTile = decks[current.deck].tiles[current.y][current.x];
    if (currentTile === TileType.STAIRS) {
      for (let d = 0; d < decks.length; d++) {
        if (d === current.deck) continue;
        if (isWalkable(decks, current.x, current.y, d)) {
          const nk = key(current.x, current.y, d);
          if (closed.has(nk)) continue;
          const g = current.g + 1;
          const h = heuristic({ x: current.x, y: current.y, deck: d }, to);
          open.push({
            x: current.x, y: current.y, deck: d,
            g, h, f: g + h, parent: current,
          });
        }
      }
    }
  }

  return null;
}
