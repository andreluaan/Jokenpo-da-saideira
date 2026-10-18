import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Junta malhas paradas que usam o "mesmo" material (mesmo tipo/textura/acabamento) numa malha só.
 * Cada malha a menos é um desenho (draw call) a menos por quadro — e o dobro disso com sombras.
 * O visual não muda: as geometrias são copiadas já na posição final.
 * Cores diferentes não separam: a cor de cada peça é "pintada" nos vértices (atributo `color`) e o
 * material juntado fica branco com `vertexColors` (cor final = branco × cor do vértice = a mesma de antes).
 *
 * `container`: onde as malhas juntadas vão morar (e em que espaço ficam as coordenadas).
 * `roots`: o que pode ser juntado. `skip`: subárvores que se mexem e devem ficar como estão.
 * Devolve quantas malhas foram trocadas.
 */
export function mergeStatic(container: THREE.Object3D, roots: THREE.Object3D[], skip: Set<THREE.Object3D> = new Set()): number {
  container.updateMatrixWorld(true);
  const toLocal = container.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; bake: boolean; geos: THREE.BufferGeometry[]; colors: THREE.Color[]; meshes: THREE.Mesh[] }>();

  const visit = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) consider(m);
    o.children.forEach(visit);
  };
  const consider = (m: THREE.Mesh) => {
    if ((m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material) || m.userData.outline || !m.visible) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.transparent) return;
    const src = m.geometry;
    if (!src.getAttribute('position') || Object.keys(src.morphAttributes).length) return;
    const world = toLocal.clone().multiply(m.matrixWorld);
    if (world.determinant() < 0) return; // espelhada: inverteria as faces
    let g = src.index ? src.toNonIndexed() : src.clone();
    // Mantém só os atributos que o material usa (todos do mesmo grupo precisam ter os mesmos).
    for (const name of Object.keys(g.attributes)) {
      const keep = name === 'position' || name === 'normal' || (name === 'uv' && !!mat.map) || (name === 'color' && mat.vertexColors);
      if (!keep) g.deleteAttribute(name);
    }
    if (mat.map && !g.getAttribute('uv')) return;
    if (mat.vertexColors && !g.getAttribute('color')) return;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(world);
    g = g.index ? g.toNonIndexed() : g;
    // Dá para pintar a cor nos vértices se o material ainda não usa cor por vértice nem shader próprio.
    const bake = !!mat.color && !mat.vertexColors && mat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
    const key = [
      mat.type,
      bake ? 'bake' : mat.color?.getHexString(),
      mat.map?.uuid ?? '-',
      mat.emissive?.getHexString() ?? '-',
      mat.emissiveIntensity ?? '-',
      mat.roughness ?? '-',
      mat.metalness ?? '-',
      mat.flatShading,
      mat.vertexColors,
      mat.side,
      m.castShadow,
      m.receiveShadow,
    ].join('|');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, recv: m.receiveShadow, bake, geos: [], colors: [], meshes: [] }));
    b.geos.push(g);
    b.colors.push(mat.color);
    b.meshes.push(m);
  };
  roots.forEach(visit);

  let replaced = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    let mat = b.mat;
    if (b.bake && b.colors.some((c) => !c.equals(b.colors[0]))) {
      // Cores diferentes no mesmo grupo: cada geometria leva a sua cor nos vértices.
      b.geos.forEach((g, i) => {
        const c = b.colors[i];
        const n = g.getAttribute('position').count;
        const arr = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) arr.set([c.r, c.g, c.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      });
      const m = b.mat.clone() as THREE.MeshStandardMaterial;
      m.color.set(0xffffff);
      m.vertexColors = true;
      mat = m;
    }
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue; // atributos incompatíveis: deixa as originais
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    container.add(mesh);
    for (const m of b.meshes) m.removeFromParent();
    replaced += b.meshes.length;
  }
  return replaced;
}
