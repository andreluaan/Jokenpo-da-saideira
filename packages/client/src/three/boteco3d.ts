import * as THREE from 'three';
import type { GameConfig, GameEvent, Snapshot } from '@ppt/shared';
import { S, gltf, instance, toWorld } from './assets';
import type { ArenaHandles } from './arena3d';
import { CHAR_SCALE, addOutline, handPoint, makeBottle, type Character3D } from './character3d';
import { recolorColormap, softCircle } from './textures';

/**
 * Visual do "boteco vivo": itens no chão, poças, engradado quebrando, freezer abrindo, escudo de gelo,
 * queimadura na churrasqueira e o garçom. Só lê snapshot/eventos — regras ficam na simulação.
 */

export interface BotecoDeps {
  scene: THREE.Scene;
  cfg: GameConfig;
  arena: ArenaHandles;
  /** Personagem 3D de cada jogador (para animações e efeitos presos ao corpo). */
  character(id: string): Character3D | undefined;
  puff(at: THREE.Vector3, color: number, n: number): void;
  popup(at: THREE.Vector3, text: string, color: string, size?: number, ms?: number): void;
  localId: string;
  simNow(): number;
}

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const SOFT = softCircle();

// ------------------------------------------------------------------ modelos dos itens

/** Long neck "GELADA" em pé no chão (largada pelo garçom no evento do Zé). */
function beerModel(): THREE.Object3D {
  const b = makeBottle();
  b.scale.setScalar(1.4);
  addOutline(b);
  return b;
}

const BEER_GLOW = 0xffd27a;

// ------------------------------------------------------------------ figurante (garçom)

/** Personagem extra da Kenney com animações (garçom, torcida). */
export class Extra3D {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private readonly model: THREE.Object3D;
  private readonly armR: THREE.Bone | undefined;
  private readonly head: THREE.Bone | undefined;
  private readonly rest = new Map<THREE.Bone, THREE.Euler>();
  /** Gole de cerveja (só quem segura garrafa): progresso 0–1 e quando é o próximo. */
  private sip = -1;
  private nextSip = 2 + Math.random() * 6;
  private holding = false;

  constructor(base: string, body: Record<string, number> = {}, scale = CHAR_SCALE) {
    const model = instance(`chars/${base}`);
    this.model = model;
    model.scale.setScalar(scale);
    // Repintura da paleta Kenney no corpo (mesmo esquema dos personagens jogáveis).
    const bm = model.getObjectByName('body-mesh') as THREE.Mesh | undefined;
    if (bm && Object.keys(body).length) {
      const m = (bm.material as THREE.MeshStandardMaterial).clone();
      if (m.map) m.map = recolorColormap(m.map.image as HTMLImageElement, body);
      bm.material = m;
    }
    this.root.add(model);
    addOutline(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf(`chars/${base}`).animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.armR = model.getObjectByName('arm-right') as THREE.Bone | undefined;
    this.head = model.getObjectByName('head') as THREE.Bone | undefined;
    for (const b of [this.armR, this.head]) if (b) this.rest.set(b, b.rotation.clone());
  }

  /** Long neck na mão direita; de vez em quando leva à boca e dá um gole. */
  holdBottle(): void {
    if (!this.armR || this.holding) return;
    this.holding = true;
    const hand = new THREE.Group();
    hand.position.copy(handPoint(this.model, this.armR));
    this.model.add(hand);
    this.model.updateMatrixWorld(true);
    this.armR.attach(hand);
    const b = makeBottle();
    b.scale.setScalar(1 / this.model.scale.x); // sem contorno: garrafa pequenininha, economiza desenho
    hand.add(b);
  }

  play(name: string, fade = 0.2): void {
    if (this.current === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.actions.get(this.current);
    next.reset().play();
    if (prev) prev.crossFadeTo(next, fade, false);
    this.current = name;
  }

  /** Animação curta que volta para `back` depois. */
  once(name: string, back: string): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.current = '';
    this.play(name, 0.1);
    const done = () => {
      this.mixer.removeEventListener('finished', done);
      this.current = '';
      this.play(back);
    };
    this.mixer.addEventListener('finished', done);
  }

  update(dt: number): void {
    for (const [b, r] of this.rest) b.rotation.copy(r);
    this.mixer.update(dt);
    if (!this.holding || !this.armR) return;
    // Gole: o braço sobe até a boca e a cabeça vai para trás (igual aos jogadores bebendo).
    this.nextSip -= dt;
    if (this.sip < 0 && this.nextSip <= 0) {
      this.sip = 0;
      this.nextSip = 4 + Math.random() * 7;
    }
    if (this.sip >= 0) {
      this.sip += dt / 1.6;
      const k = Math.sin(Math.min(1, this.sip) * Math.PI);
      this.armR.rotation.x -= 2.2 * k;
      this.armR.rotation.z -= 0.3 * k;
      if (this.head) this.head.rotation.x -= 0.35 * k;
      if (this.sip >= 1) this.sip = -1;
    }
  }

  /** Adianta a animação (para a torcida não balançar toda igual). */
  offset(seconds: number): void {
    this.mixer.update(seconds);
  }
}

/** Bandeja com garrafas que o garçom carrega na mão. */
function trayModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), std(0xc9ccd2, { metalness: 0.5, roughness: 0.35 })));
  for (let i = 0; i < 3; i++) {
    const b = makeBottle();
    b.scale.setScalar(0.8);
    b.position.set(Math.cos(i * 2.1) * 0.09, 0.01, Math.sin(i * 2.1) * 0.09);
    g.add(b);
  }
  return g;
}

// ------------------------------------------------------------------ cena

interface Debris {
  m: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
}

export class Boteco3D {
  private readonly items = new Map<number, { g: THREE.Group; glow: THREE.Mesh; born: number }>();
  private readonly puddles = new Map<number, THREE.Mesh>();
  private readonly shields = new Map<string, THREE.Mesh>();
  private debris: Debris[] = [];
  private readonly lidAngle = new Map<number, number>();
  private waiter: { e: Extra3D; tray: THREE.Group; wobble: number } | null = null;
  private dim = 0;
  private readonly brokenSeen = new Set<number>();
  private readonly nextSplash = new Map<string, number>();
  private readonly lastPos = new Map<string, { x: number; y: number }>();
  private seenItems = new Set<number>();
  private readonly t0 = performance.now();

  constructor(private readonly d: BotecoDeps) {}

  private w(x: number, y: number, h = 0): THREE.Vector3 {
    return toWorld(this.d.cfg, x, y).setY(h);
  }

  // ---------------------------------------------------------------- eventos

  onEvent(e: GameEvent): void {
    const { d } = this;
    switch (e.type) {
      case 'pickup': {
        d.puff(this.w(e.x, e.y, 0.3), BEER_GLOW, 8);
        break;
      }
      case 'burn': {
        const at = this.w(e.x, e.y, 0.4);
        d.puff(at, 0xff7a2f, 12);
        d.puff(at.clone().setY(1.2), 0x6b5b55, 6);
        d.popup(at.clone().setY(1.9), 'AI, QUENTE!', '#ff7a2f', 22, 1100);
        const c = d.character(e.playerId);
        c?.hit(at.x, at.z - 1, at.x, at.z, 1.3, d.simNow());
        // Pulinho de dor.
        c?.trigger('jump', 500, d.simNow());
        break;
      }
      case 'crate': {
        const g = d.arena.props[e.index];
        if (!g) break;
        const o = d.cfg.obstacles[e.index];
        const c = o.kind === 'rect' ? this.w(o.x + o.w / 2, o.y + o.h / 2) : this.w(o.x, o.y);
        if (e.broken) this.breakCrate(e.index, c);
        else {
          // Rachou: chacoalha e tomba um tiquinho.
          g.userData.shake = 1;
          g.rotation.z = (Math.random() - 0.5) * 0.12;
          d.puff(c.clone().setY(0.3), 0xf2b134, 6);
        }
        break;
      }
      case 'shield': {
        const c = d.character(e.playerId);
        if (e.stage === 'start') c?.trigger('interact-right', d.cfg.hazards.freezer.openMs, d.simNow());
        if (e.stage === 'ready') c?.trigger('emote-yes', 600, d.simNow());
        if (e.stage === 'broken') {
          const s = this.shields.get(e.playerId);
          const at = s ? s.position.clone() : new THREE.Vector3();
          d.puff(at, 0xbfe9ff, 14);
          d.popup(at.clone().setY(1.8), 'O gelo segurou!', '#8ecae6', 20, 1100);
        }
        if (e.stage === 'ready' && e.playerId === d.localId) {
          const s = this.shields.get(e.playerId);
          if (s) d.popup(s.position.clone().setY(1.8), '🧊 Escudo de gelo!', '#bfe9ff', 18, 1200);
        }
        break;
      }
      case 'waiterBump': {
        const at = this.w(e.x, e.y, 0.4);
        d.puff(at, 0xffffff, 6);
        d.popup(at.clone().setY(1.8), 'Opa, licença!', '#fff4e6', 18, 900);
        if (this.waiter) this.waiter.wobble = 1;
        d.character(e.playerId)?.hit(at.x - 0.5, at.z, at.x, at.z, 1.1, d.simNow());
        break;
      }
    }
  }

  private breakCrate(index: number, c: THREE.Vector3): void {
    const g = this.d.arena.props[index];
    if (!g || this.brokenSeen.has(index)) return;
    this.brokenSeen.add(index);
    g.visible = false;
    this.d.puff(c.clone().setY(0.3), 0xf2b134, 14);
    this.d.puff(c.clone().setY(0.2), 0xe9c46a, 10);
    // Pedaços de engradado e cacos de garrafa voando.
    const mats = [std(0xf2b134), std(0x4f9a5c), std(0x6b3a1f, { roughness: 0.3 })];
    for (let i = 0; i < 18; i++) {
      const big = i < 8;
      const m = part(big ? new THREE.BoxGeometry(0.16, 0.05, 0.12) : new THREE.BoxGeometry(0.04, 0.08, 0.04), mats[big ? i % 2 : 2]);
      m.position.copy(c).setY(0.3);
      this.d.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2;
      this.debris.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), t: 0 });
    }
  }

  // ---------------------------------------------------------------- quadro

  update(snap: Snapshot, now: number, dt: number): void {
    const t = (performance.now() - this.t0) / 1000;
    this.syncItems(snap, t);
    this.syncPuddles(snap, now);
    for (const i of snap.broken) {
      const o = this.d.cfg.obstacles[i];
      if (!this.brokenSeen.has(i) && o.kind === 'rect') this.breakCrate(i, this.w(o.x + o.w / 2, o.y + o.h / 2));
    }
    this.updateCrates(dt);
    this.updateFreezers(snap, now, dt);
    this.updatePlayerFx(snap, t);
    this.updateQuirks(snap, now);
    this.updateWaiter(snap, dt);
    this.updateDebris(dt);
    // Queda de luz: escurece suave na entrada e na saída.
    const ev = snap.barEvent;
    const dark = ev && ev.kind === 'blackout' && now >= ev.startAt && now < ev.endAt ? 1 : 0;
    this.dim += (dark - this.dim) * Math.min(1, dt * (dark ? 6 : 2.5));
    this.d.arena.setDim(this.dim);
  }

  /** Quem anda numa poça escorrega e respinga. */
  private updateQuirks(snap: Snapshot, now: number): void {
    for (const p of snap.players) {
      if (!p.alive) continue;
      const c = this.d.character(p.id);
      if (!c) continue;
      const pos = c.root.position;
      const last = this.lastPos.get(p.id);
      this.lastPos.set(p.id, { x: p.x, y: p.y });
      const moving = !!last && Math.hypot(p.x - last.x, p.y - last.y) > 1.5;
      const wet = snap.puddles.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r);
      if (wet && moving && now >= (this.nextSplash.get(p.id) ?? 0)) {
        this.nextSplash.set(p.id, now + 420);
        this.d.puff(pos.clone().setY(0.05), 0xe0a83a, 4);
        // Escorregão: o corpo dá uma balançada (molas do rig).
        c.hit(pos.x - (p.x - last!.x), pos.z - (p.y - last!.y), pos.x, pos.z, 0.5, this.d.simNow());
      }
    }
  }

  get blackout(): boolean {
    return this.dim > 0.5;
  }

  private syncItems(snap: Snapshot, t: number): void {
    const alive = new Set(snap.items.map((i) => i.id));
    // Cerveja nova enquanto o garçom passa = ele se abaixou para largar.
    if (this.waiter && snap.items.some((i) => i.kind === 'beer' && !this.seenItems.has(i.id))) this.waiter.e.once('interact-right', 'walk');
    this.seenItems = alive;
    for (const [id, it] of this.items) {
      if (alive.has(id)) continue;
      it.g.removeFromParent();
      it.glow.removeFromParent();
      this.items.delete(id);
    }
    for (const i of snap.items) {
      let it = this.items.get(i.id);
      if (!it) {
        const g = new THREE.Group();
        g.add(beerModel());
        const glow = new THREE.Mesh(
          new THREE.CircleGeometry(0.42, 24),
          new THREE.MeshBasicMaterial({ map: SOFT, color: BEER_GLOW, transparent: true, opacity: 0.6, depthWrite: false }),
        );
        glow.rotation.x = -Math.PI / 2;
        this.d.scene.add(g, glow);
        it = { g, glow, born: t };
        this.items.set(i.id, it);
      }
      const p = this.w(i.x, i.y);
      // Em pé no chão, onde o garçom largou (só um brilho fraquinho embaixo para achar).
      it.g.position.set(p.x, 0, p.z);
      it.g.rotation.y = i.id * 1.7;
      it.g.scale.setScalar(1.2 * Math.min(1, (t - it.born) / 0.2 + 0.2));
      it.glow.position.set(p.x, 0.015, p.z);
    }
  }

  private syncPuddles(snap: Snapshot, now: number): void {
    const alive = new Set(snap.puddles.map((q) => q.id));
    for (const [id, m] of this.puddles) {
      if (alive.has(id)) continue;
      m.removeFromParent();
      this.puddles.delete(id);
    }
    for (const q of snap.puddles) {
      let m = this.puddles.get(q.id);
      if (!m) {
        // Contorno irregular de poça (sempre igual para o mesmo id).
        const shape = new THREE.Shape();
        const n = 14;
        for (let k = 0; k <= n; k++) {
          const a = (k / n) * Math.PI * 2;
          const r = 1 + Math.sin(a * 3 + q.id) * 0.12 + Math.sin(a * 5 + q.id * 2) * 0.08;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (k === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        m = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ color: 0xd99a2a, transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0.3, depthWrite: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.receiveShadow = true;
        m.userData.born = performance.now();
        this.d.scene.add(m);
        this.puddles.set(q.id, m);
      }
      const p = this.w(q.x, q.y, 0.012);
      m.position.copy(p);
      // Espalha ao aparecer e seca no fim.
      const grow = Math.min(1, (performance.now() - (m.userData.born as number)) / 500);
      const left = q.until - now;
      const r = q.r * S * grow;
      m.scale.set(r, r * 0.8, 1);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.6 * Math.min(1, left / 1500);
    }
  }

  private updateCrates(dt: number): void {
    this.d.arena.props.forEach((g) => {
      if (!g || !g.userData.shake) return;
      g.userData.shake = Math.max(0, (g.userData.shake as number) - dt * 3);
      g.position.y = Math.abs(Math.sin(g.userData.shake * 20)) * 0.04 * g.userData.shake;
    });
  }

  /** Tampa de vidro do freezer abre enquanto alguém está abrindo (e fecha depois). */
  private updateFreezers(snap: Snapshot, now: number, dt: number): void {
    const R = this.d.cfg.player.radius + this.d.cfg.hazards.freezer.reach + 10;
    for (const f of snap.freezers) {
      const g = this.d.arena.props[f.index];
      const lid = g?.userData.lid as THREE.Group | undefined;
      if (!lid) continue;
      const o = this.d.cfg.obstacles[f.index];
      if (o.kind !== 'rect') continue;
      const opening = snap.players.some((p) => {
        if (p.openingUntil <= now) return false;
        const nx = Math.max(o.x, Math.min(p.x, o.x + o.w));
        const ny = Math.max(o.y, Math.min(p.y, o.y + o.h));
        return Math.hypot(p.x - nx, p.y - ny) < R;
      });
      const cur = this.lidAngle.get(f.index) ?? 0;
      const next = cur + ((opening ? 1.15 : 0) - cur) * Math.min(1, dt * (opening ? 5 : 3));
      this.lidAngle.set(f.index, next);
      lid.rotation.x = -next;
      // Vapor gelado saindo enquanto a tampa está aberta.
      if (next > 0.4 && Math.random() < dt * 8) {
        const c = this.w(o.x + o.w / 2 + (Math.random() - 0.5) * o.w, o.y + o.h / 2, 0.7);
        this.d.puff(c, 0xe8f6ff, 2);
      }
    }
  }

  /** Escudo de gelo do freezer. */
  private updatePlayerFx(snap: Snapshot, t: number): void {
    for (const p of snap.players) {
      const pos = this.w(p.x, p.y);
      let s = this.shields.get(p.id);
      if (p.alive && p.shielded) {
        if (!s) {
          s = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.62, 1),
            new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x4fa6d8, emissiveIntensity: 0.4, transparent: true, opacity: 0.32, roughness: 0.1, flatShading: true, depthWrite: false }),
          );
          this.d.scene.add(s);
          this.shields.set(p.id, s);
        }
        s.position.copy(pos).setY(0.55);
        s.rotation.y = t * 0.8;
        s.scale.setScalar(1 + Math.sin(t * 5) * 0.03);
      } else if (s) {
        s.removeFromParent();
        this.shields.delete(p.id);
      }
    }
  }

  private updateWaiter(snap: Snapshot, dt: number): void {
    const w = snap.waiter;
    if (!w) {
      if (this.waiter) {
        this.waiter.e.root.removeFromParent();
        this.waiter = null;
      }
      return;
    }
    if (!this.waiter) {
      // Garçom de boteco: jaleco branco com gravata-borboleta preta.
      const e = new Extra3D('character-male-e', { r2c5: 0x2b1d22 });
      const tray = trayModel();
      tray.position.set(0.31, 0.92, 0.07); // bandeja erguida ao lado do ombro
      e.root.add(tray);
      e.play('walk');
      this.d.scene.add(e.root);
      this.waiter = { e, tray, wobble: 0 };
      this.d.popup(this.w(w.x, w.y, 2), '🍽️ Olha o garçom!', '#fff4e6', 18, 1200);
    }
    const { e, tray } = this.waiter;
    e.root.position.copy(this.w(w.x, w.y));
    e.root.rotation.y = Math.atan2(w.faceX, w.faceY);
    // Bandeja balança quando esbarram nele.
    this.waiter.wobble = Math.max(0, this.waiter.wobble - dt * 2);
    tray.rotation.z = Math.sin(performance.now() / 60) * 0.25 * this.waiter.wobble;
    e.update(dt);
  }

  private updateDebris(dt: number): void {
    for (const p of this.debris) {
      p.t += dt;
      p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.03) {
        p.m.position.y = 0.03;
        p.v.multiplyScalar(0.4);
        p.v.y = Math.abs(p.v.y) * 0.3;
        p.spin.multiplyScalar(0.5);
      }
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      if (p.t > 4) p.m.scale.setScalar(Math.max(0.01, 1 - (p.t - 4)));
    }
    this.debris = this.debris.filter((p) => {
      if (p.t > 5) p.m.removeFromParent();
      return p.t <= 5;
    });
  }

  destroy(): void {
    for (const it of this.items.values()) it.g.removeFromParent(), it.glow.removeFromParent();
    for (const m of this.puddles.values()) m.removeFromParent();
    for (const m of this.shields.values()) m.removeFromParent();
    this.debris.forEach((p) => p.m.removeFromParent());
    this.waiter?.e.root.removeFromParent();
  }
}
