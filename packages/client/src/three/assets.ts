import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameConfig } from '@ppt/shared';

/** 1 unidade 3D = 100 px da simulação. */
export const S = 0.01;

/** Converte coordenadas da simulação (px, y para baixo) para o mundo 3D (x, z no chão). */
export function toWorld(cfg: GameConfig, x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((x - cfg.arena.cx) * S, 0, (y - cfg.arena.cy) * S);
}

const BASE = `${import.meta.env.BASE_URL}models/`;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const done = new Map<string, GLTF>();

/** Modelos usados pelo jogo (pacotes CC0 da Kenney, ver public/models/CREDITS.md). */
export const MODELS = {
  chars: ['character-male-a', 'character-male-b', 'character-male-d', 'character-male-f', 'aid-sunglasses', 'character-male-c', 'character-male-e', 'character-female-a', 'character-female-c'],
  food: ['mug', 'soda-bottle', 'glass', 'skewer', 'can', 'soda-can', 'barrel', 'fries', 'plate', 'bowl', 'plate-broken'],
  furniture: ['tableRound', 'chair', 'chairRounded', 'stoolBar', 'speaker', 'radio', 'televisionVintage', 'trashcan', 'kitchenBar', 'bench', 'plantSmall1', 'kitchenFridgeLarge', 'bookcaseOpenLow'],
  nature: [
    'tree_default_fall',
    'tree_oak_fall',
    'tree_fat_fall',
    'tree_detailed_fall',
    'fence_simple',
    'fence_gate',
    'campfire_stones',
    'crop_carrot',
    'crop_pumpkin',
    'crops_cornStageD',
    'crops_dirtRow',
    'flower_redA',
    'flower_yellowA',
    'flower_purpleA',
    'grass',
    'grass_large',
    'rock_smallA',
    'rock_largeA',
    'log_stack',
    'stump_round',
    'sign',
    'plant_bush',
    'plant_bushLarge',
    // v0.7: quintal mais verde
    'tree_default',
    'tree_oak',
    'tree_fat',
    'tree_detailed',
    'tree_palmShort',
    'plant_bushDetailed',
    'plant_bushSmall',
    'plant_flatTall',
    'grass_leafs',
    'grass_leafsLarge',
    'flower_redB',
    'flower_yellowB',
    'flower_purpleB',
    'pot_small',
    'path_stone',
  ],
} as const;

export function load(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(`${BASE}${path}.glb`).then((g) => {
      done.set(path, g);
      return g;
    });
    cache.set(path, p);
  }
  return p;
}

/** Carrega tudo de uma vez (tela de carregamento). */
export async function preloadAll(onProgress?: (k: number) => void): Promise<void> {
  const all = Object.entries(MODELS).flatMap(([dir, names]) => names.map((n) => `${dir}/${n}`));
  let n = 0;
  await Promise.all(
    all.map((p) =>
      load(p).then(() => {
        n++;
        onProgress?.(n / all.length);
      }),
    ),
  );
}

export function gltf(path: string): GLTF {
  const g = done.get(path);
  if (!g) throw new Error(`Modelo não carregado: ${path}`);
  return g;
}

/** Cópia de um modelo pronto (com esqueleto independente, se tiver). */
export function instance(path: string): THREE.Object3D {
  const g = gltf(path);
  const obj = g.animations.length ? skeletonClone(g.scene) : g.scene.clone(true);
  shadows(obj);
  return obj;
}

export function shadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

export interface FitOptions {
  /** Altura final (y). */
  height?: number;
  /** Maior lado no chão (x/z). */
  size?: number;
  /** Escala fixa (ignora height/size). */
  scale?: number;
}

/** Centraliza no chão (base em y=0, centro em x/z) e escala. Retorna um grupo pronto para posicionar. */
export function fit(obj: THREE.Object3D, o: FitOptions): THREE.Group {
  const box = new THREE.Box3().setFromObject(obj);
  const sz = box.getSize(new THREE.Vector3());
  const k = o.scale ?? (o.height ? o.height / sz.y : o.size ? o.size / Math.max(sz.x, sz.z) : 1);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -box.min.y, -center.z);
  const g = new THREE.Group();
  g.add(obj);
  g.scale.setScalar(k);
  return g;
}

/** Atalho: instância + fit + posição/rotação. */
export function place(path: string, x: number, z: number, o: FitOptions & { rot?: number; y?: number } = {}): THREE.Group {
  const g = fit(instance(path), o);
  g.position.set(x, o.y ?? 0, z);
  g.rotation.y = o.rot ?? 0;
  return g;
}

/** Troca a cor de materiais por nome (clona o material para não afetar outras cópias). */
export function recolor(obj: THREE.Object3D, colors: Record<string, number>): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const next = mats.map((mat) => {
      const c = colors[mat.name] ?? colors['*'];
      if (c === undefined) return mat;
      const copy = (mat as THREE.MeshStandardMaterial).clone();
      copy.color = new THREE.Color(c);
      return copy;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
}
