import * as THREE from 'three';
import { CHARACTER_IDS, CHARACTER_INFO, DEFAULT_CONFIG, PLAYER_COLORS, type CharacterId, type PlayerView } from '@ppt/shared';
import { S, toWorld } from './assets';
import { buildArena3D, type ArenaHandles } from './arena3d';
import { Character3D } from './character3d';

export interface MenuState {
  character: CharacterId;
  bots: number;
  name: string;
}

/** Quem não joga fica encostado no balcão do Bar do Zé (coordenadas da simulação). */
const BAR_SPOTS = [
  { x: 110, y: 230 },
  { x: 175, y: 245 },
  { x: 240, y: 235 },
  { x: 305, y: 248 },
];
const WALK = 0.32; // px/ms

interface Actor {
  id: CharacterId;
  c: Character3D;
  ring: THREE.Mesh;
  x: number;
  y: number;
  fx: number;
  fy: number;
  moving: boolean;
  label: HTMLDivElement;
}

/**
 * Fundo do menu: o próprio quintal em 3D, com cada personagem caminhando até o ponto de largada
 * que terá na partida (você no 1, NPCs nos seguintes). A câmera desvia para a direita do menu lateral.
 */
export class MenuStage3D {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private arena!: ArenaHandles;
  private actors: Actor[] = [];
  private overlay!: HTMLDivElement;
  private ro: ResizeObserver | null = null;
  private clock = new THREE.Clock();
  private t0 = performance.now();

  constructor(
    private readonly parent: HTMLElement,
    private readonly sidebar: HTMLElement,
    private readonly state: () => MenuState,
    private readonly onPick: (c: CharacterId) => void,
  ) {}

  show(): void {
    if (this.renderer) return;
    const cfg = DEFAULT_CONFIG;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.parent.appendChild(r.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay3d';
    this.parent.appendChild(this.overlay);
    this.arena = buildArena3D(this.scene, cfg);

    const targets = this.targets();
    this.actors = CHARACTER_IDS.map((id) => {
      const c = new Character3D(id);
      this.scene.add(c.root);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      const label = document.createElement('div');
      label.className = 'menulabel3d';
      this.overlay.appendChild(label);
      const p = targets.get(id)!.pos;
      return { id, c, ring, x: p.x, y: p.y, fx: 0, fy: 1, moving: false, label };
    });

    r.domElement.addEventListener('pointerdown', (e) => this.pick(e));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.parent);
    this.resize();
    r.setAnimationLoop(() => this.frame());
  }

  hide(): void {
    if (!this.renderer) return;
    this.renderer.setAnimationLoop(null);
    this.ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
    this.renderer = null;
    this.actors = [];
  }

  private targets(): Map<CharacterId, { pos: { x: number; y: number }; slot: number }> {
    const s = this.state();
    const playing = [s.character, ...CHARACTER_IDS.filter((c) => c !== s.character).slice(0, s.bots)];
    const out = new Map<CharacterId, { pos: { x: number; y: number }; slot: number }>();
    CHARACTER_IDS.forEach((c, i) => {
      const slot = playing.indexOf(c);
      out.set(c, { pos: slot >= 0 ? DEFAULT_CONFIG.spawns[slot] : BAR_SPOTS[i], slot });
    });
    return out;
  }

  private resize(): void {
    if (!this.renderer) return;
    const W = Math.max(1, this.parent.clientWidth);
    const H = Math.max(1, this.parent.clientHeight);
    this.renderer.setSize(W, H);
    const side = W > 760 ? this.sidebar.getBoundingClientRect().width : 0;
    const freeW = W - side;
    // Desloca a imagem para a direita do menu lateral (a arena fica centrada na área livre).
    this.camera.aspect = W / H;
    this.camera.setViewOffset(W, H, -side / 2, 0, W, H);
    const cfg = DEFAULT_CONFIG;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfW = cfg.arena.rx * S + 0.4;
    const halfH = cfg.arena.ry * S + 1.4;
    const dist = Math.max(halfW / (t * (freeW / H)), halfH / t, 9);
    this.scene.fog = new THREE.Fog(0xd08a6b, dist + 5, dist + 30);
    const target = new THREE.Vector3(-0.4, 0, 0.8);
    const dir = new THREE.Vector3(0, 1, 0.95).normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.camera.userData.base = this.camera.position.clone();
    this.camera.userData.target = target;
    this.camera.updateProjectionMatrix();
  }

  private pick(e: PointerEvent): void {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    let best: Actor | null = null;
    let bestD = 70;
    for (const a of this.actors) {
      const s = toWorld(DEFAULT_CONFIG, a.x, a.y).setY(0.7).project(this.camera);
      const sx = ((s.x + 1) / 2) * rect.width;
      const sy = ((1 - s.y) / 2) * rect.height;
      const d = Math.hypot(sx - (e.clientX - rect.left), sy - (e.clientY - rect.top));
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      best.c.hit(0, 0, 1, 0, 0.8, performance.now());
      this.onPick(best.id);
    }
  }

  private frame(): void {
    if (!this.renderer) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    const s = this.state();
    const targets = this.targets();
    const cfg = DEFAULT_CONFIG;
    for (const a of this.actors) {
      const t = targets.get(a.id)!;
      const dx = t.pos.x - a.x;
      const dy = t.pos.y - a.y;
      const d = Math.hypot(dx, dy);
      a.moving = d > 3;
      if (a.moving) {
        const stepLen = Math.min(d, WALK * dt * 1000);
        a.x += (dx / d) * stepLen;
        a.y += (dy / d) * stepLen;
        a.fx = dx / d;
        a.fy = dy / d;
      } else {
        const cx = cfg.arena.cx - a.x;
        const cy = cfg.arena.cy - a.y;
        const n = Math.hypot(cx, cy) || 1;
        a.fx += (cx / n - a.fx) * 0.05;
        a.fy += (cy / n - a.fy) * 0.05;
      }
      const isMe = t.slot === 0;
      const view = viewOf(a, t.slot);
      const w = toWorld(cfg, a.x, a.y);
      a.c.update(dt, { view, now, faceX: a.fx, faceZ: a.fy, speed: a.moving ? WALK * 1000 : 0, pump: 0, drink: -1 }, w.x, w.z);
      const hop = isMe && !a.moving ? Math.abs(Math.sin(now / 300)) * 0.12 : 0;
      a.c.root.position.y = hop;
      a.c.root.scale.setScalar(isMe ? 1.15 : 1);
      a.ring.visible = t.slot >= 0;
      a.ring.position.set(w.x, 0.02, w.z);
      (a.ring.material as THREE.MeshBasicMaterial).color.set(isMe ? 0xffffff : PLAYER_COLORS[Math.max(0, t.slot)]);
      const sp = toWorld(cfg, a.x, a.y).setY(1.75).project(this.camera);
      const W = this.parent.clientWidth;
      const H = this.parent.clientHeight;
      a.label.style.transform = `translate(${((sp.x + 1) / 2) * W}px, ${((1 - sp.y) / 2) * H}px)`;
      a.label.textContent = isMe ? `${s.name || 'Você'} (você)` : t.slot >= 0 ? CHARACTER_INFO[a.id].name : '';
      a.label.classList.toggle('me', isMe);
    }
    this.arena.update(dt, now);
    // Câmera respirando devagar.
    const base = this.camera.userData.base as THREE.Vector3 | undefined;
    if (base) {
      const k = (now - this.t0) / 1000;
      this.camera.position.set(base.x + Math.sin(k * 0.25) * 0.5, base.y, base.z + Math.cos(k * 0.2) * 0.3);
      this.camera.lookAt(this.camera.userData.target as THREE.Vector3);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

function viewOf(a: Actor, slot: number): PlayerView {
  return {
    id: a.id,
    name: CHARACTER_INFO[a.id].name,
    color: PLAYER_COLORS[Math.max(0, slot) % PLAYER_COLORS.length],
    character: a.id,
    isBot: slot !== 0,
    x: a.x,
    y: a.y,
    faceX: a.fx,
    faceY: a.fy,
    hp: 3,
    maxHp: 3,
    focus: 100,
    alive: true,
    holding: false,
    locked: false,
    symbol: null,
    targetId: null,
    impactAt: null,
    clashWith: null,
    stunned: false,
    busy: false,
    graceUntil: 0,
    dashReadyAt: 0,
    swapsLeft: null,
    drinkingUntil: 0,
  };
}
