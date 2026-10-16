import type Phaser from 'phaser';
import type { PlayerView } from '@ppt/shared';
import { PAL, SHADOW_ALPHA } from './palette';

type G = Phaser.GameObjects.Graphics;

/** Visual puramente cosmético: todos jogam exatamente igual. */
export type Look = 'cap' | 'straw' | 'bun' | 'mustache';
export const LOOKS: Look[] = ['cap', 'straw', 'bun', 'mustache'];

function darken(c: number, k: number): number {
  const r = Math.floor(((c >> 16) & 0xff) * k);
  const g = Math.floor(((c >> 8) & 0xff) * k);
  const b = Math.floor((c & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

export interface DrawOpts {
  index: number;
  R: number;
  now: number;
  isMe: boolean;
  inGrace: boolean;
}

/**
 * Desenha um frequentador do Bar do Zé. A pose NÃO depende do símbolo escolhido
 * (informação oculta): segurar qualquer símbolo tem a mesma pose de "mão escondida".
 */
export function drawCharacter(g: G, p: PlayerView, o: DrawOpts): void {
  const { R, now } = o;
  const look = LOOKS[o.index % LOOKS.length];
  const skin = PAL.skin[o.index % PAL.skin.length];
  const hair = PAL.hair[o.index % PAL.hair.length];
  const x = p.x;
  const y = p.y;
  g.clear();

  if (!p.alive) {
    g.fillStyle(PAL.shadow, SHADOW_ALPHA).fillEllipse(x + 4, y + R * 0.5, R * 2.8, R * 1.1);
    g.fillStyle(0x8b8290, 0.8).fillEllipse(x, y + R * 0.2, R * 2.2, R * 1.1);
    g.fillStyle(0xb9adb4, 0.9).fillCircle(x + R * 1.1, y + R * 0.1, R * 0.55);
    g.lineStyle(2.5, PAL.signInk, 0.9);
    const ex = x + R * 1.1;
    const ey = y + R * 0.05;
    for (const dx of [-6, 6]) g.lineBetween(ex + dx - 3, ey - 3, ex + dx + 3, ey + 3).lineBetween(ex + dx + 3, ey - 3, ex + dx - 3, ey + 3);
    return;
  }

  const alpha = o.inGrace && Math.floor(now / 90) % 2 === 0 ? 0.45 : 1;
  const bob = p.stunned ? Math.sin(now / 40) * 2 : 0;

  // Sombra e anel colorido no chão (cor do jogador).
  const fy = y + R * 0.55;
  g.fillStyle(PAL.shadow, SHADOW_ALPHA).fillEllipse(x + 3, fy + 2, R * 2.3, R * 1.0);
  g.fillStyle(p.color, 0.35 * alpha).fillEllipse(x, fy, (R + 12) * 2, (R + 12) * 1.1);
  g.lineStyle(o.isMe ? 5 : 4, o.isMe ? 0xffffff : p.color, alpha).strokeEllipse(x, fy, (R + 12) * 2, (R + 12) * 1.1);
  if (o.isMe) g.lineStyle(3, p.color, alpha).strokeEllipse(x, fy, (R + 6) * 2, (R + 6) * 1.1);
  // Indicador de direção na borda do anel.
  const fx = p.faceX;
  const fz = p.faceY;
  const tipX = x + fx * (R + 20);
  const tipY = fy + fz * (R + 20) * 0.55;
  g.fillStyle(0xffffff, 0.85 * alpha).fillTriangle(
    tipX,
    tipY,
    x + fx * (R + 10) - fz * 7,
    fy + (fz * (R + 10) + fx * 7) * 0.55,
    x + fx * (R + 10) + fz * 7,
    fy + (fz * (R + 10) - fx * 7) * 0.55,
  );

  const by = y - 4 + bob;
  // Pernas.
  g.fillStyle(0x3d3550, alpha).fillRoundedRect(x - R * 0.5, by + R * 0.35, R * 0.38, R * 0.5, 4);
  g.fillStyle(0x3d3550, alpha).fillRoundedRect(x + R * 0.12, by + R * 0.35, R * 0.38, R * 0.5, 4);
  // Corpo (camisa na cor do jogador).
  g.fillStyle(darken(p.color, 0.72), alpha).fillEllipse(x, by + 3, R * 1.7, R * 1.45);
  g.fillStyle(p.color, alpha).fillEllipse(x, by, R * 1.6, R * 1.35);
  g.fillStyle(0xffffff, 0.18 * alpha).fillEllipse(x - R * 0.3, by - R * 0.25, R * 0.6, R * 0.35);
  // Braços: segurando símbolo = mãos juntas na frente, fechadas (igual para os três).
  const hold = p.holding;
  const armDX = hold ? R * 0.35 : R * 0.82;
  const armY = hold ? by + R * 0.15 : by + R * 0.05;
  g.fillStyle(darken(p.color, 0.85), alpha).fillCircle(x - R * 0.72, by - R * 0.05, R * 0.3).fillCircle(x + R * 0.72, by - R * 0.05, R * 0.3);
  g.fillStyle(skin, alpha).fillCircle(x - armDX, armY, R * 0.24).fillCircle(x + armDX, armY, R * 0.24);
  if (hold) g.fillStyle(darken(skin, 0.8), alpha).fillCircle(x, armY + 2, R * 0.2);

  // Cabeça.
  const hx = x + fx * 2;
  const hy = by - R * 0.95;
  const hr = R * 0.6;
  g.fillStyle(darken(skin, 0.85), alpha).fillCircle(hx, hy + 2, hr);
  g.fillStyle(skin, alpha).fillCircle(hx, hy, hr);
  drawLook(g, look, hx, hy, hr, hair, p.color, alpha);

  // Rosto (só quando olhando para "baixo"/lados).
  if (fz > -0.55) {
    const ex = hx + fx * hr * 0.35;
    const ey = hy + hr * 0.1 + fz * 2;
    g.fillStyle(PAL.signInk, alpha).fillCircle(ex - hr * 0.32, ey, 2.6).fillCircle(ex + hr * 0.32, ey, 2.6);
    if (look === 'mustache') {
      g.fillStyle(hair, alpha).fillEllipse(ex - 4, ey + hr * 0.42, 11, 5).fillEllipse(ex + 4, ey + hr * 0.42, 11, 5);
    } else {
      g.fillStyle(0xe07a6a, 0.6 * alpha).fillCircle(ex - hr * 0.55, ey + hr * 0.3, 3).fillCircle(ex + hr * 0.55, ey + hr * 0.3, 3);
    }
  }

  if (p.stunned) {
    for (let i = 0; i < 3; i++) {
      const a = now / 150 + (i * Math.PI * 2) / 3;
      g.fillStyle(PAL.sign, 1).fillCircle(hx + Math.cos(a) * (hr + 10), hy - hr - 4 + Math.sin(a) * 4, 3.5);
    }
  }
}

function drawLook(g: G, look: Look, x: number, y: number, r: number, hair: number, color: number, alpha: number): void {
  switch (look) {
    case 'cap':
      g.fillStyle(darken(color, 0.6), alpha).fillEllipse(x, y - r * 0.35, r * 2.1, r * 1.3);
      g.fillStyle(darken(color, 0.6), alpha).fillEllipse(x, y - r * 0.05, r * 2.3, r * 0.6);
      g.fillStyle(0xffffff, 0.9 * alpha).fillCircle(x, y - r * 0.55, 3);
      break;
    case 'straw':
      g.fillStyle(0xc99a4a, alpha).fillEllipse(x, y - r * 0.15, r * 3, r * 1.0);
      g.fillStyle(0xe2b866, alpha).fillEllipse(x, y - r * 0.5, r * 1.7, r * 1.1);
      g.fillStyle(0xd8443c, alpha).fillRect(x - r * 0.85, y - r * 0.32, r * 1.7, 4);
      break;
    case 'bun':
      g.fillStyle(hair, alpha).fillEllipse(x, y - r * 0.4, r * 2.05, r * 1.25);
      g.fillStyle(hair, alpha).fillCircle(x, y - r * 1.15, r * 0.45);
      g.fillStyle(color, alpha).fillRect(x - r * 0.4, y - r * 0.85, r * 0.8, 4);
      break;
    case 'mustache':
      g.fillStyle(hair, alpha).fillEllipse(x - r * 0.75, y - r * 0.2, r * 0.6, r * 0.9).fillEllipse(x + r * 0.75, y - r * 0.2, r * 0.6, r * 0.9);
      g.fillStyle(0xffffff, 0.25 * alpha).fillEllipse(x - r * 0.15, y - r * 0.55, r * 0.7, r * 0.35);
      break;
  }
}

/** Seta de mira no chão (lâmina branca translúcida), como na referência. Não revela o símbolo. */
export function drawAim(g: G, x1: number, y1: number, x2: number, y2: number, R: number, color: number, duel: boolean, strong: boolean): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < R * 2) return;
  const ux = dx / len;
  const uy = dy / len;
  const fy = R * 0.55;
  const sx = x1 + ux * (R + 14);
  const sy = y1 + fy + uy * (R + 14) * 0.7;
  const L = Math.min(120, len - R * 2 - 10);
  const ex = sx + ux * L;
  const ey = sy + uy * L * 0.85;
  const w = 13;
  const blade = duel ? PAL.sign : 0xffffff;
  g.fillStyle(PAL.shadow, 0.25).fillPoints(
    [
      { x: sx - uy * w + 4, y: sy + ux * w + 5 },
      { x: ex + 4, y: ey + 5 },
      { x: sx + uy * w + 4, y: sy - ux * w + 5 },
    ],
    true,
  );
  g.fillStyle(blade, strong ? 0.85 : 0.6).fillPoints(
    [
      { x: sx - uy * w, y: sy + ux * w },
      { x: ex, y: ey },
      { x: sx + uy * w, y: sy - ux * w },
    ],
    true,
  );
  g.lineStyle(2, color, 0.9).strokePoints(
    [
      { x: sx - uy * w, y: sy + ux * w },
      { x: ex, y: ey },
      { x: sx + uy * w, y: sy - ux * w },
    ],
    true,
  );
  // Linha pontilhada discreta até o alvo.
  g.lineStyle(2, color, 0.45);
  const tx = x2;
  const ty = y2 + fy;
  const rest = Math.hypot(tx - ex, ty - ey);
  for (let d = 10; d < rest - R; d += 16) {
    const a = d / rest;
    const b = Math.min(1, (d + 7) / rest);
    g.lineBetween(ex + (tx - ex) * a, ey + (ty - ey) * a, ex + (tx - ex) * b, ey + (ty - ey) * b);
  }
}
