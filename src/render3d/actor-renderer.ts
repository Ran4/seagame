import * as THREE from 'three';
import { Actor, Corpse, TILE_SIZE } from '../types';
import { DECK_HEIGHT, GRID_OFFSET_X, GRID_OFFSET_Z } from './ship-builder';
import { getActorMaterial } from './materials';

export interface ActorRenderer {
  group: THREE.Group;
  actorMeshes: Map<number, THREE.Mesh>; // actorId -> mesh
  corpseMeshes: Map<number, THREE.Mesh>; // corpse actorId -> mesh
  selectionRing: THREE.Mesh;
  syncActors(actors: Actor[], selectedActorId: number | null): void;
  syncCorpses(corpses: Corpse[], selectedCorpseId: number | null): void;
}

// Shared geometry for actor cylinders
const HUMAN_GEOM = new THREE.CylinderGeometry(0.15, 0.15, 0.55, 12);
const ANIMAL_GEOM = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10);
const SMALL_ANIMAL_GEOM = new THREE.CylinderGeometry(0.09, 0.09, 0.25, 8);
const CORPSE_GEOM = new THREE.CylinderGeometry(0.15, 0.15, 0.55, 12);

// Selection ring
const RING_GEOM = new THREE.RingGeometry(0.22, 0.28, 24);
const RING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffff00,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.7,
});

function actorTo3D(pixelX: number, pixelY: number, deck: number): THREE.Vector3 {
  return new THREE.Vector3(
    pixelX / TILE_SIZE - GRID_OFFSET_X,
    (2 - deck) * DECK_HEIGHT + 0.3,
    pixelY / TILE_SIZE - GRID_OFFSET_Z,
  );
}

function getGeom(actorType: string): THREE.CylinderGeometry {
  if (actorType === 'monkey' || actorType === 'cat') return SMALL_ANIMAL_GEOM;
  if (actorType !== 'human') return ANIMAL_GEOM;
  return HUMAN_GEOM;
}

export function createActorRenderer(): ActorRenderer {
  const group = new THREE.Group();
  group.name = 'actors';
  const actorMeshes = new Map<number, THREE.Mesh>();
  const corpseMeshes = new Map<number, THREE.Mesh>();

  const selectionRing = new THREE.Mesh(RING_GEOM, RING_MAT);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;
  group.add(selectionRing);

  function syncActors(actors: Actor[], selectedActorId: number | null): void {
    const seen = new Set<number>();

    for (const actor of actors) {
      seen.add(actor.id);
      let mesh = actorMeshes.get(actor.id);

      if (!mesh) {
        const geom = getGeom(actor.actorType);
        const mat = getActorMaterial(actor.profile.color);
        mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.userData = { actorId: actor.id, isActor: true };
        actorMeshes.set(actor.id, mesh);
        group.add(mesh);
      }

      // Update position
      const pos = actorTo3D(actor.pixelX, actor.pixelY, actor.deck);
      mesh.position.copy(pos);
      mesh.visible = true;
    }

    // Remove meshes for actors that no longer exist
    for (const [id, mesh] of actorMeshes) {
      if (!seen.has(id)) {
        group.remove(mesh);
        actorMeshes.delete(id);
      }
    }

    // Selection ring
    if (selectedActorId !== null) {
      const selectedMesh = actorMeshes.get(selectedActorId);
      if (selectedMesh) {
        selectionRing.visible = true;
        selectionRing.position.set(
          selectedMesh.position.x,
          selectedMesh.position.y - 0.25,
          selectedMesh.position.z,
        );
      } else {
        selectionRing.visible = false;
      }
    } else {
      selectionRing.visible = false;
    }
  }

  function syncCorpses(corpses: Corpse[], selectedCorpseId: number | null): void {
    const seen = new Set<number>();

    for (const corpse of corpses) {
      seen.add(corpse.actorId);
      let mesh = corpseMeshes.get(corpse.actorId);

      if (!mesh) {
        const mat = getActorMaterial(corpse.color);
        const corpseMat = mat.clone();
        corpseMat.transparent = true;
        corpseMat.opacity = 0.6;
        mesh = new THREE.Mesh(CORPSE_GEOM, corpseMat);
        mesh.castShadow = true;
        mesh.userData = { corpseActorId: corpse.actorId, isCorpse: true };
        corpseMeshes.set(corpse.actorId, mesh);
        group.add(mesh);
      }

      const pos = actorTo3D(corpse.pixelX, corpse.pixelY, corpse.deck);
      // Lie on the ground, rotated 90deg
      mesh.position.set(pos.x, pos.y - 0.2, pos.z);
      mesh.rotation.z = Math.PI / 2;
      mesh.visible = true;
    }

    // Remove meshes for corpses that no longer exist
    for (const [id, mesh] of corpseMeshes) {
      if (!seen.has(id)) {
        group.remove(mesh);
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
        corpseMeshes.delete(id);
      }
    }

    // Selection ring for corpse
    if (selectedCorpseId !== null && !actorMeshes.has(selectedCorpseId)) {
      // Only show if no actor is selected
      const corpseMesh = corpseMeshes.get(selectedCorpseId);
      if (corpseMesh) {
        selectionRing.visible = true;
        selectionRing.position.set(
          corpseMesh.position.x,
          corpseMesh.position.y - 0.05,
          corpseMesh.position.z,
        );
      }
    }
  }

  return { group, actorMeshes, corpseMeshes, selectionRing, syncActors, syncCorpses };
}
