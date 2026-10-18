import * as THREE from 'three';
import type { Seat } from './arena3d';
import { makeBottle } from './character3d';
import { rbox, rcyl, soft } from './props3d';
import { textTexture } from './textures';

/**
 * Cantinho dos jogadores (v0.16): "camarote" de boteco logo depois da porteira, **reto na tela** (alinhado com
 * os eixos, não com a curva da cerca), sem cercadinho de corda. Piso de tábuas, mesa comprida com toalha xadrez
 * e cerveja na mesa (balde de gelo com long necks GELADA, copos americanos, porção de batata e amendoim),
 * engradados de cerveja virados de banquinho, varal de lâmpadas por cima e a placa "SÓ QUEM JOGA" pendurada no fundo.
 * Coordenadas: x ao longo da mesa; z+ = lado da câmera.
 */
export interface PlayersCorner {
  /** Centro do piso. `halfL` em x, `halfD` em z. */
  c: THREE.Vector3;
  halfL: number;
  halfD: number;
  /** Saída do piso (lado da porteira da arena). */
  door: THREE.Vector3;
}

/** Retângulo do camarote (com folga `pad`): vegetação, árvores e torcida não entram. */
export function inPlayersCorner(pc: PlayersCorner, x: number, z: number, pad = 0): boolean {
  return Math.abs(x - pc.c.x) < pc.halfL + pad && Math.abs(z - pc.c.z) < pc.halfD + pad;
}

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

/** Toalha xadrez vermelha e branca (quadradinhos de 0,24 un.; a geometria é que escala as UVs). */
let checkerTex: THREE.Texture | null = null;
function checker(): THREE.Texture {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff4e6';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#d8443c';
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillRect(0, 0, 32, 64);
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return (checkerTex = t);
}

/** Pano da toalha: plano com UVs no tamanho real (quadradinhos iguais no tampo e na barra). */
function cloth(w: number, h: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 0.48, (uv.getY(i) * h) / 0.48);
  const o = new THREE.Mesh(g, m);
  o.receiveShadow = true;
  return o;
}

/** Engradado de cerveja de boca para baixo (banquinho de boteco). Topo em y≈0,34. */
function crateSeat(color: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.18).getHex();
  g.add(rbox(0.44, 0.24, 0.34, 0.03, soft(color), 0, 0.12, 0));
  g.add(rbox(0.44, 0.1, 0.34, 0.03, soft(top), 0, 0.29, 0));
  // Alça vazada na frente e atrás + vãos das laterais.
  for (const sz of [-1, 1]) g.add(box(0.16, 0.045, 0.02, soft(0x2b1d22), 0, 0.2, sz * 0.172, false));
  for (const sx of [-1, 1]) for (const y of [0.07, 0.15]) g.add(box(0.02, 0.04, 0.2, soft(0x2b1d22), sx * 0.222, y, 0, false));
  return g;
}

/** Copo americano com cerveja e espuma. */
function glassOfBeer(): THREE.Group {
  const g = new THREE.Group();
  g.add(rcyl(0.036, 0.095, 0.008, soft(0xe3eef0, { roughness: 0.2 }), 0, 0.0475, 0, 10));
  g.add(rcyl(0.032, 0.07, 0.004, soft(0xf2a93b, { roughness: 0.3, emissive: 0x3a2000 }), 0, 0.042, 0, 10));
  g.add(rcyl(0.034, 0.02, 0.008, soft(0xfff8ee), 0, 0.083, 0, 10));
  return g;
}

/**
 * Monta o camarote e devolve os lugares (os 4 primeiros = fileira de trás, de frente para a câmera;
 * depois a da frente) e as lâmpadas (para o arena3d animar junto com o varal).
 */
export function buildPlayersCorner(scene: THREE.Scene, pc: PlayersCorner): { seats: Seat[]; bulbs: { pos: THREE.Vector3; color: number }[] } {
  const g = new THREE.Group();
  g.position.copy(pc.c);
  scene.add(g);
  const L = pc.halfL;
  const D = pc.halfD;

  // Piso de tábuas (rente ao chão: quem anda por cima não afunda) com um rodapé mais escuro.
  const plankA = std(0xb07a52);
  const plankB = std(0x9a6a4a);
  const dark = std(0x6a3f37);
  const n = Math.round((D * 2) / 0.38);
  for (let i = 0; i < n; i++) {
    const z = -D + ((i + 0.5) * (D * 2)) / n;
    g.add(box(L * 2, 0.02, (D * 2) / n - 0.025, i % 2 ? plankA : plankB, 0, 0.01, z, false));
  }
  for (const sz of [-1, 1]) g.add(box(L * 2 + 0.08, 0.035, 0.06, dark, 0, 0.017, sz * D, false));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.035, D * 2, dark, sx * L, 0.017, 0, false));

  // Mesa comprida com toalha xadrez.
  const tz = -0.05;
  const len = 2.9;
  const dep = 0.95;
  const wood = std(0x9a6a4a);
  g.add(box(len, 0.06, dep, wood, 0, 0.48, tz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, 0.46, 0.08, dark, sx * (len / 2 - 0.15), 0.23, tz + sz * (dep / 2 - 0.12)));
  const cl = new THREE.MeshStandardMaterial({ map: checker(), roughness: 0.9 });
  const ow = len + 0.12;
  const od = dep + 0.12;
  const topY = 0.515;
  const drop = 0.16;
  const tabletop = cloth(ow, od, cl);
  tabletop.rotation.x = -Math.PI / 2;
  tabletop.position.set(0, topY, tz);
  g.add(tabletop);
  for (const [w, x, z, ry] of [
    [ow, 0, tz + od / 2, 0],
    [ow, 0, tz - od / 2, Math.PI],
    [od, ow / 2, tz, Math.PI / 2],
    [od, -ow / 2, tz, -Math.PI / 2],
  ] as const) {
    const p = cloth(w, drop, cl);
    p.position.set(x, topY - drop / 2, z);
    p.rotation.y = ry;
    g.add(p);
  }

  // Na mesa: balde de gelo com long necks no meio, garrafas, copos, porção e amendoim.
  const on = (o: THREE.Object3D, x: number, z: number, ry = 0) => {
    o.position.set(x, topY, tz + z);
    o.rotation.y = ry;
    g.add(o);
    return o;
  };
  const bucket = new THREE.Group();
  bucket.add(rcyl(0.17, 0.22, 0.02, soft(0xc9ccd2, { metalness: 0.55, roughness: 0.3 }), 0, 0.11, 0, 16));
  bucket.add(rcyl(0.18, 0.03, 0.012, soft(0x9fa4ad, { metalness: 0.55, roughness: 0.3 }), 0, 0.21, 0, 16));
  bucket.add(rcyl(0.15, 0.03, 0.01, soft(0xdff3f8, { roughness: 0.15 }), 0, 0.215, 0, 14));
  for (let k = 0; k < 5; k++) {
    const b = makeBottle();
    const a = (k / 5) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.08, 0.06, Math.sin(a) * 0.08);
    b.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    bucket.add(b);
  }
  on(bucket, 0, 0);
  for (const [x, z] of [
    [-1.1, -0.22],
    [-0.75, 0.24],
    [0.55, -0.26],
    [1.05, 0.2],
    [-0.35, -0.3],
    [0.3, 0.28],
  ] as const) {
    const b = on(makeBottle(), x, z);
    b.scale.setScalar(1.05);
  }
  for (const [x, z] of [
    [-1.2, 0.18],
    [-0.5, -0.12],
    [0.75, 0.12],
    [1.25, -0.18],
    [-0.95, -0.05],
    [0.4, -0.05],
  ] as const)
    on(glassOfBeer(), x, z);
  // Porção de batata frita e tigela de amendoim.
  const fries = new THREE.Group();
  fries.add(rcyl(0.15, 0.02, 0.008, soft(0xfff8ee), 0, 0.01, 0, 16));
  const fm = soft(0xf2c14e, { roughness: 0.6 });
  for (let k = 0; k < 11; k++) {
    const a = k * 2.4;
    const r = 0.03 + (k % 4) * 0.025;
    const f = box(0.11, 0.022, 0.022, fm, Math.cos(a) * r, 0.03 + (k % 3) * 0.012, Math.sin(a) * r);
    f.rotation.y = a * 1.7;
    fries.add(f);
  }
  on(fries, -0.42, 0.12);
  const nuts = new THREE.Group();
  nuts.add(rcyl(0.09, 0.05, 0.015, soft(0x8a5a33), 0, 0.025, 0, 14));
  nuts.add(rcyl(0.075, 0.02, 0.008, soft(0xc98a4b, { roughness: 0.9 }), 0, 0.05, 0, 12));
  on(nuts, 0.78, -0.08);

  // Engradados de banquinho: 4 atrás (de frente para a câmera) e 4 na frente.
  const crateColors = [0xd8443c, 0xf2b134, 0x4f9a5c, 0x3b9be8];
  const us = [-1.05, -0.35, 0.35, 1.05];
  const seats: Seat[] = [];
  const world = (x: number, z: number) => new THREE.Vector3(pc.c.x + x, 0, pc.c.z + z);
  [-1, 1].forEach((side, row) => {
    us.forEach((u, k) => {
      const z = tz + side * 0.8;
      const s = crateSeat(crateColors[(k + row * 2) % 4]);
      s.position.set(u, 0.02, z);
      s.rotation.y = (k % 2 ? 0.06 : -0.05) * (row ? -1 : 1);
      g.add(s);
      // Sai pela beirada do piso do seu lado e vai até a saída (lado da porteira), sem atravessar a mesa.
      const edgeZ = side < 0 ? -D + 0.35 : D - 0.35;
      const path = [world(u, edgeZ), world(L - 0.35, edgeZ), pc.door.clone()];
      seats.push({ pos: world(u, z).setY(0.36), face: new THREE.Vector3(0, 0, -side), path });
    });
  });

  // Varal de lâmpadas: postes nos 4 cantos (os de trás mais altos, com a viga da placa), cordões sagrando.
  const post = std(0x6a3f37);
  const backY = 2.3;
  const frontY = 1.65;
  const corners = {
    bl: new THREE.Vector3(-L + 0.1, backY, -D + 0.1),
    br: new THREE.Vector3(L - 0.1, backY, -D + 0.1),
    fl: new THREE.Vector3(-L + 0.1, frontY, D - 0.1),
    fr: new THREE.Vector3(L - 0.1, frontY, D - 0.1),
  };
  for (const p of Object.values(corners)) g.add(box(0.09, p.y, 0.09, post, p.x, p.y / 2, p.z));
  g.add(box(L * 2 - 0.1, 0.09, 0.09, post, 0, backY - 0.05, -D + 0.1));
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.52),
    new THREE.MeshStandardMaterial({ map: textTexture('SÓ QUEM JOGA', { w: 768, h: 236, bg: 0xffc145, border: 0x2b1d22, color: '#2b1d22', size: 104 }) }),
  );
  plate.position.set(0, backY - 0.42, -D + 0.14);
  plate.rotation.x = -0.3; // inclinada para trás: a câmera (de cima) lê bem
  plate.castShadow = true;
  g.add(plate);
  for (const sx of [-0.55, 0.55]) {
    const ch = box(0.012, 0.14, 0.012, post, sx, backY - 0.13, -D + 0.12, false);
    g.add(ch);
  }

  const bulbs: { pos: THREE.Vector3; color: number }[] = [];
  const colors = [0xffd27a, 0xff6b5a, 0x7ee0a8, 0x9fd3ff];
  const cordMat = new THREE.LineBasicMaterial({ color: 0x2b1d22 });
  const cordPts: THREE.Vector3[] = [];
  const string = (a: THREE.Vector3, b: THREE.Vector3, count: number, sag: number) => {
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const v = a.clone().lerp(b, t);
      v.y -= Math.sin(t * Math.PI) * sag;
      if (prev) cordPts.push(prev, v);
      prev = v;
    }
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const v = a.clone().lerp(b, t);
      v.y -= Math.sin(t * Math.PI) * sag + 0.06;
      bulbs.push({ pos: v.add(pc.c), color: colors[bulbs.length % 4] });
    }
  };
  const top = (p: THREE.Vector3) => p.clone().setY(p.y - 0.02);
  string(top(corners.bl), top(corners.fl), 5, 0.35);
  string(top(corners.br), top(corners.fr), 5, 0.35);
  string(top(corners.fl), top(corners.fr), 7, 0.25);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cordPts), cordMat));

  // Luz quente do camarote (sem sombra: não custa desenho extra).
  const lamp = new THREE.PointLight(0xffc27a, 3.2, 5.5, 1.6);
  lamp.name = 'camarote-lamp';
  lamp.position.set(0, 1.9, tz);
  g.add(lamp);

  return { seats, bulbs };
}
