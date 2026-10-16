import * as THREE from 'three';
import type { CharacterId, PlayerView } from '@ppt/shared';
import { gltf, instance, fit } from './assets';
import { recolorColormap } from './textures';
import { WobbleRig } from '../art/rig';

/** Escala do personagem (o modelo da Kenney tem ~0,67 de altura). */
export const CHAR_SCALE = 1.45;

type Anim =
  | 'idle'
  | 'walk'
  | 'sprint'
  | 'die'
  | 'attack-kick-right'
  | 'attack-melee-right'
  | 'holding-right'
  | 'emote-yes'
  | 'interact-right';

interface Look {
  base: string;
  /** Repintura da paleta no corpo e na cabeça (texturas separadas). */
  body: Record<string, number>;
  head: Record<string, number>;
  build: (c: Character3D) => void;
  /** Adereço na mão quando parado/andando (some ao segurar símbolo). */
  prop?: 'bottle' | 'mug';
}

const BLACK = 0x1a1420;
const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

function spike(r: number, h: number, color: number, x: number, y: number, z: number, rx: number, rz: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, Math.PI / 4, rz);
  m.castShadow = true;
  return m;
}

/** Personagens originais, inspirados em arquétipos (sem copiar designs registrados). Coordenadas no espaço do osso da cabeça. */
const LOOKS: Record<CharacterId, Look> = {
  fera: {
    base: 'character-male-a',
    body: { r2c3: 0x3f9a3a, r2c11: 0x3f9a3a, r2c5: 0xf07a2a, r3c13: 0xf3ece8, r3c11: 0xf2c6a0 },
    head: { r3c13: 0xf2c6a0 },
    prop: 'bottle',
    build: (c) => {
      const h = c.headAnchor;
      // Cabelo tigelinha brilhante.
      // (o modelo de base já tem cabelo preto; aqui só a franja reta e as laterais da tigelinha)
      h.add(box(0.42, 0.045, 0.025, BLACK, 0, 0.3, 0.176));
      // Sobrancelhonas.
      h.add(box(0.12, 0.035, 0.02, BLACK, 0.09, 0.2, 0.178));
      h.add(box(0.12, 0.035, 0.02, BLACK, -0.09, 0.2, 0.178));
      // Óculos escuros do pacote.
      const glasses = fit(instance('chars/aid-sunglasses'), { scale: 1 });
      glasses.position.set(0, 0.105, 0.095);
      h.add(glasses);
    },
  },
  principe: {
    base: 'character-male-d',
    body: { r3c1: 0x2e5fd1, r2c9: 0xe8b830, r3c15: 0xf7f5ef },
    head: { r3c11: BLACK },
    build: (c) => {
      const h = c.headAnchor;
      // Cabelo espetado em chama.
      const spikes: [number, number, number, number][] = [
        [-0.15, -0.02, 0.25, 0.35],
        [0, -0.04, 0.32, 0],
        [0.15, -0.02, 0.25, -0.35],
        [-0.08, 0.08, 0.22, 0.2],
        [0.08, 0.08, 0.22, -0.2],
        [0, -0.13, 0.26, 0],
      ];
      for (const [x, z, len, rz] of spikes) h.add(spike(0.08, len, BLACK, x, 0.3 + len / 2, z, -0.35, rz));
      // Entradas em V.
      h.add(box(0.11, 0.11, 0.03, BLACK, 0, 0.29, 0.17, [0, 0, Math.PI / 4]));
      // Ombreiras douradas.
      const t = c.torsoBox;
      const tc = t.getCenter(new THREE.Vector3());
      for (const sx of [1, -1]) c.torsoAnchor.add(box(0.13, 0.05, 0.17, 0xe8b830, sx * t.max.x * 0.82, t.max.y - 0.015, tc.z));
    },
  },
  panca: {
    base: 'character-male-b',
    body: { r2c9: 0xfafafa, r2c11: 0x4fb3e8 },
    head: {},
    prop: 'mug',
    build: (c) => {
      // Fiapos penteados na careca e barrigão.
      for (const x of [-0.05, 0.05]) c.headAnchor.add(box(0.012, 0.008, 0.24, 0x3b2a25, x, 0.331, 0, [0, 0, 0.1]));
      const t = c.torsoBox;
      const tc = t.getCenter(new THREE.Vector3());
      c.torsoAnchor.add(box((t.max.x - t.min.x) * 0.8, (t.max.y - t.min.y) * 0.55, 0.08, 0xf4f4f4, tc.x, tc.y - 0.01, t.max.z + 0.01));
    },
  },
  sonolento: {
    base: 'character-male-f',
    body: { r2c3: 0x6f8040, r3c3: 0x2c3328, r3c15: 0x2c3328 },
    head: {},
    build: (c) => {
      const h = c.headAnchor;
      // Rabo de cavalo espetado no alto.
      for (const [x, z, rx, rz] of [
        [0, -0.06, -0.5, 0],
        [-0.06, -0.04, -0.3, 0.5],
        [0.06, -0.04, -0.3, -0.5],
        [0, -0.1, -0.9, 0],
      ] as const) {
        h.add(spike(0.06, 0.24, BLACK, x, 0.42, z, rx, rz));
      }
      h.add(box(0.1, 0.05, 0.1, 0xd8443c, 0, 0.345, -0.06));
      // Olhos meio fechados (pálpebras) e palito de dente.
      h.add(box(0.1, 0.03, 0.015, 0xd9a887, 0.085, 0.135, 0.176));
      h.add(box(0.1, 0.03, 0.015, 0xd9a887, -0.085, 0.135, 0.176));
      h.add(box(0.012, 0.012, 0.14, 0xe8d9a0, 0.06, 0.06, 0.21, [0, 0.7, 0.2]));
    },
  },
};

/** Caixa dos vértices de uma malha (opcionalmente só os presos a um osso), no espaço do MODELO, na pose de repouso. */
function modelBox(model: THREE.Object3D, meshName: string, bone: THREE.Bone | null): THREE.Box3 {
  const mesh = model.getObjectByName(meshName) as THREE.SkinnedMesh | undefined;
  const box3 = new THREE.Box3();
  if (!mesh) return box3.setFromCenterAndSize(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0.45, 0.33, 0.34));
  model.updateMatrixWorld(true);
  const idx = bone && mesh.skeleton ? mesh.skeleton.bones.indexOf(bone) : -1;
  const pos = mesh.geometry.getAttribute('position');
  const skin = mesh.geometry.getAttribute('skinIndex');
  const toModel = model.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (idx >= 0 && skin && skin.getX(i) !== idx) continue;
    // Posição já deformada pelo esqueleto (o que aparece na tela), não a pose de "bind" crua.
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
    else v.fromBufferAttribute(pos, i);
    box3.expandByPoint(v.applyMatrix4(toModel));
  }
  return box3;
}

/** Caixa "canônica" da cabeça usada para desenhar cabelos/acessórios; é mapeada para a caixa real de cada modelo. */
const CANON_HEAD = new THREE.Box3(new THREE.Vector3(-0.227, 0, -0.171), new THREE.Vector3(0.227, 0.328, 0.171));

/** Ponto (no espaço do modelo) da mão: base dos vértices do braço. */
function handPoint(model: THREE.Object3D, bone: THREE.Bone): THREE.Vector3 {
  const b = modelBox(model, 'body-mesh', bone);
  const c = b.getCenter(new THREE.Vector3());
  return new THREE.Vector3(c.x, b.min.y + 0.03, c.z);
}

export function makeBottle(): THREE.Group {
  const g = new THREE.Group();
  const glass = (c: number) => mat(c, { roughness: 0.25, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), glass(0x6b3a1f));
  body.position.y = 0.08;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, 0.09, 8), glass(0x6b3a1f));
  neck.position.y = 0.205;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.06, 8), mat(0xfff4e6));
  label.position.y = 0.08;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 8), mat(0xe8d9a0, { metalness: 0.6 }));
  cap.position.y = 0.255;
  g.add(body, neck, label, cap);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

function makeMug(): THREE.Group {
  const g = new THREE.Group();
  const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.15, 10), mat(0xf2b134, { roughness: 0.3, emissive: 0x3a2000 }));
  beer.position.y = 0.075;
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.07, 0.04, 10), mat(0xffffff));
  foam.position.y = 0.16;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10), mat(0xe9f2f5, { transparent: true, opacity: 0.8 }));
  handle.position.set(0.085, 0.08, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(beer, foam, handle);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export interface CharacterState {
  view: PlayerView;
  now: number;
  /** Direção do olhar (pode vir da revelação). */
  faceX: number;
  faceZ: number;
  speed: number;
  /** 0–1 altura dos punhos no Jo-Ken-Pô. */
  pump: number;
  /** 0–1 progresso bebendo; <0 = não bebendo. */
  drink: number;
}

/**
 * Personagem 3D: modelo animado + molas de "bêbado".
 * Hierarquia: root (posição) → tilt (balanço/tombo no mundo) → facing (rotação Y) → modelo.
 */
export class Character3D {
  readonly root = new THREE.Group();
  readonly tilt = new THREE.Group();
  readonly facing = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly head: THREE.Bone;
  readonly torso: THREE.Bone;
  readonly armL: THREE.Bone;
  readonly armR: THREE.Bone;
  readonly rig = new WobbleRig();
  readonly handR = new THREE.Group();
  /** Grupo preso à cabeça cujas coordenadas seguem CANON_HEAD (topo em y≈0,33, rosto em z≈+0,17). */
  readonly headAnchor = new THREE.Group();
  readonly torsoBox: THREE.Box3;
  /** Grupo no espaço do modelo, preso depois ao tronco (ombreiras, barriga). */
  readonly torsoAnchor: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: Anim | null = null;
  private oneShot: { anim: Anim; until: number } | null = null;
  private prop: THREE.Object3D | null = null;
  private drinkProp: THREE.Object3D;
  private dead = false;
  private tiltDir = new THREE.Vector2(1, 0);
  private yaw = 0;
  /** Rotação de repouso dos ossos ajustados à mão (evita acumular ajustes de um quadro para o outro). */
  private readonly rest = new Map<THREE.Bone, THREE.Euler>();

  constructor(readonly id: CharacterId) {
    const look = LOOKS[id];
    const src = gltf(`chars/${look.base}`);
    this.model = instance(`chars/${look.base}`);
    this.model.scale.setScalar(CHAR_SCALE);
    this.root.add(this.tilt);
    this.tilt.add(this.facing);
    this.facing.add(this.model);

    // Repintura por personagem (corpo e cabeça em texturas separadas).
    for (const [meshName, rules] of [
      ['body-mesh', look.body],
      ['head-mesh', look.head],
    ] as const) {
      const mesh = this.model.getObjectByName(meshName) as THREE.Mesh | undefined;
      if (!mesh) continue;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (m.map && Object.keys(rules).length) m.map = recolorColormap(m.map.image as HTMLImageElement, rules);
      m.roughness = 0.8;
      mesh.material = m;
    }

    const bone = (n: string) => this.model.getObjectByName(n) as THREE.Bone;
    this.head = bone('head');
    this.torso = bone('torso');
    this.armL = bone('arm-left');
    this.armR = bone('arm-right');
    // Acessórios são montados no espaço do modelo (boneco em pé, pose de repouso) e depois presos
    // aos ossos com attach(), que preserva a posição no mundo — assim rotações internas dos ossos não importam.
    const real = modelBox(this.model, 'head-mesh', null);
    const cs = CANON_HEAD.getSize(new THREE.Vector3());
    const rs = real.getSize(new THREE.Vector3());
    const k = new THREE.Vector3(rs.x / cs.x, rs.y / cs.y, rs.z / cs.z);
    this.headAnchor.scale.copy(k);
    this.headAnchor.position.copy(real.min).sub(CANON_HEAD.min.clone().multiply(k));
    this.model.add(this.headAnchor);
    this.torsoBox = modelBox(this.model, 'body-mesh', this.torso);
    this.torsoAnchor = new THREE.Group();
    this.model.add(this.torsoAnchor);
    look.build(this);
    this.model.updateMatrixWorld(true);
    this.head.attach(this.headAnchor);
    this.torso.attach(this.torsoAnchor);
    this.head.traverse((o) => ((o as THREE.Mesh).castShadow = true));

    for (const b of [this.head, this.torso, this.armL, this.armR]) this.rest.set(b, b.rotation.clone());
    this.handR.position.copy(handPoint(this.model, this.armR));
    this.model.add(this.handR);
    this.model.updateMatrixWorld(true);
    this.armR.attach(this.handR);
    if (look.prop) {
      this.prop = look.prop === 'mug' ? makeMug() : makeBottle();
      this.prop.scale.setScalar(1 / CHAR_SCALE);
      this.handR.add(this.prop);
    }
    this.drinkProp = look.prop === 'mug' ? makeMug() : makeBottle();
    this.drinkProp.scale.setScalar(1 / CHAR_SCALE);
    this.drinkProp.visible = false;
    this.handR.add(this.drinkProp);

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of src.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');
  }

  private play(anim: Anim, fade = 0.18): void {
    if (this.current === anim) return;
    const next = this.actions.get(anim);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset();
    if (anim === 'die') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else if (anim.startsWith('attack') || anim === 'emote-yes') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    next.play();
    if (prev) prev.crossFadeTo(next, fade, false);
    this.current = anim;
  }

  /** Animação curta por cima do estado (golpe, rasteira). */
  trigger(anim: Anim, ms: number, now: number): void {
    this.oneShot = { anim, until: now + ms };
    this.current = null;
    this.play(anim, 0.08);
  }

  /** Golpe recebido: arremessa na direção do impacto. */
  hit(fromX: number, fromZ: number, x: number, z: number, strength: number, simNow: number, sweep = false): void {
    const d = new THREE.Vector2(x - fromX, z - fromZ);
    if (d.lengthSq() > 1e-6) this.tiltDir.copy(d.normalize());
    if (sweep) this.rig.sweep(1, simNow);
    else this.rig.hit(-1, 0, 0, 0, strength);
  }

  drunk(simNow: number, ms: number): void {
    this.rig.drunk(simNow, ms);
  }

  /** Posição do mundo da mão direita (para o sinal da revelação). */
  handWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.handR.getWorldPosition(out);
  }

  update(dt: number, s: CharacterState, worldX: number, worldZ: number): void {
    const p = s.view;
    this.root.position.set(worldX, 0, worldZ);

    // Rotação suave para a direção do olhar.
    if (Math.hypot(s.faceX, s.faceZ) > 0.01) {
      const target = Math.atan2(s.faceX, s.faceZ);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 12);
      this.facing.rotation.y = this.yaw;
    }

    // Escolha da animação.
    if (!p.alive) {
      if (!this.dead) {
        this.dead = true;
        this.current = null;
        this.play('die', 0.1);
      }
    } else {
      this.dead = false;
      if (this.oneShot && s.now > this.oneShot.until) {
        this.oneShot = null;
        this.current = null;
      }
      if (!this.oneShot) {
        if (s.drink >= 0) this.play('holding-right');
        else if (s.speed > 30 && !p.stunned) this.play(s.speed > 260 ? 'sprint' : 'walk');
        else this.play('idle');
      }
    }
    const walk = this.actions.get('walk');
    if (walk) walk.timeScale = Math.max(0.6, Math.min(1.6, s.speed / 180));
    for (const [b, r] of this.rest) b.rotation.copy(r);
    this.mixer.update(dt);

    // Molas de bêbado.
    this.rig.update({ x: p.x, y: p.y, alive: p.alive, stunned: p.stunned, holding: p.holding }, dt * 1000, s.now);
    if (p.alive) {
      // Limita o tombo a ~83°: a mola pode passar do ponto, mas o corpo nunca atravessa o chão.
      const t = Math.max(-1.45, Math.min(1.45, this.rig.tilt));
      // Balanço de lado (tela) por padrão; depois de um golpe, tomba na direção do impacto.
      this.tiltDir.lerp(new THREE.Vector2(1, 0), Math.min(1, dt * 0.8));
      this.tilt.rotation.z = -t * this.tiltDir.x;
      this.tilt.rotation.x = t * this.tiltDir.y;
      const sq = Math.max(-0.2, Math.min(0.3, this.rig.squash * 0.25));
      this.tilt.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    } else {
      this.tilt.rotation.set(0, 0, 0);
      this.tilt.scale.set(1, 1, 1);
    }

    // Ajustes procedurais nos ossos (depois da animação).
    if (p.alive) {
      this.head.rotation.z += this.rig.headX * 0.02;
      this.head.rotation.x += this.rig.headY * 0.02;
      this.armL.rotation.z += this.rig.lX * 0.03;
      this.armR.rotation.z += this.rig.rX * 0.03;
      if (s.pump > 0 && !this.oneShot) {
        // Jo-Ken-Pô: os dois punhos sobem e descem juntos, fechados (igual para os 3 símbolos).
        this.armL.rotation.x -= 0.6 + s.pump * 0.9;
        this.armR.rotation.x -= 0.6 + s.pump * 0.9;
      }
      if (s.drink >= 0) {
        // Leva a bebida à boca e inclina a cabeça para trás.
        const sip = Math.sin(s.now / 140) * 0.08;
        this.armR.rotation.x -= 2.3 + sip;
        this.armR.rotation.z -= 0.35;
        this.head.rotation.x -= 0.35 + sip;
      }
    }
    if (this.prop) this.prop.visible = p.alive && !p.holding && s.drink < 0 && !this.oneShot;
    this.drinkProp.visible = s.drink >= 0;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
