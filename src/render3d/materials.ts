import * as THREE from 'three';
import { TileType } from '../types';

// Convert CSS hex colors from TILE_COLORS to Three.js materials
const TILE_MATERIAL_COLORS: Record<TileType, number> = {
  [TileType.WATER]:        0x1a5276,
  [TileType.HULL]:         0x5c3d2e,
  [TileType.FLOOR]:        0xc4a46c,
  [TileType.STAIRS]:       0xa08050,
  [TileType.HELM]:         0x8b7355,
  [TileType.MAST]:         0x3e2723,
  [TileType.CANNON]:       0x333333,
  [TileType.STOVE]:        0x8b2500,
  [TileType.BED]:          0x6b8cae,
  [TileType.BARREL]:       0x8b6914,
  [TileType.TABLE]:        0x6d4c2e,
  [TileType.MAP_TABLE]:    0x4a6644,
  [TileType.LANTERN]:      0xc89b3c,
  [TileType.RAISED_FLOOR]: 0xb89458,
  [TileType.NEST]:         0x8b7355,
  [TileType.WHARF]:        0x8b6f47,
  [TileType.LAND]:         0x7a9b57,
  [TileType.GANGPLANK]:    0xa08050,
  [TileType.HARBOR_WALL]:  0x8b7765,
  [TileType.HARBOR_FLOOR]: 0xb0a08a,
  [TileType.NOTICE_BOARD]: 0x6b5b3a,
};

// Shared geometry cache (reuse across tiles)
export const GEOM = {
  floorPlane:   new THREE.BoxGeometry(1, 0.05, 1),
  hull:         new THREE.BoxGeometry(1, 0.4, 1),
  raisedFloor:  new THREE.BoxGeometry(1, 0.15, 1),
  barrel:       new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12),
  mast:         new THREE.CylinderGeometry(0.12, 0.14, 7.5, 10),
  cannon:       new THREE.CylinderGeometry(0.08, 0.12, 0.7, 8),
  cannonBase:   new THREE.BoxGeometry(0.4, 0.15, 0.5),
  bed:          new THREE.BoxGeometry(0.8, 0.2, 0.9),
  table:        new THREE.BoxGeometry(0.8, 0.05, 0.8),
  tableLeg:     new THREE.BoxGeometry(0.06, 0.3, 0.06),
  stove:        new THREE.BoxGeometry(0.7, 0.4, 0.7),
  helm:         new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16),
  helmPost:     new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8),
  lanternPost:  new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6),
  lanternGlass: new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8),
  mapTable:     new THREE.BoxGeometry(0.8, 0.05, 0.8),
  nest:         new THREE.CylinderGeometry(0.4, 0.5, 0.3, 12),
  stairs:       new THREE.BoxGeometry(0.9, 0.05, 0.15),
  harborWall:   new THREE.BoxGeometry(1, 1.5, 1),
  noticeBoard:  new THREE.BoxGeometry(0.6, 0.5, 0.06),
  noticeBoardPost: new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6),
  gangplank:    new THREE.BoxGeometry(1, 0.04, 1),
};

// Materials per tile type
function makeMat(color: number, opts?: Partial<THREE.MeshPhongMaterialParameters>): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({ color, shininess: 12, ...opts });
}

export const MAT: Record<string, THREE.Material> = {
  floor:       makeMat(0xc4a46c),
  hull:        makeMat(0x5c3d2e, { shininess: 5 }),
  raisedFloor: makeMat(0xb89458),
  stairs:      makeMat(0xa08050),
  helm:        makeMat(0x8b7355, { shininess: 30 }),
  helmPost:    makeMat(0x6b5335),
  mast:        makeMat(0x3e2723, { shininess: 5 }),
  cannon:      makeMat(0x333333, { shininess: 50 }),
  cannonBase:  makeMat(0x444444),
  stove:       makeMat(0x8b2500),
  stoveFire:   makeMat(0xff6600, { emissive: 0xff4400, emissiveIntensity: 0.3 }),
  bed:         makeMat(0x6b8cae),
  bedPillow:   makeMat(0x8ab4d4),
  barrel:      makeMat(0x8b6914, { shininess: 8 }),
  barrelRing:  makeMat(0x555555, { shininess: 40 }),
  table:       makeMat(0x6d4c2e),
  mapTable:    makeMat(0x4a6644),
  mapParchment: makeMat(0xd4c49a),
  lanternBrass: makeMat(0xc89b3c, { shininess: 50 }),
  lanternGlass: makeMat(0xffc850, { transparent: true, opacity: 0.4 }),
  lanternGlassLit: makeMat(0xffdd88, { transparent: true, opacity: 0.7, emissive: 0xffc850, emissiveIntensity: 0.5 }),
  nest:        makeMat(0x8b7355),
  wharf:       makeMat(0x8b6f47),
  land:        makeMat(0x7a9b57),
  gangplank:   makeMat(0xa08050),
  harborWall:  makeMat(0x8b7765, { shininess: 5 }),
  harborFloor: makeMat(0xb0a08a),
  noticeBoard: makeMat(0x8b6914),
  noticePaper: makeMat(0xe8dcc8),
  selection:   new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
};

// Flat map from TileType to a material (for simple coloring)
export function getTileMaterial(type: TileType): THREE.MeshPhongMaterial {
  const color = TILE_MATERIAL_COLORS[type];
  return makeMat(color);
}

// Actor materials (created on demand, cached by color string)
const actorMatCache = new Map<string, THREE.MeshPhongMaterial>();
export function getActorMaterial(color: string): THREE.MeshPhongMaterial {
  let mat = actorMatCache.get(color);
  if (!mat) {
    mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(color), shininess: 20 });
    actorMatCache.set(color, mat);
  }
  return mat;
}
