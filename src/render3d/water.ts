import * as THREE from 'three';

export interface WaterPlane {
  mesh: THREE.Mesh;
  update(time: number, offsetX: number, offsetZ: number): void;
}

export function createWater(): WaterPlane {
  const geometry = new THREE.PlaneGeometry(200, 200, 80, 80);
  const material = new THREE.MeshPhongMaterial({
    color: 0x1a5276,
    transparent: true,
    opacity: 0.78,
    shininess: 85,
    side: THREE.DoubleSide,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.08;
  mesh.receiveShadow = true;

  // Store original Y positions (they're Z in the plane's local space before rotation)
  const posAttr = geometry.attributes.position;
  const basePositions = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count * 3; i++) {
    basePositions[i] = posAttr.array[i] as number;
  }

  function update(time: number, offsetX: number, offsetZ: number): void {
    // Shift water plane position for sailing effect
    mesh.position.x = offsetX;
    mesh.position.z = offsetZ;

    // Animate waves (vertex displacement in local Z = world Y)
    const pa = geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = basePositions[i * 3];
      const y = basePositions[i * 3 + 1];
      const z =
        Math.sin(x * 0.25 + time * 0.7) * 0.07 +
        Math.sin(y * 0.35 + time * 0.5) * 0.05 +
        Math.sin((x + y) * 0.18 + time * 1.1) * 0.04;
      pa.setZ(i, z);
    }
    pa.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return { mesh, update };
}
