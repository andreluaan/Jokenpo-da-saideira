import * as THREE from 'three';
import { makeRng, type GameConfig, type Obstacle } from '@ppt/shared';
import { S, fit, instance, place, recolor, shadows, toWorld } from './assets';
import { makeBottle } from './character3d';
import { grassTexture, roadTexture, softCircle, speckleTexture, textTexture } from './textures';
import { mergeStatic } from './merge';
import { buildBeerTable, buildCooler, buildCrates, buildFreezer, buildGrill } from './props3d';

const SOFT = softCircle();
const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** Elipse (com ou sem furo) deitada no chão. */
function ellipseShape(rx: number, rz: number, holeRx?: number, holeRz?: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  if (holeRx && holeRz) {
    const h = new THREE.Path();
    h.absellipse(0, 0, holeRx, holeRz, 0, Math.PI * 2, true, 0);
    s.holes.push(h);
  }
  return s;
}

function flat(shape: THREE.Shape, m: THREE.Material, y: number, segs = 96): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.ShapeGeometry(shape, segs), m);
  o.rotation.x = -Math.PI / 2;
  o.position.y = y;
  o.receiveShadow = true;
  return o;
}

export interface Seat {
  pos: THREE.Vector3;
  /** Para onde o personagem sentado olha (a mesa). */
  face: THREE.Vector3;
  /** Caminho do banco até a entradinha do cercadinho (sem atravessar a mesa). */
  path?: THREE.Vector3[];
}

/**
 * Área dos jogadores (v0.13): cercadinho retangular encostado na porteira da arena, alinhado com a cerca.
 * `c` = centro, `t` = ao longo da cerca, `n` = para fora da arena; `halfL`/`halfD` = metades do retângulo.
 */
interface PlayersArea {
  c: THREE.Vector3;
  t: THREE.Vector3;
  n: THREE.Vector3;
  halfL: number;
  halfD: number;
  /** Ponto da entradinha (lado virado para a porteira da arena). */
  door: THREE.Vector3;
  /** Posição da entradinha ao longo do lado de dentro (fica alinhada com a porteira da arena). */
  doorU: number;
}

export interface ArenaHandles {
  /** Onde fica a long neck em cima da mesa (para mostrar/esconder). */
  beerSpot: THREE.Vector3;
  /** Porteira: um ponto do lado de fora e outro do lado de dentro da arena. */
  gate: { outside: THREE.Vector3; inside: THREE.Vector3 };
  /** Banquinhos da mesa do lado de fora do bar (onde os jogadores sentam no menu). */
  seats: Seat[];
  /** Cadeiras das mesas vermelhas (torcida sentada). */
  fanSeats: Seat[];
  /** Onde fica a picape com paredão (traseira virada para a arena) e o garçom do balcão. */
  truck: { pos: THREE.Vector3; yaw: number };
  barWaiter: { pos: THREE.Vector3; yaw: number };
  /** Lugares dentro do Bar do Zé (varanda): banquetas do balcão e cadeiras da mesinha. */
  barSeats: Seat[];
  /** Área reservada da mesa dos jogadores: torcida não chega perto (só os cachorros). */
  playersArea: { center: THREE.Vector3; r: number };
  /** Pontos onde a turma em pé faz rodinha (conversando com a cerveja na mão). */
  hangouts: THREE.Vector3[];
  /** Grupo 3D de cada obstáculo (mesmo índice de config.obstacles; null quando não há grupo único). */
  props: (THREE.Group | null)[];
  /** Queda de luz: 0 = normal, 1 = quintal apagado (só brasa, luz do bar e as lâmpadas do varal). */
  setDim(k: number): void;
  update(dt: number, now: number): void;
}

/** Grama do quintal (v0.7: mais verde e aconchegante). A névoa/fundo é um verde-claro de mormaço. */
const GROUND = 0x8fa452;
export const SKY = 0xa9b97a;

/** Estradinha de terra que chega no terreiro do Bar do Zé (pontos em x/z do mundo). */
// v0.13: passa por fora da área dos jogadores (folga ~0,4 da beira) e chega no terreiro por cima dela.
const ROAD: [number, number][] = [
  [-19, 6.6],
  [-15.6, 4.6],
  [-14.6, 1.4],
  [-14.4, -1.8],
  [-13.6, -4.5],
  [-12.0, -5.6],
  [-10.2, -5.45],
  [-8.4, -5.35],
];
/** Bar do Zé (v0.9): maior, com varanda coberta, recuado da arena. Frente virada para +z. */
export const BAR = { x: -7.6, z: -8.0 };
/** Caixa do bar inteiro (casinha + varanda + telhado), relativa a BAR — usada para enquadrar a câmera do menu. */
export const BAR_EXTENT = { halfW: 2.7, back: 2.5, front: 2.6, top: 3.3 };
/** Lousa da SAIDEIRA (placa de beira de estrada), à vista da câmera do menu e da partida. */
const SAIDEIRA_BOARD = { x: -9.9, z: 6.8 };
/** Mesas vermelhas em volta (x, z, guarda-sol). */
const PATIOS: [number, number, boolean][] = [
  [9.2, 4.9, true],
  [10.9, 1.5, false],
  [10.6, -2.4, true],
  [2.2, -7.6, true],
  [-0.9, -7.6, false],
  [-3.2, -6.7, true],
  [-9.6, 3.6, true],
  [-7.8, 5.7, false],
  [6.4, 6.3, true],
];
const HANGOUTS: [number, number][] = [
  [-3.6, 6.6],
  [3.3, -6.4],
  [11.5, -0.4],
  // (estava em -3,4/-4,7, em cima da cerca: metade da roda ficava dentro da arena)
  [8.7, -5.3],
];

/** Monta todo o quintal do Bar do Zé. */
export function buildArena3D(scene: THREE.Scene, cfg: GameConfig): ArenaHandles {
  const rng = makeRng(20261016);
  const before = new Set(scene.children);
  const { rx, ry } = cfg.arena;
  const ax = rx * S;
  const az = ry * S;
  const smokes: { s: THREE.Sprite; t: number; x: number; z: number }[] = [];
  const glows: THREE.Mesh[] = [];

  // --- chão ---
  // Chão de fora um tom mais escuro e menos saturado que a arena: o olho vai direto para o ringue.
  const groundTex = grassTexture(GROUND);
  groundTex.repeat.set(12, 9);
  const ground = mesh(new THREE.PlaneGeometry(70, 50), std(0xffffff, { map: groundTex, flatShading: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);

  // Campo seco no fundo à direita.
  const field = new THREE.Shape();
  // (a forma é desenhada em x/y e deitada no chão: y da forma = -z do mundo, então o campo fica no fundo)
  field.moveTo(4.5, 30);
  field.lineTo(40, 30);
  field.lineTo(40, 1.2);
  field.bezierCurveTo(14, 1.5, 12, 3, 9.5, 5.2);
  field.bezierCurveTo(8, 6.3, 6, 6.4, 4.5, 7.2);
  const fieldTex = speckleTexture(0xe9b949, [0xd9a43a, 0xf2cc6a, 0xdcab40], 2000, 512, 11, 0.3, 2.5);
  fieldTex.repeat.set(0.15, 0.15);
  scene.add(flat(field, std(0xffffff, { map: fieldTex, flatShading: false }), 0.004));

  // Terra revirada, terra da arena e a borda branca.
  scene.add(flat(ellipseShape(ax + 0.75, az + 0.7), std(0xa0705c, { transparent: true, opacity: 0.6 }), 0.006));
  // Terra batida clara: personagens (com contorno escuro) se destacam bem sobre ela.
  const dirtTex = speckleTexture(0xc89f83, [0xbb9073, 0xd4b097, 0xb2856a], 2400, 512, 5, 0.25, 3);
  dirtTex.repeat.set(0.35, 0.35);
  scene.add(flat(ellipseShape(ax + 0.16, az + 0.16), std(0xffffff, { map: dirtTex, flatShading: false }), 0.01));
  scene.add(flat(ellipseShape(ax + 0.2, az + 0.2, ax + 0.06, az + 0.06), std(0xf3ece8), 0.014));

  // --- cerca de madeira ---
  const fx = ax + 0.42;
  const fz = az + 0.42;
  const posts: THREE.Vector3[] = [];
  const steps = 900;
  let acc = 0;
  let last = new THREE.Vector3(fx, 0, 0);
  const panel = 1.25;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * fx, 0, Math.sin(a) * fz);
    acc += p.distanceTo(last);
    last = p;
    if (acc >= panel) {
      acc = 0;
      posts.push(p);
    }
  }
  // A porteira fica no painel mais próximo deste ângulo (lado do bar).
  const GATE_ANGLE = -2.75;
  const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let gateIdx = 0;
  posts.forEach((p, i) => {
    const q = posts[(i + 1) % posts.length];
    const m = p.clone().add(q).multiplyScalar(0.5);
    const best = posts[gateIdx].clone().add(posts[(gateIdx + 1) % posts.length]).multiplyScalar(0.5);
    if (angDist(Math.atan2(m.z / fz, m.x / fx), GATE_ANGLE) < angDist(Math.atan2(best.z / fz, best.x / fx), GATE_ANGLE)) gateIdx = i;
  });
  const gate = { outside: new THREE.Vector3(), inside: new THREE.Vector3() };
  posts.forEach((p, i) => {
    const q = posts[(i + 1) % posts.length];
    const mid = p.clone().add(q).multiplyScalar(0.5);
    if (i === gateIdx) {
      // Porteira aberta para dentro.
      const gtf = place('nature/fence_gate', mid.x, mid.z, { height: 0.5 });
      gtf.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      gtf.scale.x *= p.distanceTo(q) / (panel * 0.98) || 1;
      const leaf = gtf.getObjectByName('gate');
      if (leaf) leaf.rotation.y = -1.35;
      scene.add(gtf);
      for (const end of [p, q]) scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6), std(0x6a3f37), end.x, 0.37, end.z));
      const n = mid.clone().normalize();
      gate.outside.copy(mid).addScaledVector(n, 1.0);
      gate.inside.copy(mid).addScaledVector(n, -1.1);
      return;
    }
    const f = place('nature/fence_simple', mid.x, mid.z, { height: 0.5 });
    f.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
    f.scale.x *= p.distanceTo(q) / (panel * 0.98) || 1;
    scene.add(f);
    // Plaquinha amarela em losango de vez em quando.
    if (i % 5 === 2) {
      const sign = mesh(new THREE.PlaneGeometry(0.24, 0.24), std(0xffc145, { side: THREE.DoubleSide }), mid.x, 0.3, mid.z);
      sign.rotation.set(0, f.rotation.y, Math.PI / 4);
      sign.position.add(new THREE.Vector3(mid.x, 0, mid.z).normalize().multiplyScalar(-0.06));
      scene.add(sign);
    }
  });

  // Área dos jogadores: logo depois da porteira, alinhada com a cerca (mesa comprida de 8 lugares).
  const gn = gate.outside.clone().sub(gate.inside).setY(0).normalize();
  const gmid = gate.outside.clone().addScaledVector(gn, -1.0);
  const halfL = 2.25;
  const halfD = 1.2;
  // O cercadinho desce um pouco (para longe da varanda do bar); a entradinha continua de frente para a porteira.
  const gt = new THREE.Vector3(-gn.z, 0, gn.x);
  const shift = 1.6;
  const pa: PlayersArea = {
    c: gmid.clone().addScaledVector(gn, 1.0 + 0.55 + halfD).addScaledVector(gt, -shift),
    t: gt,
    n: gn,
    halfL,
    halfD,
    door: gmid.clone().addScaledVector(gn, 1.0 + 0.25),
    doorU: shift,
  };

  // Varal de luzes no fundo (postes altos + lâmpadas).
  const bulbColors = [0xffd27a, 0xff6b5a, 0x7ee0a8, 0x9fd3ff];
  const back = posts.filter((p) => p.z < -1.2);
  const poles = back.filter((_, i) => i % 3 === 0);
  for (const p of poles) scene.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 6), std(0x6a3f37), p.x, 0.95, p.z));
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i];
    const b = poles[i + 1];
    const pts: THREE.Vector3[] = [];
    for (let t = 0; t <= 1.001; t += 0.1) {
      const v = a.clone().lerp(b, t);
      v.y = 1.85 - Math.sin(t * Math.PI) * 0.35;
      pts.push(v);
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2b1d22 })));
    pts.slice(1, -1).forEach((v, k) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: bulbColors[(i + k) % 4] }));
      bulb.position.set(v.x, v.y - 0.06, v.z);
      scene.add(bulb);
      glows.push(bulb);
    });
  }

  // --- obstáculos (mesmas posições da simulação) ---
  let beerSpot = new THREE.Vector3();
  const props: (THREE.Group | null)[] = [];
  for (const [i, o] of cfg.obstacles.entries()) {
    const { spot, group } = buildObstacle(scene, cfg, o, smokes, i);
    if (o.prop === 'beerTable' && spot) beerSpot = spot;
    props.push(group);
  }

  // --- entorno: estradinha, Bar do Zé, árvores, mesas, plantas ---
  const roadPts = buildRoad(scene, ROAD);
  // Terreiro de terra batida na frente do bar, onde a estrada chega.
  scene.add(flat(ellipseShape(2.9, 0.95), std(0xb8916a, { flatShading: false }), 0.007).translateX(BAR.x).translateY(-(BAR.z + 2.7)));
  const bar = buildBar(scene, BAR.x, BAR.z);
  const seats = buildPlayersTable(scene, pa);
  buildPlayersArea(scene, pa);
  const roadDist = (x: number, z: number) => Math.min(...roadPts.map((p) => Math.hypot(p.x - x, p.z - z)));
  // Árvores: verdes misturadas com as de outono (aconchego sem perder a paleta quente).
  const treeSpots: [number, number][] = [];
  for (const [x, z, h, kind] of [
    [8.6, -5.4, 2.6, 'tree_oak'],
    [11.6, -4.2, 2.2, 'tree_fat_fall'],
    [7.3, -7.9, 2.0, 'tree_default_fall'],
    [-13.4, 0.4, 2.4, 'tree_detailed'],
    [-12.9, -5.6, 2.2, 'tree_oak_fall'],
    [-1.4, -8.8, 2.1, 'tree_fat'],
    [12.1, 3.3, 2.3, 'tree_default'],
    [-11.2, 5.5, 2.1, 'tree_default_fall'],
    [13.6, -1.1, 2.2, 'tree_oak'],
    [-14.4, -2.4, 2.3, 'tree_fat'],
    [3.9, -9.2, 2.2, 'tree_detailed'],
    [-11.6, -8.6, 2.0, 'tree_default'],
    [-4.4, -6.0, 2.3, 'tree_palmShort'],
    [-10.8, -6.9, 1.8, 'tree_palmShort'],
  ] as const) {
    if (roadDist(x, z) < 1.7) continue; // (a estrada mudou na v0.13: árvore em cima dela fica de fora)
    scene.add(place(`nature/${kind}`, x, z, { height: h, rot: rng() * 6 }));
    treeSpots.push([x, z]);
  }
  // Milharal no campo.
  for (let i = 0; i < 26; i++) {
    const x = 6 + (i % 9) * 0.55 + rng() * 0.2;
    const z = -6.8 + Math.floor(i / 9) * 0.6 + rng() * 0.2;
    if (z > -4.8 && x < 9) continue;
    scene.add(place('nature/crops_cornStageD', x + 2.2, z, { height: 0.9 + rng() * 0.2, rot: rng() * 6 }));
  }
  // Mesas de plástico vermelhas espalhadas em volta (a turma assiste sentada, tomando uma).
  const fanSeats: Seat[] = [];
  for (const [x, z, umb] of PATIOS) fanSeats.push(...buildPatio(scene, x, z, umb));
  // Lousa da saideira na entrada da estradinha, como placa de beira de estrada.
  const board = new THREE.Group();
  // (v0.13: maior e virada para a câmera, inclinada para trás para ler de cima)
  const face = new THREE.Group();
  face.add(mesh(new THREE.BoxGeometry(1.9, 1.25, 0.08), std(0x8a4f45), 0, 0, 0));
  face.add(mesh(new THREE.PlaneGeometry(1.74, 1.09), new THREE.MeshStandardMaterial({ map: textTexture('SAIDEIRA\nquem perde paga', { w: 768, h: 480, bg: 0x2f3b33, size: 112, color: '#fff4e6' }), roughness: 1 }), 0, 0, 0.045));
  face.position.y = 1.35;
  face.rotation.x = -0.45;
  board.add(face);
  board.add(mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), std(0x6a3f37), -0.75, 0.7, -0.12));
  board.add(mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), std(0x6a3f37), 0.75, 0.7, -0.12));
  board.position.set(SAIDEIRA_BOARD.x, 0, SAIDEIRA_BOARD.z);
  board.rotation.y = 0.25;
  scene.add(board);

  // Vegetação: moitas acompanhando a estrada e muito capim, flor e arbusto pelo quintal.
  const free = (x: number, z: number, pad = 0) => {
    const k = (x / (ax + 1.45 + pad)) ** 2 + (z / (az + 1.45 + pad)) ** 2;
    if (k < 1) return false; // arena + torcida na cerca
    if (roadDist(x, z) < 1.15 + pad) return false;
    if (x > BAR.x - 3.2 && x < BAR.x + 3.2 && z > BAR.z - 2.6 && z < BAR.z + 3.8) return false; // bar e terreiro
    if (inPlayersArea(pa, x, z, 0.6 + pad)) return false; // área dos jogadores
    if (PATIOS.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.25 + pad)) return false;
    if (HANGOUTS.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 1.1 + pad)) return false;
    if (Math.hypot(x - 5.4, z + 7.6) < 2 + pad) return false; // picape
    if (Math.hypot(x - SAIDEIRA_BOARD.x, z - SAIDEIRA_BOARD.z) < 1.3 + pad) return false; // lousa da saideira
    return true;
  };
  roadPts.forEach((p, i) => {
    if (i % 3 !== 0) return;
    for (const side of [-1, 1]) {
      const n = roadPts[Math.min(roadPts.length - 1, i + 1)].clone().sub(p).normalize();
      const x = p.x - n.z * side * (1.25 + rng() * 0.4);
      const z = p.z + n.x * side * (1.25 + rng() * 0.4);
      if (!free(x, z, -0.2) || rng() < 0.6) continue;
      const kind = rng() < 0.55 ? 'nature/plant_bushSmall' : rng() < 0.5 ? 'nature/plant_bushDetailed' : 'nature/flower_yellowB';
      scene.add(place(kind, x, z, { height: kind.includes('grass') ? 0.35 : 0.42 + rng() * 0.2, rot: rng() * 6 }));
    }
  });
  const scatter: [string, number][] = [
    ['nature/grass_leafs', 0.28],
    ['nature/grass_leafsLarge', 0.36],
    ['nature/grass', 0.25],
    ['nature/grass_large', 0.3],
    ['nature/flower_redA', 0.25],
    ['nature/flower_yellowB', 0.25],
    ['nature/flower_purpleB', 0.25],
    ['nature/flower_redB', 0.25],
    ['nature/flower_yellowA', 0.25],
    ['nature/flower_purpleA', 0.25],
    ['nature/plant_bushSmall', 0.38],
    ['nature/rock_smallA', 0.16],
  ];
  for (let i = 0; i < 260; i++) {
    const x = (rng() - 0.5) * 30;
    const z = (rng() - 0.5) * 19;
    if (!free(x, z)) continue;
    const [kind, h] = scatter[Math.floor(rng() * scatter.length)];
    scene.add(place(kind, x, z, { height: h * (0.8 + rng() * 0.5), rot: rng() * 6 }));
  }
  // Mais árvores compondo o cenário (v0.13): preenche as áreas vazias do mapa todo — grama e campo seco —
  // numa grade com sorteio, respeitando estrada, bar, mesas, área dos jogadores e a arena (free), sem encostar uma na outra.
  const green = ['tree_oak', 'tree_fat', 'tree_default', 'tree_detailed', 'tree_oak_fall', 'tree_default_fall'];
  const dry = ['tree_fat_fall', 'tree_detailed_fall', 'tree_oak_fall', 'tree_default_fall'];
  const inField = (x: number, z: number) => x > 5 && z < -1.5 + Math.max(0, x - 9) * 0.25;
  for (let gx = -24; gx <= 24; gx += 2.3) {
    for (let gz = -15; gz <= 14; gz += 2.3) {
      const x = gx + (rng() - 0.5) * 1.8;
      const z = gz + (rng() - 0.5) * 1.8;
      if (!free(x, z, 0.5)) continue;
      if (x > 7.2 && x < 14 && z > -7.3 && z < -4.6) continue; // milharal
      if (treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.1)) continue;
      const field = inField(x, z);
      // Campo seco: poucas e de outono. Na frente da câmera (perto de quem olha) menos, para não tampar a arena.
      const front = z > 6.5 && Math.abs(x) < 11;
      if (rng() > (field ? 0.32 : front ? 0.3 : 0.62)) continue;
      const list = field ? dry : green;
      scene.add(place(`nature/${list[Math.floor(rng() * list.length)]}`, x, z, { height: (front ? 1.5 : 1.8) + rng() * 1.0, rot: rng() * 6 }));
      treeSpots.push([x, z]);
    }
  }
  scene.add(place('nature/log_stack', BAR.x - 3.3, BAR.z + 0.4, { size: 1.0, rot: 0.4 }));
  scene.add(place('furniture/trashcan', 7.2, 3.4, { height: 0.55 }));

  // --- luz ---
  const hemi = new THREE.HemisphereLight(0xfff0dd, 0x6b7a44, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.6);
  sun.position.set(-7, 13, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -13;
  sc.right = 13;
  sc.top = 10;
  sc.bottom = -10;
  sc.near = 1;
  sc.far = 40;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const barLight = new THREE.PointLight(0xffb36b, 6, 7, 1.6);
  barLight.position.set(-7.5, 1.6, -4.2);
  scene.add(barLight);
  scene.fog = new THREE.Fog(SKY, 22, 40);
  scene.background = new THREE.Color(SKY);

  // Desempenho: junta tudo que é parado em poucas malhas (centenas de desenhos a menos por quadro).
  // Os obstáculos ficam com grupo próprio (engradado quebra, freezer abre a tampa), juntados por dentro.
  const propSet = new Set<THREE.Object3D>(props.filter((g): g is THREE.Group => !!g));
  for (const g of propSet) mergeStatic(g, [...g.children], new Set([g.userData.lid].filter(Boolean)));
  const decor = scene.children.filter((o) => !before.has(o) && !propSet.has(o) && !(o as THREE.Light).isLight);
  mergeStatic(scene, decor, new Set<THREE.Object3D>(glows));

  const base = { hemi: hemi.intensity, sun: sun.intensity, bar: barLight.intensity };
  const night = new THREE.Color(0x1c1e24);
  const day = new THREE.Color(SKY);
  let dim = 0;
  return {
    beerSpot,
    gate,
    seats,
    fanSeats,
    // Nos fundos à direita (aparece no menu e na partida). Frente apontando para longe da arena →
    // caçamba e paredão virados para o ringue.
    truck: { pos: new THREE.Vector3(5.4, 0, -7.6), yaw: Math.atan2(7.6, 5.4) },
    barWaiter: bar.bartender,
    barSeats: bar.seats,
    playersArea: { center: pa.c.clone(), r: Math.hypot(pa.halfL, pa.halfD) + 0.2 },
    hangouts: HANGOUTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    props,
    setDim(k) {
      if (Math.abs(k - dim) < 1e-3) return;
      dim = k;
      hemi.intensity = base.hemi * (1 - 0.82 * k);
      sun.intensity = base.sun * (1 - 0.92 * k);
      barLight.intensity = base.bar * (1 + 0.6 * k);
      const c = day.clone().lerp(night, k);
      (scene.background as THREE.Color).copy(c);
      if (scene.fog) (scene.fog as THREE.Fog).color.copy(c);
    },
    update(dt, now) {
      for (const sm of smokes) {
        sm.t += dt / 2.6;
        if (sm.t > 1) sm.t -= 1;
        sm.s.position.set(sm.x + sm.t * 0.4, 0.9 + sm.t * 1.6, sm.z - sm.t * 0.2);
        sm.s.scale.setScalar(0.25 + sm.t * 0.7);
        (sm.s.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - sm.t);
      }
      const k = 0.85 + Math.sin(now / 700) * 0.15;
      // Lâmpadas do varal "respirando".
      glows.forEach((gl, i) => gl.scale.setScalar(k + Math.sin(now / 400 + i) * 0.1));
    },
  };
}

// ------------------------------------------------------------------ obstáculos

function buildObstacle(
  scene: THREE.Scene,
  cfg: GameConfig,
  o: Obstacle,
  smokes: { s: THREE.Sprite; t: number; x: number; z: number }[],
  index: number,
): { spot: THREE.Vector3 | null; group: THREE.Group | null } {
  // Cada cópia sai um tiquinho diferente (tamanho e giro): só no visual, a colisão é a da simulação.
  const rnd = makeRng(9100 + index * 31);
  const vary = (g: THREE.Group, yaw = 0.06) => {
    g.scale.setScalar(0.93 + rnd() * 0.12);
    g.rotation.y += (rnd() - 0.5) * yaw;
  };
  if (o.kind === 'circle') {
    const c = toWorld(cfg, o.x, o.y);
    const r = o.r * S;
    if (o.prop === 'beerTable') {
      // Mesa de plástico amarela quadrada de boteco ("GELADA" é marca fictícia) com 4 cadeiras (props3d).
      const { group, top } = buildBeerTable(r);
      group.position.copy(c);
      scene.add(group);
      // Petiscos na mesa.
      scene.add(place('food/fries', c.x - r * 0.35, c.z + r * 0.25, { height: 0.12, y: top }));
      scene.add(place('food/glass', c.x + r * 0.35, c.z + r * 0.3, { height: 0.12, y: top }));
      return { spot: new THREE.Vector3(c.x + r * 0.15, top, c.z - r * 0.2), group: null };
    }
    // Churrasqueira de tambor (props3d).
    const g = buildGrill(r, () => fit(instance('food/skewer'), { size: r * 2.0 }));
    vary(g, 0.6);
    g.position.copy(c);
    scene.add(g);
    const glow = new THREE.PointLight(0xff7a2f, 2.2, 2.2, 1.5);
    glow.position.set(c.x, 0.9, c.z);
    scene.add(glow);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: 0xf3ece8, transparent: true, opacity: 0.4, depthWrite: false }));
      scene.add(s);
      smokes.push({ s, t: i / 3, x: c.x, z: c.z });
    }
    return { spot: null, group: g };
  }

  const c = toWorld(cfg, o.x + o.w / 2, o.y + o.h / 2);
  const w = o.w * S;
  const d = o.h * S;
  let g: THREE.Group;
  if (o.prop === 'crates') g = buildCrates(w, d, index);
  else if (o.prop === 'cooler') g = buildCooler(w, d, index);
  else if (o.prop === 'freezer') g = buildFreezer(w, d, index);
  else g = new THREE.Group();
  vary(g);
  g.position.copy(c);
  shadows(g);
  scene.add(g);
  return { spot: null, group: g };
}

// ------------------------------------------------------------------ entorno

/** Faixa de terra seguindo a curva (textura com trilhas de pneu e mato nas beiradas). Devolve pontos ao longo dela. */
function buildRoad(scene: THREE.Scene, pts: [number, number][]): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const N = 90;
  const width = 1.7;
  const along = curve.getSpacedPoints(N);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  along.forEach((p, i) => {
    const t = curve.getTangentAt(i / N);
    const nx = -t.z;
    const nz = t.x;
    if (i > 0) dist += p.distanceTo(along[i - 1]);
    // A estrada abre um pouco ao chegar no terreiro.
    const w = (width / 2) * (i > N - 8 ? 1 + (i - (N - 8)) * 0.06 : 1);
    pos.push(p.x - nx * w, 0.008, p.z - nz * w, p.x + nx * w, 0.008, p.z + nz * w);
    uv.push(0, dist / 1.7, 1, dist / 1.7);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) g.setIndex(idx.map((_, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]]));
  g.computeVertexNormals();
  const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.95 }));
  road.receiveShadow = true;
  scene.add(road);
  return along;
}

/**
 * Bar do Zé (v0.9): casinha maior (cabe gente) com varanda coberta na frente. O telhado da varanda sobe
 * para a frente — assim a câmera, que olha de cima e de frente, enxerga o balcão, o Zé e os fregueses.
 * Coordenadas locais: frente em +z; a parede da frente da casinha fica em z=0 e a varanda vai até z=VD.
 */
function buildBar(scene: THREE.Scene, x: number, z: number): { bartender: { pos: THREE.Vector3; yaw: number }; seats: Seat[] } {
  const g = new THREE.Group();
  const W = 5.0;
  const D = 2.2;
  const H = 2.3;
  const VD = 2.3;
  const wall = std(0xf1dcc4);
  const trim = std(0xd9b08a);
  const wood = std(0x9a6a4a);
  const darkWood = std(0x6a3f37);
  // Casinha: paredes, rodapé, porta e janelona com prateleira de garrafas.
  g.add(mesh(new THREE.BoxGeometry(W, H, D), wall, 0, H / 2, -D / 2));
  g.add(mesh(new THREE.BoxGeometry(W + 0.02, 0.35, D + 0.02), trim, 0, 0.175, -D / 2));
  g.add(mesh(new THREE.BoxGeometry(0.75, 1.5, 0.04), std(0x8a4f45), -1.75, 0.75, 0.01));
  g.add(mesh(new THREE.BoxGeometry(2.6, 1.0, 0.03), std(0x2b1d22), 0.6, 1.25, 0.005));
  const shelf = fit(instance('furniture/bookcaseOpenLow'), { height: 0.9 });
  shelf.position.set(0.6, 0.78, 0.03);
  g.add(shelf);
  for (let k = 0; k < 9; k++) {
    const b = makeBottle();
    b.scale.setScalar(0.75);
    b.position.set(-0.4 + k * 0.24, 1.25 + (k % 2) * 0.02, 0.1);
    g.add(b);
  }
  // Telhado de zinco da casinha (cai para trás) e as nervuras.
  const roof = mesh(new THREE.BoxGeometry(W + 0.4, 0.08, D + 0.5), std(0xd8443c, { metalness: 0.2, roughness: 0.6 }), 0, H + 0.18, -D / 2);
  roof.rotation.x = 0.16;
  g.add(roof);
  for (let k = -W / 2 - 0.1; k <= W / 2 + 0.1; k += 0.24) {
    const rib = mesh(new THREE.BoxGeometry(0.03, 0.03, D + 0.5), std(0xb0342f), k, H + 0.24, -D / 2);
    rib.rotation.x = 0.16;
    g.add(rib);
  }
  // Varanda: piso de tábua, esteios e telhado que sobe para a frente.
  g.add(mesh(new THREE.BoxGeometry(W + 0.4, 0.08, VD), wood, 0, 0.04, VD / 2));
  for (let k = -W / 2; k <= W / 2 + 0.01; k += 0.3) g.add(mesh(new THREE.BoxGeometry(0.014, 0.012, VD), std(0x7a4f36), k, 0.085, VD / 2));
  const front = 2.75;
  for (const px of [-W / 2, 0, W / 2]) g.add(mesh(new THREE.BoxGeometry(0.1, front, 0.1), darkWood, px, front / 2, VD - 0.05));
  const vRoof = mesh(new THREE.BoxGeometry(W + 0.4, 0.07, VD + 0.15), std(0xe07a3a, { roughness: 0.7 }), 0, (H + front) / 2 + 0.05, VD / 2);
  vRoof.rotation.x = -Math.atan2(front - H, VD);
  g.add(vRoof);
  g.add(mesh(new THREE.BoxGeometry(W + 0.4, 0.12, 0.08), darkWood, 0, front + 0.04, VD - 0.02));
  // Placa em cima da varanda.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshStandardMaterial({ map: textTexture('BAR DO ZÉ', { w: 512, h: 128, bg: 0xffc145, border: 0x2b1d22, color: '#2b1d22', size: 84 }) }),
  );
  sign.position.set(0, front + 0.45, VD - 0.02);
  sign.rotation.x = -0.2;
  g.add(sign);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), darkWood, -0.9, front + 0.22, VD - 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), darkWood, 0.9, front + 0.22, VD - 0.05));
  // Lampiões e cordão de lâmpadas na beirada da varanda.
  for (const lx of [-1.3, 1.3]) {
    g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), std(0x2b1d22), lx, front - 0.2, VD - 0.15));
    g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc860, emissiveIntensity: 1.4 }), lx, front - 0.38, VD - 0.15));
  }
  for (let k = 0; k < 11; k++) {
    const bx = -W / 2 + (k / 10) * W;
    const sag = Math.sin((k / 10) * Math.PI) * 0.12;
    const col = [0xffd27a, 0xff6b5a, 0x7ee0a8, 0x9fd3ff][k % 4];
    g.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: col }), bx, front - 0.08 - sag, VD + 0.02));
  }
  // Balcão de madeira na varanda (o Zé atrás, fregueses nas banquetas na frente).
  const counterX = -1.1;
  const counterZ = 1.45;
  // Na altura dos bonecos baixinhos (o Zé aparece por cima do tampo).
  g.add(mesh(new THREE.BoxGeometry(2.0, 0.5, 0.42), wood, counterX, 0.33, counterZ));
  g.add(mesh(new THREE.BoxGeometry(2.1, 0.06, 0.52), std(0xb36a55), counterX, 0.61, counterZ));
  for (const k of [-0.7, 0, 0.7]) {
    const b = makeBottle();
    b.scale.setScalar(0.8);
    b.position.set(counterX + k + 0.15, 0.64, counterZ - 0.05);
    g.add(b);
  }
  const radio = fit(instance('furniture/radio'), { height: 0.16 });
  radio.position.set(counterX - 0.75, 0.64, counterZ + 0.05);
  g.add(radio);
  const seats: Seat[] = [];
  for (const k of [-0.65, 0, 0.65]) {
    const st = fit(instance('furniture/stoolBar'), { height: 0.42 });
    st.position.set(counterX + k, 0.08, counterZ + 0.55);
    g.add(st);
    seats.push({ pos: new THREE.Vector3(counterX + k, 0.3, counterZ + 0.62), face: new THREE.Vector3(0, 0, -1) });
  }
  // Mesinha da varanda.
  const tx = 1.35;
  const tz = 1.25;
  const tbl = fit(instance('furniture/tableRound'), { size: 0.8 });
  tbl.position.set(tx, 0.08, tz);
  g.add(tbl);
  for (const a of [Math.PI * 0.15, Math.PI * 0.85, -Math.PI * 0.5]) {
    const cx = tx + Math.cos(a) * 0.62;
    const cz = tz + Math.sin(a) * 0.62;
    const ch = fit(instance('furniture/chair'), { height: 0.55 });
    ch.position.set(cx, 0.08, cz);
    ch.rotation.y = -a - Math.PI / 2;
    g.add(ch);
    seats.push({ pos: new THREE.Vector3(tx + Math.cos(a) * 0.55, 0.18, tz + Math.sin(a) * 0.55), face: new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)) });
  }
  const fridge = fit(instance('furniture/kitchenFridgeLarge'), { height: 1.25 });
  fridge.position.set(W / 2 - 0.4, 0.08, 0.35);
  g.add(fridge);
  // Caixa de som, vasos, arbustos e engradados.
  const speaker = fit(instance('furniture/speaker'), { height: 0.8 });
  speaker.position.set(-W / 2 + 0.3, 0.08, VD - 0.35);
  speaker.rotation.y = 0.4;
  g.add(speaker);
  for (const [px, pz] of [
    [-W / 2 - 0.35, VD + 0.2],
    [W / 2 + 0.35, VD + 0.2],
  ]) {
    const pot = fit(instance('nature/pot_small'), { height: 0.6 });
    pot.position.set(px, 0, pz);
    g.add(pot);
  }
  for (const [px, pz, h] of [
    [-W / 2 - 0.45, -0.6, 0.7],
    [-W / 2 - 0.4, -1.6, 0.55],
    [W / 2 + 0.5, -1.4, 0.6],
  ]) {
    const b = fit(instance('nature/plant_bushDetailed'), { height: h });
    b.position.set(px, 0, pz);
    g.add(b);
  }
  for (let k = 0; k < 4; k++) {
    const crate = mesh(new THREE.BoxGeometry(0.44, 0.24, 0.34), std(k % 2 ? 0x4f9a5c : 0xf2b134), W / 2 + 0.45 + (k > 1 ? 0.48 : 0), 0.12 + (k % 2) * 0.24, 0.4);
    crate.rotation.y = (k - 1.5) * 0.1;
    g.add(crate);
  }
  g.position.set(x, 0, z);
  shadows(g);
  scene.add(g);
  const world = (lx: number, ly: number, lz: number) => new THREE.Vector3(x + lx, ly, z + lz);
  return {
    bartender: { pos: world(counterX - 0.2, 0.08, counterZ - 0.55), yaw: 0 },
    seats: seats.map((s) => ({ pos: world(s.pos.x, s.pos.y, s.pos.z), face: s.face })),
  };
}

/** Está dentro do retângulo da área dos jogadores (com folga `pad`)? */
function inPlayersArea(pa: PlayersArea, x: number, z: number, pad = 0): boolean {
  const d = new THREE.Vector3(x - pa.c.x, 0, z - pa.c.z);
  return Math.abs(d.dot(pa.t)) < pa.halfL + pad && Math.abs(d.dot(pa.n)) < pa.halfD + pad;
}

/**
 * Cercadinho de corda retangular dos jogadores, alinhado com a cerca da arena, com uma **entradinha**
 * (dois mourões e a placa "SÓ QUEM JOGA" em cima) virada para a porteira. A torcida não chega perto.
 */
function buildPlayersArea(scene: THREE.Scene, pa: PlayersArea): void {
  const post = std(0x6a3f37);
  const rope = std(0xd9b77a);
  const at = (u: number, v: number) => pa.c.clone().addScaledVector(pa.t, u).addScaledVector(pa.n, v);
  const L = pa.halfL;
  const D = pa.halfD;
  const doorHalf = 0.62;
  // Contorno: lado de dentro (virado para a arena) tem a entradinha no meio.
  const corners = [at(-L, -D), at(L, -D), at(L, D), at(-L, D)];
  const du = pa.doorU;
  const segs: [THREE.Vector3, THREE.Vector3][] = [
    [at(-L, -D), at(du - doorHalf, -D)],
    [at(du + doorHalf, -D), at(L, -D)],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  const ropeSpan = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      scene.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.6, 6), post, p.x, 0.3, p.z));
      if (i === n) break;
      const q = a.clone().lerp(b, (i + 1) / n);
      // Corda com uma barriguinha no meio.
      for (const [u, w, ya, yb] of [
        [p, p.clone().lerp(q, 0.5), 0.5, 0.44],
        [p.clone().lerp(q, 0.5), q, 0.44, 0.5],
      ] as const) {
        const l = u.distanceTo(w);
        const r = mesh(new THREE.CylinderGeometry(0.012, 0.012, l, 4), rope, (u.x + w.x) / 2, (ya + yb) / 2, (u.z + w.z) / 2);
        r.rotation.order = 'YXZ';
        r.rotation.y = Math.atan2(w.x - u.x, w.z - u.z);
        r.rotation.x = Math.PI / 2 - Math.atan2(yb - ya, l);
        scene.add(r);
      }
    }
  };
  for (const [a, b] of segs) ropeSpan(a, b);

  // Entradinha: dois mourões mais altos e a placa atravessada em cima, de frente para a arena (e para a câmera).
  const yaw = Math.atan2(pa.t.x, pa.t.z) + Math.PI / 2;
  for (const side of [-1, 1]) {
    const p = at(du + side * doorHalf, -D);
    scene.add(mesh(new THREE.BoxGeometry(0.1, 1.45, 0.1), post, p.x, 0.72, p.z));
  }
  const top = at(du, -D);
  const beam = mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.3, 0.08, 0.1), post, top.x, 1.42, top.z);
  beam.rotation.y = yaw + Math.PI / 2;
  scene.add(beam);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.48),
    new THREE.MeshStandardMaterial({ map: textTexture('SÓ QUEM JOGA', { w: 768, h: 240, bg: 0xffc145, border: 0x2b1d22, color: '#2b1d22', size: 104 }), side: THREE.DoubleSide }),
  );
  plate.position.set(top.x, 1.72, top.z);
  // Vira para a câmera (que olha de +z) e inclina um pouco para trás: lê de cima.
  plate.rotation.set(-0.35, 0, 0);
  scene.add(plate);
}

/** Mesa comprida de madeira com 8 banquinhos (4 de cada lado), ao longo da cerca. */
function buildPlayersTable(scene: THREE.Scene, pa: PlayersArea): Seat[] {
  const g = new THREE.Group();
  const wood = std(0x9a6a4a);
  const dark = std(0x6a3f37);
  const len = pa.halfL * 2 - 0.9;
  g.add(mesh(new THREE.BoxGeometry(len, 0.07, 0.9), wood, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(len - 0.1, 0.05, 0.78), dark, 0, 0.45, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.46, 0.08), dark, sx * (len / 2 - 0.15), 0.23, sz * 0.33));
  g.position.copy(pa.c);
  g.rotation.y = -Math.atan2(pa.t.z, pa.t.x);
  scene.add(g);
  // Na mesa: canecas e garrafas espalhadas.
  const at = (u: number, v: number) => pa.c.clone().addScaledVector(pa.t, u).addScaledVector(pa.n, v);
  for (const [u, v, kind, h] of [
    [-0.8, 0.12, 'food/mug', 0.14],
    [0.2, -0.15, 'food/soda-bottle', 0.22],
    [0.9, 0.1, 'food/mug', 0.14],
    [-0.2, 0.2, 'food/plate', 0.04],
  ] as const) {
    const p = at(u, v);
    scene.add(place(kind, p.x, p.z, kind === 'food/plate' ? { size: 0.2, y: 0.54 } : { height: h, y: 0.54 }));
  }
  const seats: Seat[] = [];
  const us = [-1.05, -0.35, 0.35, 1.05];
  // Primeiro o lado de dentro (virado para a arena: sai direto pela entradinha), depois o de fora.
  for (const side of [-1, 1]) {
    for (const u of us) {
      const p = at(u, side * 0.78);
      const stool = new THREE.Group();
      stool.add(mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.06, 10), std(0xb36a55), 0, 0.33, 0));
      for (let k = 0; k < 3; k++) {
        const la = (k * Math.PI * 2) / 3;
        const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 5), dark, Math.cos(la) * 0.12, 0.16, Math.sin(la) * 0.12);
        leg.rotation.set(Math.sin(la) * 0.15, 0, -Math.cos(la) * 0.15);
        stool.add(leg);
      }
      stool.position.set(p.x, 0, p.z);
      scene.add(stool);
      // Quem senta do lado de fora dá a volta pela ponta da mesa mais próxima.
      const end = Math.sign(u) * (pa.halfL - 0.3);
      const path = side < 0 ? [at(u, -1.05)] : [at(end, 0.78), at(end, -1.05)];
      path.push(pa.door.clone());
      seats.push({ pos: new THREE.Vector3(p.x, 0.36, p.z), face: pa.n.clone().multiplyScalar(-side), path });
    }
  }
  return seats;
}

function buildPatio(scene: THREE.Scene, x: number, z: number, umbrella: boolean): Seat[] {
  const seats: Seat[] = [];
  const red = { '*': 0xe0453a };
  const t = place('furniture/tableRound', x, z, { size: 0.95 });
  recolor(t, red);
  scene.add(t);
  const top = new THREE.Box3().setFromObject(t).max.y;
  for (const a of [0.3, Math.PI + 0.3]) {
    const ch = place('furniture/chair', x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7, { height: 0.55 });
    ch.rotation.y = -a - Math.PI / 2;
    recolor(ch, red);
    scene.add(ch);
    seats.push({ pos: new THREE.Vector3(x + Math.cos(a) * 0.62, 0, z + Math.sin(a) * 0.62), face: new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)) });
  }
  scene.add(place('food/soda-bottle', x - 0.1, z, { height: 0.24, y: top }));
  scene.add(place('food/glass', x + 0.15, z + 0.1, { height: 0.1, y: top }));
  if (umbrella) {
    const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), std(0xeeeeee), x, 0.75, z);
    scene.add(pole);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.32, 8, 1, true));
    cone.position.set(x, 1.5, z);
    const colors = new Float32Array(cone.geometry.attributes.position.count * 3);
    cone.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pos = cone.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ang = Math.atan2(pos.getZ(i), pos.getX(i));
      const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const col = new THREE.Color(seg ? 0xe0453a : 0xfff4e6);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    cone.material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: 0.8 });
    cone.castShadow = true;
    scene.add(cone);
  }
  return seats;
}
