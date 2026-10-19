import * as THREE from 'three';
import { type CharacterId, type ExchangeEvent, type GameEvent, type PlayerView, type Rps, type Snapshot } from '@ppt/shared';
import type { GameConnection } from '../net/connection';
import { Hud } from '../ui/hud';
import { symbolSvg } from '../ui/symbolIcons';
import { BEAT_MS, QteArc } from '../ui/qteArc';
import { S, toWorld } from './assets';
import { buildArena3D, type ArenaHandles, SKY } from './arena3d';
import { Character3D, makeBottle } from './character3d';
import { signTexture, softCircle } from './textures';
import { finisherModels, startFinisher, type Fx } from './finishers';
import { Boteco3D } from './boteco3d';
import { BarEventFx } from '../ui/barEventFx';
import { Ambient3D } from './ambient3d';
import { MATCH_FOV, MATCH_TARGET, matchCameraPose } from './matchCamera';

const HAND_COLOR: Record<CharacterId, number> = { fera: 0xf3ece8, principe: 0xf7f5ef, panca: 0xf0bf8f, sonolento: 0xf2c6a0 };
const REVEAL_MS = 1300;
const SYM_BY_CODE: Record<string, Rps> = { Digit1: 'rock', Digit2: 'paper', Digit3: 'scissors', KeyJ: 'rock', KeyK: 'paper', KeyL: 'scissors', Numpad1: 'rock', Numpad2: 'paper', Numpad3: 'scissors' };

interface Actor {
  c: Character3D;
  ring: THREE.Mesh;
  ringMe?: THREE.Mesh;
  tag: HTMLDivElement;
  lastX: number;
  lastY: number;
  speed: number;
  tagKey: string;
}

interface Reveal {
  e: ExchangeEvent;
  start: number;
  stage: number;
  signs: THREE.Sprite[];
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Partida em 3D (Three.js). Lê o estado de uma GameConnection e envia só intenções. */
export class Game3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(MATCH_FOV, 1, 0.1, 120);
  private readonly overlay = document.createElement('div');
  private readonly arena: ArenaHandles;
  private readonly actors = new Map<string, Actor>();
  private readonly hud: Hud;
  private readonly clock = new THREE.Clock();
  private readonly ro: ResizeObserver;
  private readonly keys = new Set<string>();
  private readonly cleanups: (() => void)[] = [];
  private reveals: Reveal[] = [];
  private dust: { s: THREE.Sprite; t: number; v: THREE.Vector3 }[] = [];
  private fxs: Fx[] = [];
  private readonly drinkStart = new Map<string, number>();
  private readonly boteco: Boteco3D;
  private readonly barFx: BarEventFx;
  private readonly ambient: Ambient3D;
  private targetId: string | null = null;
  private lastMove = { x: 0, y: 0 };
  private ended = false;
  private shake = 0;
  private canDrink = false;
  private readonly aims = new Map<string, THREE.Group>();
  private readonly selRing: THREE.Mesh;
  private readonly beer: THREE.Group;
  private readonly qte: QteArc;
  /** Instante (tempo do servidor) em que VOCÊ apertou a Última Palavra — para congelar a barra ali. */
  private localLock: number | null = null;
  private readonly center = document.createElement('div');
  private readonly timer = document.createElement('div');
  private readonly beerHint = document.createElement('div');
  private readonly camBase = new THREE.Vector3();
  private readonly camTarget = MATCH_TARGET.clone();
  private softTex = softCircle();
  private lastPhase = '';

  constructor(
    private readonly parent: HTMLElement,
    private readonly conn: GameConnection,
    private readonly onEnd: (winnerId: string | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    parent.appendChild(this.renderer.domElement);
    this.overlay.className = 'overlay3d';
    parent.appendChild(this.overlay);

    this.arena = buildArena3D(this.scene, conn.config);
    // Pré-compila os golpes finais (senão o 1º golpe de cada tipo dá um tranco e pula quadros da animação).
    const warm = finisherModels();
    warm.forEach((o) => this.scene.add(o));
    this.renderer.compile(this.scene, this.camera);
    warm.forEach((o) => o.removeFromParent());

    this.boteco = new Boteco3D({
      scene: this.scene,
      cfg: conn.config,
      arena: this.arena,
      character: (id) => this.actors.get(id)?.c,
      puff: (at, color, n) => this.puff(at, color, n),
      localId: conn.localPlayerId,
      simNow: () => this.conn.now(),
    });
    this.barFx = new BarEventFx(this.overlay);
    this.ambient = new Ambient3D(this.scene, conn.config, this.arena);

    // Anel de seleção de alvo.
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40), new THREE.MeshBasicMaterial({ color: 0xfff4e6, transparent: true, opacity: 0.9 }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    // Long neck em cima da mesa.
    this.beer = makeBottle();
    this.beer.scale.setScalar(1.6);
    this.beer.position.copy(this.arena.beerSpot);
    this.scene.add(this.beer);

    // Jo-Ken-Pô num painel fixo na lateral da tela (fora do personagem).
    this.qte = new QteArc(this.overlay);
    this.center.className = 'center3d';
    this.timer.className = 'timer3d';
    this.beerHint.className = 'beerhint3d';
    this.beerHint.textContent = '[E] Beber uma gelada';
    this.overlay.append(this.center, this.timer, this.beerHint);

    this.hud = new Hud(conn.localPlayerId, {
      symbol: (s) => this.pressSymbol(s),
      challenge: () => this.pressChallenge(),
      dash: () => this.pressDash(),
      drink: () => conn.send({ type: 'drink' }),
    });

    this.setupInput();
    const off = conn.onEvents((ev) => this.handleEvents(ev));
    this.cleanups.push(off);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(parent);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.cleanups.forEach((f) => f());
    this.fxs.forEach((f) => f.dispose());
    this.boteco.destroy();
    this.barFx.destroy();
    this.ambient.destroy();
    this.hud.destroy();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ------------------------------------------------------------------ câmera

  private resize(): void {
    const w = Math.max(1, this.parent.clientWidth);
    const h = Math.max(1, this.parent.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const pose = matchCameraPose(this.conn.config, this.camera.aspect);
    this.scene.fog = new THREE.Fog(SKY, pose.dist + 5, pose.dist + 30);
    this.camBase.copy(pose.position);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  private screen(v: THREE.Vector3): { x: number; y: number; ok: boolean } {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.parent.clientWidth, y: ((1 - p.y) / 2) * this.parent.clientHeight, ok: p.z < 1 };
  }

  private world(x: number, y: number, h = 0): THREE.Vector3 {
    return toWorld(this.conn.config, x, y).setY(h);
  }

  // ------------------------------------------------------------------ entrada

  private setupInput(): void {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat && e.code !== 'KeyW' && e.code !== 'KeyA' && e.code !== 'KeyS' && e.code !== 'KeyD') return;
      this.keys.add(e.code);
      const sym = SYM_BY_CODE[e.code];
      if (sym) return this.pressSymbol(sym);
      switch (e.code) {
        case 'Space':
          return this.pressChallenge();
        case 'ShiftLeft':
        case 'ShiftRight':
          return this.pressDash();
        case 'Tab':
          return this.cycleTarget();
        case 'KeyE':
          return this.conn.send({ type: 'drink' });
      }
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    const canvas = this.renderer.domElement;
    const ctx = (e: MouseEvent) => e.preventDefault();
    const click = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), hit)) return;
      const snap = this.conn.latest();
      if (!snap) return;
      const best = snap.players
        .filter((p) => p.alive && p.id !== this.conn.localPlayerId)
        .map((p) => ({ p, d: this.world(p.x, p.y, 0.5).distanceTo(hit) }))
        .sort((a, b) => a.d - b.d)[0];
      if (best && best.d < 0.9) this.targetId = best.p.id;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    canvas.addEventListener('contextmenu', ctx);
    canvas.addEventListener('pointerdown', click);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('contextmenu', ctx);
      canvas.removeEventListener('pointerdown', click);
    });
  }

  private moveVec(): { x: number; y: number } {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    return { x, y };
  }

  private me(snap: Snapshot): PlayerView | undefined {
    return snap.players.find((p) => p.id === this.conn.localPlayerId);
  }

  /** J/K/L (ou 1/2/3): bota o símbolo no duelo (a conexão carimba o instante em que apertou). */
  private pressSymbol(s: Rps): void {
    const snap = this.conn.latest();
    const me = snap && this.me(snap);
    if (!snap || !me) return;
    if (!me.holding) return;
    if (!me.locked && this.localLock === null) this.localLock = this.conn.now();
    this.conn.send({ type: 'symbol', symbol: s });
  }

  /** Espaço: chama o alvo (clicado/Tab, ou o mais perto) para o Jo-Ken-Pô. */
  private pressChallenge(): void {
    const snap = this.conn.latest();
    const me = snap && this.me(snap);
    if (!snap || !me || me.holding) return;
    const target = this.currentTarget(snap, me);
    if (!target) return;
    this.conn.send({ type: 'challenge', targetId: target.id });
  }

  private pressDash(): void {
    const m = this.moveVec();
    this.conn.send({ type: 'dash', x: m.x, y: m.y });
  }

  private cycleTarget(): void {
    const snap = this.conn.latest();
    const me = snap && this.me(snap);
    if (!snap || !me) return;
    const opts = snap.players.filter((p) => p.alive && p.id !== me.id).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    if (!opts.length) return;
    const i = opts.findIndex((p) => p.id === this.targetId);
    this.targetId = opts[(i + 1) % opts.length].id;
  }

  private currentTarget(snap: Snapshot, me: PlayerView): PlayerView | undefined {
    const sel = snap.players.find((p) => p.id === this.targetId && p.alive);
    if (sel) return sel;
    const n = snap.players.filter((p) => p.alive && p.id !== me.id).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    this.targetId = n?.id ?? null;
    return n;
  }

  // ------------------------------------------------------------------ eventos

  private pos(id: string, h = 0): THREE.Vector3 | null {
    const p = this.conn.latest()?.players.find((q) => q.id === id);
    return p ? this.world(p.x, p.y, h) : null;
  }

  private handleEvents(events: GameEvent[]): void {
    const meId = this.conn.localPlayerId;
    for (const e of events) {
      this.boteco.onEvent(e);
      this.ambient.onEvent(e);
      switch (e.type) {
        case 'exchange': {
          this.reveals.push({ e, start: performance.now(), stage: 0, signs: [] });
          if (e.damagedId === meId) this.shake = 0.18;
          else if (e.winnerId === meId) this.shake = 0.08;
          break;
        }
        case 'whiff': {
          const t = this.pos(e.targetId);
          for (const id of e.playerIds) {
            const a = this.actors.get(id);
            const q = this.pos(id);
            if (a && q && t) a.c.hit(q.x - (t.x - q.x), q.z - (t.z - q.z), q.x, q.z, 0.7, this.conn.now());
          }
          break;
        }
        case 'drink': {
          // Guarda o início do gole: a animação usa a duração real (mesa ou cerveja do chão).
          if (e.stage === 'start') this.drinkStart.set(e.playerId, e.at);
          if (e.stage === 'done') {
            this.actors.get(e.playerId)?.c.drunk(this.conn.now(), 6000);
          }
          break;
        }
        case 'phase':
          if (e.phase === 'playing') this.flash('LUTA!');
          if (e.phase === 'ended' && !this.ended) {
            this.ended = true;
            setTimeout(() => this.onEnd(e.winnerId), 1500);
          }
          break;
      }
    }
  }

  private flash(text: string): void {
    this.center.textContent = text;
    this.center.classList.remove('flash');
    void this.center.offsetWidth;
    this.center.classList.add('flash');
  }

  // ------------------------------------------------------------------ atores

  private actorFor(p: PlayerView): Actor {
    let a = this.actors.get(p.id);
    if (a) return a;
    const c = new Character3D(p.character);
    this.scene.add(c.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 36), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.95 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.scene.add(ring);
    let ringMe: THREE.Mesh | undefined;
    if (p.id === this.conn.localPlayerId) {
      ringMe = new THREE.Mesh(new THREE.RingGeometry(0.53, 0.58, 36), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ringMe.rotation.x = -Math.PI / 2;
      ringMe.position.y = 0.021;
      this.scene.add(ringMe);
    }
    const tag = document.createElement('div');
    tag.className = `tag3d${p.id === this.conn.localPlayerId ? ' me' : ''}`;
    tag.innerHTML = `<div class="hand"></div><div class="nm"></div><div class="hp"></div><div class="st"></div><div class="fb"><i></i></div>`;
    (tag.querySelector('.nm') as HTMLElement).textContent = p.id === this.conn.localPlayerId ? `${p.name} (você)` : p.name;
    (tag.querySelector('.nm') as HTMLElement).style.borderColor = hex(p.color);
    this.overlay.appendChild(tag);
    a = { c, ring, ringMe, tag, lastX: p.x, lastY: p.y, speed: 0, tagKey: '' };
    this.actors.set(p.id, a);
    return a;
  }

  // ------------------------------------------------------------------ quadro

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const snap = this.conn.latest();
    if (!snap) return;
    const now = this.conn.now();
    const me = this.me(snap);

    const m = this.moveVec();
    if (m.x !== this.lastMove.x || m.y !== this.lastMove.y) {
      this.lastMove = m;
      this.conn.send({ type: 'move', x: m.x, y: m.y });
    }

    // Contagem e relógio.
    if (snap.phase === 'countdown') {
      const n = Math.ceil((snap.phaseEndsAt - now) / 1000);
      this.center.textContent = n > 0 ? String(n) : '';
      this.center.classList.remove('flash');
    } else if (this.lastPhase === 'countdown' && !this.center.classList.contains('flash')) {
      // (online o evento "phase" pode chegar antes do primeiro quadro: garante a animação que some)
      this.flash('LUTA!');
    }
    this.lastPhase = snap.phase;
    const left = Math.max(0, snap.phaseEndsAt - now);
    this.timer.textContent = snap.phase === 'playing' ? `${Math.floor(Math.ceil(left / 1000) / 60)}:${String(Math.ceil(left / 1000) % 60).padStart(2, '0')}` : '';

    if (me) this.currentTarget(snap, me);
    const poses = this.revealPoses(snap);

    for (const p of snap.players) {
      const a = this.actorFor(p);
      const step = Math.hypot(p.x - a.lastX, p.y - a.lastY);
      a.speed += (step / Math.max(dt, 1e-3) - a.speed) * Math.min(1, dt * 10);
      a.lastX = p.x;
      a.lastY = p.y;
      const w = this.world(p.x, p.y);
      const pose = poses.get(p.id);
      a.c.update(
        dt,
        {
          view: p,
          now,
          faceX: pose ? pose.x : p.faceX,
          faceZ: pose ? pose.y : p.faceY,
          speed: a.speed,
          pump: this.pumpFor(p, now),
          // No fim, quem ficou de pé por último leva a cerveja — e toma ali mesmo.
          drink:
            p.drinkingUntil > now
              ? this.drinkProgress(p.id, p.drinkingUntil, now)
              : snap.phase === 'ended' && p.id === snap.winnerId && p.alive
                ? (now % 2200) / 2200
                : -1,
        },
        w.x,
        w.z,
      );
      const grace = now < p.graceUntil && Math.floor(now / 90) % 2 === 0;
      a.ring.position.set(w.x, 0.02, w.z);
      a.ring.visible = p.alive;
      const ringMat = a.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = grace ? 0.35 : 0.95;
      // Lento (tesourada): o anel pisca em azul-gelo.
      if (p.slowed) ringMat.color.setHex(0x8ecae6).lerp(new THREE.Color(p.color), 0.5 + 0.5 * Math.sin(now / 110));
      else ringMat.color.setHex(p.color);
      if (a.ringMe) {
        a.ringMe.position.set(w.x, 0.021, w.z);
        a.ringMe.visible = p.alive;
      }
      a.c.model.traverse((o) => {
        // Contorno usa um material compartilhado por todos: some durante o pisca em vez de ficar transparente.
        if (o.userData.outline) {
          o.visible = !grace;
          return;
        }
        const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mm && 'opacity' in mm) {
          mm.transparent = grace;
          mm.opacity = grace ? 0.55 : 1;
        }
      });
      this.updateTag(a, p, w, now);
    }

    this.updateAims(snap, now, me);
    this.updateReveals(snap, now);
    this.updateBeer(snap, now, me);
    this.updateQte(now, me);
    this.updateDust(dt);
    this.updateFx();
    this.boteco.update(snap, now, dt);
    this.barFx.update(snap.barEvent, now);
    this.ambient.update(dt);
    this.ambient.setWaiterAway(!!snap.waiter);
    this.arena.update(dt, now);

    // Tremidinha de câmera nos golpes.
    this.shake = Math.max(0, this.shake - dt * 0.9);
    this.camera.position.copy(this.camBase).add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    this.renderer.render(this.scene, this.camera);
    this.hud.update(snap, now, this.canDrink);
  }

  private updateTag(a: Actor, p: PlayerView, w: THREE.Vector3, now: number): void {
    const s = this.screen(w.clone().setY(1.55));
    a.tag.style.transform = `translate(${s.x}px, ${s.y}px)`;
    // Queda de luz: crachás dos outros somem (só o anel no chão brilha).
    a.tag.style.visibility = this.boteco.blackout && p.id !== this.conn.localPlayerId ? 'hidden' : '';
    a.tag.classList.toggle('dead', !p.alive);
    let hand = '';
    if (p.alive && p.holding) hand = p.symbol ?? '?';
    else if (p.alive && p.drinkingUntil > now) hand = '🍺';
    // Status público: 🧊 escudo de gelo do freezer.
    const st = p.alive && p.shielded ? '🧊' : '';
    const key = `${p.hp}:${p.alive}:${Math.round(p.focus / 5)}:${hand}:${st}`;
    if (key !== a.tagKey) {
      a.tagKey = key;
      (a.tag.querySelector('.st') as HTMLElement).textContent = st;
      (a.tag.querySelector('.hp') as HTMLElement).innerHTML = '❤'.repeat(p.hp) + `<span>${'❤'.repeat(Math.max(0, p.maxHp - p.hp))}</span>`;
      (a.tag.querySelector('.fb i') as HTMLElement).style.width = `${Math.round((p.focus / this.conn.config.player.maxFocus) * 100)}%`;
      const handEl = a.tag.querySelector('.hand') as HTMLElement;
      // Símbolo botado = ícone desenhado (pedra, papel, tesoura); ainda não botou = "?".
      if (hand === 'rock' || hand === 'paper' || hand === 'scissors') handEl.innerHTML = symbolSvg(hand);
      else handEl.textContent = hand;
    }
    // Preparação do ataque: anel de tempo no próprio crachá.
    const handEl = a.tag.querySelector('.hand') as HTMLElement;
    if (p.alive && p.holding && p.impactAt) {
      const frac = Math.max(0, Math.min(1, (p.impactAt - now) / this.conn.config.attack.windupMs));
      // Botou cedo? o crachá fica amarelo (todo mundo já viu a mão).
      handEl.classList.toggle('shown', !!p.symbol);
      handEl.style.background = `conic-gradient(${hex(p.color)} ${frac * 360}deg, #2b1d2299 0)`;
    } else {
      handEl.style.background = '';
    }
  }

  /** Seta no chão de quem desafiou até o desafiado. */
  private updateAims(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const active = new Set<string>();
    for (const p of snap.players) {
      // Uma seta por duelo, saindo de quem desafiou.
      if (!p.alive || !p.holding || !p.targetId || !p.challenger) continue;
      const t = snap.players.find((o) => o.id === p.targetId);
      if (!t) continue;
      active.add(p.id);
      let g = this.aims.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.55);
        shape.lineTo(0.2, 0);
        shape.lineTo(-0.2, 0);
        shape.closePath();
        const arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
        arrowMesh.rotation.x = -Math.PI / 2; // ponta da forma (+y) passa a apontar para -z
        const arrow = new THREE.Group();
        arrow.name = 'arrow';
        arrow.add(arrowMesh);
        g.add(arrow);
        for (let i = 0; i < 14; i++) {
          const dot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 8), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.7, depthWrite: false }));
          dot.rotation.x = -Math.PI / 2;
          dot.name = 'dot';
          g.add(dot);
        }
        this.scene.add(g);
        this.aims.set(p.id, g);
      }
      const a = this.world(p.x, p.y, 0.03);
      const b = this.world(t.x, t.y, 0.03);
      const dir = b.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      const arrow = g.getObjectByName('arrow') as THREE.Group;
      arrow.position.copy(a).addScaledVector(dir, 0.6);
      arrow.rotation.y = Math.atan2(-dir.x, -dir.z);
      const am = (arrow.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      am.color.set(0xffc145);
      const mine = t.id === me?.id || p.id === me?.id;
      am.opacity = t.id === me?.id ? 0.95 : mine ? 0.8 : 0.28;
      const dots = g.children.filter((c) => c.name === 'dot');
      dots.forEach((d, i) => {
        const k = 1.2 + i * 0.35;
        d.visible = mine && k < len - 0.55;
        d.position.copy(a).addScaledVector(dir, k);
        d.scale.setScalar(1 + 0.25 * Math.sin(now / 120 - i));
      });
    }
    // Queda de luz: só dá para ver a sua própria seta (blefe no escuro).
    for (const [id, g] of this.aims) g.visible = active.has(id) && (!this.boteco.blackout || id === me?.id);

    const sel = snap.players.find((p) => p.id === this.targetId && p.alive);
    this.selRing.visible = !!sel && !!me?.alive;
    if (sel) {
      const w = this.world(sel.x, sel.y, 0.025);
      this.selRing.position.copy(w);
      this.selRing.scale.setScalar(1 + Math.sin(now / 140) * 0.06);
    }
  }

  /** Altura dos punhos no Jo-Ken-Pô: descem em cada batida até o impacto. */
  private pumpFor(p: PlayerView, now: number): number {
    if (!p.holding || p.impactAt === null) return 0;
    const d = p.impactAt - now;
    if (d > BEAT_MS * 3 || d < -120) return 0;
    const k = (((d % BEAT_MS) + BEAT_MS) % BEAT_MS) / BEAT_MS;
    return Math.sin(k * Math.PI);
  }

  /** Revelação frente a frente: viram um para o outro, mostram a mão; quem perde toma rasteira. */
  private revealPoses(snap: Snapshot): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    const now = performance.now();
    for (const r of this.reveals) {
      if (now - r.start > REVEAL_MS) continue;
      const a = snap.players.find((p) => p.id === r.e.attackerId);
      const d = snap.players.find((p) => p.id === r.e.defenderId);
      if (!a || !d) continue;
      const dx = d.x - a.x;
      const dy = d.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      out.set(a.id, { x: dx / l, y: dy / l });
      out.set(d.id, { x: -dx / l, y: -dy / l });
    }
    return out;
  }

  private updateReveals(snap: Snapshot, simNow: number): void {
    const now = performance.now();
    for (const r of this.reveals) {
      const t = now - r.start;
      const { e } = r;
      const A = this.actors.get(e.attackerId);
      const D = this.actors.get(e.defenderId);
      const a = snap.players.find((p) => p.id === e.attackerId);
      const d = snap.players.find((p) => p.id === e.defenderId);
      if (!A || !D || !a || !d) continue;
      if (r.stage === 0) {
        r.stage = 1;
        // Estendem a mão com o sinal.
        A.c.trigger('attack-melee-right', 450, simNow);
        if (e.defenderSymbol) D.c.trigger('attack-melee-right', 450, simNow);
        for (const [actor, view, sym] of [
          [A, a, e.attackerSymbol],
          [D, d, e.defenderSymbol],
        ] as const) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(sym, HAND_COLOR[view.character]), transparent: true, depthTest: false }));
          sp.renderOrder = 10;
          sp.userData = { actor };
          this.scene.add(sp);
          r.signs.push(sp);
        }
      }
      // Sinais acompanham a mão, com "pop".
      const pop = easeOutBack(Math.min(1, t / 180));
      const fade = t > REVEAL_MS - 260 ? Math.max(0, (REVEAL_MS - t) / 260) : 1;
      r.signs.forEach((sp, i) => {
        const actor = sp.userData.actor as Actor;
        const view = i === 0 ? a : d;
        const other = i === 0 ? d : a;
        const p = actor.c.handWorld();
        const dir = this.world(other.x, other.y).sub(this.world(view.x, view.y)).setY(0).normalize();
        sp.position.copy(p).addScaledVector(dir, 0.6).setY(1.35);
        sp.scale.setScalar(0.85 * pop);
        (sp.material as THREE.SpriteMaterial).opacity = fade;
      });
      if (r.stage === 1 && t > 120) {
        r.stage = 2;
        if (e.damagedId && e.winnerId && e.finisher) this.finisher(e.finisher, e.damagedId, e.winnerId, simNow);
        else if (e.damagedId && e.winnerId) this.actors.get(e.winnerId)?.c.trigger('attack-kick-right', 600, simNow);
      }
      if (r.stage === 2 && t > 330) {
        r.stage = 3;
        const wa = this.world(a.x, a.y);
        const wd = this.world(d.x, d.y);
        const posOf = (id: string) => (id === a.id ? wa : wd);
        const otherOf = (id: string) => (id === a.id ? wd : wa);
        if (e.damagedId && e.finisher) {
          // Golpe final: a animação do símbolo cuida do perdedor (ver finishers.ts).
        } else if (e.damagedId) {
          const v = posOf(e.damagedId);
          const w = otherOf(e.damagedId);
          this.actors.get(e.damagedId)?.c.hit(w.x, w.z, v.x, v.z, 1.1, simNow, true);
          this.puff(v, 0xe9d2b8, 10);
        } else if (e.protectedId) {
          const v = posOf(e.protectedId);
          const w = otherOf(e.protectedId);
          this.actors.get(e.protectedId)?.c.hit(w.x, w.z, v.x, v.z, 0.5, simNow);
        } else if (e.kind === 'clank' || e.kind === 'tie-stagger') {
          A.c.hit(wd.x, wd.z, wa.x, wa.z, 0.6, simNow);
          D.c.hit(wa.x, wa.z, wd.x, wd.z, 0.6, simNow);
          this.puff(wa.clone().add(wd).multiplyScalar(0.5), 0xfff4e6, 8);
        } else {
          A.c.hit(wa.x - (wd.x - wa.x), wa.z - (wd.z - wa.z), wa.x, wa.z, 0.6, simNow);
        }
      }
    }
    this.reveals = this.reveals.filter((r) => {
      const alive = now - r.start <= REVEAL_MS;
      if (!alive) r.signs.forEach((s) => s.removeFromParent());
      return alive;
    });
  }

  /** Dispara o golpe final do símbolo vencedor (mão de pedra, tesoura gigante ou bola de papel). */
  private finisher(sym: Rps, victimId: string, winnerId: string, simNow: number): void {
    const V = this.actors.get(victimId);
    const W = this.actors.get(winnerId);
    if (!V || !W) return;
    W.c.trigger('attack-melee-right', 500, simNow);
    const winnerPos = W.c.root.position.clone();
    const fx = startFinisher(
      sym,
      {
        scene: this.scene,
        victimPos: () => V.c.root.position,
        winnerPos,
        victimRoot: V.c.root,
        knock: (sweep, strength) => {
          const v = V.c.root.position;
          V.c.hit(winnerPos.x, winnerPos.z, v.x, v.z, strength, this.conn.now(), sweep);
        },
        puff: (at, color, n) => this.puff(at, color, n),
        shake: (amount) => (this.shake = Math.max(this.shake, amount)),
      },
      performance.now(),
    );
    this.fxs.push(fx);
  }

  private updateFx(): void {
    const now = performance.now();
    this.fxs = this.fxs.filter((f) => {
      const alive = f.update(now);
      if (!alive) f.dispose();
      return alive;
    });
  }

  private puff(at: THREE.Vector3, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color, transparent: true, depthWrite: false }));
      s.position.copy(at).setY(0.15);
      s.scale.setScalar(0.25);
      const ang = (i / n) * Math.PI * 2;
      this.scene.add(s);
      this.dust.push({ s, t: 0, v: new THREE.Vector3(Math.cos(ang) * 1.4, 0.5 + Math.random() * 0.4, Math.sin(ang) * 1.4) });
    }
  }

  private updateDust(dt: number): void {
    for (const d of this.dust) {
      d.t += dt / 0.6;
      d.s.position.addScaledVector(d.v, dt);
      d.v.multiplyScalar(0.92);
      d.s.scale.setScalar(0.25 + d.t * 0.5);
      (d.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.8 * (1 - d.t));
    }
    this.dust = this.dust.filter((d) => {
      if (d.t >= 1) d.s.removeFromParent();
      return d.t < 1;
    });
  }

  private drinkProgress(id: string, until: number, now: number): number {
    const start = this.drinkStart.get(id) ?? until - this.conn.config.beer.drinkMs;
    return Math.max(0, Math.min(1, (now - start) / Math.max(1, until - start)));
  }

  private updateBeer(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const cfg = this.conn.config;
    const b = snap.beers[0];
    this.canDrink = false;
    this.beerHint.style.display = 'none';
    if (!b) return;
    // Online, Infinity ("alguém pegou") chega como null no JSON.
    const ready = b.readyAt !== null && b.readyAt <= now;
    this.beer.visible = ready;
    this.beer.rotation.y = now / 900;
    const free = me?.alive && !me.holding && me.drinkingUntil <= now && me.openingUntil <= now;
    if (ready && free && me.hp < me.maxHp) {
      const table = cfg.obstacles.find((o) => o.prop === 'beerTable');
      const r = table?.kind === 'circle' ? table.r : 60;
      if (Math.hypot(me.x - b.x, me.y - b.y) <= r + cfg.player.radius + cfg.beer.reach) {
        this.canDrink = true;
        const s = this.screen(this.arena.beerSpot.clone().setY(this.arena.beerSpot.y + 0.9));
        this.beerHint.textContent = '[E] Beber uma gelada';
        this.beerHint.style.display = 'block';
        this.beerHint.style.transform = `translate(${s.x}px, ${s.y}px)`;
        return;
      }
    }
    // Perto do freezer (e sem escudo): E abre e dá o escudo de gelo.
    if (!free || me.shielded) return;
    for (const f of snap.freezers) {
      const o = cfg.obstacles[f.index];
      if (o.kind !== 'rect' || f.readyAt === null || f.readyAt > now) continue;
      const nx = Math.max(o.x, Math.min(me.x, o.x + o.w));
      const ny = Math.max(o.y, Math.min(me.y, o.y + o.h));
      if (Math.hypot(me.x - nx, me.y - ny) > cfg.player.radius + cfg.hazards.freezer.reach) continue;
      this.canDrink = true;
      const s = this.screen(this.world(o.x + o.w / 2, o.y + o.h / 2, 1.1));
      this.beerHint.textContent = '[E] Abrir o freezer (escudo de gelo)';
      this.beerHint.style.display = 'block';
      this.beerHint.style.transform = `translate(${s.x}px, ${s.y}px)`;
      return;
    }
  }

  /** Jo-Ken-Pô: texto curvado logo abaixo da cerca da frente (ver ui/qteArc.ts). */
  private updateQte(now: number, me: PlayerView | undefined): void {
    if (!me?.alive || !me.holding || me.impactAt === null) {
      this.localLock = null;
      this.qte.hide();
      return;
    }
    // Caminho: um pedaço da elipse da arena, por fora da cerca da frente (lado da câmera), projetado na tela.
    const { rx, ry } = this.conn.config.arena;
    const ex = rx * S + 1.25;
    const ez = ry * S + 1.25;
    const arc: { x: number; y: number }[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI / 2 + 0.75 - (i / 24) * 1.5;
      arc.push(this.screen(new THREE.Vector3(Math.cos(a) * ex, 0, Math.sin(a) * ez)));
    }
    // Letra proporcional ao tamanho da arena na tela (1 unidade do chão ≈ quantos px aqui na frente).
    const mid = this.screen(new THREE.Vector3(0, 0, ez));
    const unit = Math.abs(this.screen(new THREE.Vector3(1, 0, ez)).x - mid.x);
    this.qte.update({
      now,
      impactAt: me.impactAt,
      pickedAt: this.localLock ?? me.pickedAt,
      cfg: this.conn.config,
      arc,
      size: Math.max(22, Math.min(64, unit * 0.62)),
    });
  }

}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
