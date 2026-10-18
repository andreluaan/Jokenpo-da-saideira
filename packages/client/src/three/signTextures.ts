import * as THREE from 'three';

/**
 * Placas com mais "vida" (v0.16): no lugar de um retângulo liso com letra chapada,
 * - `paintedSign`: tábuas de madeira com veio, tinta gasta nas beiradas, moldura pintada, letras com contorno,
 *   sombra e brilho, estrelinhas e pregos (BAR DO ZÉ, SÓ QUEM JOGA);
 * - `chalkSign`: lousa verde com marcas de apagador, letra de giz granulada, sublinhado e desenhinhos (SAIDEIRA).
 * Tudo desenhado num canvas (sem arquivo de imagem). O texto encolhe sozinho para caber na largura.
 */

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const FONT = 'Fredoka, "Segoe UI", sans-serif';
const CHALK_FONT = '"Caveat Brush", Fredoka, cursive';

/** Sorteio fixo (a placa sai sempre igual). */
function rand(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function toTexture(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Maior tamanho de letra (até `max`) em que a linha cabe em `maxW`. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, font: (s: number) => string, max: number, maxW: number): number {
  let s = max;
  for (; s > 12; s -= 2) {
    ctx.font = font(s);
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

/** Estrelinha de 5 pontas. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Tábuas na horizontal com veio, nós e frestas. */
function woodPlanks(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, base = 0x8a5a3c): void {
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, w, h);
  const planks = Math.max(2, Math.round(h / 90));
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    // Cada tábua um tom levemente diferente.
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,220,180' : '40,20,10'},${0.05 + rnd() * 0.08})`;
    ctx.fillRect(0, y0, w, ph);
    // Veio da madeira.
    for (let k = 0; k < 9; k++) {
      ctx.strokeStyle = `rgba(50,25,12,${0.1 + rnd() * 0.15})`;
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath();
      const yy = y0 + rnd() * ph;
      const amp = 2 + rnd() * 5;
      const fr = 0.004 + rnd() * 0.01;
      const ph0 = rnd() * 6;
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, yy + Math.sin(x * fr + ph0) * amp);
      ctx.stroke();
    }
    // Um nó de vez em quando.
    if (rnd() < 0.7) {
      const nx = rnd() * w;
      const ny = y0 + ph * (0.3 + rnd() * 0.4);
      for (let r = 10; r > 2; r -= 3) {
        ctx.strokeStyle = 'rgba(50,25,12,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(nx, ny, r * 2.2, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Fresta entre tábuas.
    ctx.fillStyle = 'rgba(30,15,8,0.55)';
    ctx.fillRect(0, y0 + ph - 3, w, 3);
  }
}

/** Letra com sombra, contorno grosso e brilho em cima (estilo letreiro pintado à mão). */
function letter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, ink: string, font: (s: number) => string): void {
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Sombra projetada.
  ctx.fillStyle = 'rgba(30,15,10,0.35)';
  ctx.strokeStyle = 'rgba(30,15,10,0.35)';
  ctx.lineWidth = size * 0.16;
  ctx.strokeText(text, x + size * 0.06, y + size * 0.08);
  ctx.fillText(text, x + size * 0.06, y + size * 0.08);
  // Contorno.
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.16;
  ctx.strokeText(text, x, y);
  // Recheio com degradê (mais claro em cima).
  const g = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45);
  const c = new THREE.Color(fill);
  const light = c.clone().lerp(new THREE.Color(0xffffff), 0.35);
  g.addColorStop(0, `#${light.getHexString()}`);
  g.addColorStop(0.55, fill);
  g.addColorStop(1, `#${c.clone().multiplyScalar(0.85).getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  // Brilho fino na parte de cima das letras.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - size * 0.5, ctx.canvas.width, size * 0.28);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = size * 0.03;
  ctx.strokeText(text, x, y - size * 0.03);
  ctx.restore();
}

/**
 * Placa de madeira pintada: tábuas, painel de tinta gasta (deixa ver a madeira nas beiradas e em arranhões),
 * moldura dupla pintada, estrelinhas dos lados e pregos nos cantos.
 */
export function paintedSign(text: string, o: { w?: number; h?: number; paint?: number; letter?: number; ink?: number; seed?: number } = {}): THREE.Texture {
  const w = o.w ?? 1024;
  const h = o.h ?? 300;
  const rnd = rand(o.seed ?? 11);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  woodPlanks(ctx, w, h, rnd);

  // Painel de tinta num canvas à parte (para "descascar" sem apagar a madeira).
  const pc = document.createElement('canvas');
  pc.width = w;
  pc.height = h;
  const p = pc.getContext('2d')!;
  const m = h * 0.07;
  const paint = new THREE.Color(o.paint ?? 0xffc145);
  const pg = p.createLinearGradient(0, 0, 0, h);
  pg.addColorStop(0, `#${paint.clone().lerp(new THREE.Color(0xffffff), 0.12).getHexString()}`);
  pg.addColorStop(1, `#${paint.clone().multiplyScalar(0.88).getHexString()}`);
  p.fillStyle = pg;
  p.beginPath();
  p.roundRect(m, m, w - 2 * m, h - 2 * m, h * 0.08);
  p.fill();
  // Pinceladas (tinta não é lisa).
  for (let i = 0; i < 70; i++) {
    p.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '120,70,0'},${0.04 + rnd() * 0.05})`;
    p.lineWidth = 6 + rnd() * 14;
    const y = m + rnd() * (h - 2 * m);
    const x = m + rnd() * (w - 2 * m);
    p.beginPath();
    p.moveTo(x, y);
    p.lineTo(x + 80 + rnd() * 160, y + (rnd() - 0.5) * 6);
    p.stroke();
  }
  // Moldura pintada (linha dupla) e estrelinhas.
  const ink = hex(o.ink ?? 0x2b1d22);
  p.strokeStyle = ink;
  p.lineWidth = h * 0.025;
  p.beginPath();
  p.roundRect(m + h * 0.05, m + h * 0.05, w - 2 * m - h * 0.1, h - 2 * m - h * 0.1, h * 0.05);
  p.stroke();
  p.lineWidth = h * 0.008;
  p.beginPath();
  p.roundRect(m + h * 0.085, m + h * 0.085, w - 2 * m - h * 0.17, h - 2 * m - h * 0.17, h * 0.035);
  p.stroke();
  const letterColor = hex(o.letter ?? 0xd8443c);
  for (const sx of [m + h * 0.17, w - m - h * 0.17]) {
    star(p, sx, h / 2, h * 0.06);
    p.fillStyle = letterColor;
    p.fill();
    p.lineWidth = h * 0.012;
    p.stroke();
  }
  // Texto (encolhe para caber entre as estrelas).
  const font = (s: number) => `700 ${s}px ${FONT}`;
  const size = fitSize(p, text, font, h * 0.5, w - 2 * m - h * 0.55);
  letter(p, text, w / 2, h / 2 + size * 0.04, size, letterColor, ink, font);
  // Tinta gasta: lascas nas beiradas e arranhões mostrando a madeira.
  p.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const edge = rnd();
    const x = edge < 0.5 ? m + rnd() * (w - 2 * m) : rnd() < 0.5 ? m + rnd() * 18 : w - m - rnd() * 18;
    const y = edge < 0.5 ? (rnd() < 0.5 ? m + rnd() * 14 : h - m - rnd() * 14) : m + rnd() * (h - 2 * m);
    p.fillStyle = `rgba(0,0,0,${0.5 + rnd() * 0.5})`;
    p.beginPath();
    p.ellipse(x, y, 3 + rnd() * 9, 2 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
    p.fill();
  }
  for (let i = 0; i < 14; i++) {
    p.strokeStyle = `rgba(0,0,0,${0.3 + rnd() * 0.4})`;
    p.lineWidth = 1 + rnd() * 2;
    const x = m + rnd() * (w - 2 * m);
    const y = m + rnd() * (h - 2 * m);
    p.beginPath();
    p.moveTo(x, y);
    p.lineTo(x + (rnd() - 0.5) * 70, y + (rnd() - 0.5) * 20);
    p.stroke();
  }
  p.globalCompositeOperation = 'source-over';
  ctx.drawImage(pc, 0, 0);

  // Pregos nos cantos.
  for (const [x, y] of [
    [m * 0.5, m * 0.5],
    [w - m * 0.5, m * 0.5],
    [m * 0.5, h - m * 0.5],
    [w - m * 0.5, h - m * 0.5],
  ]) {
    const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, h * 0.03);
    g.addColorStop(0, '#d9dde3');
    g.addColorStop(1, '#4a4a52');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.028, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sujeirinha e cantos mais escuros (placa de quintal, pegou sol e chuva).
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,20,5,0.28)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  return toTexture(c);
}

/**
 * Lousa de giz: verde-escuro com nuvens de apagador e riscos velhos, letra de giz granulada (com um brilho leve),
 * sublinhado e desenhinhos (caneco de chope e estrelinhas). `lines[0]` = título, o resto = linhas menores.
 */
export function chalkSign(lines: string[], o: { w?: number; h?: number; seed?: number } = {}): THREE.Texture {
  const w = o.w ?? 1024;
  const h = o.h ?? 640;
  const rnd = rand(o.seed ?? 5);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2f3b33';
  ctx.fillRect(0, 0, w, h);
  // Marcas de apagador (nuvens claras) e riscos velhos meio apagados.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 60 + rnd() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(230,235,225,${0.04 + rnd() * 0.05})`);
    g.addColorStop(1, 'rgba(230,235,225,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(240,240,230,${0.03 + rnd() * 0.05})`;
    ctx.lineWidth = 2 + rnd() * 4;
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 60, x + (rnd() - 0.5) * 300, y + (rnd() - 0.5) * 80);
    ctx.stroke();
  }

  // Giz num canvas à parte, depois "granulado" (furinhos) e colado com um brilho leve.
  const gc = document.createElement('canvas');
  gc.width = w;
  gc.height = h;
  const g = gc.getContext('2d')!;
  g.fillStyle = '#fff4e6';
  g.strokeStyle = '#fff4e6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineCap = 'round';
  const titleFont = (s: number) => `400 ${s}px ${CHALK_FONT}`;
  const subFont = (s: number) => `400 ${s}px ${CHALK_FONT}`;
  const title = lines[0] ?? '';
  const ts = fitSize(g, title, titleFont, h * 0.36, w * 0.78);
  const ty = lines.length > 1 ? h * 0.36 : h * 0.5;
  g.font = titleFont(ts);
  g.save();
  g.translate(w / 2, ty);
  g.rotate(-0.03);
  g.fillStyle = '#ffd27a'; // título em giz amarelo
  g.fillText(title, 0, 0);
  // Sublinhado em "swoosh".
  const tw = g.measureText(title).width;
  g.strokeStyle = '#ffd27a';
  g.lineWidth = h * 0.018;
  g.beginPath();
  g.moveTo(-tw / 2, ts * 0.5);
  g.quadraticCurveTo(0, ts * 0.62, tw / 2 + 20, ts * 0.42);
  g.stroke();
  g.restore();
  lines.slice(1).forEach((ln, i) => {
    const ss = fitSize(g, ln, subFont, h * 0.2, w * 0.66);
    g.font = subFont(ss);
    g.fillStyle = '#fff4e6';
    g.fillText(ln, w / 2 - 20, h * 0.68 + i * ss * 1.05);
  });
  // Caneco de chope desenhado no canto e estrelinhas.
  const mx = w * 0.87;
  const my = h * 0.8;
  const mw = w * 0.055;
  const mh = h * 0.16;
  g.lineWidth = h * 0.012;
  g.strokeStyle = '#fff4e6';
  g.strokeRect(mx - mw / 2, my - mh / 2, mw, mh);
  g.beginPath();
  g.arc(mx + mw / 2, my, mh * 0.22, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  for (let k = -1; k <= 1; k++) {
    g.beginPath();
    g.arc(mx + k * mw * 0.3, my - mh / 2, mw * 0.22, Math.PI, 0);
    g.stroke();
  }
  for (const [sx, sy, r] of [
    [w * 0.93, h * 0.12, h * 0.04],
    [w * 0.955, h * 0.27, h * 0.025],
    [w * 0.07, h * 0.13, h * 0.03],
  ]) {
    star(g, sx, sy, r);
    g.lineWidth = h * 0.008;
    g.stroke();
  }
  // Grão do giz: furinhos espalhados.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${0.35 + rnd() * 0.65})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 1 + rnd() * 2);
  }
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.shadowColor = 'rgba(255,244,230,0.35)';
  ctx.shadowBlur = 6;
  ctx.drawImage(gc, 0, 0);
  ctx.restore();
  return toTexture(c);
}
