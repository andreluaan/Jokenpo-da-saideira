import * as THREE from 'three';
import { makeRng, type GameConfig, type Obstacle } from '@ppt/shared';
import { S, fit, instance, place, recolor, shadows, toWorld } from './assets';
import { softCircle, speckleTexture, textTexture } from './textures';

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
  /** Grupo 3D de cada obstáculo (mesmo índice de config.obstacles; null quando não há grupo único). */
  props: (THREE.Group | null)[];
  /** Queda de luz: 0 = normal, 1 = quintal apagado (só brasa, luz do bar e as lâmpadas do varal). */
  setDim(k: number): void;
  update(dt: number, now: number): void;
}

/** Cor do chão de fora; a névoa e o fundo usam a mesma cor para o horizonte sumir sem emenda. */
const GROUND = 0xbf7a60;
export const SKY = GROUND;

/** Monta todo o quintal do Bar do Zé. */
export function buildArena3D(scene: THREE.Scene, cfg: GameConfig): ArenaHandles {
  const rng = makeRng(20261016);
  const { rx, ry } = cfg.arena;
  const ax = rx * S;
  const az = ry * S;
  const smokes: { s: THREE.Sprite; t: number; x: number; z: number }[] = [];
  const glows: THREE.Mesh[] = [];

  // --- chão ---
  // Chão de fora um tom mais escuro e menos saturado que a arena: o olho vai direto para o ringue.
  const groundTex = speckleTexture(GROUND, [0xb5735b, 0xc98a6f, 0xa86a52], 2200, 512, 3, 0.2, 2.4);
  groundTex.repeat.set(10, 10);
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
      const sign = mesh(new THREE.PlaneGeometry(0.16, 0.16), std(0xffc145, { side: THREE.DoubleSide }), mid.x, 0.3, mid.z);
      sign.rotation.set(0, f.rotation.y, Math.PI / 4);
      sign.position.add(new THREE.Vector3(mid.x, 0, mid.z).normalize().multiplyScalar(-0.06));
      scene.add(sign);
    }
  });

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
  for (const o of cfg.obstacles) {
    const { spot, group } = buildObstacle(scene, cfg, o, smokes);
    if (o.prop === 'beerTable' && spot) beerSpot = spot;
    props.push(group);
  }

  // --- entorno: Bar do Zé, árvores, mesas, horta ---
  buildShack(scene, -8.1, -5.1);
  const seats = buildOutdoorTable(scene, -9.25, -1.3);
  for (const [x, z, h, kind] of [
    [8.6, -5.4, 2.6, 'tree_oak_fall'],
    [10.2, -2.6, 2.2, 'tree_fat_fall'],
    [7.3, -7.9, 2.0, 'tree_default_fall'],
    [-10.9, 1.4, 2.4, 'tree_detailed_fall'],
    [-10.9, -3.3, 2.0, 'tree_oak_fall'],
    [-2.6, -6.9, 2.1, 'tree_fat_fall'],
    [10.6, 2.6, 2.3, 'tree_default_fall'],
    [-10.6, 3.4, 2.1, 'tree_fat_fall'],
  ] as const) {
    scene.add(place(`nature/${kind}`, x, z, { height: h, rot: rng() * 6 }));
  }
  // Milharal no campo.
  for (let i = 0; i < 26; i++) {
    const x = 6 + (i % 9) * 0.55 + rng() * 0.2;
    const z = -6.8 + Math.floor(i / 9) * 0.6 + rng() * 0.2;
    if (z > -4.8 && x < 9) continue;
    scene.add(place('nature/crops_cornStageD', x + 2.2, z, { height: 0.9 + rng() * 0.2, rot: rng() * 6 }));
  }
  // Mesas de plástico vermelhas espalhadas em volta (quem não cabe na cerca assiste sentado).
  const fanSeats: Seat[] = [];
  for (const [x, z, umb] of [
    [9.2, 4.9, true],
    [10.9, 1.5, false],
    [10.6, -2.4, true],
    [2.2, -7.6, true],
    [-3.9, -7.0, false],
    [-11.1, 2.6, true],
    [-9.4, 4.8, true],
  ] as const) {
    fanSeats.push(...buildPatio(scene, x, z, umb));
  }
  // Lousa da saideira.
  const board = new THREE.Group();
  board.add(mesh(new THREE.BoxGeometry(1.1, 0.75, 0.06), std(0x8a4f45), 0, 0.85, 0));
  const chalk = mesh(new THREE.PlaneGeometry(0.98, 0.63), new THREE.MeshStandardMaterial({ map: textTexture('SAIDEIRA\nquem perde paga', { w: 512, h: 330, bg: 0x2f3b33, size: 74, color: '#fff4e6' }), roughness: 1 }), 0, 0.85, 0.035);
  board.add(chalk);
  board.add(mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), std(0x6a3f37), -0.42, 0.45, -0.05));
  board.add(mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), std(0x6a3f37), 0.42, 0.45, -0.05));
  board.position.set(-1.0, 0, -7.6);
  board.rotation.y = 0;
  scene.add(board);

  // Grama, flores e pedrinhas espalhadas fora da arena.
  const scatter = ['nature/grass', 'nature/grass_large', 'nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/rock_smallA', 'nature/plant_bush'];
  for (let i = 0; i < 90; i++) {
    const x = (rng() - 0.5) * 24;
    const z = (rng() - 0.5) * 15;
    const k = (x / (ax + 1.1)) ** 2 + (z / (az + 1.1)) ** 2;
    // Fora da arena, do bar e do canto da picape (frente à esquerda).
    if (k < 1 || (x < -6.4 && z < -3.6) || (x < -7.2 && z > 3)) continue;
    const kind = scatter[Math.floor(rng() * scatter.length)];
    scene.add(place(kind, x, z, { height: kind.includes('rock') ? 0.18 : kind.includes('bush') ? 0.45 : 0.25, rot: rng() * 6 }));
  }
  scene.add(place('nature/log_stack', -6.0, -3.9, { size: 1.0, rot: 0.4 }));
  scene.add(place('nature/stump_round', -5.3, -4.6, { height: 0.3 }));
  scene.add(place('furniture/trashcan', 7.2, 3.4, { height: 0.55 }));

  // --- luz ---
  const hemi = new THREE.HemisphereLight(0xfff0dd, 0x7a5a52, 1.15);
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

  const base = { hemi: hemi.intensity, sun: sun.intensity, bar: barLight.intensity };
  const night = new THREE.Color(0x241820);
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
    barWaiter: { pos: new THREE.Vector3(-7.0, 0, -3.95), yaw: 0.35 },
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
): { spot: THREE.Vector3 | null; group: THREE.Group | null } {
  if (o.kind === 'circle') {
    const c = toWorld(cfg, o.x, o.y);
    const r = o.r * S;
    if (o.prop === 'beerTable') {
      // Mesa de plástico amarela de boteco ("GELADA" é marca fictícia) com 4 cadeiras.
      const yellow = { '*': 0xf6c514 };
      const table = place('furniture/tableRound', c.x, c.z, { size: r * 1.75 });
      recolor(table, yellow);
      scene.add(table);
      const top = new THREE.Box3().setFromObject(table).max.y;
      const logo = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.55, 32),
        new THREE.MeshStandardMaterial({ map: textTexture('GELADA', { w: 512, h: 256, bg: 0xd8443c, ellipse: true, size: 120 }), transparent: true, roughness: 0.6 }),
      );
      logo.rotation.x = -Math.PI / 2;
      logo.scale.y = 0.55;
      logo.position.set(c.x, top + 0.003, c.z);
      scene.add(logo);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const ch = place('furniture/chair', c.x + Math.cos(a) * r * 1.15, c.z + Math.sin(a) * r * 1.15, { height: 0.6 });
        ch.rotation.y = -a - Math.PI / 2;
        recolor(ch, yellow);
        scene.add(ch);
      }
      // Petiscos na mesa.
      scene.add(place('food/fries', c.x - r * 0.35, c.z + r * 0.25, { height: 0.12, y: top }));
      scene.add(place('food/glass', c.x + r * 0.35, c.z + r * 0.3, { height: 0.12, y: top }));
      return { spot: new THREE.Vector3(c.x + r * 0.15, top, c.z - r * 0.2), group: null };
    }
    // Churrasqueira de tambor.
    const g = new THREE.Group();
    const drum = fit(instance('food/barrel'), { height: 0.62 });
    recolor(drum, { '*': 0x4a4a52 });
    g.add(drum);
    const ember = mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff5a10, emissiveIntensity: 1.6 }), 0, 0.63, 0);
    g.add(ember);
    for (let k = -2; k <= 2; k++) g.add(mesh(new THREE.BoxGeometry(r * 2, 0.012, 0.012), std(0x2a2a30), 0, 0.65, k * r * 0.35));
    for (const dz of [-0.08, 0.08]) {
      const sk = fit(instance('food/skewer'), { size: r * 2.2 });
      sk.position.set(0, 0.66, dz);
      g.add(sk);
    }
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
  const g = new THREE.Group();
  g.position.copy(c);
  if (o.prop === 'crates') {
    // Engradados de cerveja (amarelo embaixo, verde em cima) com as tampinhas aparecendo.
    const crate = (cw: number, cd: number, y: number, col: number) => {
      const h = 0.26;
      g.add(mesh(new THREE.BoxGeometry(cw, h, cd), std(col), 0, y + h / 2, 0));
      g.add(mesh(new THREE.BoxGeometry(cw * 0.7, 0.05, 0.01), std(0x000000, { transparent: true, opacity: 0.25 }), 0, y + h * 0.6, cd / 2 + 0.006));
      const nx = 4;
      const nz = 3;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const bx = -cw / 2 + ((i + 0.5) * cw) / nx;
          const bz = -cd / 2 + ((j + 0.5) * cd) / nz;
          g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), std(0x6b3a1f, { roughness: 0.3 }), bx, y + h + 0.02, bz));
          g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), std(0xe8d9a0, { metalness: 0.5 }), bx, y + h + 0.05, bz));
        }
      }
    };
    crate(w, d, 0, 0xf2b134);
    crate(w * 0.8, d * 0.75, 0.26, 0x4f9a5c);
  } else if (o.prop === 'cooler') {
    // Isopor com gelo e latinhas.
    const h = 0.38;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), std(0xf6f4ef), 0, h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w * 0.88, 0.02, d * 0.82), std(0xbfe4f0, { roughness: 0.3 }), 0, h - 0.02, 0));
    const lid = mesh(new THREE.BoxGeometry(w, 0.05, d * 0.9), std(0xfafaf7), 0, h + 0.18, -d / 2 - 0.02);
    lid.rotation.x = -1.2;
    g.add(lid);
    const cans = ['food/soda-can', 'food/can', 'food/soda-can'];
    cans.forEach((cn, i) => {
      const can = fit(instance(cn), { height: 0.16 });
      can.position.set(-w * 0.28 + i * w * 0.28, h - 0.06, (i % 2 ? 0.05 : -0.05) * d * 3);
      can.rotation.z = (i - 1) * 0.4;
      g.add(can);
    });
  } else if (o.prop === 'freezer') {
    // Freezer horizontal de bar: branco, faixa vermelha, vidro com bebida.
    const h = 0.62;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), std(0xf4f3f3, { roughness: 0.4 }), 0, h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.005, 0.09, d + 0.005), std(0xd8443c), 0, h * 0.45, 0));
    // Tampa de vidro presa na borda de trás (o "lid" gira para abrir — ver boteco3d).
    const lid = new THREE.Group();
    lid.position.set(0, h + 0.007, -d * 0.4);
    lid.add(mesh(new THREE.BoxGeometry(w * 0.9, 0.012, d * 0.8), new THREE.MeshStandardMaterial({ color: 0x9fd3e8, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.2 }), 0, 0, d * 0.4));
    g.add(lid);
    g.userData.lid = lid;
    for (let i = 0; i < 5; i++) {
      const can = fit(instance(i % 2 ? 'food/soda-can' : 'food/can'), { height: 0.14 });
      can.position.set(-w * 0.35 + i * w * 0.175, h - 0.15, 0);
      g.add(can);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, 0.12), new THREE.MeshStandardMaterial({ map: textTexture('GELADA', { w: 512, h: 128, size: 92 }), transparent: true }));
    label.position.set(0, h * 0.45, d / 2 + 0.006);
    g.add(label);
  }
  shadows(g);
  scene.add(g);
  return { spot: null, group: g };
}

// ------------------------------------------------------------------ entorno

function buildShack(scene: THREE.Scene, x: number, z: number): void {
  const g = new THREE.Group();
  const W = 3.4;
  const H = 1.7;
  const D = 1.6;
  g.add(mesh(new THREE.BoxGeometry(W, H, D), std(0xf1dcc4), 0, H / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(W + 0.02, 0.35, D + 0.02), std(0xd9b08a), 0, 0.175, 0));
  // Balcão com janela.
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 0.02), std(0x2b1d22), 0.45, 1.05, D / 2 + 0.005));
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.07, 0.3), std(0xb36a55), 0.45, 0.74, D / 2 + 0.13));
  g.add(mesh(new THREE.BoxGeometry(0.6, 1.15, 0.03), std(0x8a4f45), -1.05, 0.58, D / 2 + 0.01));
  const tv = fit(instance('furniture/televisionVintage'), { height: 0.32 });
  tv.position.set(0.9, 0.78, D / 2 + 0.1);
  g.add(tv);
  const radio = fit(instance('furniture/radio'), { height: 0.16 });
  radio.position.set(0.05, 0.78, D / 2 + 0.12);
  g.add(radio);
  // Telhado de zinco vermelho.
  const roof = mesh(new THREE.BoxGeometry(W + 0.5, 0.08, D + 0.9), std(0xd8443c, { metalness: 0.2, roughness: 0.6 }), 0, H + 0.12, 0.2);
  roof.rotation.x = 0.12;
  g.add(roof);
  for (let k = -W / 2 - 0.2; k <= W / 2 + 0.2; k += 0.22) {
    const rib = mesh(new THREE.BoxGeometry(0.03, 0.03, D + 0.9), std(0xb0342f), k, H + 0.18, 0.2);
    rib.rotation.x = 0.12;
    g.add(rib);
  }
  // Placa.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshStandardMaterial({ map: textTexture('BAR DO ZÉ', { w: 512, h: 128, bg: 0xffc145, border: 0x2b1d22, color: '#2b1d22', size: 84 }) }),
  );
  sign.position.set(0, H + 0.45, D / 2 + 0.55);
  sign.rotation.x = -0.25;
  g.add(sign);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), std(0x6a3f37), -0.7, H + 0.22, D / 2 + 0.52));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), std(0x6a3f37), 0.7, H + 0.22, D / 2 + 0.52));
  // Banquetas, caixa de som e engradados na porta.
  for (const k of [-0.1, 0.45, 1.0]) {
    const st = fit(instance('furniture/stoolBar'), { height: 0.5 });
    st.position.set(k, 0, D / 2 + 0.55);
    g.add(st);
  }
  const speaker = fit(instance('furniture/speaker'), { height: 0.7 });
  speaker.position.set(-1.55, 0, D / 2 + 0.35);
  speaker.rotation.y = 0.4;
  g.add(speaker);
  g.position.set(x, 0, z);
  shadows(g);
  scene.add(g);
}

/** Mesa de madeira com quatro banquinhos do lado de fora do bar (onde a turma espera a vez). */
function buildOutdoorTable(scene: THREE.Scene, x: number, z: number): Seat[] {
  const t = place('furniture/tableRound', x, z, { size: 0.9 });
  scene.add(t);
  const top = new THREE.Box3().setFromObject(t).max.y;
  scene.add(place('food/mug', x - 0.12, z + 0.05, { height: 0.14, y: top }));
  scene.add(place('food/soda-bottle', x + 0.12, z - 0.08, { height: 0.22, y: top }));
  scene.add(place('food/plate', x + 0.05, z + 0.18, { size: 0.2, y: top }));
  const seats: Seat[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const sx = x + Math.cos(a) * 0.72;
    const sz = z + Math.sin(a) * 0.72;
    const stool = new THREE.Group();
    stool.add(mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.06, 10), std(0xb36a55), 0, 0.33, 0));
    for (let k = 0; k < 3; k++) {
      const la = (k * Math.PI * 2) / 3;
      const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 5), std(0x6a3f37), Math.cos(la) * 0.12, 0.16, Math.sin(la) * 0.12);
      leg.rotation.set(Math.sin(la) * 0.15, 0, -Math.cos(la) * 0.15);
      stool.add(leg);
    }
    stool.position.set(sx, 0, sz);
    scene.add(stool);
    seats.push({ pos: new THREE.Vector3(sx, 0.36, sz), face: new THREE.Vector3(x - sx, 0, z - sz).normalize() });
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
