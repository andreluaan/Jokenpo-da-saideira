import type Phaser from 'phaser';
import type { PlayerView } from '@ppt/shared';
import { PAL, SHADOW_ALPHA } from './palette';
import type { RigPose } from './rig';

type G = Phaser.GameObjects.Graphics;

export interface DrawOpts {
  R: number;
  now: number;
  isMe: boolean;
  inGrace: boolean;
  /** Fase da caminhada (radianos) e se está andando. */
  walk: number;
  moving: boolean;
  /** Molas do ragdoll (balanço de cabeça e braços). */
  rig?: RigPose;
  /** Progresso (0–1) bebendo cerveja; ausente = não está bebendo. */
  drink?: number;
  /** Altura (0–1) do punho no "Jo-Ken-Pô" (bate no ritmo do QTE). */
  pump?: number;
  /** Revelação: lado (-1/1) do braço estendido com o sinal; 0 = nenhum. */
  signDir?: number;
  /** Rasteira: extensão (0–1) da perna e lado (-1/1). */
  kick?: number;
  kickDir?: number;
}

/** Ponto local (pés na origem) onde fica a mão estendida na revelação. Multiplique pela escala do corpo. */
export function signAnchor(R: number, dir: number): { x: number; y: number } {
  return { x: dir * R * 1.45, y: -R * 0.95 };
}

interface Frame {
  x: number;
  by: number;
  fy: number;
  R: number;
  hx: number;
  hy: number;
  hr: number;
  fx: number;
  fz: number;
  back: boolean;
  a: number;
  swing: number;
  /** Pose de "mão escondida" ao segurar símbolo — igual para os três símbolos. */
  hold: boolean;
  idle: boolean;
  now: number;
  /** Deslocamento das mãos vindo do rig (braços soltos). */
  lX: number;
  lY: number;
  rX: number;
  rY: number;
  ko: boolean;
  drink: number;
  pump: number;
  signDir: number;
  kick: number;
  kickDir: number;
  character: PlayerView['character'];
}

const INK = 0x1e1418;
const HAIR = 0x1a1420;

function shade(c: number, k: number): number {
  const r = Math.min(255, Math.floor(((c >> 16) & 0xff) * k));
  const g = Math.min(255, Math.floor(((c >> 8) & 0xff) * k));
  const b = Math.min(255, Math.floor((c & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/**
 * Desenha um frequentador do Bar do Zé (estilo cartoon chunky, cabeça grande) em coordenadas LOCAIS,
 * com os pés na origem: quem chama posiciona/gira/escala o Graphics (balanço do ragdoll).
 */
export function drawCharacter(g: G, p: PlayerView, o: DrawOpts): void {
  g.clear();
  const R = o.R;
  const rig = o.rig;
  const ko = !p.alive;
  const a = ko ? 0.85 : o.inGrace && Math.floor(o.now / 90) % 2 === 0 ? 0.45 : 1;
  const bob = ko ? 0 : p.stunned ? Math.sin(o.now / 40) * 2 : o.moving ? -Math.abs(Math.sin(o.walk)) * 3 : Math.sin(o.now / 420) * 1.2;
  const by = -R * 0.75 + bob;
  const hr = R * 0.7;
  const f: Frame = {
    x: 0,
    by,
    fy: 0,
    R,
    hx: p.faceX * 2 + (rig?.headX ?? 0),
    hy: by - R * 1.05 + (rig?.headY ?? 0),
    hr,
    fx: ko ? 0 : p.faceX,
    fz: ko ? 1 : p.faceY,
    back: !ko && p.faceY < -0.55,
    a,
    swing: o.moving && !ko ? Math.sin(o.walk) * R * 0.2 : 0,
    hold: p.holding && !ko,
    idle: !p.holding && !o.moving && !p.stunned && !ko,
    now: o.now,
    lX: rig?.lX ?? 0,
    lY: rig?.lY ?? 0,
    rX: rig?.rX ?? 0,
    rY: rig?.rY ?? 0,
    ko,
    drink: ko || o.drink === undefined ? -1 : o.drink,
    pump: o.pump ?? 0,
    signDir: ko ? 0 : (o.signDir ?? 0),
    kick: ko ? 0 : (o.kick ?? 0),
    kickDir: o.kickDir ?? 1,
    character: p.character,
  };
  if (f.drink >= 0) {
    // Cabeça para trás no gole.
    f.hy -= 3 + Math.sin(o.now / 120) * 1.5;
    f.idle = false;
  }
  if (f.signDir) {
    f.hold = false;
    f.idle = false;
  }

  switch (p.character) {
    case 'fera':
      drawFera(g, f);
      break;
    case 'principe':
      drawPrincipe(g, f);
      break;
    case 'panca':
      drawPanca(g, f);
      break;
    case 'sonolento':
      drawSonolento(g, f);
      break;
  }

  if (f.drink >= 0) drawDrinking(g, f);

  if (ko) {
    // Olhos em X por cima do rosto.
    const { ex, ey, d } = eyesAt(f);
    g.lineStyle(2.8, INK, 1);
    for (const dx of [-d, d]) g.lineBetween(ex + dx - 4, ey - 4, ex + dx + 4, ey + 4).lineBetween(ex + dx + 4, ey - 4, ex + dx - 4, ey + 4);
  } else if (p.stunned) {
    for (let i = 0; i < 3; i++) {
      const ang = o.now / 150 + (i * Math.PI * 2) / 3;
      g.fillStyle(PAL.sign, 1).fillCircle(f.hx + Math.cos(ang) * (hr + 12), f.hy - hr - 8 + Math.sin(ang) * 4, 3.5);
    }
  }
}

/** Sombra, anel colorido (identidade do jogador) e indicador de direção, no chão e em coordenadas absolutas. */
export function drawGroundMarker(g: G, p: PlayerView, R: number, isMe: boolean, inGrace: boolean, now: number): void {
  const fy = p.y + R * 0.6;
  const a = inGrace && Math.floor(now / 90) % 2 === 0 ? 0.45 : 1;
  g.fillStyle(PAL.shadow, SHADOW_ALPHA).fillEllipse(p.x + 3, fy + 2, R * (p.alive ? 2.3 : 3.6), R * 1.0);
  if (!p.alive) return;
  drawRing(g, p, { x: p.x, fy, R, a, fx: p.faceX, fz: p.faceY } as Frame, isMe);
}

function drawRing(g: G, p: PlayerView, f: Frame, isMe: boolean): void {
  const { x, fy, R, a } = f;
  g.fillStyle(p.color, 0.35 * a).fillEllipse(x, fy, (R + 12) * 2, (R + 12) * 1.1);
  g.lineStyle(isMe ? 5 : 4, isMe ? 0xffffff : p.color, a).strokeEllipse(x, fy, (R + 12) * 2, (R + 12) * 1.1);
  if (isMe) g.lineStyle(3, p.color, a).strokeEllipse(x, fy, (R + 6) * 2, (R + 6) * 1.1);
  const tipX = x + f.fx * (R + 20);
  const tipY = fy + f.fz * (R + 20) * 0.55;
  g.fillStyle(0xffffff, 0.85 * a).fillTriangle(
    tipX,
    tipY,
    x + f.fx * (R + 10) - f.fz * 7,
    fy + (f.fz * (R + 10) + f.fx * 7) * 0.55,
    x + f.fx * (R + 10) + f.fz * 7,
    fy + (f.fz * (R + 10) - f.fx * 7) * 0.55,
  );
}

// ------------------------------------------------------------------ partes comuns

function legs(g: G, f: Frame, color: number, footColor: number, footH = 0.22): void {
  const { x, by, R, a, swing } = f;
  const top = by + R * 0.35;
  const h = R * 0.62;
  for (const [side, s] of [
    [-1, swing],
    [1, -swing],
  ] as const) {
    if (f.kick > 0 && side === f.kickDir) {
      // Perna esticada varrendo o chão (rasteira).
      const hipX = x + side * R * 0.3;
      const footX = hipX + side * R * 1.5 * f.kick;
      const footY = top + h * (1 - 0.15 * f.kick);
      g.lineStyle(R * 0.38, color, a).lineBetween(hipX, top + 4, footX, footY - R * 0.1);
      g.fillStyle(footColor, a).fillEllipse(footX + side * 3, footY - 2, R * 0.55, R * 0.32);
      continue;
    }
    const lx = x + side * R * 0.3 - R * 0.19;
    g.fillStyle(color, a).fillRoundedRect(lx, top + s * 0.4, R * 0.38, h, 5);
    g.fillStyle(footColor, a).fillRoundedRect(lx - 1, top + h - R * footH + s * 0.4, R * 0.4, R * footH + 3, 4);
  }
}

function torso(g: G, f: Frame, color: number, w = 1.5, h = 1.3): void {
  const { x, by, R, a } = f;
  g.fillStyle(shade(color, 0.72), a).fillEllipse(x, by + 3, R * (w + 0.1), R * (h + 0.1));
  g.fillStyle(color, a).fillEllipse(x, by, R * w, R * h);
  g.fillStyle(0xffffff, 0.16 * a).fillEllipse(x - R * 0.3, by - R * 0.28, R * 0.55, R * 0.3);
}

/** Braços laterais (andando/parado) ou mãos juntas na frente (segurando símbolo). */
function arms(g: G, f: Frame, sleeve: number, hand: number, forearm?: (hx: number, hy: number) => void): { rx: number; ry: number } {
  const { x, by, R, a, hold, swing } = f;
  if (f.signDir) {
    // Revelação: um braço estendido na direção do adversário (a mão/sinal é desenhada pela cena).
    const side = f.signDir;
    const anchor = signAnchor(R, side);
    g.fillStyle(sleeve, a).fillCircle(x - R * 0.62, by - R * 0.05, R * 0.3).fillCircle(x + R * 0.62, by - R * 0.05, R * 0.3);
    g.lineStyle(R * 0.32, sleeve, a).lineBetween(x + side * R * 0.62, by - R * 0.1, anchor.x - side * R * 0.25, anchor.y);
    g.fillStyle(hand, a).fillCircle(x - side * R * 0.8 + f.lX, by + R * 0.05 + f.lY, R * 0.23);
    return { rx: anchor.x, ry: anchor.y };
  }
  if (hold) {
    // Punhos juntos e fechados: batem no ritmo do Jo-Ken-Pô, mas nunca mudam conforme o símbolo.
    const jx = (f.lX + f.rX) * 0.25;
    const jy = (f.lY + f.rY) * 0.25 - f.pump * R * 0.55;
    g.fillStyle(sleeve, a).fillCircle(x - R * 0.62, by - R * 0.05, R * 0.3).fillCircle(x + R * 0.62, by - R * 0.05, R * 0.3);
    g.fillStyle(hand, a).fillCircle(x - R * 0.28 + jx, by + R * 0.18 + jy, R * 0.25).fillCircle(x + R * 0.28 + jx, by + R * 0.18 + jy, R * 0.25);
    g.fillStyle(shade(hand, 0.8), a).fillCircle(x + jx, by + R * 0.22 + jy, R * 0.22);
    return { rx: x + R * 0.28 + jx, ry: by + R * 0.18 + jy };
  }
  const pts: [number, number][] = [
    [x - R * 0.85 + f.lX, by + R * 0.05 - swing * 0.5 + f.lY],
    [x + R * 0.85 + f.rX, by + R * 0.05 + swing * 0.5 + f.rY],
  ];
  g.fillStyle(sleeve, a).fillCircle(x - R * 0.68, by - R * 0.12, R * 0.3).fillCircle(x + R * 0.68, by - R * 0.12, R * 0.3);
  const right = { rx: pts[1][0], ry: pts[1][1] };
  if (f.drink >= 0) pts.pop(); // a mão direita está segurando a bebida (desenhada depois da cabeça)
  for (const [hx, hy] of pts) {
    // "Braço" ligando o ombro à mão solta (dá a sensação de membro mole).
    const sx = hx < x ? x - R * 0.68 : x + R * 0.68;
    g.lineStyle(R * 0.3, sleeve, a).lineBetween(sx, by - R * 0.12, hx, hy);
    forearm?.(hx, hy);
    g.fillStyle(hand, a).fillCircle(hx, hy, R * 0.23);
  }
  return right;
}

function head(g: G, f: Frame, skin: number, scale = 1): void {
  const { hx, hy, hr, a } = f;
  const r = hr * scale;
  g.fillStyle(shade(skin, 0.82), a).fillCircle(hx, hy + 3, r);
  g.fillStyle(skin, a).fillCircle(hx, hy, r);
  g.fillStyle(shade(skin, 0.9), a).fillCircle(hx - r * 0.95, hy + r * 0.1, r * 0.2).fillCircle(hx + r * 0.95, hy + r * 0.1, r * 0.2);
}

/** Posição dos olhos (acompanha a direção do olhar). */
function eyesAt(f: Frame): { ex: number; ey: number; d: number } {
  return { ex: f.hx + f.fx * f.hr * 0.3, ey: f.hy + f.hr * 0.12 + f.fz * 2, d: f.hr * 0.36 };
}

function dotEyes(g: G, f: Frame): void {
  const { ex, ey, d } = eyesAt(f);
  g.fillStyle(INK, f.a).fillCircle(ex - d, ey, 2.8).fillCircle(ex + d, ey, 2.8);
}

// ------------------------------------------------------------------ Fera Verde

function drawFera(g: G, f: Frame): void {
  const suit = 0x3f9a3a;
  const skin = 0xf2c6a0;
  legs(g, f, shade(suit, 0.85), 0xf07a2a, 0.3);
  torso(g, f, suit);
  // Cinto vermelho.
  g.fillStyle(0xd8443c, f.a).fillRect(f.x - f.R * 0.66, f.by + f.R * 0.26, f.R * 1.32, 5);
  const bandage = (hx: number, hy: number) => {
    g.fillStyle(0xf3ece8, f.a).fillRoundedRect(hx - f.R * 0.17, hy - f.R * 0.42, f.R * 0.34, f.R * 0.42, 4);
    g.lineStyle(1.2, 0xb9adb4, f.a).lineBetween(hx - f.R * 0.17, hy - f.R * 0.3, hx + f.R * 0.17, hy - f.R * 0.22);
    g.lineBetween(hx - f.R * 0.17, hy - f.R * 0.16, hx + f.R * 0.17, hy - f.R * 0.08);
  };
  const h = arms(g, f, suit, skin, bandage);
  if (!f.hold) bottle(g, h.rx, h.ry, f);
  head(g, f, skin);
  const { hx, hy, hr, a } = f;
  if (f.back) {
    g.fillStyle(HAIR, a).fillCircle(hx, hy - 1, hr * 1.04);
    g.fillStyle(0x6a6a9a, 0.5 * a).fillEllipse(hx - hr * 0.3, hy - hr * 0.5, hr * 0.7, hr * 0.3);
    return;
  }
  // Cabelo tigelinha brilhante com franja reta.
  g.fillStyle(HAIR, a).fillEllipse(hx, hy - hr * 0.42, hr * 2.2, hr * 1.5);
  g.fillStyle(HAIR, a).fillRect(hx - hr * 1.08, hy - hr * 0.45, hr * 2.16, hr * 0.42);
  g.fillStyle(HAIR, a).fillRect(hx - hr * 1.08, hy - hr * 0.1, hr * 0.32, hr * 0.55).fillRect(hx + hr * 0.76, hy - hr * 0.1, hr * 0.32, hr * 0.55);
  g.fillStyle(0x7a7aaa, 0.55 * a).fillEllipse(hx - hr * 0.35, hy - hr * 0.75, hr * 0.8, hr * 0.28);
  // Sobrancelhonas + óculos escuros.
  const { ex, ey, d } = eyesAt(f);
  g.fillStyle(HAIR, a).fillRect(ex - d - 6, ey - 9, 12, 4).fillRect(ex + d - 6, ey - 9, 12, 4);
  g.fillStyle(0x9a9aa8, a).fillRect(ex - d - 7, ey - 3, d * 2 + 14, 2.5);
  g.fillStyle(0x4b3fa8, a).fillRoundedRect(ex - d - 6, ey - 4, 12, 8, 3).fillRoundedRect(ex + d - 6, ey - 4, 12, 8, 3);
  g.fillStyle(0xb6a8ff, 0.6 * a).fillRect(ex - d - 4, ey - 3, 4, 2).fillRect(ex + d - 4, ey - 3, 4, 2);
  g.fillStyle(INK, a).fillRect(ex - 4, ey + hr * 0.42, 8, 2);
}

function bottle(g: G, x: number, y: number, f: Frame): void {
  const R = f.R;
  g.fillStyle(0x2f8a3a, f.a).fillRoundedRect(x - R * 0.15, y - R * 0.75, R * 0.3, R * 0.62, 4);
  g.fillStyle(0x2f8a3a, f.a).fillRect(x - R * 0.07, y - R * 1.0, R * 0.14, R * 0.3);
  g.fillStyle(0x6fd17a, 0.6 * f.a).fillRect(x - R * 0.09, y - R * 0.7, R * 0.06, R * 0.45);
  g.fillStyle(PAL.bottleCap, f.a).fillRect(x - R * 0.09, y - R * 1.05, R * 0.18, R * 0.08);
}

// ------------------------------------------------------------------ Príncipe Marrento

function drawPrincipe(g: G, f: Frame): void {
  const suit = 0x2e5fd1;
  const skin = 0xf2c6a0;
  const gold = 0xe8b830;
  const white = 0xf7f5ef;
  legs(g, f, suit, white, 0.34);
  // Pontas douradas das botas.
  g.fillStyle(gold, f.a).fillRect(f.x - f.R * 0.52, f.fy - 4, f.R * 0.42, 4).fillRect(f.x + f.R * 0.1, f.fy - 4, f.R * 0.42, 4);
  torso(g, f, suit);
  const { x, by, R, a } = f;
  // Peitoral branco, ombreiras e faixa dourada.
  g.fillStyle(0xd8d4c8, a).fillEllipse(x, by - R * 0.08, R * 1.32, R * 0.92);
  g.fillStyle(white, a).fillEllipse(x, by - R * 0.12, R * 1.24, R * 0.84);
  g.fillStyle(gold, a).fillEllipse(x - R * 0.62, by - R * 0.42, R * 0.48, R * 0.32).fillEllipse(x + R * 0.62, by - R * 0.42, R * 0.48, R * 0.32);
  g.fillStyle(gold, a).fillRect(x - R * 0.5, by + R * 0.24, R, 5);
  if (f.idle) {
    // Braços cruzados, marra total.
    g.fillStyle(shade(suit, 0.8), a).fillRoundedRect(x - R * 0.78, by - R * 0.05, R * 1.56, R * 0.4, 8);
    g.fillStyle(suit, a).fillRoundedRect(x - R * 0.78, by - R * 0.1, R * 1.56, R * 0.36, 8);
    g.fillStyle(white, a).fillCircle(x - R * 0.42, by + R * 0.08, R * 0.2).fillCircle(x + R * 0.42, by - R * 0.02, R * 0.2);
  } else {
    arms(g, f, suit, white);
  }
  head(g, f, skin);
  const { hx, hy, hr } = f;
  // Cabelo espetado em chama, com "entradas" em V.
  const spikes = [
    [-0.95, -0.1],
    [-1.1, -0.9],
    [-0.95, -1.95],
    [-0.5, -1.15],
    [-0.35, -2.4],
    [0, -1.25],
    [0.35, -2.35],
    [0.5, -1.15],
    [0.95, -1.9],
    [1.1, -0.9],
    [0.95, -0.1],
    [0.55, -0.55],
    [0, f.back ? -0.4 : -0.12],
    [-0.55, -0.55],
  ];
  g.fillStyle(HAIR, a).fillPoints(
    spikes.map(([sx, sy]) => ({ x: hx + sx * hr, y: hy + sy * hr })),
    true,
  );
  g.fillStyle(0x4a4060, 0.6 * a).fillTriangle(hx - hr * 0.3, hy - hr * 1.2, hx - hr * 0.35, hy - hr * 2.2, hx - hr * 0.1, hy - hr * 1.25);
  if (f.back) {
    g.fillStyle(HAIR, a).fillEllipse(hx, hy - hr * 0.2, hr * 2.05, hr * 1.4);
    return;
  }
  // Sobrancelhas franzidas e boca de desdém.
  const { ex, ey, d } = eyesAt(f);
  g.lineStyle(3.5, INK, a).lineBetween(ex - d - 6, ey - 9, ex - d + 5, ey - 5).lineBetween(ex + d + 6, ey - 9, ex + d - 5, ey - 5);
  dotEyes(g, f);
  g.lineStyle(2, INK, a).lineBetween(ex - 5, ey + hr * 0.45, ex + 5, ey + hr * 0.4);
}

// ------------------------------------------------------------------ Seu Pança

function drawPanca(g: G, f: Frame): void {
  const shirt = 0xfafafa;
  const pants = 0x4fb3e8;
  const skin = 0xf0bf8f;
  legs(g, f, pants, 0x6b6f78, 0.2);
  // Barrigão.
  torso(g, f, shirt, 1.85, 1.55);
  const { x, by, R, a } = f;
  g.fillStyle(0xdcdfe6, a).fillEllipse(x + R * 0.1, by + R * 0.25, R * 1.3, R * 0.7);
  g.fillStyle(shirt, a).fillEllipse(x, by + R * 0.12, R * 1.45, R * 0.8);
  g.fillStyle(0xdcdfe6, a).fillTriangle(x - R * 0.32, by - R * 0.62, x, by - R * 0.38, x - R * 0.05, by - R * 0.7);
  g.fillStyle(0xdcdfe6, a).fillTriangle(x + R * 0.32, by - R * 0.62, x, by - R * 0.38, x + R * 0.05, by - R * 0.7);
  const h = arms(g, f, shirt, skin);
  if (!f.hold) mug(g, h.rx + 2, h.ry, f);
  head(g, f, skin, 1.05);
  const { hx, hy, hr } = f;
  // Careca com fiapinhos penteados.
  g.lineStyle(1.8, 0x5a4030, a);
  for (const k of [-0.25, 0.05, 0.35]) {
    g.beginPath();
    g.arc(hx + k * hr * 1.2, hy - hr * 0.6, hr * 0.32, Math.PI * 1.15, Math.PI * 1.85, false);
    g.strokePath();
  }
  g.fillStyle(0xffffff, 0.35 * a).fillEllipse(hx - hr * 0.35, hy - hr * 0.6, hr * 0.6, hr * 0.28);
  if (f.back) return;
  // Barba por fazer, olhos grandes e boca aberta de alegria.
  const { ex, ey, d } = eyesAt(f);
  g.fillStyle(0xb08a6a, 0.5 * a).fillEllipse(ex, ey + hr * 0.55, hr * 1.25, hr * 0.7);
  g.fillStyle(0xffffff, a).fillCircle(ex - d, ey - 1, 5.5).fillCircle(ex + d, ey - 1, 5.5);
  g.fillStyle(INK, a).fillCircle(ex - d + f.fx * 1.5, ey - 1, 2.2).fillCircle(ex + d + f.fx * 1.5, ey - 1, 2.2);
  g.fillStyle(0x7a2a2a, a).fillEllipse(ex, ey + hr * 0.55, 10, 7);
}

function mug(g: G, x: number, y: number, f: Frame): void {
  const R = f.R;
  g.lineStyle(3, 0xf3ece8, f.a).strokeCircle(x + R * 0.3, y - R * 0.45, R * 0.15);
  g.fillStyle(0xffffff, 0.5 * f.a).fillRoundedRect(x - R * 0.2, y - R * 0.8, R * 0.46, R * 0.66, 4);
  g.fillStyle(PAL.crateYellow, f.a).fillRoundedRect(x - R * 0.17, y - R * 0.68, R * 0.4, R * 0.52, 3);
  g.fillStyle(0xffffff, f.a).fillEllipse(x + R * 0.03, y - R * 0.78, R * 0.56, R * 0.26);
  g.fillStyle(0xffffff, f.a).fillCircle(x - R * 0.12, y - R * 0.86, R * 0.1).fillCircle(x + R * 0.14, y - R * 0.88, R * 0.08);
}

// ------------------------------------------------------------------ Sonolento

function drawSonolento(g: G, f: Frame): void {
  const dark = 0x2c3328;
  const vest = 0x6f8040;
  const skin = 0xf2c6a0;
  legs(g, f, dark, 0x1e2219, 0.2);
  // Faixa branca na coxa.
  g.fillStyle(0xf3ece8, f.a).fillRect(f.x + f.R * 0.11, f.by + f.R * 0.52 - f.swing * 0.4, f.R * 0.38, 3).fillRect(f.x + f.R * 0.11, f.by + f.R * 0.6 - f.swing * 0.4, f.R * 0.38, 3);
  torso(g, f, dark);
  const { x, by, R, a } = f;
  // Colete tático com bolsos e gola alta.
  g.fillStyle(shade(vest, 0.8), a).fillEllipse(x - R * 0.36, by + 2, R * 0.72, R * 1.15).fillEllipse(x + R * 0.36, by + 2, R * 0.72, R * 1.15);
  g.fillStyle(vest, a).fillEllipse(x - R * 0.36, by, R * 0.68, R * 1.1).fillEllipse(x + R * 0.36, by, R * 0.68, R * 1.1);
  g.fillStyle(shade(vest, 0.75), a).fillRect(x - R * 0.58, by + R * 0.02, R * 0.34, R * 0.26).fillRect(x + R * 0.24, by + R * 0.02, R * 0.34, R * 0.26);
  g.fillStyle(vest, a).fillEllipse(x, by - R * 0.6, R * 0.9, R * 0.35);
  if (f.idle) {
    // Uma mão no bolso, a outra solta: desânimo estratégico.
    g.fillStyle(dark, a).fillCircle(x - R * 0.68, by - R * 0.12, R * 0.3).fillCircle(x + R * 0.68, by - R * 0.12, R * 0.3);
    g.fillStyle(skin, a).fillCircle(x + R * 0.85, by + R * 0.1, R * 0.23);
  } else {
    arms(g, f, dark, skin);
  }
  head(g, f, skin);
  const { hx, hy, hr } = f;
  // Cabelo puxado para trás + rabo de cavalo espetado no alto.
  const tuft = [
    [-0.35, -0.9],
    [-0.6, -1.7],
    [-0.2, -1.35],
    [0, -1.95],
    [0.2, -1.35],
    [0.6, -1.7],
    [0.35, -0.9],
  ];
  g.fillStyle(HAIR, a).fillPoints(
    tuft.map(([sx, sy]) => ({ x: hx + sx * hr, y: hy + sy * hr })),
    true,
  );
  g.fillStyle(HAIR, a).fillEllipse(hx, hy - hr * (f.back ? 0.2 : 0.55), hr * 2.08, hr * (f.back ? 1.5 : 1.05));
  g.fillStyle(0xd8443c, a).fillRect(hx - hr * 0.22, hy - hr * 1.0, hr * 0.44, 4);
  if (f.back) return;
  // Olhos meio fechados e palito de dente.
  const { ex, ey, d } = eyesAt(f);
  g.lineStyle(2.5, INK, a).lineBetween(ex - d - 5, ey, ex - d + 5, ey).lineBetween(ex + d - 5, ey, ex + d + 5, ey);
  g.lineStyle(1.5, INK, 0.5 * a).lineBetween(ex - d - 5, ey - 3, ex - d + 5, ey - 3).lineBetween(ex + d - 5, ey - 3, ex + d + 5, ey - 3);
  g.lineStyle(2, 0xe8d9a0, a).lineBetween(ex + 3, ey + hr * 0.45, ex + 14, ey + hr * 0.32);
  g.lineStyle(2, INK, a).lineBetween(ex - 4, ey + hr * 0.45, ex + 4, ey + hr * 0.45);
  if (f.idle) {
    // "z" flutuando de vez em quando.
    const t = (f.now % 2400) / 2400;
    if (t < 0.6) {
      const zx = hx + hr * 0.9 + t * 14;
      const zy = hy - hr * 1.3 - t * 22;
      g.lineStyle(2, 0xfff4e6, (1 - t / 0.6) * a);
      g.lineBetween(zx, zy, zx + 7, zy).lineBetween(zx + 7, zy, zx, zy + 7).lineBetween(zx, zy + 7, zx + 7, zy + 7);
    }
  }
}

// ------------------------------------------------------------------ bebendo

const SLEEVE: Record<PlayerView['character'], number> = { fera: 0x3f9a3a, principe: 0x2e5fd1, panca: 0xfafafa, sonolento: 0x2c3328 };
const HAND: Record<PlayerView['character'], number> = { fera: 0xf3ece8, principe: 0xf7f5ef, panca: 0xf0bf8f, sonolento: 0xf2c6a0 };

/** Braço levando a garrafa (ou a caneca do Seu Pança) à boca, com bolhas do gole. */
function drawDrinking(g: G, f: Frame): void {
  const { R, a, hx, hy, hr, now } = f;
  const sip = 0.5 + Math.sin(now / 140) * 0.5;
  const mx = hx + hr * 0.35;
  const my = hy + hr * 0.45;
  const handX = mx + R * 0.55;
  const handY = my + R * 0.25 - sip * 2;
  g.lineStyle(R * 0.3, SLEEVE[f.character], a).lineBetween(f.x + R * 0.68, f.by - R * 0.12, handX, handY);
  if (f.character === 'panca') {
    // Caneca de chope inclinada.
    g.fillStyle(0xffffff, 0.55 * a).fillPoints(rot(handX - 4, handY - 6, R * 0.5, R * 0.62, -0.8), true);
    g.fillStyle(PAL.crateYellow, a).fillPoints(rot(handX - 4, handY - 6, R * 0.42, R * 0.5, -0.8), true);
    g.fillStyle(0xffffff, a).fillCircle(mx + 3, my - 2, R * 0.16);
  } else {
    // Long neck marrom, gargalo na boca.
    g.fillStyle(0x6b3a1f, a).fillPoints(rot(handX - 2, handY - 4, R * 0.3, R * 0.75, -1.0), true);
    g.lineStyle(R * 0.13, 0x6b3a1f, a).lineBetween(handX - 6, handY - 10, mx + 2, my);
    g.fillStyle(0xe8d9a0, a).fillRect(handX - 8, handY - 8, 7, 4);
  }
  g.fillStyle(HAND[f.character], a).fillCircle(handX, handY, R * 0.23);
  // Bolhas do gole.
  for (let i = 0; i < 3; i++) {
    const t = ((now / 500 + i / 3) % 1 + 1) % 1;
    g.fillStyle(0xffffff, (1 - t) * 0.8 * a).fillCircle(mx + 8 + i * 4, my - 6 - t * 26, 2.5 + t * 2);
  }
}

/** Retângulo girado em torno de (cx, cy). */
function rot(cx: number, cy: number, w: number, h: number, ang: number): { x: number; y: number }[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

// ------------------------------------------------------------------ mira

/** Seta de mira no chão (lâmina branca translúcida), como na referência. Não revela o símbolo. */
export function drawAim(g: G, x1: number, y1: number, x2: number, y2: number, R: number, color: number, duel: boolean, strong: boolean): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < R * 2) return;
  const ux = dx / len;
  const uy = dy / len;
  const fy = R * 0.6;
  const sx = x1 + ux * (R + 14);
  const sy = y1 + fy + uy * (R + 14) * 0.7;
  const L = Math.min(120, len - R * 2 - 10);
  const ex = sx + ux * L;
  const ey = sy + uy * L * 0.85;
  const w = 13;
  const tri = [
    { x: sx - uy * w, y: sy + ux * w },
    { x: ex, y: ey },
    { x: sx + uy * w, y: sy - ux * w },
  ];
  g.fillStyle(PAL.shadow, 0.25).fillPoints(
    tri.map((p) => ({ x: p.x + 4, y: p.y + 5 })),
    true,
  );
  g.fillStyle(duel ? PAL.sign : 0xffffff, strong ? 0.85 : 0.6).fillPoints(tri, true);
  g.lineStyle(2, color, 0.9).strokePoints(tri, true);
  // Linha pontilhada discreta até o alvo.
  g.lineStyle(2, color, 0.45);
  const tx = x2;
  const ty = y2 + fy;
  const rest = Math.hypot(tx - ex, ty - ey);
  for (let d = 10; d < rest - R; d += 16) {
    const a0 = d / rest;
    const a1 = Math.min(1, (d + 7) / rest);
    g.lineBetween(ex + (tx - ex) * a0, ey + (ty - ey) * a0, ex + (tx - ex) * a1, ey + (ty - ey) * a1);
  }
}
