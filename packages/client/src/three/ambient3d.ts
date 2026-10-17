import * as THREE from 'three';
import type { GameConfig, GameEvent } from '@ppt/shared';
import { S, toWorld } from './assets';
import type { ArenaHandles } from './arena3d';
import { Extra3D } from './boteco3d';
import { addOutline } from './character3d';
import { softCircle } from './textures';

/**
 * Vida no entorno (só visual): torcida nas mesas de fora reagindo aos golpes, o cachorro do bar
 * passeando em volta da cerca e faíscas subindo das churrasqueiras.
 */

const std = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });

function box(w: number, h: number, d: number, color: number | THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? std(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Vira-lata caramelo low-poly: corpo, cabeça, orelhas, rabo e 4 patas (rabo e patas animados). */
function dogModel(): { root: THREE.Group; legs: THREE.Object3D[]; tail: THREE.Object3D; head: THREE.Object3D; body: THREE.Object3D } {
  const root = new THREE.Group();
  const fur = std(0xc98a4b);
  const light = std(0xf0d2a6);
  const body = new THREE.Group();
  body.position.y = 0.32;
  body.add(box(0.5, 0.22, 0.24, fur, 0, 0, 0));
  body.add(box(0.3, 0.06, 0.2, light, 0.02, -0.11, 0));
  root.add(body);
  const head = new THREE.Group();
  head.position.set(0.3, 0.14, 0);
  head.add(box(0.2, 0.18, 0.18, fur, 0, 0, 0));
  head.add(box(0.12, 0.09, 0.12, light, 0.13, -0.04, 0));
  head.add(box(0.04, 0.04, 0.04, 0x2b1d22, 0.2, -0.01, 0));
  for (const z of [-0.08, 0.08]) {
    const ear = box(0.06, 0.1, 0.04, 0x8a5a33, -0.02, 0.1, z);
    ear.rotation.x = z > 0 ? 0.4 : -0.4;
    head.add(ear);
    head.add(box(0.025, 0.025, 0.01, 0x2b1d22, 0.08, 0.04, z * 0.7 + (z > 0 ? 0.03 : -0.03)));
  }
  body.add(head);
  const tail = new THREE.Group();
  tail.position.set(-0.25, 0.06, 0);
  const t = box(0.04, 0.2, 0.04, fur, 0, 0.09, 0);
  tail.add(t);
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
  addOutline(root);
  return { root, legs, tail, head, body };
}

interface Fan {
  e: Extra3D;
  base: 'sit' | 'idle';
  cheerUntil: number;
}

export class Ambient3D {
  private readonly fans: Fan[] = [];
  private readonly dog = dogModel();
  private dogAngle = 2.2;
  private dogDir = 1;
  private dogRestUntil = 0;
  private dogNextRest = 6;
  private readonly sparks: { s: THREE.Sprite; t: number; life: number; x: number; z: number; vx: number; vz: number }[] = [];
  private readonly grills: THREE.Vector3[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private readonly cfg: GameConfig,
    arena: ArenaHandles,
    private readonly popup: (at: THREE.Vector3, text: string, color: string, size?: number, ms?: number) => void,
  ) {
    // Torcida: dois sentados na mesa de fora do bar, dois em pé perto das mesas vermelhas.
    const seated: [string, number][] = [
      ['character-female-a', 0],
      ['character-male-c', 2],
    ];
    for (const [base, i] of seated) {
      const seat = arena.seats[i];
      if (!seat) continue;
      const e = new Extra3D(base);
      e.root.position.copy(seat.pos).setY(0.14); // mesma altura de quem senta no menu (SIT_Y)
      e.root.rotation.y = Math.atan2(seat.face.x, seat.face.z);
      e.play('sit');
      scene.add(e.root);
      this.fans.push({ e, base: 'sit', cheerUntil: 0 });
    }
    for (const [base, x, z] of [
      ['character-female-c', 8.9, 3.9],
      ['character-female-a', 9.7, 1.7],
    ] as const) {
      const e = new Extra3D(base, base === 'character-female-a' ? { r2c15: 0xd8443c, r2c11: 0x3f4a8a } : {});
      e.root.position.set(x, 0, z);
      e.root.rotation.y = Math.atan2(-x, -z); // olhando para o ringue
      e.play('idle');
      scene.add(e.root);
      this.fans.push({ e, base: 'idle', cheerUntil: 0 });
    }

    this.dog.root.scale.setScalar(1.3);
    scene.add(this.dog.root);

    for (const o of cfg.obstacles) if (o.prop === 'grill' && o.kind === 'circle') this.grills.push(toWorld(cfg, o.x, o.y));
    const tex = softCircle();
    for (const g of this.grills) {
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(0.06);
        scene.add(s);
        this.sparks.push({ s, t: Math.random(), life: 0.8 + Math.random() * 0.8, x: g.x, z: g.z, vx: 0, vz: 0 });
      }
    }
  }

  /** Torcida e cachorro reagem aos golpes e às eliminações. */
  onEvent(e: GameEvent): void {
    if (e.type === 'exchange' && e.damagedId) {
      const big = !!e.finisher;
      for (const f of this.fans) if (Math.random() < (big ? 0.85 : 0.45)) this.cheer(f, big ? 'jump' : 'emote-yes');
      if (big && Math.random() < 0.5) this.bark();
    } else if (e.type === 'eliminated') {
      for (const f of this.fans) this.cheer(f, 'jump');
      this.bark();
    } else if (e.type === 'barEvent' && e.stage === 'start') {
      for (const f of this.fans) this.cheer(f, 'emote-yes');
    }
  }

  private cheer(f: Fan, anim: string): void {
    if (this.time < f.cheerUntil) return;
    f.cheerUntil = this.time + 1.2;
    // Pequeno atraso para não pularem todos juntos.
    setTimeout(() => f.e.once(anim, f.base), Math.random() * 250);
  }

  private bark(): void {
    const p = this.dog.root.position.clone().setY(1);
    this.popup(p, 'Au! Au!', '#fff4e6', 16, 900);
    this.dogRestUntil = this.time + 1.2;
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.fans) f.e.update(dt);
    this.updateDog(dt);
    this.updateSparks(dt);
  }

  private updateDog(dt: number): void {
    const { arena } = this.cfg;
    const rx = arena.rx * S + 1.15;
    const rz = arena.ry * S + 1.15;
    const d = this.dog;
    const resting = this.time < this.dogRestUntil;
    if (!resting && this.time > this.dogNextRest) {
      // De vez em quando para, senta e abana o rabo; às vezes volta pelo outro lado.
      this.dogRestUntil = this.time + 1.5 + Math.random() * 2;
      this.dogNextRest = this.dogRestUntil + 5 + Math.random() * 8;
      if (Math.random() < 0.35) this.dogDir *= -1;
    }
    const speed = resting ? 0 : 1.1; // unidades/s
    const circ = Math.PI * (rx + rz);
    this.dogAngle += ((speed / circ) * Math.PI * 2 * this.dogDir) * dt;
    const x = Math.cos(this.dogAngle) * rx;
    const z = Math.sin(this.dogAngle) * rz;
    d.root.position.set(x, 0, z);
    // Tangente da elipse = direção do passo.
    const tx = -Math.sin(this.dogAngle) * rx * this.dogDir;
    const tz = Math.cos(this.dogAngle) * rz * this.dogDir;
    d.root.rotation.y = Math.atan2(-tz, tx);
    const step = this.time * 11;
    d.legs.forEach((l, i) => (l.rotation.z = resting ? 0 : Math.sin(step + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.55));
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
    this.dog.root.removeFromParent();
    for (const p of this.sparks) p.s.removeFromParent();
  }
}
