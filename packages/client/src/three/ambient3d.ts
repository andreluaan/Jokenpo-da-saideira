import * as THREE from 'three';
import { makeRng, type GameConfig, type GameEvent } from '@ppt/shared';
import { S, toWorld } from './assets';
import type { ArenaHandles } from './arena3d';
import { Extra3D } from './boteco3d';
import { addOutline, makeBottle } from './character3d';
import { buildParedao, type Paredao } from './paredao3d';
import { softCircle } from './textures';

/**
 * Vida no entorno (só visual) — a briga virou evento da cidade:
 * torcida em pé colada na cerca e sentada nas mesas vermelhas, cachorros fazendo ronda por fora,
 * garçom no balcão do Bar do Zé, picape com paredão e faíscas nas churrasqueiras.
 * Usado na partida e no menu (no menu ninguém dispara eventos; a torcida comemora sozinha de vez em quando).
 */

/** Modelos Kenney da torcida e a célula da paleta que é a camisa (para variar a cor). */
const CROWD: { base: string; shirt?: string }[] = [
  { base: 'character-female-a', shirt: 'r2c15' },
  { base: 'character-female-c', shirt: 'r2c11' },
  { base: 'character-male-c', shirt: 'r2c11' },
  { base: 'character-male-e', shirt: 'r3c9' },
  { base: 'character-male-a', shirt: 'r2c3' },
  { base: 'character-male-b', shirt: 'r2c9' },
  { base: 'character-male-f', shirt: 'r2c3' },
  { base: 'character-male-d' },
];
const SHIRTS = [0xd8443c, 0x3b9be8, 0xf2a93b, 0x3dbf7a, 0xa35ce0, 0xfff4e6, 0xffc145, 0x2b1d22, 0xe07a9a, 0x4fb3a8];

const std = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  return b;
}

interface Dog {
  root: THREE.Group;
  legs: THREE.Object3D[];
  tail: THREE.Object3D;
  head: THREE.Object3D;
  body: THREE.Object3D;
  /** Ronda: vai e volta entre dois ângulos da elipse, a `ring` unidades da borda da arena. */
  min: number;
  max: number;
  ring: number;
  angle: number;
  dir: number;
  speed: number;
  restUntil: number;
  nextRest: number;
}

/** Vira-lata low-poly (corpo, cabeça, orelhas, rabo e 4 patas animados). */
function dogModel(furColor: number, bellyColor: number, earColor: number): Pick<Dog, 'root' | 'legs' | 'tail' | 'head' | 'body'> {
  const root = new THREE.Group();
  const fur = std(furColor);
  const light = std(bellyColor);
  const body = new THREE.Group();
  body.position.y = 0.32;
  body.add(box(0.5, 0.22, 0.24, fur, 0, 0, 0));
  body.add(box(0.3, 0.06, 0.2, light, 0.02, -0.11, 0));
  root.add(body);
  const head = new THREE.Group();
  head.position.set(0.3, 0.14, 0);
  head.add(box(0.2, 0.18, 0.18, fur, 0, 0, 0));
  head.add(box(0.12, 0.09, 0.12, light, 0.13, -0.04, 0));
  head.add(box(0.04, 0.04, 0.04, std(0x2b1d22), 0.2, -0.01, 0));
  for (const z of [-0.08, 0.08]) {
    const ear = box(0.06, 0.1, 0.04, std(earColor), -0.02, 0.1, z);
    ear.rotation.x = z > 0 ? 0.4 : -0.4;
    head.add(ear);
    head.add(box(0.025, 0.025, 0.01, std(0x2b1d22), 0.08, 0.04, z * 0.7 + (z > 0 ? 0.03 : -0.03)));
  }
  body.add(head);
  const tail = new THREE.Group();
  tail.position.set(-0.25, 0.06, 0);
  tail.add(box(0.04, 0.2, 0.04, fur, 0, 0.09, 0));
  tail.rotation.z = 0.6;
  body.add(tail);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [
    [0.17, 0.08],
    [0.17, -0.08],
    [-0.17, 0.08],
    [-0.17, -0.08],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.22, z);
    leg.add(box(0.07, 0.22, 0.07, x > 0 ? light : fur, 0, -0.11, 0));
    root.add(leg);
    legs.push(leg);
  }
  root.scale.setScalar(1.3);
  addOutline(root);
  return { root, legs, tail, head, body };
}

interface Fan {
  e: Extra3D;
  base: 'sit' | 'idle';
  cheerUntil: number;
}

/** Faixas de ângulo (na elipse da cerca) sem torcida em pé: porteira/mesa de fora/bar e o meio da frente (não tapar a câmera). */
const NO_CROWD: [number, number][] = [
  [-3.25, -2.2],
  [1.25, 1.9],
];
const inRanges = (a: number, rs: [number, number][]) => rs.some(([lo, hi]) => a >= lo && a <= hi);

export class Ambient3D {
  private readonly fans: Fan[] = [];
  private readonly dogs: Dog[] = [];
  private readonly sparks: { s: THREE.Sprite; t: number; life: number; x: number; z: number; vx: number; vz: number }[] = [];
  private readonly waiter: Extra3D;
  private readonly paredao: Paredao;
  private energy = 0.6;
  private time = 0;
  private nextIdleCheer = 3;
  private readonly rng = makeRng(77);

  constructor(
    scene: THREE.Scene,
    private readonly cfg: GameConfig,
    arena: ArenaHandles,
    private readonly popup: (at: THREE.Vector3, text: string, color: string, size?: number, ms?: number) => void = () => {},
  ) {
    const rng = this.rng;
    const pickLook = () => {
      const c = CROWD[Math.floor(rng() * CROWD.length)];
      const body: Record<string, number> = {};
      if (c.shirt) body[c.shirt] = SHIRTS[Math.floor(rng() * SHIRTS.length)];
      return new Extra3D(c.base, body);
    };
    const ax = cfg.arena.rx * S;
    const az = cfg.arena.ry * S;

    // Alguns na cerca, espaçados (nada de paredão de gente: dá sensação de aperto).
    const ring = 0.78;
    for (let i = 0, a = -Math.PI; a < Math.PI && i < 20; i++) {
      a += 0.38 + rng() * 0.42;
      if (inRanges(a, NO_CROWD)) continue;
      const x = Math.cos(a) * (ax + ring);
      const z = Math.sin(a) * (az + ring);
      const e = pickLook();
      e.root.position.set(x, 0, z);
      e.root.rotation.y = Math.atan2(-x, -z) + (rng() - 0.5) * 0.4;
      e.play('idle');
      e.offset(rng() * 2);
      if (rng() < 0.4) e.holdBottle();
      scene.add(e.root);
      this.fans.push({ e, base: 'idle', cheerUntil: 0 });
    }
    // A maioria assiste sentada nas mesas, tomando uma.
    for (const seat of arena.fanSeats) {
      if (rng() < 0.15) continue;
      const e = pickLook();
      e.root.position.copy(seat.pos).setY(0.14);
      e.root.rotation.y = Math.atan2(seat.face.x, seat.face.z);
      e.play('sit');
      e.offset(rng() * 2);
      e.holdBottle();
      scene.add(e.root);
      this.fans.push({ e, base: 'sit', cheerUntil: 0 });
    }
    // Rodinhas em pé, de cerveja na mão, conversando (uma delas perto do paredão).
    for (const h of arena.hangouts) {
      const n = 3 + Math.floor(rng() * 2);
      const a0 = rng() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * Math.PI * 2 + (rng() - 0.5) * 0.4;
        const r = 0.55 + rng() * 0.15;
        const e = pickLook();
        e.root.position.set(h.x + Math.cos(a) * r, 0, h.z + Math.sin(a) * r);
        e.root.rotation.y = Math.atan2(h.x - e.root.position.x, h.z - e.root.position.z);
        e.play('idle');
        e.offset(rng() * 2);
        e.holdBottle();
        scene.add(e.root);
        this.fans.push({ e, base: 'idle', cheerUntil: 0 });
      }
    }

    // Garçom no balcão do Bar do Zé (sai de lá para atravessar a arena nos eventos).
    this.waiter = new Extra3D('character-male-e', { r2c5: 0x2b1d22 });
    this.waiter.root.position.copy(arena.barWaiter.pos);
    this.waiter.root.rotation.y = arena.barWaiter.yaw;
    const bottle = makeBottle();
    bottle.scale.setScalar(0.9);
    bottle.position.set(0.3, 0.62, 0.15);
    this.waiter.root.add(bottle);
    this.waiter.play('idle');
    scene.add(this.waiter.root);

    // Picape com paredão.
    this.paredao = buildParedao();
    this.paredao.root.position.copy(arena.truck.pos);
    this.paredao.root.rotation.y = arena.truck.yaw;
    this.paredao.root.scale.setScalar(0.85);
    scene.add(this.paredao.root);

    // Cachorros fazendo ronda por fora da torcida (cada um no seu trecho).
    for (const [fur, belly, ear, min, max, r, speed] of [
      [0xc98a4b, 0xf0d2a6, 0x8a5a33, -0.9, 1.0, 1.7, 1.1],
      [0x2b2630, 0x4a4450, 0x1a161d, 0.7, 2.1, 1.7, 0.9],
      [0xf4efe6, 0xffffff, 0x8a5a33, -2.1, -1.3, 1.7, 1.3],
    ] as const) {
      const m = dogModel(fur, belly, ear);
      scene.add(m.root);
      this.dogs.push({ ...m, min, max, ring: r, angle: min + rng() * (max - min), dir: rng() < 0.5 ? 1 : -1, speed, restUntil: 0, nextRest: 3 + rng() * 6 });
    }

    // Faíscas das churrasqueiras.
    const tex = softCircle();
    for (const o of cfg.obstacles) {
      if (o.prop !== 'grill' || o.kind !== 'circle') continue;
      const g = toWorld(cfg, o.x, o.y);
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(0.06);
        scene.add(s);
        this.sparks.push({ s, t: Math.random(), life: 0.8 + Math.random() * 0.8, x: g.x, z: g.z, vx: 0, vz: 0 });
      }
    }
  }

  /** Torcida e cachorros reagem aos golpes, eliminações e eventos; o paredão aumenta o volume. */
  onEvent(e: GameEvent): void {
    if (e.type === 'exchange' && e.damagedId) {
      const big = !!e.finisher;
      for (const f of this.fans) if (this.rng() < (big ? 0.7 : 0.3)) this.cheer(f, big ? 'jump' : 'emote-yes');
      if (big) this.bark(Math.floor(this.rng() * this.dogs.length));
      this.energy = Math.min(1, this.energy + (big ? 0.35 : 0.15));
    } else if (e.type === 'eliminated') {
      for (const f of this.fans) this.cheer(f, 'jump');
      this.dogs.forEach((_, i) => this.bark(i));
      this.energy = 1;
    } else if (e.type === 'barEvent' && e.stage === 'start') {
      for (const f of this.fans) this.cheer(f, 'emote-yes');
      this.energy = 1;
    }
  }

  /** O garçom do balcão some enquanto o garçom do evento atravessa a arena. */
  setWaiterAway(away: boolean): void {
    this.waiter.root.visible = !away;
  }

  private cheer(f: Fan, anim: string): void {
    if (this.time < f.cheerUntil) return;
    f.cheerUntil = this.time + 1.2;
    setTimeout(() => f.e.once(anim, f.base), this.rng() * 300);
  }

  private bark(i: number): void {
    const d = this.dogs[i];
    if (!d) return;
    this.popup(d.root.position.clone().setY(1), 'Au! Au!', '#fff4e6', 16, 900);
    d.restUntil = this.time + 1.2;
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.fans) f.e.update(dt);
    this.waiter.update(dt);
    // Sem briga, a torcida comemora sozinha de vez em quando (no menu também).
    if (this.time > this.nextIdleCheer) {
      this.nextIdleCheer = this.time + 1.5 + this.rng() * 3;
      const f = this.fans[Math.floor(this.rng() * this.fans.length)];
      if (f) this.cheer(f, this.rng() < 0.5 ? 'emote-yes' : 'jump');
    }
    this.energy += (0.6 - this.energy) * Math.min(1, dt * 0.4);
    this.paredao.update(this.time, this.energy);
    this.dogs.forEach((d) => this.updateDog(d, dt));
    this.updateSparks(dt);
  }

  private updateDog(d: Dog, dt: number): void {
    const rx = this.cfg.arena.rx * S + d.ring;
    const rz = this.cfg.arena.ry * S + d.ring;
    const resting = this.time < d.restUntil;
    if (!resting && this.time > d.nextRest) {
      // Para, senta e abana o rabo; às vezes dá meia-volta.
      d.restUntil = this.time + 1.5 + this.rng() * 2;
      d.nextRest = d.restUntil + 4 + this.rng() * 7;
      if (this.rng() < 0.35) d.dir *= -1;
    }
    const circ = Math.PI * (rx + rz);
    if (!resting) d.angle += ((d.speed / circ) * Math.PI * 2 * d.dir) * dt;
    if (d.angle > d.max || d.angle < d.min) {
      d.angle = Math.max(d.min, Math.min(d.max, d.angle));
      d.dir *= -1;
    }
    d.root.position.set(Math.cos(d.angle) * rx, 0, Math.sin(d.angle) * rz);
    const tx = -Math.sin(d.angle) * rx * d.dir;
    const tz = Math.cos(d.angle) * rz * d.dir;
    d.root.rotation.y = Math.atan2(-tz, tx);
    const step = this.time * 11 * d.speed;
    d.legs.forEach((l, i) => (l.rotation.z = resting ? 0 : Math.sin(step + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55));
    d.body.position.y = 0.32 + (resting ? -0.05 : Math.abs(Math.sin(step)) * 0.025);
    d.body.rotation.z = resting ? 0.25 : 0;
    d.tail.rotation.x = Math.sin(this.time * (resting ? 22 : 9)) * 0.6;
    d.head.rotation.y = resting ? Math.sin(this.time * 1.5) * 0.4 : 0;
  }

  /** Faíscas da brasa subindo e apagando. */
  private updateSparks(dt: number): void {
    for (const p of this.sparks) {
      p.t += dt / p.life;
      if (p.t >= 1) {
        p.t = 0;
        p.life = 0.8 + Math.random() * 0.8;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vz = (Math.random() - 0.5) * 0.4;
        p.s.position.set(p.x + (Math.random() - 0.5) * 0.5, 0.68, p.z + (Math.random() - 0.5) * 0.5);
      }
      p.s.position.x += p.vx * dt + Math.sin(this.time * 6 + p.life * 10) * 0.004;
      p.s.position.z += p.vz * dt;
      p.s.position.y += (0.9 - p.t * 0.4) * dt;
      (p.s.material as THREE.SpriteMaterial).opacity = Math.sin(p.t * Math.PI) * 0.95;
      p.s.scale.setScalar(0.05 + (1 - p.t) * 0.04);
    }
  }

  destroy(): void {
    for (const f of this.fans) f.e.root.removeFromParent();
    for (const d of this.dogs) d.root.removeFromParent();
    for (const p of this.sparks) p.s.removeFromParent();
    this.waiter.root.removeFromParent();
    this.paredao.root.removeFromParent();
  }
}
