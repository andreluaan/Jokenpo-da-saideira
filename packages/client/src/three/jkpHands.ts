import * as THREE from 'three';
import type { Rps } from '@ppt/shared';
import { rbox } from './props3d';

/**
 * Mãos do Jo-Ken-Pô (v0.15): o QTE é a própria mão do boneco. Uma mão aberta, de palma para cima,
 * fica na frente do corpo; o punho da outra bate nela no JO… KEN… PÔ! (gesto clássico do jokenpô).
 * Mãos grandinhas de desenho, em blocos arredondados como o resto do jogo, com contorno.
 * A cor é o QTE: normal (pele/luva) → verde no PÔ! → vermelho se passar do ponto.
 * Ao botar o símbolo, o punho vira o gesto (pedra, papel ou tesoura).
 * Coordenadas no espaço do modelo do personagem (frente em +z, altura total ≈ 0,67).
 */
export type HandTint = 'normal' | 'green' | 'red';

/** Mãos de desenho bem grandinhas: precisam ler de longe na câmera da partida e cobrir a mãozinha do boneco. */
const HAND_SCALE = 1.1;

const GREEN = new THREE.Color(0x5ad19a);
const RED = new THREE.Color(0xff5a5f);
const GREEN_GLOW = new THREE.Color(0x2fe08a);
const RED_GLOW = new THREE.Color(0xff2a35);

const UP = new THREE.Vector3(0, 1, 0);
const SH = new THREE.Vector3();
const TMP = new THREE.Vector3();
/** Onde o braço encosta em cada mão (pulso). */
const PALM_WRIST = new THREE.Vector3(0.02, -0.02, -0.05);
const FIST_WRIST = new THREE.Vector3(0, -0.01, -0.055);

/** Onde a palma fica (e o punho bate), no espaço do modelo. */
export const PALM_AT = new THREE.Vector3(0.05, 0.19, 0.25);
/** Centro do punho para uma altura `lift` (0 = encostado na palma). */
export const FIST_AT = (lift: number) => new THREE.Vector3(PALM_AT.x - 0.025, PALM_AT.y + 0.08 + lift * 0.1, PALM_AT.z - 0.005);

export class JkpHands {
  readonly group = new THREE.Group();
  private readonly palm = new THREE.Group();
  private readonly hand = new THREE.Group();
  private readonly gestures: Record<Rps | 'fist', THREE.Group>;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly skin: THREE.Color;
  private current: Rps | 'fist' = 'fist';
  /** Braços de desenho (cápsulas na cor da manga) do ombro até a palma e até o punho. */
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;

  /**
   * `skin` = cor das mãos; `sleeve` = cor do braço; `shoulderX/Y` = onde o braço sai do tronco (espaço do modelo).
   */
  constructor(
    skin: number,
    sleeve: number,
    private readonly shoulderX: number,
    private readonly shoulderY: number,
  ) {
    this.skin = new THREE.Color(skin);
    this.mat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.5, flatShading: false, emissive: 0x000000 });
    const m = this.mat;

    // Mão de baixo: palma aberta para cima, dedos juntos apontando para a frente, polegar de lado.
    this.palm.add(rbox(0.15, 0.04, 0.12, 0.018, m, 0, 0, 0));
    for (let i = 0; i < 4; i++) this.palm.add(rbox(0.032, 0.032, 0.07, 0.014, m, -0.05 + i * 0.034, 0.002, 0.09));
    const thumbL = rbox(0.03, 0.03, 0.06, 0.014, m, 0.085, 0.008, 0.02);
    thumbL.rotation.y = -0.6;
    this.palm.add(thumbL);
    this.palm.position.copy(PALM_AT);
    this.palm.scale.setScalar(HAND_SCALE);

    // Mão de cima: os quatro gestos (punho fechado pulando, e os três símbolos depois de botar).
    const fist = () => {
      const g = new THREE.Group();
      g.add(rbox(0.12, 0.1, 0.11, 0.03, m, 0, 0, 0));
      // Dedos dobrados (nós dos dedos) na frente e polegar por cima.
      for (let i = 0; i < 4; i++) g.add(rbox(0.03, 0.04, 0.035, 0.013, m, -0.045 + i * 0.03, -0.012, 0.06));
      const th = rbox(0.06, 0.028, 0.03, 0.012, m, -0.02, 0.025, 0.065);
      th.rotation.z = 0.2;
      g.add(th);
      return g;
    };
    const rock = fist();
    const paper = new THREE.Group();
    paper.add(rbox(0.13, 0.12, 0.035, 0.016, m, 0, 0, 0));
    for (let i = 0; i < 4; i++) paper.add(rbox(0.028, 0.07, 0.03, 0.012, m, -0.045 + i * 0.03, 0.09, 0));
    const thP = rbox(0.03, 0.06, 0.03, 0.012, m, 0.075, 0.02, 0);
    thP.rotation.z = -0.7;
    paper.add(thP);
    const scissors = fist();
    for (const [x, rz] of [
      [-0.03, 0.22],
      [0.012, -0.22],
    ] as const) {
      const f = rbox(0.028, 0.1, 0.03, 0.012, m, x, 0.09, 0.03);
      f.rotation.z = rz;
      scissors.add(f);
    }
    this.gestures = { fist: fist(), rock, paper, scissors };
    for (const [k, g] of Object.entries(this.gestures)) {
      g.visible = k === 'fist';
      this.hand.add(g);
    }
    const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.6, flatShading: false });
    const arm = () => {
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 1, 4, 10), sleeveMat);
      a.castShadow = true;
      return a;
    };
    this.armL = arm();
    this.armR = arm();
    this.group.add(this.armL, this.armR, this.palm, this.hand);
    this.group.visible = false;
  }

  /** Estica a cápsula do braço entre o ombro e a mão. */
  private reach(a: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
    const d = to.clone().sub(from);
    const len = Math.max(0.01, d.length());
    a.position.copy(from).addScaledVector(d, 0.5);
    a.quaternion.setFromUnitVectors(UP, d.normalize());
    a.scale.set(1, len, 1);
  }

  /** Mostra/esconde as mãos (só durante o duelo). */
  show(on: boolean): void {
    this.group.visible = on;
  }

  /** Punho fechado pulando, ou o símbolo que botou. */
  setGesture(g: Rps | 'fist'): void {
    if (g === this.current) return;
    this.gestures[this.current].visible = false;
    this.gestures[g].visible = true;
    this.current = g;
  }

  /** `lift` 0 = encostado na palma, 1 = lá em cima; `squash` = amassadinho na batida. */
  pose(lift: number, squash: number): void {
    const h = this.hand;
    const showing = this.current !== 'fist';
    // Gesto revelado fica em pé, virado para o adversário, um pouco acima da palma.
    h.position.copy(FIST_AT(lift)).add(new THREE.Vector3(0, showing ? 0.04 : 0, showing ? 0.02 : 0));
    h.rotation.set(showing ? -0.2 : 0.15 - lift * 0.35, 0, showing ? 0 : -0.1);
    const s = 1 + squash;
    h.scale.set(HAND_SCALE * s, HAND_SCALE / s, HAND_SCALE * s);
    // Braços: o esquerdo vai por baixo da palma, o direito entra pela parte de trás do punho.
    this.reach(this.armL, SH.set(this.shoulderX, this.shoulderY, 0.01), TMP.copy(PALM_AT).add(PALM_WRIST));
    this.reach(this.armR, SH.set(-this.shoulderX, this.shoulderY, 0.01), TMP.copy(h.position).add(FIST_WRIST));
  }

  /** Cor do QTE: normal → verde → vermelho, com brilho (`glow` 0–1) para ler de longe. */
  tint(kind: HandTint, glow: number): void {
    const c = kind === 'green' ? GREEN : kind === 'red' ? RED : this.skin;
    this.mat.color.copy(c);
    this.mat.emissive.copy(kind === 'green' ? GREEN_GLOW : kind === 'red' ? RED_GLOW : this.skin).multiplyScalar(kind === 'normal' ? 0.12 : 0.35 + glow * 0.45);
  }
}
