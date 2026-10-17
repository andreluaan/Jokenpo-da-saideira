import * as THREE from 'three';
import { GRADE_LABEL, RPS_ICON, type CharacterId, type ExchangeEvent, type GameEvent, type Grade, type PlayerView, type Rps, type Snapshot } from '@ppt/shared';
import type { GameConnection } from '../net/connection';
import { Hud } from '../ui/hud';
import { DENY_TEXT, WHIFF_TEXT, describeExchange } from '../ui/describe';
import { S, toWorld } from './assets';
import { buildArena3D, type ArenaHandles, SKY } from './arena3d';
import { Character3D, makeBottle } from './character3d';
import { signTexture, softCircle } from './textures';
import { finisherModels, startFinisher, type Fx } from './finishers';

const GRADE_COLOR: Record<Grade, string> = { perfect: '#5ad19a', good: '#fff4e6', fail: '#ff5a5f' };
const HAND_COLOR: Record<CharacterId, number> = { fera: 0xf3ece8, principe: 0xf7f5ef, panca: 0xf0bf8f, sonolento: 0xf2c6a0 };
/** Batidas do Jo-Ken-Pô: o "PÔ!" cai exatamente no impacto (QTE perfeito). */
const BEAT_MS = 400;
const CHANT = ['JO', 'KEN', 'PÔ!'];
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
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
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
  private targetId: string | null = null;
  private lastMove = { x: 0, y: 0 };
  private ended = false;
  private shake = 0;
  private canDrink = false;
  private readonly aims = new Map<string, THREE.Group>();
  private readonly selRing: THREE.Mesh;
  private readonly beer: THREE.Group;
  private readonly qte: SVGSVGElement;
  /** Instante (tempo do servidor) em que VOCÊ apertou a Última Palavra — para congelar a barra ali. */
  private localLock: number | null = null;
  private readonly center = document.createElement('div');
  private readonly timer = document.createElement('div');
  private readonly beerHint = document.createElement('div');
  private readonly camBase = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3(0, 0, 0.55);
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

    this.qte = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.qte.setAttribute('class', 'qte3d');
    // Barra curva estilo "shot meter": contorno, trilho, janela (BOM), fatia verde (PERFEITO), enchimento e rótulo.
    this.qte.innerHTML =
      '<path class="edge"/><path class="track"/><path class="win"/><path class="perf"/><path class="fill"/><line class="tick"/><text class="lbl"></text>';
    this.overlay.appendChild(this.qte);
    this.center.className = 'center3d';
    this.timer.className = 'timer3d';
    this.beerHint.className = 'beerhint3d';
    this.beerHint.textContent = '[E] Beber uma gelada';
    this.overlay.append(this.center, this.timer, this.beerHint);

    this.hud = new Hud(conn.localPlayerId, {
      symbol: (s) => this.pressSymbol(s),
      commit: () => this.pressCommit(),
      feint: () => conn.send({ type: 'feint' }),
      cancel: () => conn.send({ type: 'cancel' }),
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
    const cfg = this.conn.config;
    // Margem curta em volta da cerca: quanto mais perto, maiores os personagens na tela.
    const halfW = cfg.arena.rx * S + 0.7;
    const halfH = cfg.arena.ry * S + 1.0;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(halfW / (t * this.camera.aspect), (halfH * 1.15) / t, 10);
    this.scene.fog = new THREE.Fog(SKY, dist + 5, dist + 30);
    // Câmera um pouco mais deitada (~46°): vê mais do corpo e do rosto, menos do topo da cabeça.
    const dir = new THREE.Vector3(0, 1, 0.95).normalize();
    this.camBase.copy(this.camTarget).addScaledVector(dir, dist);
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
          return this.pressCommit();
        case 'KeyF':
          return this.conn.send({ type: 'feint' });
        case 'KeyX':
          return this.conn.send({ type: 'cancel' });
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
      if (e.button === 2) return this.conn.send({ type: 'cancel' });
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

  private pressSymbol(s: Rps): void {
    const snap = this.conn.latest();
    const me = snap && this.me(snap);
    if (!snap || !me) return;
    if (me.holding) return this.conn.send({ type: 'symbol', symbol: s });
    const attacker = snap.players.filter((p) => p.alive && p.targetId === me.id && p.impactAt !== null).sort((a, b) => a.impactAt! - b.impactAt!)[0];
    const target = attacker ?? this.currentTarget(snap, me);
    if (!target) return this.popup(this.world(me.x, me.y, 1.6), 'Sem alvo', '#c9b5a8', 18);
    this.targetId = target.id;
    this.conn.send({ type: 'symbol', symbol: s, targetId: target.id });
  }

  private pressCommit(): void {
    const me = this.conn.latest() && this.me(this.conn.latest()!);
    if (me?.holding && !me.locked && this.localLock === null) this.localLock = this.conn.now();
    this.conn.send({ type: 'commit' });
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

  private nameOf = (id: string): string => (id === this.conn.localPlayerId ? 'Você' : (this.conn.latest()?.players.find((p) => p.id === id)?.name ?? id));

  private pos(id: string, h = 0): THREE.Vector3 | null {
    const p = this.conn.latest()?.players.find((q) => q.id === id);
    return p ? this.world(p.x, p.y, h) : null;
  }

  /** Tem a ver com você? (você, seu alvo, ou quem está te atacando) — o resto não vira pop-up, só log. */
  private relevant(id: string): boolean {
    const snap = this.conn.latest();
    const meId = this.conn.localPlayerId;
    if (id === meId) return true;
    const me = snap?.players.find((p) => p.id === meId);
    if (me?.targetId === id) return true;
    return !!snap?.players.find((p) => p.id === id && p.targetId === meId);
  }

  private handleEvents(events: GameEvent[]): void {
    const meId = this.conn.localPlayerId;
    for (const e of events) {
      switch (e.type) {
        case 'signal': {
          const p = this.pos(e.playerId, 1.7);
          if (!p || !this.relevant(e.playerId)) break;
          const t = e.kind === 'swap' ? '↻' : e.kind === 'lock' ? '🔒' : '✖';
          const c = e.kind === 'swap' ? '#ffd166' : e.kind === 'lock' ? '#8ecae6' : '#ff5a5f';
          this.popup(p.add(new THREE.Vector3(0.35, 0, 0)), t, c, 22);
          break;
        }
        case 'duel': {
          const a = this.pos(e.a, 1.4);
          const b = this.pos(e.b, 1.4);
          if (a && b && (e.a === meId || e.b === meId)) this.popup(a.add(b).multiplyScalar(0.5), 'DUELO!', '#ffc145', 20, 800);
          break;
        }
        case 'exchange': {
          this.reveals.push({ e, start: performance.now(), stage: 0, signs: [] });
          const { headline, line } = describeExchange(e, this.nameOf);
          const involved = e.attackerId === meId || e.defenderId === meId;
          this.hud.addLog(line, !involved ? '' : e.damagedId === meId ? 'me-loss' : e.winnerId === meId ? 'me-win' : '');
          if (involved) {
            // Só os confrontos com você viram texto na tela; os outros ficam no log (menos poluição).
            this.popup(this.world(e.x, e.y, 2.3), headline, e.damagedId ? '#ffc145' : '#fff4e6', 20, 1400);
            const myGrade = e.attackerId === meId ? e.attackerGrade : e.defenderGrade;
            const mp = this.pos(meId, -0.1);
            if (mp && myGrade) this.popup(mp, GRADE_LABEL[myGrade], GRADE_COLOR[myGrade], 18, 1100);
          }
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
          const p = this.pos(e.playerIds[0], 1.6);
          if (p && e.playerIds.includes(meId)) this.popup(p, WHIFF_TEXT[e.reason], '#c9b5a8', 18);
          if (e.playerIds.includes(meId)) this.hud.addLog(`Você: ${WHIFF_TEXT[e.reason]}`);
          break;
        }
        case 'denied': {
          if (e.playerId !== meId || e.reason === 'phase') break;
          const p = this.pos(meId, 1.9);
          if (p) this.popup(p, DENY_TEXT[e.reason], '#c9b5a8', 16, 800);
          break;
        }
        case 'eliminated': {
          const p = this.pos(e.playerId, 1.2);
          if (p) this.popup(p, 'ELIMINADO', '#ff5a5f', 34, 1800);
          this.hud.addLog(`${this.nameOf(e.playerId)} foi eliminado${e.byId ? ` por ${this.nameOf(e.byId)}` : ''}.`);
          break;
        }
        case 'drink': {
          const p = this.pos(e.playerId, 1.8);
          if (e.stage === 'done') {
            if (p) this.popup(p, '+1 ❤', '#5ad19a', 32, 1400);
            setTimeout(() => {
              const q = this.pos(e.playerId, 2.1);
              if (q) this.popup(q.add(new THREE.Vector3(0.4, 0, 0)), 'hic!', '#fff4e6', 24, 900);
            }, 450);
            this.actors.get(e.playerId)?.c.drunk(this.conn.now(), 6000);
            this.hud.addLog(`${this.nameOf(e.playerId)} tomou uma gelada e recuperou 1 ❤.`, e.playerId === meId ? 'me-win' : '');
          } else if (e.stage === 'spilled') {
            if (p) this.popup(p, 'Derramou!', '#ff5a5f', 28, 1200);
            this.hud.addLog(`${this.nameOf(e.playerId)} levou um golpe e derramou a cerveja.`, e.playerId === meId ? 'me-loss' : '');
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
        case 'attackStart':
          break;
      }
    }
  }

  private popup(at: THREE.Vector3, text: string, color: string, size = 20, ms = 1000): void {
    const s = this.screen(at);
    if (!s.ok) return;
    const el = document.createElement('div');
    el.className = 'pop3d';
    el.textContent = text;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.style.animationDuration = `${ms}ms`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), ms);
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
    tag.innerHTML = `<div class="hand"></div><div class="nm"></div><div class="hp"></div><div class="fb"><i></i></div>`;
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
    const cfg = this.conn.config;

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
          pump: this.pumpFor(p, snap, now),
          // No fim, quem ficou de pé por último leva a cerveja — e toma ali mesmo.
          drink:
            p.drinkingUntil > now
              ? 1 - (p.drinkingUntil - now) / cfg.beer.drinkMs
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
    this.updateQte(snap, now, me);
    this.updateDust(dt);
    this.updateFx();
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
    a.tag.classList.toggle('dead', !p.alive);
    let hand = '';
    if (p.alive && p.holding) hand = (p.symbol ? RPS_ICON[p.symbol] : '❔') + (p.locked ? '🔒' : '');
    else if (p.alive && p.drinkingUntil > now) hand = '🍺';
    const key = `${p.hp}:${p.alive}:${Math.round(p.focus / 5)}:${hand}`;
    if (key !== a.tagKey) {
      a.tagKey = key;
      (a.tag.querySelector('.hp') as HTMLElement).innerHTML = '❤'.repeat(p.hp) + `<span>${'❤'.repeat(Math.max(0, p.maxHp - p.hp))}</span>`;
      (a.tag.querySelector('.fb i') as HTMLElement).style.width = `${Math.round((p.focus / this.conn.config.player.maxFocus) * 100)}%`;
      (a.tag.querySelector('.hand') as HTMLElement).textContent = hand;
    }
    // Preparação do ataque: anel de tempo no próprio crachá.
    const handEl = a.tag.querySelector('.hand') as HTMLElement;
    if (p.alive && p.holding && p.impactAt) {
      const frac = Math.max(0, Math.min(1, (p.impactAt - now) / this.conn.config.attack.windupMs));
      handEl.style.background = `conic-gradient(${hex(p.color)} ${frac * 360}deg, #2b1d2299 0)`;
    } else {
      handEl.style.background = '';
    }
  }

  /** Setas brancas no chão apontando o alvo (sem revelar o símbolo). */
  private updateAims(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const active = new Set<string>();
    for (const p of snap.players) {
      if (!p.alive || !p.holding || !p.targetId) continue;
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
      const duel = p.clashWith === t.id;
      const arrow = g.getObjectByName('arrow') as THREE.Group;
      arrow.position.copy(a).addScaledVector(dir, 0.6);
      arrow.rotation.y = Math.atan2(-dir.x, -dir.z);
      const am = (arrow.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      am.color.set(duel ? 0xffc145 : 0xffffff);
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
    for (const [id, g] of this.aims) g.visible = active.has(id);

    const sel = snap.players.find((p) => p.id === this.targetId && p.alive);
    this.selRing.visible = !!sel && !!me?.alive;
    if (sel) {
      const w = this.world(sel.x, sel.y, 0.025);
      this.selRing.position.copy(w);
      this.selRing.scale.setScalar(1 + Math.sin(now / 140) * 0.06);
    }
  }

  /** Altura dos punhos no Jo-Ken-Pô: descem em cada batida até o impacto. */
  private pumpFor(p: PlayerView, snap: Snapshot, now: number): number {
    if (!p.holding || p.impactAt === null) return 0;
    const T = Math.min(p.impactAt, ...snap.players.filter((o) => o.alive && o.targetId === p.id && o.impactAt !== null).map((o) => o.impactAt!));
    const d = T - now;
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
          if (e.protectedId === this.conn.localPlayerId) this.popup(v.clone().setY(1.9), 'Protegido', '#8ecae6', 22);
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

  private updateBeer(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const cfg = this.conn.config;
    const b = snap.beers[0];
    this.canDrink = false;
    this.beerHint.style.display = 'none';
    if (!b) return;
    const ready = b.readyAt <= now;
    this.beer.visible = ready;
    this.beer.rotation.y = now / 900;
    if (ready && me?.alive && !me.holding && me.hp < me.maxHp && me.drinkingUntil <= now) {
      const table = cfg.obstacles.find((o) => o.prop === 'beerTable');
      const r = table?.kind === 'circle' ? table.r : 60;
      if (Math.hypot(me.x - b.x, me.y - b.y) <= r + cfg.player.radius + cfg.beer.reach) {
        this.canDrink = true;
        const s = this.screen(this.arena.beerSpot.clone().setY(this.arena.beerSpot.y + 0.9));
        this.beerHint.style.display = 'block';
        this.beerHint.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    }
  }

  /**
   * Barra do QTE ao lado do seu personagem (estilo "shot meter"): enche de baixo para cima no ritmo do
   * Jo-Ken-Pô e chega na fatia verde exatamente no "PÔ!" (instante do impacto). Ao apertar, congela e mostra a nota.
   */
  private updateQte(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const svg = this.qte;
    svg.style.display = 'none';
    if (!me?.alive || !me.holding || me.impactAt === null) {
      this.localLock = null;
      return;
    }
    const { qte, attack } = this.conn.config;
    const impacts = [me.impactAt, ...snap.players.filter((p) => p.alive && p.targetId === me.id && p.impactAt !== null).map((p) => p.impactAt!)];
    const T = Math.min(...impacts.filter((t) => t + qte.lateMs >= now));
    if (!Number.isFinite(T)) return;

    // Tamanho e posição: à direita do corpo, proporcional ao zoom da câmera.
    const c = this.screen(this.world(me.x, me.y, 0.75));
    const edge = this.screen(this.world(me.x, me.y, 0.75).add(new THREE.Vector3(0.75, 0, 0)));
    const r = Math.max(46, Math.abs(edge.x - c.x) * 1.25);
    svg.style.display = 'block';
    svg.style.transform = `translate(${c.x}px, ${c.y}px)`;

    // Tempo → posição na barra (0 = base, 1 = topo). Do início da preparação até o fim da janela.
    const t0 = T - attack.windupMs;
    const t1 = T + qte.lateMs;
    const u = (t: number) => Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
    const A0 = (62 * Math.PI) / 180; // base (embaixo, à direita)
    const A1 = (-62 * Math.PI) / 180; // topo
    const pt = (k: number) => {
      const a = A0 + (A1 - A0) * k;
      return `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
    };
    const arc = (k0: number, k1: number) => (k1 <= k0 ? '' : `M ${pt(k0)} A ${r} ${r} 0 0 0 ${pt(k1)}`);
    const set = (cls: string, d: string) => (svg.querySelector(`.${cls}`) as SVGPathElement).setAttribute('d', d);
    set('edge', arc(0, 1));
    set('track', arc(0, 1));
    set('win', arc(u(T - qte.leadMs), 1));
    set('perf', arc(u(T - qte.perfectMs), u(T + qte.perfectMs)));

    // Enchimento: até agora, ou congelado onde você apertou.
    const lockAt = this.localLock ?? (me.locked ? now : null);
    const fillTo = u(lockAt ?? now);
    const fill = svg.querySelector('.fill') as SVGPathElement;
    fill.setAttribute('d', arc(0, Math.max(0.001, fillTo)));
    const lbl = svg.querySelector('.lbl') as SVGTextElement;
    const tick = svg.querySelector('.tick') as SVGLineElement;
    const [tx, ty] = pt(u(T)).split(' ').map(Number);
    tick.setAttribute('x1', String(tx * 0.86));
    tick.setAttribute('y1', String(ty * 0.86));
    tick.setAttribute('x2', String(tx * 1.14));
    tick.setAttribute('y2', String(ty * 1.14));
    const [lx, ly] = pt(1).split(' ').map(Number);
    lbl.setAttribute('x', String(lx + 10));
    lbl.setAttribute('y', String(ly - 12));

    let state: string;
    let text: string;
    if (lockAt !== null) {
      // Mesma regra do servidor (gradeLock): perto do PÔ! = perfeito; antes/depois dentro do limite = bom.
      const d = lockAt - T;
      state = Math.abs(d) <= qte.perfectMs ? 'perfect' : d > qte.lateMs ? 'fail' : 'good';
      text = state === 'perfect' ? 'PERFEITO!' : state === 'good' ? (d < -qte.leadMs ? 'BOM (cedo)' : 'BOM') : 'TARDE!';
    } else if (now > T + qte.lateMs) {
      state = 'fail';
      text = 'FALHA';
    } else {
      // Jo-Ken-Pô pequeno, no rótulo da barra (antes era um texto grande flutuando em cima do duelo).
      const dt = T - now;
      state = Math.abs(dt) <= qte.perfectMs ? 'perfect live' : dt <= qte.leadMs ? 'window live' : 'early live';
      const beat = Math.round(dt / BEAT_MS); // 2 = JO, 1 = KEN, 0 = PÔ!
      text = Math.abs(dt) <= qte.perfectMs ? CHANT[2] : beat >= 0 && beat <= 2 ? CHANT[2 - beat] : '';
    }
    fill.setAttribute('class', `fill ${state}`);
    lbl.setAttribute('class', `lbl ${state}`);
    lbl.textContent = text;
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
