import * as THREE from 'three';
import { CHARACTER_IDS, CHARACTER_INFO, DEFAULT_CONFIG, PLAYER_COLORS, type CharacterId, type PlayerView } from '@ppt/shared';
import { S, toWorld } from './assets';
import { BAR, BAR_EXTENT, buildArena3D, type ArenaHandles, SKY } from './arena3d';
import { Character3D } from './character3d';
import { Ambient3D } from './ambient3d';

export interface MenuState {
  /** Quem joga, na ordem das largadas (largada 1 = primeiro). */
  lineup: CharacterId[];
  /** O seu personagem. */
  me: CharacterId;
  /** Apelidos (online/você); quem não tiver usa o nome do personagem. */
  names: Partial<Record<CharacterId, string>>;
}

const WALK = 2.3; // unidades/s
/** Tempo para levantar do banquinho antes de sair andando, e intervalo entre um e outro. */
const STAND_MS = 450;
const STAGGER_MS = 380;
/** Altura do personagem quando sentado no banquinho. */
const SIT_Y = 0.14;

interface Actor {
  id: CharacterId;
  c: Character3D;
  ring: THREE.Mesh;
  label: HTMLDivElement;
  pos: THREE.Vector3;
  face: THREE.Vector3;
  seat: number;
  /** Destino atual (chave) e rota até ele. */
  destKey: string;
  route: THREE.Vector3[];
  seated: boolean;
  departAt: number;
  slot: number;
}

/**
 * Fundo do menu: o quintal em 3D. A turma começa sentada na mesa do lado de fora do bar;
 * quem vai jogar levanta, passa pela porteira e vai até o ponto de largada da partida.
 * Quem fica de fora volta para o banquinho. A câmera desvia para a direita do menu lateral.
 */
export class MenuStage3D {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private arena!: ArenaHandles;
  /** Torcida, cachorros, garçom e paredão: o menu já abre com o quintal cheio. */
  private ambient: Ambient3D | null = null;
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
    this.ambient = new Ambient3D(this.scene, cfg, this.arena);
    this.t0 = performance.now();

    // Todo mundo começa sentado na mesa do lado de fora do bar.
    this.actors = CHARACTER_IDS.map((id, i) => {
      const c = new Character3D(id);
      this.scene.add(c.root);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      const label = document.createElement('div');
      label.className = 'menulabel3d';
      this.overlay.appendChild(label);
      const seat = this.arena.seats[i % this.arena.seats.length];
      return {
        id,
        c,
        ring,
        label,
        pos: seat.pos.clone().setY(0),
        face: seat.face.clone(),
        seat: i,
        destKey: `seat:${i}`,
        route: [],
        seated: true,
        departAt: 0,
        slot: -1,
      };
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
    this.ambient?.destroy();
    this.ambient = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
    this.renderer = null;
    this.actors = [];
  }

  /** Quem joga e em que posição. */
  private slots(): Map<CharacterId, number> {
    const { lineup } = this.state();
    return new Map(CHARACTER_IDS.map((c) => [c, lineup.indexOf(c)]));
  }

  private inArena(p: THREE.Vector3): boolean {
    const { rx, ry } = DEFAULT_CONFIG.arena;
    return (p.x / (rx * S)) ** 2 + (p.z / (ry * S)) ** 2 < 1.05;
  }

  /** Planeja a rota: sempre pela porteira quando entra ou sai da arena. */
  private plan(a: Actor, slot: number, now: number, order: number): void {
    const { gate, seats } = this.arena;
    const cfg = DEFAULT_CONFIG;
    a.slot = slot;
    if (slot >= 0) {
      const sp = cfg.spawns[slot];
      const dest = toWorld(cfg, sp.x, sp.y);
      a.destKey = `spawn:${slot}`;
      a.route = this.inArena(a.pos) ? [dest] : [gate.outside.clone(), gate.inside.clone(), dest];
    } else {
      const dest = seats[a.seat].pos.clone().setY(0);
      a.destKey = `seat:${a.seat}`;
      a.route = this.inArena(a.pos) ? [gate.inside.clone(), gate.outside.clone(), dest] : [dest];
    }
    // Quem está sentado leva um instante para levantar; saem um de cada vez.
    a.departAt = a.seated ? now + STAND_MS + order * STAGGER_MS : now;
  }

  private resize(): void {
    if (!this.renderer) return;
    const W = Math.max(1, this.parent.clientWidth);
    const H = Math.max(1, this.parent.clientHeight);
    this.renderer.setSize(W, H);
    const side = W > 760 ? this.sidebar.getBoundingClientRect().width + 14 : 0;
    const freeW = W - side;
    // Desloca a imagem para a direita do menu lateral (a cena fica centrada na área livre).
    this.camera.aspect = W / H;
    this.camera.setViewOffset(W, H, -side / 2, 0, W, H);
    const cfg = DEFAULT_CONFIG;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // Enquadra a arena e a mesa do lado de fora do bar.
    const halfW = cfg.arena.rx * S + 2.5;
    const halfH = cfg.arena.ry * S + 1.4;
    let dist = Math.max(halfW / (t * (freeW / H)), halfH / t, 9);
    const target = new THREE.Vector3(-1.6, 0, -0.9);
    const dir = new THREE.Vector3(0, 1, 0.95).normalize();
    // Afasta só o necessário para o Bar do Zé caber inteiro (telhado encostando no alto da tela).
    const e = BAR_EXTENT;
    const corners: THREE.Vector3[] = [];
    for (const x of [-e.halfW, e.halfW]) for (const z of [-e.back, e.front]) for (const y of [0, e.top]) corners.push(new THREE.Vector3(BAR.x + x, y, BAR.z + z));
    const p = new THREE.Vector3();
    const left = -1 + (2 * side) / W;
    for (let k = 0; k < 40; k++) {
      this.camera.position.copy(target).addScaledVector(dir, dist);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      const fits = corners.every((c) => (p.copy(c).project(this.camera), p.y < 0.985 && p.x > left + 0.01));
      if (fits) break;
      dist *= 1.015;
    }
    // Um pouco mais longe que o justo: mais quintal em volta do bar (pedido do usuário).
    dist *= 1.12;
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.camera.userData.base = this.camera.position.clone();
    this.camera.userData.target = target;
    this.camera.updateProjectionMatrix();
    this.scene.fog = new THREE.Fog(SKY, dist + 5, dist + 30);
  }

  private pick(e: PointerEvent): void {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    let best: Actor | null = null;
    let bestD = 70;
    for (const a of this.actors) {
      const s = a.pos.clone().setY(0.7).project(this.camera);
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
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    // A caminhada usa o tempo real (até 0,25 s por quadro) para não virar câmera lenta em máquina lenta.
    const walkDt = Math.min(0.25, raw);
    this.ambient?.update(dt);
    const now = performance.now();
    const s = this.state();
    const slots = this.slots();
    const cfg = DEFAULT_CONFIG;
    const W = this.parent.clientWidth;
    const H = this.parent.clientHeight;

    // Replaneja quem mudou de destino (quem vai jogar sai primeiro, na ordem das largadas).
    const changed = this.actors.filter((a) => {
      const slot = slots.get(a.id)!;
      return (slot >= 0 ? `spawn:${slot}` : `seat:${a.seat}`) !== a.destKey;
    });
    const rank = (a: Actor) => {
      const sl = slots.get(a.id)!;
      return sl < 0 ? 9 : sl;
    };
    changed.sort((x, y) => rank(x) - rank(y)).forEach((a, order) => this.plan(a, slots.get(a.id)!, now, order));

    for (const a of this.actors) {
      let speed = 0;
      if (a.route.length && now >= a.departAt) {
        a.seated = false;
        const next = a.route[0];
        const d = next.clone().sub(a.pos).setY(0);
        const len = d.length();
        const step = WALK * walkDt;
        if (len <= step) {
          a.pos.copy(next);
          a.route.shift();
        } else {
          a.pos.addScaledVector(d.normalize(), step);
          a.face.copy(d);
        }
        speed = WALK * 100;
      }
      const arrived = a.route.length === 0;
      if (arrived && a.destKey.startsWith('seat:')) {
        a.seated = true;
        a.face.lerp(this.arena.seats[a.seat].face, 0.15);
      } else if (arrived) {
        // No ponto de largada: olha para o centro da arena.
        const toCenter = new THREE.Vector3(-a.pos.x, 0, -a.pos.z).normalize();
        a.face.lerp(toCenter, 0.06);
      }
      const isMe = a.id === s.me && a.slot >= 0;
      const view = viewOf(a, a.pos, cfg);
      // Continua sentado enquanto "levanta" (até a hora de sair andando).
      const sitting = a.seated;
      a.c.update(dt, { view, now, faceX: a.face.x, faceZ: a.face.z, speed, pump: 0, drink: -1, sit: sitting }, a.pos.x, a.pos.z);
      const hop = isMe && arrived && !a.seated ? Math.abs(Math.sin(now / 300)) * 0.12 : 0;
      a.c.root.position.y = sitting ? SIT_Y : hop;
      a.c.root.scale.setScalar(isMe ? 1.12 : 1);
      a.ring.visible = a.slot >= 0 && arrived && !a.seated;
      a.ring.position.set(a.pos.x, 0.02, a.pos.z);
      (a.ring.material as THREE.MeshBasicMaterial).color.set(isMe ? 0xffffff : PLAYER_COLORS[Math.max(0, a.slot)]);
      const sp = a.pos.clone().setY(sitting ? 1.5 : 1.75).project(this.camera);
      a.label.style.transform = `translate(${((sp.x + 1) / 2) * W}px, ${((1 - sp.y) / 2) * H}px)`;
      const nm = s.names[a.id] ?? CHARACTER_INFO[a.id].name;
      a.label.textContent = isMe ? `${nm} (você)` : nm;
      a.label.classList.toggle('me', isMe);
      a.label.classList.toggle('bench', a.slot < 0);
    }
    this.arena.update(dt, now);
    // Câmera respirando devagar.
    const base = this.camera.userData.base as THREE.Vector3 | undefined;
    if (base) {
      const k = (now - this.t0) / 1000;
      this.camera.position.set(base.x + Math.sin(k * 0.25) * 0.4, base.y, base.z + Math.cos(k * 0.2) * 0.25);
      this.camera.lookAt(this.camera.userData.target as THREE.Vector3);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

/** Converte a posição do mundo de volta para coordenadas da simulação (o rig usa px). */
function viewOf(a: Actor, pos: THREE.Vector3, cfg: typeof DEFAULT_CONFIG): PlayerView {
  return {
    id: a.id,
    name: CHARACTER_INFO[a.id].name,
    color: PLAYER_COLORS[Math.max(0, a.slot) % PLAYER_COLORS.length],
    character: a.id,
    isBot: a.slot !== 0,
    x: pos.x / S + cfg.arena.cx,
    y: pos.z / S + cfg.arena.cy,
    faceX: a.face.x,
    faceY: a.face.z,
    hp: 3,
    maxHp: 3,
    focus: 100,
    alive: true,
    holding: false,
    locked: false,
    symbol: null,
    targetId: null,
    impactAt: null,
    pickedAt: null,
    challenger: false,
    stunned: false,
    busy: false,
    graceUntil: 0,
    dashReadyAt: 0,
    drinkingUntil: 0,
    slowed: false,
    shielded: false,
    openingUntil: 0,
  };
}
