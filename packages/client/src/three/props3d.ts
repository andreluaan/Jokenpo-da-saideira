import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { textTexture } from './textures';

/**
 * Objetos da arena no estilo "brinquedo" (v0.14, referência do usuário): cantos arredondados, sombreado suave,
 * cores chapadas com um tom mais claro em cima. Tudo em coordenadas locais (centro no chão, frente em +z).
 */

/** Material liso (sem facetas), levemente brilhante como plástico. */
export const soft = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, flatShading: false, ...extra });

function put<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T {
  o.position.set(x, y, z);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

/** Caixa de cantos arredondados (o "jeito brinquedo" da referência). */
export function rbox(w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return put(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rr), m), x, y, z);
}

/** Cilindro com as bordas arredondadas (latinha, tambor). */
export function rcyl(r: number, h: number, bevel: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 18): THREE.Mesh {
  const b = Math.min(bevel, r * 0.5, h * 0.5);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.sin(a) * b, b - Math.cos(a) * b));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h));
  return put(new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m), x, y - h / 2, z);
}

const CAN_COLORS = [0x7cc23a, 0xf2a93b, 0xd8443c, 0x7cc23a, 0xf2a93b];

/** Latinha: corpo colorido, faixa clara em cima e tampa prateada. */
function can(color: number): THREE.Group {
  const g = new THREE.Group();
  const h = 0.13;
  g.add(rcyl(0.036, h, 0.012, soft(color, { roughness: 0.35 }), 0, h / 2, 0));
  g.add(rcyl(0.0365, 0.03, 0.008, soft(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex(), { roughness: 0.35 }), 0, h - 0.022, 0));
  g.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 14), soft(0xd9dde3, { metalness: 0.6, roughness: 0.3 })), 0, h + 0.002, 0));
  return g;
}

/** Monte de cubos de gelo (azul-claro, meio brilhante) cobrindo uma área. */
function ice(w: number, d: number, y: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const m = soft(0xb3ecfb, { roughness: 0.12, emissive: 0x4cc3e6, emissiveIntensity: 0.28 });
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Cubos grandinhos (lidos de cima pela câmera), amontoados: mais altos no meio.
  const n = Math.round((w * d) / 0.0045);
  for (let i = 0; i < n; i++) {
    const k = 0.06 + rnd() * 0.03;
    const px = (rnd() - 0.5) * (w - k);
    const pz = (rnd() - 0.5) * (d - k);
    const mound = 1 - Math.max(Math.abs(px) / (w / 2), Math.abs(pz) / (d / 2));
    const c = rbox(k, k, k, 0.016, m, px, y + mound * 0.05 + rnd() * 0.02, pz);
    c.rotation.set(rnd() * 0.8, rnd() * 3, rnd() * 0.8);
    g.add(c);
  }
  return g;
}

/** Alça lateral arredondada (isopor). */
function handle(m: THREE.Material): THREE.Mesh {
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI), m);
  t.rotation.set(0, Math.PI / 2, Math.PI);
  return put(t);
}

/** Isopor (caixa térmica) aberto, cheio de gelo e latinhas — igual à referência. */
export function buildCooler(w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const h = 0.36;
  const blue = soft(0x86aed6);
  const blueTop = soft(0xb9d2ea);
  const white = soft(0xf4f4f1);
  // Corpo em dois tons (mais claro em cima) e a borda de dentro.
  g.add(rbox(w, h * 0.7, d, 0.06, blue, 0, h * 0.35, 0));
  g.add(rbox(w, h * 0.38, d, 0.06, blueTop, 0, h * 0.78, 0));
  // Fundo do "poço" (só aparece entre os cubos) e o gelo transbordando um pouco da borda.
  g.add(rbox(w - 0.08, 0.02, d - 0.08, 0.008, soft(0x7d9cb6), 0, h - 0.004, 0));
  g.add(ice(w - 0.1, d - 0.1, h + 0.01, seed));
  // Latinhas deitadas no gelo.
  for (let i = 0; i < 3; i++) {
    const c = can(CAN_COLORS[(seed + i) % CAN_COLORS.length]);
    c.rotation.set(Math.PI / 2, 0, (i - 1) * 0.7 + 0.3);
    c.position.set((i - 1) * w * 0.25, h + 0.1, (i % 2 ? 0.12 : -0.1) * d);
    g.add(c);
  }
  // Tampa branca aberta para trás.
  const lid = rbox(w + 0.02, 0.07, d * 0.95, 0.035, white, 0, 0, 0);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, h + 0.02, -d / 2);
  lid.position.set(0, 0, d * 0.47);
  lidPivot.add(lid);
  lidPivot.rotation.x = -1.95;
  g.add(lidPivot);
  // Alças brancas dos lados.
  for (const sx of [-1, 1]) {
    const hd = handle(white);
    hd.position.set(sx * (w / 2 + 0.005), h * 0.62, 0);
    hd.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(hd);
  }
  return g;
}

/**
 * Freezer horizontal de bar (branco, faixa vermelha "GELADA", tampa de vidro com latinhas dentro).
 * `userData.lid` é a tampa que abre (boteco3d gira em x a partir da borda de trás).
 */
export function buildFreezer(w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const h = 0.62;
  const white = soft(0xf6f6f4, { roughness: 0.4 });
  g.add(rbox(w, h - 0.06, d, 0.07, white, 0, h / 2 + 0.02, 0));
  // Pezinhos e rodapé escuro.
  g.add(rbox(w - 0.06, 0.06, d - 0.06, 0.02, soft(0x5e5a5c), 0, 0.03, 0));
  // Faixa vermelha com o logo.
  g.add(rbox(w + 0.012, 0.11, d + 0.012, 0.03, soft(0xd8443c), 0, h * 0.5, 0));
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.5, 0.1),
    new THREE.MeshStandardMaterial({ map: textTexture('GELADA', { w: 512, h: 128, size: 92 }), transparent: true }),
  );
  label.position.set(0, h * 0.5, d / 2 + 0.008);
  g.add(label);
  // Borda de cima e o "poço" com gelo e latinhas em pé (aparecem pelo vidro).
  g.add(rbox(w - 0.1, 0.03, d - 0.1, 0.012, soft(0xd5dde4), 0, h + 0.005, 0));
  g.add(ice(w - 0.16, d - 0.16, h - 0.05, seed + 7));
  for (let i = 0; i < 6; i++) {
    const c = can(CAN_COLORS[(seed + i) % CAN_COLORS.length]);
    c.position.set(-w * 0.36 + i * w * 0.145, h - 0.11, (i % 2 ? 0.08 : -0.08) * d);
    g.add(c);
  }
  // Tampa de vidro com moldura branca e puxador, presa na borda de trás.
  const lid = new THREE.Group();
  lid.position.set(0, h + 0.03, -d / 2 + 0.02);
  // Moldura vazada (4 barras) para o vidro mostrar o gelo e as latinhas.
  const fw = w - 0.02;
  const fd = d - 0.03;
  const bar = 0.07;
  const frame = new THREE.Group();
  frame.add(
    rbox(fw, 0.035, bar, 0.017, white, 0, 0, bar / 2),
    rbox(fw, 0.035, bar, 0.017, white, 0, 0, fd - bar / 2),
    rbox(bar, 0.035, fd, 0.017, white, -fw / 2 + bar / 2, 0, fd / 2),
    rbox(bar, 0.035, fd, 0.017, white, fw / 2 - bar / 2, 0, fd / 2),
  );
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.16, 0.012, d - 0.16),
    new THREE.MeshStandardMaterial({ color: 0x9fd3e8, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2 }),
  );
  glass.position.set(0, 0.012, (d - 0.03) / 2);
  lid.add(frame, glass, rbox(w * 0.3, 0.03, 0.04, 0.012, soft(0xd8443c), 0, 0.02, d - 0.05));
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

/** Engradados de cerveja de plástico (dois empilhados), com alça vazada e gargalos aparecendo. */
export function buildCrates(w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const crate = (cw: number, cd: number, y: number, color: number, yaw: number) => {
    const c = new THREE.Group();
    const h = 0.26;
    const top = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.18).getHex();
    c.add(rbox(cw, h * 0.72, cd, 0.035, soft(color), 0, h * 0.36, 0));
    c.add(rbox(cw, h * 0.3, cd, 0.035, soft(top), 0, h * 0.85, 0));
    // Alça vazada (rasgo escuro) na frente e atrás.
    for (const sz of [-1, 1]) c.add(rbox(cw * 0.36, 0.05, 0.02, 0.02, soft(0x2b1d22), 0, h * 0.82, sz * (cd / 2 + 0.002)));
    // Divisórias e gargalos com tampinha.
    const nx = 4;
    const nz = 3;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const bx = -cw / 2 + ((i + 0.5) * cw) / nx;
        const bz = -cd / 2 + ((j + 0.5) * cd) / nz;
        c.add(rcyl(0.032, 0.09, 0.01, soft(0x6b3a1f, { roughness: 0.25 }), bx, h + 0.02, bz, 12));
        c.add(rcyl(0.027, 0.016, 0.005, soft(0xe8d9a0, { metalness: 0.5, roughness: 0.3 }), bx, h + 0.07, bz, 12));
      }
    }
    c.position.y = y;
    c.rotation.y = yaw;
    g.add(c);
  };
  const tw = ((seed * 37) % 10) / 10 - 0.5;
  crate(w, d, 0, 0xf2b134, 0);
  crate(w * 0.82, d * 0.78, 0.27, 0x4f9a5c, tw * 0.18);
  return g;
}

/** Churrasqueira de tambor: tambor arredondado em pé sobre pernas, grelha, brasa e espetinhos. */
export function buildGrill(r: number, skewer: () => THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  const dark = soft(0x45454d, { roughness: 0.45, metalness: 0.3 });
  const ring = soft(0x2f2f36, { roughness: 0.4, metalness: 0.4 });
  const h = 0.48;
  const y0 = 0.16;
  g.add(rcyl(r, h, 0.06, dark, 0, y0 + h / 2, 0, 22));
  // Aros do tambor.
  for (const k of [0.3, 0.7]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.012, 6, 28), ring);
    t.rotation.x = Math.PI / 2;
    g.add(put(t, 0, y0 + h * k, 0));
  }
  // Pernas.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = rbox(0.04, y0 + 0.08, 0.04, 0.015, ring, Math.cos(a) * r * 0.7, (y0 + 0.08) / 2, Math.sin(a) * r * 0.7);
    leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    g.add(leg);
  }
  // Brasa (brilha), grelha e espetinhos.
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff5a10, emissiveIntensity: 1.6 }));
  g.add(put(ember, 0, y0 + h - 0.03, 0));
  for (let k = -3; k <= 3; k++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, Math.sqrt(Math.max(0.01, r * r - (k * r * 0.26) ** 2)) * 2, 6), ring);
    bar.rotation.z = Math.PI / 2;
    g.add(put(bar, 0, y0 + h + 0.005, k * r * 0.26));
  }
  for (const dz of [-0.09, 0.02, 0.12]) {
    const sk = skewer();
    sk.position.set(0, y0 + h + 0.015, dz);
    g.add(sk);
  }
  return g;
}

/** Mesa de plástico amarela quadrada de boteco (GELADA) com 4 cadeiras de plástico. */
export function buildBeerTable(r: number): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  const yellow = soft(0xf6c514, { roughness: 0.5 });
  const yellowDark = soft(0xd9a90d, { roughness: 0.5 });
  const size = r * 1.55;
  const top = 0.56;
  g.add(rbox(size, 0.06, size, 0.04, yellow, 0, top - 0.03, 0));
  g.add(rbox(size * 0.92, 0.05, size * 0.92, 0.03, yellowDark, 0, top - 0.08, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(0.06, top - 0.06, 0.06, 0.02, yellow, sx * size * 0.4, (top - 0.06) / 2, sz * size * 0.4));
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.32, 32),
    new THREE.MeshStandardMaterial({ map: textTexture('GELADA', { w: 512, h: 256, bg: 0xd8443c, ellipse: true, size: 120 }), transparent: true, roughness: 0.6 }),
  );
  logo.rotation.x = -Math.PI / 2;
  logo.scale.y = 0.6;
  logo.position.set(0, top + 0.002, 0);
  g.add(logo);
  // Cadeiras de plástico (assento, encosto vazado e pernas), uma de cada lado.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const ch = new THREE.Group();
    ch.add(rbox(0.36, 0.04, 0.34, 0.02, yellow, 0, 0.3, 0));
    ch.add(rbox(0.36, 0.3, 0.04, 0.02, yellow, 0, 0.47, -0.16));
    ch.add(rbox(0.22, 0.06, 0.05, 0.02, soft(0x2b1d22, { transparent: true, opacity: 0.35 }), 0, 0.52, -0.16));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ch.add(rbox(0.035, 0.3, 0.035, 0.012, yellowDark, sx * 0.15, 0.15, sz * 0.14));
    ch.position.set(Math.cos(a) * r * 1.2, 0, Math.sin(a) * r * 1.2);
    // A frente da cadeira (+z) vira para o centro da mesa.
    ch.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    g.add(ch);
  }
  return { group: g, top };
}
