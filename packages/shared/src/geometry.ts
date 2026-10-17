import type { Arena, Obstacle, Rect } from './config';

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

/** Segmento cruza o círculo (cx, cy, r)? */
export function segmentHitsCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1) : 0;
  const px = x1 + dx * t - cx;
  const py = y1 + dy * t - cy;
  return px * px + py * py <= r * r;
}

/** Empurra um círculo de raio r para fora de um obstáculo. */
export function pushOutOfObstacle(x: number, y: number, r: number, o: Obstacle): { x: number; y: number } {
  if (o.kind === 'rect') return pushCircleOutOfRect(x, y, r, o);
  const dx = x - o.x;
  const dy = y - o.y;
  const d = Math.hypot(dx, dy);
  const min = o.r + r;
  if (d >= min) return { x, y };
  if (d < 1e-6) return { x: o.x + min, y: o.y };
  return { x: o.x + (dx / d) * min, y: o.y + (dy / d) * min };
}

/** Linha de visão bloqueada por algum obstáculo? */
export function lineBlocked(x1: number, y1: number, x2: number, y2: number, obstacles: readonly Obstacle[]): boolean {
  return obstacles.some((o) => (o.kind === 'rect' ? segmentHitsRect(x1, y1, x2, y2, o) : segmentHitsCircle(x1, y1, x2, y2, o.x, o.y, o.r)));
}

/** Centro do obstáculo (retângulos guardam o canto superior esquerdo). */
export function obstacleCenter(o: Obstacle): { x: number; y: number } {
  return o.kind === 'circle' ? { x: o.x, y: o.y } : { x: o.x + o.w / 2, y: o.y + o.h / 2 };
}

/** Distância de um ponto até a borda do obstáculo (0 se dentro). */
export function distToObstacle(x: number, y: number, o: Obstacle): number {
  if (o.kind === 'circle') return Math.max(0, Math.hypot(x - o.x, y - o.y) - o.r);
  const nx = clamp(x, o.x, o.x + o.w);
  const ny = clamp(y, o.y, o.y + o.h);
  return Math.hypot(x - nx, y - ny);
}

/** Ponto (com raio r) está dentro de algum obstáculo? */
export function insideObstacle(x: number, y: number, r: number, obstacles: readonly Obstacle[]): boolean {
  return obstacles.some((o) => {
    if (o.kind === 'circle') return Math.hypot(x - o.x, y - o.y) < o.r + r;
    const nx = clamp(x, o.x, o.x + o.w);
    const ny = clamp(y, o.y, o.y + o.h);
    return Math.hypot(x - nx, y - ny) < r;
  });
}

/** Mantém um círculo de raio r dentro da elipse da arena (aproximação por escala radial). */
export function clampInArena(x: number, y: number, r: number, a: Arena): { x: number; y: number } {
  const ex = a.rx - r;
  const ey = a.ry - r;
  const dx = x - a.cx;
  const dy = y - a.cy;
  const k = (dx * dx) / (ex * ex) + (dy * dy) / (ey * ey);
  if (k <= 1) return { x, y };
  const s = 1 / Math.sqrt(k);
  return { x: a.cx + dx * s, y: a.cy + dy * s };
}

/** Quanto do caminho até a borda da arena: 0 no centro, 1 na borda. */
export function arenaDepth(x: number, y: number, a: Arena): number {
  const dx = (x - a.cx) / a.rx;
  const dy = (y - a.cy) / a.ry;
  return Math.sqrt(dx * dx + dy * dy);
}
