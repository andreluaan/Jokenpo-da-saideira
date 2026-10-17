import * as THREE from 'three';
import type { GameConfig } from '@ppt/shared';
import { S } from './assets';

/** Lente da câmera da partida. */
export const MATCH_FOV = 36;
/** Para onde a câmera da partida olha (um pouco abaixo do centro da arena). */
export const MATCH_TARGET = new THREE.Vector3(0, 0, 0.55);
/** Câmera um pouco mais deitada (~46°): vê mais do corpo e do rosto, menos do topo da cabeça. */
const DIR = new THREE.Vector3(0, 1, 0.95).normalize();

/**
 * Enquadramento do duelo: a arena inteira com uma margem curta em volta da cerca
 * (quanto mais perto, maiores os personagens na tela). Usado pela partida e pelo voo de câmera do menu,
 * para a troca de uma para a outra ficar sem emenda.
 */
export function matchCameraPose(cfg: GameConfig, aspect: number): { position: THREE.Vector3; target: THREE.Vector3; dist: number } {
  const halfW = cfg.arena.rx * S + 0.7;
  const halfH = cfg.arena.ry * S + 1.0;
  const t = Math.tan(THREE.MathUtils.degToRad(MATCH_FOV / 2));
  const dist = Math.max(halfW / (t * aspect), (halfH * 1.15) / t, 10);
  return { position: MATCH_TARGET.clone().addScaledVector(DIR, dist), target: MATCH_TARGET.clone(), dist };
}
