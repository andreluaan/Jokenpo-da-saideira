import type Phaser from 'phaser';
import type { Rps } from '@ppt/shared';

type G = Phaser.GameObjects.Graphics;
const INK = 0x2b1d22;

/** Retângulo arredondado aproximado e girado (para dedos inclinados). */
function finger(g: G, x: number, y: number, w: number, h: number, ang: number, color: number, alpha: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const pts: { x: number; y: number }[] = [];
  // Ponta arredondada (semicírculo) + base reta.
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI + (i / 8) * Math.PI;
    const lx = Math.cos(t) * (w / 2);
    const ly = -h + w / 2 + Math.sin(t) * (w / 2);
    pts.push({ x: x + lx * c - ly * s, y: y + lx * s + ly * c });
  }
  for (const [lx, ly] of [
    [w / 2, 0],
    [-w / 2, 0],
  ]) {
    pts.push({ x: x + lx * c - ly * s, y: y + lx * s + ly * c });
  }
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

/**
 * Desenha o sinal de mão do jokenpô, em pé (dedos para cima), espelhado por `dir`.
 * `size` ≈ altura total. Desenha contorno escuro e depois a cor da mão.
 */
export function drawSign(g: G, sym: Rps, x: number, y: number, size: number, dir: number, color: number, alpha = 1): void {
  const u = size / 50;
  for (const [col, pad] of [
    [INK, 3],
    [color, 0],
  ] as const) {
    const a = col === INK ? alpha * 0.9 : alpha;
    // Palma / punho.
    const pw = 30 * u + pad * 2;
    const ph = 24 * u + pad * 2;
    g.fillStyle(col, a).fillRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 9 * u + pad);
    // Polegar do lado da frente.
    finger(g, x + dir * 15 * u, y + 2 * u, 9 * u + pad * 2, 16 * u + pad, dir * 1.0, col, a);
    if (sym === 'rock') {
      // Nós dos dedos por cima do punho fechado.
      for (let i = 0; i < 4; i++) g.fillStyle(col, a).fillCircle(x - 11 * u + i * 7.3 * u, y - 11 * u, 4.6 * u + pad);
    } else if (sym === 'paper') {
      // Mão aberta: quatro dedos longos, levemente abertos.
      const angs = [-0.22, -0.07, 0.07, 0.22];
      angs.forEach((ang, i) => finger(g, x - 10.5 * u + i * 7 * u, y - 8 * u, 7 * u + pad * 2, (i === 0 || i === 3 ? 20 : 25) * u + pad, ang, col, a));
    } else {
      // Tesoura: indicador e médio em V; anelar e mínimo dobrados.
      finger(g, x - 3 * u, y - 8 * u, 7.5 * u + pad * 2, 27 * u + pad, -0.32, col, a);
      finger(g, x + 4 * u, y - 8 * u, 7.5 * u + pad * 2, 27 * u + pad, 0.3, col, a);
      for (let i = 0; i < 2; i++) g.fillStyle(col, a).fillCircle(x + dir * (6 + i * 6) * u, y - 9 * u, 4 * u + pad);
    }
  }
  // Linhas dos dedos no punho.
  if (sym === 'rock') {
    g.lineStyle(1.5 * u, INK, 0.45 * alpha);
    for (let i = 1; i < 4; i++) g.lineBetween(x - 14.5 * u + i * 7.3 * u, y - 13 * u, x - 14.5 * u + i * 7.3 * u, y - 4 * u);
  }
}

/** Interrogação de "sem símbolo" (indefeso). */
export function drawNoSign(g: G, x: number, y: number, size: number, alpha = 1): void {
  const u = size / 50;
  g.fillStyle(INK, 0.8 * alpha).fillCircle(x, y, 18 * u);
  g.lineStyle(4 * u, 0xfff4e6, alpha).strokeCircle(x, y, 13 * u);
  g.lineBetween(x - 9 * u, y + 9 * u, x + 9 * u, y - 9 * u);
}
