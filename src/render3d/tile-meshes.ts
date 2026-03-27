import * as THREE from 'three';
import { TileType } from '../types';
import { GEOM, MAT } from './materials';

export interface TileMeshUserData {
  tileX: number;
  tileY: number;
  deck: number;
  tileType: TileType;
}

// Create a 3D representation of a tile. Returns a Group positioned at (0,0,0) — caller sets position.
export function createTileMesh(type: TileType, tileX: number, tileY: number, deck: number): THREE.Object3D | null {
  const userData: TileMeshUserData = { tileX, tileY, deck, tileType: type };

  switch (type) {
    case TileType.WATER:
      return null; // water is a separate plane

    case TileType.HULL:
      return tagged(new THREE.Mesh(GEOM.hull, MAT.hull), userData);

    case TileType.FLOOR:
      return tagged(new THREE.Mesh(GEOM.floorPlane, MAT.floor), userData);

    case TileType.RAISED_FLOOR:
      return tagged(new THREE.Mesh(GEOM.raisedFloor, MAT.raisedFloor), userData);

    case TileType.STAIRS:
      return buildStairs(userData);

    case TileType.HELM:
      return buildHelm(userData);

    case TileType.MAST:
      return buildMast(userData);

    case TileType.CANNON:
      return buildCannon(userData);

    case TileType.STOVE:
      return buildStove(userData);

    case TileType.BED:
      return buildBed(userData);

    case TileType.BARREL:
      return buildBarrel(userData);

    case TileType.TABLE:
      return buildTable(userData);

    case TileType.MAP_TABLE:
      return buildMapTable(userData);

    case TileType.LANTERN:
      return buildLantern(userData);

    case TileType.NEST:
      return buildNest(userData);

    case TileType.WHARF:
      return tagged(new THREE.Mesh(GEOM.floorPlane, MAT.wharf), userData);

    case TileType.LAND:
      return tagged(new THREE.Mesh(GEOM.floorPlane, MAT.land), userData);

    case TileType.GANGPLANK:
      return tagged(new THREE.Mesh(GEOM.gangplank, MAT.gangplank), userData);

    case TileType.HARBOR_WALL:
      return tagged(new THREE.Mesh(GEOM.harborWall, MAT.harborWall), userData);

    case TileType.HARBOR_FLOOR:
      return tagged(new THREE.Mesh(GEOM.floorPlane, MAT.harborFloor), userData);

    case TileType.NOTICE_BOARD:
      return buildNoticeBoard(userData);

    default:
      return null;
  }
}

function tagged(obj: THREE.Object3D, userData: TileMeshUserData): THREE.Object3D {
  obj.userData = userData;
  obj.castShadow = true;
  obj.receiveShadow = true;
  return obj;
}

function group(userData: TileMeshUserData): THREE.Group {
  const g = new THREE.Group();
  g.userData = userData;
  return g;
}

function buildStairs(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  // Floor base
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // 4 steps ascending
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(GEOM.stairs, MAT.stairs);
    step.position.set(0, 0.05 + i * 0.08, -0.3 + i * 0.2);
    step.castShadow = true;
    step.receiveShadow = true;
    g.add(step);
  }
  return g;
}

function buildHelm(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // Post
  const post = new THREE.Mesh(GEOM.helmPost, MAT.helmPost);
  post.position.y = 0.32;
  post.castShadow = true;
  g.add(post);
  // Wheel
  const wheel = new THREE.Mesh(GEOM.helm, MAT.helm);
  wheel.position.y = 0.6;
  wheel.rotation.x = Math.PI / 6;
  wheel.castShadow = true;
  g.add(wheel);
  // Spokes
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.28, 4),
      MAT.helmPost
    );
    spoke.position.set(
      Math.cos(angle) * 0.14,
      0.6,
      Math.sin(angle) * 0.14 * Math.cos(Math.PI / 6)
    );
    spoke.rotation.z = -angle;
    g.add(spoke);
  }
  return g;
}

function buildMast(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  const mast = new THREE.Mesh(GEOM.mast, MAT.mast);
  mast.position.y = 3.75; // tall, spans decks
  mast.castShadow = true;
  g.add(mast);
  return g;
}

function buildCannon(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // Base
  const base = new THREE.Mesh(GEOM.cannonBase, MAT.cannonBase);
  base.position.y = 0.1;
  base.castShadow = true;
  g.add(base);
  // Barrel
  const barrel = new THREE.Mesh(GEOM.cannon, MAT.cannon);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.25, -0.1);
  barrel.castShadow = true;
  g.add(barrel);
  return g;
}

function buildStove(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  const stove = new THREE.Mesh(GEOM.stove, MAT.stove);
  stove.position.y = 0.22;
  stove.castShadow = true;
  g.add(stove);
  // Fire glow on top
  const fire = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, 0.3),
    MAT.stoveFire
  );
  fire.position.y = 0.44;
  g.add(fire);
  return g;
}

function buildBed(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  const bed = new THREE.Mesh(GEOM.bed, MAT.bed);
  bed.position.y = 0.12;
  bed.castShadow = true;
  bed.receiveShadow = true;
  g.add(bed);
  // Pillow
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.25),
    MAT.bedPillow
  );
  pillow.position.set(0, 0.26, -0.3);
  g.add(pillow);
  return g;
}

function buildBarrel(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  const barrel = new THREE.Mesh(GEOM.barrel, MAT.barrel);
  barrel.position.y = 0.27;
  barrel.castShadow = true;
  g.add(barrel);
  // Metal rings
  for (const dy of [-0.15, 0, 0.15]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.015, 6, 16),
      MAT.barrelRing
    );
    ring.position.y = 0.27 + dy;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  return g;
}

function buildTable(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // Tabletop
  const top = new THREE.Mesh(GEOM.table, MAT.table);
  top.position.y = 0.35;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  // 4 legs
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const leg = new THREE.Mesh(GEOM.tableLeg, MAT.table);
    leg.position.set(dx, 0.17, dz);
    g.add(leg);
  }
  return g;
}

function buildMapTable(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // Table
  const top = new THREE.Mesh(GEOM.mapTable, MAT.mapTable);
  top.position.y = 0.35;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  // Parchment on top
  const parchment = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.01, 0.6),
    MAT.mapParchment
  );
  parchment.position.y = 0.39;
  g.add(parchment);
  // 4 legs
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const leg = new THREE.Mesh(GEOM.tableLeg, MAT.mapTable);
    leg.position.set(dx, 0.17, dz);
    g.add(leg);
  }
  return g;
}

function buildLantern(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  g.name = `lantern_${ud.deck}_${ud.tileX}_${ud.tileY}`;
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.floor);
  floor.receiveShadow = true;
  g.add(floor);
  // Post
  const post = new THREE.Mesh(GEOM.lanternPost, MAT.lanternBrass);
  post.position.y = 0.27;
  post.castShadow = true;
  g.add(post);
  // Glass body (swapped between lit/unlit by lighting system)
  const glass = new THREE.Mesh(GEOM.lanternGlass, MAT.lanternGlass);
  glass.position.y = 0.55;
  glass.name = 'lanternGlass';
  g.add(glass);
  return g;
}

function buildNest(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.raisedFloor, MAT.raisedFloor);
  floor.receiveShadow = true;
  g.add(floor);
  const nest = new THREE.Mesh(GEOM.nest, MAT.nest);
  nest.position.y = 0.22;
  nest.castShadow = true;
  g.add(nest);
  return g;
}

function buildNoticeBoard(ud: TileMeshUserData): THREE.Group {
  const g = group(ud);
  const floor = new THREE.Mesh(GEOM.floorPlane, MAT.harborFloor);
  floor.receiveShadow = true;
  g.add(floor);
  // Post
  const post = new THREE.Mesh(GEOM.noticeBoardPost, MAT.table);
  post.position.y = 0.35;
  post.castShadow = true;
  g.add(post);
  // Board
  const board = new THREE.Mesh(GEOM.noticeBoard, MAT.noticeBoard);
  board.position.y = 0.7;
  board.castShadow = true;
  g.add(board);
  // Paper
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.25, 0.01),
    MAT.noticePaper
  );
  paper.position.set(-0.1, 0.72, 0.04);
  g.add(paper);
  const paper2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.28, 0.01),
    MAT.noticePaper
  );
  paper2.position.set(0.12, 0.7, 0.04);
  g.add(paper2);
  return g;
}
