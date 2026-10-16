import Phaser from 'phaser';
import { makeRng, type GameConfig, type Obstacle } from '@ppt/shared';
import { PAL, SHADOW_ALPHA } from './palette';

export const FONT = 'Fredoka, "Segoe UI", sans-serif';
/** Camadas de profundidade. Jogadores e objetos de cenário usam depth = y da base. */
export const DEPTH = { ground: -1000, floor: -900, fenceBack: -800, fenceFront: 5000, ui: 6000, popup: 7000 } as const;

type G = Phaser.GameObjects.Graphics;

/** Desenha todo o cenário estático: quintal, arena, cerca, obstáculos e decoração. */
export function buildArena(scene: Phaser.Scene, cfg: GameConfig): void {
  const rng = makeRng(20261016);
  drawGround(scene.add.graphics().setDepth(DEPTH.ground), cfg, rng);
  drawDecor(scene, cfg, rng);
  drawFloor(scene.add.graphics().setDepth(DEPTH.floor), cfg, rng);
  drawFence(scene, cfg);
  for (const o of cfg.obstacles) drawObstacle(scene, o);
}

// ------------------------------------------------------------------ chão externo

function drawGround(g: G, cfg: GameConfig, rng: () => number): void {
  const { width, height } = cfg.arena;
  g.fillStyle(PAL.ground, 1).fillRect(0, 0, width, height);
  for (let i = 0; i < 60; i++) {
    const w = 60 + rng() * 180;
    g.fillStyle(rng() < 0.5 ? PAL.groundLight : PAL.groundShade, 0.35).fillEllipse(rng() * width, rng() * height, w, w * 0.45);
  }
  // Campo seco no canto superior direito.
  const field = [
    { x: 1360, y: 0 },
    { x: width, y: 0 },
    { x: width, y: 560 },
    { x: 1840, y: 470 },
    { x: 1760, y: 300 },
    { x: 1640, y: 170 },
    { x: 1500, y: 90 },
  ];
  g.fillStyle(PAL.fieldShade, 1).fillPoints(field.map((p) => ({ x: p.x - 10, y: p.y + 14 })), true);
  g.fillStyle(PAL.field, 1).fillPoints(field, true);
  g.lineStyle(2, PAL.fieldShade, 0.7);
  for (let i = 0; i < 40; i++) {
    const x = 1500 + rng() * 420;
    const y = rng() * 420;
    if (y > (x - 1360) * 0.95) continue;
    g.lineBetween(x, y, x + 4, y - 10).lineBetween(x + 6, y, x + 8, y - 8);
  }
  // Caminho de terra até o boteco.
  g.fillStyle(PAL.groundShade, 0.45);
  for (let t = 0; t <= 1; t += 0.04) g.fillEllipse(360 + t * 220, 220 + t * 110, 90, 40);
}

// ------------------------------------------------------------------ arena

function drawFloor(g: G, cfg: GameConfig, rng: () => number): void {
  const { cx, cy, rx, ry } = cfg.arena;
  // Terra revirada em volta da cerca.
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2;
    const k = 1.02 + rng() * 0.09;
    const s = 4 + rng() * 10;
    g.fillStyle(rng() < 0.5 ? PAL.dirtDark : PAL.dirtTexture, 0.55).fillEllipse(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, s * 1.6, s);
  }
  g.fillStyle(PAL.shadow, 0.22).fillEllipse(cx, cy + 10, (rx + 34) * 2, (ry + 34) * 2);
  g.fillStyle(PAL.dirt, 1).fillEllipse(cx, cy, (rx + 18) * 2, (ry + 18) * 2);
  // Textura: manchas e pegadas.
  for (let i = 0; i < 140; i++) {
    const a = rng() * Math.PI * 2;
    const k = Math.sqrt(rng()) * 0.95;
    const s = 6 + rng() * 26;
    g.fillStyle(rng() < 0.6 ? PAL.dirtTexture : 0x977880, 0.45).fillEllipse(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, s * 1.8, s);
  }
  // Borda branca.
  g.lineStyle(12, PAL.rim, 1).strokeEllipse(cx, cy, (rx + 12) * 2, (ry + 12) * 2);
  g.lineStyle(3, 0xd9cfd0, 1).strokeEllipse(cx, cy, (rx + 5) * 2, (ry + 5) * 2);
}

function drawFence(scene: Phaser.Scene, cfg: GameConfig): void {
  const { cx, cy, rx, ry } = cfg.arena;
  const back = scene.add.graphics().setDepth(DEPTH.fenceBack);
  const front = scene.add.graphics().setDepth(DEPTH.fenceFront);
  const n = 64;
  const ex = rx + 30;
  const ey = ry + 30;
  const H = 34;
  const posts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * ex, y: cy + Math.sin(a) * ey };
  });

  // Sombra da cerca no chão.
  back.lineStyle(6, PAL.shadow, 0.18).strokeEllipse(cx + 6, cy + 8, ex * 2, ey * 2);

  for (let i = 0; i < n; i++) {
    const p = posts[i];
    const q = posts[(i + 1) % n];
    const g = (p.y + q.y) / 2 < cy ? back : front;
    // Ripas horizontais.
    g.lineStyle(5, PAL.woodDark, 1).lineBetween(p.x, p.y - 11, q.x, q.y - 11);
    g.lineStyle(5, PAL.wood, 1).lineBetween(p.x, p.y - 25, q.x, q.y - 25);
    g.lineStyle(1.5, PAL.woodLight, 1).lineBetween(p.x, p.y - 27, q.x, q.y - 27);
  }
  posts.forEach((p, i) => {
    const g = p.y < cy ? back : front;
    g.fillStyle(PAL.woodDark, 1).fillRect(p.x - 6, p.y - H, 12, H);
    g.fillStyle(PAL.woodLight, 1).fillRect(p.x - 6, p.y - H - 4, 12, 6);
    if (i % 6 === 3) {
      // Plaquinha amarela em losango.
      const sx = p.x;
      const sy = p.y - 18;
      g.fillStyle(PAL.signInk, 1).fillPoints([{ x: sx, y: sy - 9 }, { x: sx + 9, y: sy }, { x: sx, y: sy + 9 }, { x: sx - 9, y: sy }], true);
      g.fillStyle(PAL.sign, 1).fillPoints([{ x: sx, y: sy - 6 }, { x: sx + 6, y: sy }, { x: sx, y: sy + 6 }, { x: sx - 6, y: sy }], true);
    }
  });

  // Varal de luzes na metade de trás.
  const bulbs = [0xffc145, 0xff5a5f, 0x5ad19a, 0x8ecae6];
  for (let i = n / 2; i < n; i += 4) {
    const p = posts[i];
    const q = posts[(i + 4) % n];
    const pts: { x: number; y: number }[] = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const sag = Math.sin(t * Math.PI) * 18;
      pts.push({ x: p.x + (q.x - p.x) * t, y: p.y - H - 6 + (q.y - p.y) * t + sag });
    }
    back.lineStyle(1.5, PAL.signInk, 0.8).strokePoints(pts);
    pts.slice(1, -1).forEach((b, k) => {
      back.fillStyle(bulbs[(i + k) % bulbs.length], 0.25).fillCircle(b.x, b.y + 3, 7);
      back.fillStyle(bulbs[(i + k) % bulbs.length], 1).fillCircle(b.x, b.y + 3, 3);
    });
  }
}

// ------------------------------------------------------------------ obstáculos

function shadow(g: G, x: number, y: number, w: number, h: number): void {
  g.fillStyle(PAL.shadow, SHADOW_ALPHA).fillEllipse(x + 6, y + 6, w, h);
}

export function drawObstacle(scene: Phaser.Scene, o: Obstacle): void {
  const g = scene.add.graphics();
  if (o.kind === 'circle' && o.prop === 'table') {
    g.setDepth(o.y + o.r * 0.4);
    const { x, y, r } = o;
    shadow(g, x, y + 8, r * 2.1, r * 1.5);
    g.fillStyle(PAL.woodDark, 1).fillRect(x - 9, y - 10, 18, 26);
    g.fillStyle(PAL.woodDark, 1).fillEllipse(x, y + 16, 46, 16);
    const ty = y - 26;
    g.fillStyle(PAL.woodDark, 1).fillEllipse(x, ty + 7, r * 2, r * 1.7);
    g.fillStyle(PAL.wood, 1).fillEllipse(x, ty, r * 2, r * 1.7);
    g.lineStyle(2, PAL.woodDark, 0.5);
    for (let k = -2; k <= 2; k++) g.lineBetween(x - r * 0.9 + Math.abs(k) * 8, ty + k * 16, x + r * 0.9 - Math.abs(k) * 8, ty + k * 16);
    g.lineStyle(2, PAL.woodLight, 0.9).strokeEllipse(x, ty, r * 2 - 6, r * 1.7 - 6);
    // Copos e uma garrafa em cima da mesa.
    for (const [dx, dy] of [[-22, -8], [18, -14], [8, 16]]) {
      g.fillStyle(0xffffff, 0.55).fillCircle(x + dx, ty + dy, 7);
      g.fillStyle(PAL.sign, 0.95).fillCircle(x + dx, ty + dy, 5);
      g.fillStyle(0xffffff, 0.95).fillCircle(x + dx - 1, ty + dy - 2, 2.5);
    }
    g.fillStyle(PAL.bottle, 1).fillCircle(x - 4, ty + 4, 8);
    g.fillStyle(PAL.bottleCap, 1).fillCircle(x - 4, ty + 2, 3);
    return;
  }
  if (o.kind === 'circle') {
    // Barril de chope.
    g.setDepth(o.y + o.r * 0.5);
    const { x, y, r } = o;
    const H = 40;
    shadow(g, x, y + 4, r * 2.2, r * 1.3);
    g.fillStyle(PAL.barrelDark, 1).fillEllipse(x, y, r * 2, r * 1.2);
    g.fillStyle(PAL.barrel, 1).fillRect(x - r, y - H, r * 2, H);
    g.fillStyle(PAL.barrelDark, 0.35).fillRect(x + r * 0.35, y - H, r * 0.65, H);
    g.fillStyle(PAL.hoop, 1).fillRect(x - r, y - H + 7, r * 2, 5).fillRect(x - r, y - 12, r * 2, 5);
    g.fillStyle(PAL.barrelDark, 1).fillEllipse(x, y - H, r * 2, r * 1.2);
    g.fillStyle(PAL.woodLight, 1).fillEllipse(x, y - H, r * 1.7, r * 0.98);
    g.lineStyle(1.5, PAL.barrelDark, 0.6).lineBetween(x - r * 0.7, y - H, x + r * 0.7, y - H);
    g.fillStyle(0xc9c3c8, 1).fillCircle(x, y - H, 5);
    g.fillStyle(PAL.hoop, 1).fillCircle(x, y - H, 2);
    return;
  }
  // Pilha de engradados de cerveja (amarelos e verdes).
  const { x, y, w, h } = o;
  g.setDepth(y + h);
  shadow(g, x + w / 2, y + h - 4, w * 1.15, h * 0.9);
  const H = 30;
  drawCrate(g, x, y, w, h, H, PAL.crateYellow, PAL.crateYellowDark);
  drawCrate(g, x + 10, y + 6, w - 22, h - 18, H * 2, PAL.crateGreen, PAL.crateGreenDark);
}

function drawCrate(g: G, x: number, y: number, w: number, h: number, H: number, color: number, dark: number): void {
  // Face da frente.
  g.fillStyle(dark, 1).fillRect(x, y + h - H, w, H);
  g.fillStyle(0x000000, 0.18).fillRect(x + 8, y + h - H + 8, w - 16, 8);
  // Tampa com as garrafas aparecendo.
  g.fillStyle(color, 1).fillRect(x, y - H, w, h);
  g.lineStyle(2, dark, 1).strokeRect(x + 2, y - H + 2, w - 4, h - 4);
  const cols = Math.max(2, Math.floor(w / 18));
  const rows = Math.max(2, Math.floor(h / 18));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const bx = x + ((i + 0.5) * w) / cols;
      const by = y - H + ((j + 0.5) * h) / rows;
      g.fillStyle(PAL.bottle, 1).fillCircle(bx, by, 5.5);
      g.fillStyle(PAL.bottleCap, 1).fillCircle(bx, by - 1, 2.5);
    }
  }
}

// ------------------------------------------------------------------ decoração externa

function drawDecor(scene: Phaser.Scene, cfg: GameConfig, rng: () => number): void {
  drawShack(scene);
  drawGarden(scene.add.graphics().setDepth(900), rng);
  for (const [x, y, s] of [
    [1700, 150, 1.15],
    [1850, 380, 0.95],
    [1560, 40, 0.8],
    [70, 640, 1.0],
    [120, 420, 0.75],
    [1840, 1010, 1.1],
    [1890, 760, 0.7],
  ] as const) {
    drawTree(scene, x, y, s);
  }
  drawPatio(scene, 1640, 1065);
  drawPatio(scene, 1790, 890, true);
  drawChalkboard(scene, 470, 1130);
  void cfg;
}

function drawTree(scene: Phaser.Scene, x: number, y: number, s: number): void {
  const g = scene.add.graphics().setDepth(y + 20);
  shadow(g, x + 30 * s, y + 18 * s, 190 * s, 80 * s);
  g.fillStyle(PAL.trunk, 1).fillRect(x - 9 * s, y - 50 * s, 18 * s, 66 * s);
  g.fillStyle(PAL.trunk, 1).fillTriangle(x - 9 * s, y + 16 * s, x - 22 * s, y + 18 * s, x - 9 * s, y);
  const blobs = [
    [0, -95, 62],
    [-48, -70, 46],
    [48, -72, 48],
    [-20, -130, 44],
    [28, -122, 42],
  ];
  for (const [dx, dy, r] of blobs) g.fillStyle(PAL.foliageDark, 1).fillCircle(x + dx * s, y + (dy + 8) * s, r * s);
  for (const [dx, dy, r] of blobs) g.fillStyle(PAL.foliage, 1).fillCircle(x + dx * s, y + dy * s, r * s);
  for (const [dx, dy, r] of blobs.slice(0, 3)) g.fillStyle(PAL.foliageLight, 0.85).fillCircle(x + (dx - 12) * s, y + (dy - 14) * s, r * 0.45 * s);
}

function drawShack(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(200);
  const x = 30;
  const y = 40;
  const w = 330;
  const h = 150;
  shadow(g, x + w / 2 + 20, y + h + 10, w * 1.05, 60);
  // Parede da frente.
  g.fillStyle(PAL.wall, 1).fillRect(x + 10, y + 70, w - 20, h - 50);
  g.fillStyle(0xe2c8ab, 1).fillRect(x + 10, y + h, w - 20, 20);
  // Porta e janela com balcão.
  g.fillStyle(PAL.woodDark, 1).fillRect(x + 40, y + 100, 46, 70);
  g.fillStyle(PAL.sign, 1).fillCircle(x + 78, y + 138, 3);
  g.fillStyle(0x2b1d22, 1).fillRect(x + 130, y + 100, 150, 46);
  g.fillStyle(PAL.sign, 0.5).fillRect(x + 134, y + 104, 142, 38);
  g.fillStyle(PAL.wood, 1).fillRect(x + 122, y + 146, 166, 10);
  // Telhado de zinco vermelho.
  g.fillStyle(PAL.roofDark, 1).fillRect(x - 10, y + 52, w + 20, 26);
  g.fillStyle(PAL.roof, 1).fillRect(x - 10, y, w + 20, 60);
  g.lineStyle(3, PAL.roofDark, 0.8);
  for (let k = x; k < x + w + 10; k += 18) g.lineBetween(k, y + 2, k, y + 58);
  // Placa.
  g.fillStyle(PAL.signInk, 1).fillRoundedRect(x + 70, y + 6, 190, 40, 8);
  g.fillStyle(PAL.sign, 1).fillRoundedRect(x + 74, y + 10, 182, 32, 6);
  scene.add
    .text(x + 165, y + 26, 'BAR DO ZÉ', { fontFamily: FONT, fontSize: '24px', fontStyle: '700', color: '#2b1d22' })
    .setOrigin(0.5)
    .setDepth(201);
  // Engradados e cadeiras na porta.
  const c = scene.add.graphics().setDepth(260);
  drawCrate(c, x + 300, y + 175, 44, 34, 22, PAL.crateYellow, PAL.crateYellowDark);
  drawChair(c, x + 104, y + 205);
}

function drawPatio(scene: Phaser.Scene, x: number, y: number, umbrella = false): void {
  const g = scene.add.graphics().setDepth(y + 10);
  shadow(g, x, y + 22, 150, 46);
  // Mesa de plástico vermelha.
  g.fillStyle(PAL.plasticRedDark, 1).fillRect(x - 4, y - 6, 8, 28);
  g.fillStyle(PAL.plasticRedDark, 1).fillRoundedRect(x - 46, y - 30, 92, 34, 8);
  g.fillStyle(PAL.plasticRed, 1).fillRoundedRect(x - 46, y - 38, 92, 34, 8);
  g.fillStyle(PAL.bottle, 1).fillCircle(x - 12, y - 22, 7);
  g.fillStyle(PAL.bottleCap, 1).fillCircle(x - 12, y - 24, 3);
  g.fillStyle(0xffffff, 0.6).fillCircle(x + 16, y - 20, 6);
  g.fillStyle(PAL.sign, 1).fillCircle(x + 16, y - 20, 4);
  drawChair(g, x - 72, y + 6);
  drawChair(g, x + 72, y + 6);
  if (umbrella) {
    const u = scene.add.graphics().setDepth(y + 60);
    u.fillStyle(PAL.shadow, 0.18).fillCircle(x + 30, y + 30, 90);
    u.fillStyle(0xfff4e6, 1).fillCircle(x, y - 70, 84);
    for (let k = 0; k < 8; k += 2) {
      const a0 = (k / 8) * Math.PI * 2;
      const a1 = ((k + 1) / 8) * Math.PI * 2;
      u.fillStyle(PAL.plasticRed, 1).slice(x, y - 70, 84, a0, a1, false).fillPath();
    }
    u.fillStyle(PAL.signInk, 1).fillCircle(x, y - 70, 5);
  }
}

function drawChair(g: G, x: number, y: number): void {
  g.fillStyle(PAL.shadow, SHADOW_ALPHA).fillEllipse(x + 4, y + 12, 44, 18);
  g.fillStyle(PAL.plasticRedDark, 1).fillRoundedRect(x - 18, y - 20, 36, 32, 6);
  g.fillStyle(PAL.plasticRed, 1).fillRoundedRect(x - 18, y - 26, 36, 30, 6);
  g.fillStyle(PAL.plasticRedDark, 1).fillRoundedRect(x - 18, y - 40, 36, 12, 5);
}

function drawGarden(g: G, rng: () => number): void {
  for (let row = 0; row < 4; row++) {
    const y = 980 + row * 50;
    g.fillStyle(PAL.groundShade, 1).fillRoundedRect(30, y - 14, 300 - row * 30, 28, 14);
    for (let x = 50; x < 310 - row * 30; x += 34) {
      if (row % 2 === 0) {
        g.fillStyle(PAL.carrot, 1).fillTriangle(x - 5, y, x + 5, y, x, y + 12);
        g.fillStyle(PAL.leafGreen, 1).fillTriangle(x - 7, y - 2, x, y - 16 - rng() * 4, x + 7, y - 2);
      } else {
        g.fillStyle(0x3f8746, 1).fillCircle(x, y - 2, 11);
        g.fillStyle(PAL.leafGreen, 1).fillCircle(x - 2, y - 4, 7);
      }
    }
  }
}

function drawChalkboard(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(y);
  shadow(g, x, y + 8, 120, 26);
  g.fillStyle(PAL.woodDark, 1).fillRect(x - 40, y - 20, 6, 28).fillRect(x + 34, y - 20, 6, 28);
  g.fillStyle(PAL.woodDark, 1).fillRoundedRect(x - 54, y - 86, 108, 72, 6);
  g.fillStyle(0x2f3b33, 1).fillRoundedRect(x - 48, y - 80, 96, 60, 4);
  scene.add
    .text(x, y - 60, 'SAIDEIRA', { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#fff4e6' })
    .setOrigin(0.5)
    .setDepth(y + 1);
  scene.add
    .text(x, y - 38, 'quem perde paga', { fontFamily: FONT, fontSize: '11px', color: '#ffc145' })
    .setOrigin(0.5)
    .setDepth(y + 1);
}
