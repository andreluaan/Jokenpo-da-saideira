import * as THREE from 'three';
import type { Rps } from '@ppt/shared';

const FONT = 'Fredoka, "Segoe UI", sans-serif';
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Repinta células da paleta (colormap 512×512 da Kenney, células de 32×128 px) mantendo o degradê:
 * cada pixel vira a cor nova × (brilho relativo do pixel original dentro da célula).
 */
export function recolorColormap(src: CanvasImageSource & { width: number; height: number }, rules: Record<string, number>): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const cw = c.width / 16;
  const ch = c.height / 4;
  for (const [cell, color] of Object.entries(rules)) {
    const m = /^r(\d)c(\d+)$/.exec(cell);
    if (!m) continue;
    const x0 = Number(m[2]) * cw;
    const y0 = Number(m[1]) * ch;
    const img = ctx.getImageData(x0, y0, cw, ch);
    const d = img.data;
    let avg = 0;
    for (let i = 0; i < d.length; i += 4) avg += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    avg = avg / (d.length / 4) || 1;
    const tr = (color >> 16) & 255;
    const tg = (color >> 8) & 255;
    const tb = color & 255;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / avg;
      const k = 0.75 + (l - 1) * 0.6; // degradê suave em volta da cor nova
      d[i] = Math.min(255, tr * k);
      d[i + 1] = Math.min(255, tg * k);
      d[i + 2] = Math.min(255, tb * k);
    }
    ctx.putImageData(img, x0, y0);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** Textura com texto (placas, logo da mesa, lousa). */
export function textTexture(
  text: string,
  o: { w?: number; h?: number; bg?: number | null; color?: string; size?: number; font?: string; ellipse?: boolean; border?: number | null } = {},
): THREE.Texture {
  const w = o.w ?? 512;
  const h = o.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (o.bg != null) {
    ctx.fillStyle = hex(o.bg);
    if (o.ellipse) {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 18);
      ctx.fill();
    }
    if (o.border != null) {
      ctx.strokeStyle = hex(o.border);
      ctx.lineWidth = 8;
      ctx.stroke();
    }
  }
  ctx.fillStyle = o.color ?? '#fff4e6';
  ctx.font = `700 ${o.size ?? Math.round(h * 0.55)}px ${o.font ?? FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const lh = (o.size ?? Math.round(h * 0.55)) * 1.1;
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Chão com manchas (terra batida, grama seca), repetível. */
export function speckleTexture(base: number, specks: number[], n = 900, size = 512, seed = 7, alpha = 0.45, maxR = 5): THREE.Texture {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = hex(specks[Math.floor(rnd() * specks.length)]);
    ctx.globalAlpha = alpha * (0.5 + rnd() * 0.5);
    const r = 1 + rnd() * (i % 9 === 0 ? maxR * 3 : maxR);
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, r * 1.5, r, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Desenha `fn(x, y)` e as cópias do outro lado das bordas (para a textura repetir sem emenda). */
function wrapped(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      fn(px, py);
    }
  }
}

/**
 * Grama de quintal (repetível): verde quentinho com manchas mais escuras/secas, tufos riscados e
 * florzinhas brancas e amarelas espalhadas.
 */
export function grassTexture(base: number, size = 512, seed = 5): THREE.Texture {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  // Manchas grandes e suaves (variação de tom).
  const patches = [0x7c9443, 0x9db35c, 0xa9a85e, 0x86a04a, 0xb3a467];
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 18 + rnd() * 60;
    ctx.fillStyle = hex(patches[Math.floor(rnd() * patches.length)]);
    ctx.globalAlpha = 0.18 + rnd() * 0.2;
    wrapped(size, x, y, r * 1.4, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.4, r, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Tufos: risquinhos curtos claros e escuros.
  ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const dark = rnd() < 0.55;
    ctx.strokeStyle = dark ? '#5f7a34' : '#b7c873';
    ctx.globalAlpha = 0.35 + rnd() * 0.35;
    ctx.lineWidth = 1 + rnd() * 1.2;
    const len = 3 + rnd() * 6;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
    wrapped(size, x, y, len, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  // Florzinhas.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.fillStyle = rnd() < 0.6 ? '#fff4e6' : '#ffd25a';
    ctx.globalAlpha = 0.85;
    wrapped(size, x, y, 3, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + rnd() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Estrada de terra (u = atravessando a pista, v = ao longo, repetível em v): terra batida, duas trilhas
 * de pneu mais escuras, pedrinhas e mato invadindo as beiradas.
 */
export function roadTexture(size = 256, seed = 9): THREE.Texture {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b8916a';
  ctx.fillRect(0, 0, size, size);
  // Trilhas de pneu.
  for (const u of [0.3, 0.7]) {
    const g = ctx.createLinearGradient((u - 0.09) * size, 0, (u + 0.09) * size, 0);
    g.addColorStop(0, 'rgba(120,88,60,0)');
    g.addColorStop(0.5, 'rgba(120,88,60,0.55)');
    g.addColorStop(1, 'rgba(120,88,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect((u - 0.09) * size, 0, 0.18 * size, size);
  }
  // Pedrinhas e manchas.
  for (let i = 0; i < 260; i++) {
    const x = (0.1 + rnd() * 0.8) * size;
    const y = rnd() * size;
    ctx.fillStyle = rnd() < 0.5 ? '#9c7752' : '#d4b48c';
    ctx.globalAlpha = 0.5 + rnd() * 0.4;
    wrapped(size, x, y, 4, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, 1.5 + rnd() * 2.5, 1 + rnd() * 1.5, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Mato nas beiradas (some no meio da pista).
  for (const side of [0, 1]) {
    const g = ctx.createLinearGradient(side ? size : 0, 0, side ? size * 0.82 : size * 0.18, 0);
    g.addColorStop(0, 'rgba(143,164,82,1)');
    g.addColorStop(1, 'rgba(143,164,82,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(side ? size * 0.82 : 0, 0, size * 0.18, size);
    ctx.strokeStyle = '#6f8a3c';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 70; i++) {
      const x = side ? size - rnd() * size * 0.16 : rnd() * size * 0.16;
      const y = rnd() * size;
      ctx.globalAlpha = 0.6;
      wrapped(size, x, y, 6, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (rnd() - 0.5) * 3, py - 4 - rnd() * 4);
        ctx.stroke();
      });
    }
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Círculo suave (fumaça, poeira). */
export function softCircle(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const signCache = new Map<string, THREE.Texture>();

/** Sinal de mão do Jo-Ken-Pô desenhado em canvas (para sprite 3D). */
export function signTexture(sym: Rps | null, color: number): THREE.Texture {
  const key = `${sym}:${color}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const ink = '#2b1d22';
  const fill = hex(color);
  const u = S / 64;
  const finger = (x: number, y: number, w: number, h: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, w / 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  ctx.lineWidth = 3.2 * u;
  ctx.strokeStyle = ink;
  ctx.fillStyle = fill;
  ctx.lineJoin = 'round';
  const cx = S / 2;
  const cy = S * 0.62;
  if (sym === null) {
    ctx.fillStyle = '#2b1d22cc';
    ctx.beginPath();
    ctx.arc(cx, S / 2, 22 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff4e6';
    ctx.lineWidth = 5 * u;
    ctx.beginPath();
    ctx.arc(cx, S / 2, 15 * u, 0, Math.PI * 2);
    ctx.moveTo(cx - 11 * u, S / 2 + 11 * u);
    ctx.lineTo(cx + 11 * u, S / 2 - 11 * u);
    ctx.stroke();
  } else {
    if (sym === 'paper') {
      [-0.22, -0.07, 0.07, 0.22].forEach((a, i) => finger(cx - 11 * u + i * 7.3 * u, cy - 8 * u, 7.5 * u, (i === 0 || i === 3 ? 21 : 26) * u, a));
    } else if (sym === 'scissors') {
      finger(cx - 3 * u, cy - 8 * u, 8 * u, 28 * u, -0.34);
      finger(cx + 4 * u, cy - 8 * u, 8 * u, 28 * u, 0.32);
    }
    // Palma/punho.
    ctx.beginPath();
    ctx.roundRect(cx - 16 * u, cy - 12 * u, 32 * u, 25 * u, 9 * u);
    ctx.fill();
    ctx.stroke();
    // Polegar.
    finger(cx + 16 * u, cy + 4 * u, 9 * u, 16 * u, 1.0);
    if (sym === 'rock') {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx - 11 * u + i * 7.3 * u, cy - 12 * u, 4.8 * u, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (sym === 'scissors') {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(cx + (7 + i * 6) * u, cy - 12 * u, 4 * u, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  signCache.set(key, t);
  return t;
}
