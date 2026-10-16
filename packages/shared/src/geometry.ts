import type { Rect } from './config';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Normaliza (x, y); vetor nulo continua nulo. */
export function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len > 1e-6 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

/** Empurra um círculo para fora de um retângulo. Retorna a nova posição. */
export function pushCircleOutOfRect(cx: number, cy: number, r: number, rect: Rect): { x: number; y: number } {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x: cx, y: cy };
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, y: ny + (dy / d) * r };
  }
  // Centro dentro do retângulo: sai pelo lado mais próximo.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: cy };
  if (m === right) return { x: rect.x + rect.w + r, y: cy };
  if (m === top) return { x: cx, y: rect.y - r };
  return { x: cx, y: rect.y + rect.h + r };
}

/** Segmento (x1,y1)-(x2,y2) cruza o retângulo? (Liang–Barsky) */
export function segmentHitsRect(x1: number, y1: number, x2: number, y2: number, rect: Rect): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}
