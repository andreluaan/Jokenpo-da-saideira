import * as THREE from 'three';
import type { Rps } from '@ppt/shared';
import { addOutline } from './character3d';

/**
 * Golpes finais (vencer pelo símbolo + acertar o QTE): mão gigante de pedra, tesoura gigante e bola de papel.
 * Só visual — empurrão, atordoamento e lentidão vêm da simulação.
 */

/** Efeito em andamento. `update` devolve false quando acabou. */
export interface Fx {
  update(nowMs: number): boolean;
  dispose(): void;
}

/** O que o efeito precisa saber da cena (fornecido pelo Game3D). */
export interface FinisherCtx {
  scene: THREE.Scene;
  /** Posição atual (renderizada) do perdedor no mundo. */
  victimPos(): THREE.Vector3;
  /** Posição do vencedor no mundo quando o golpe saiu. */
  winnerPos: THREE.Vector3;
  /** Raiz do modelo do perdedor (para esconder dentro do papel). */
  victimRoot: THREE.Object3D;
  /** Aplica o tombo/arremesso no perdedor (molas do rig). `sweep` = cai deitado. */
  knock(sweep: boolean, strength: number): void;
  puff(at: THREE.Vector3, color: number, n: number): void;
  shake(amount: number): void;
}

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rot?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ------------------------------------------------------------------ Pedra

/**
 * Punho de pedra visto de frente (dedos dobrados + polegar virados para +Z) com antebraço subindo.
 * Base em y=0. O grupo é inclinado para trás, então a câmera vê a frente do punho.
 */
function stoneFist(): THREE.Group {
  const g = new THREE.Group();
  const stone = std(0xb8b0a4);
  const mid = std(0xa39b8f);
  const dark = std(0x857e74);
  // Bloco da mão.
  g.add(part(new THREE.BoxGeometry(0.92, 0.78, 0.66), stone, 0, 0.45, 0));
  // Quatro dedos dobrados na frente, com nós salientes embaixo.
  for (let i = 0; i < 4; i++) {
    const x = -0.33 + i * 0.22;
    g.add(part(new THREE.BoxGeometry(0.2, 0.46, 0.16), i % 2 ? mid : stone, x, 0.42, 0.38, [0, 0, (i - 1.5) * 0.03]));
    g.add(part(new THREE.BoxGeometry(0.2, 0.16, 0.24), dark, x, 0.1, 0.3));
  }
  // Polegar atravessando os dedos.
  g.add(part(new THREE.BoxGeometry(0.5, 0.17, 0.18), mid, 0.12, 0.24, 0.5, [0, 0, -0.12]));
  // Antebraço (dois blocos, levemente tortos, como pedra lascada).
  g.add(part(new THREE.BoxGeometry(0.66, 0.8, 0.56), mid, 0, 1.2, -0.04, [0, 0.08, 0]));
  g.add(part(new THREE.BoxGeometry(0.6, 0.9, 0.5), dark, 0.02, 2.0, -0.06, [0, -0.1, 0]));
  addOutline(g);
  return g;
}

function rockFx(ctx: FinisherCtx, t0: number): Fx {
  const fist = stoneFist();
  fist.rotation.x = -0.45; // braço vem do alto, por trás: a câmera vê os dedos
  fist.scale.setScalar(1.1);
  ctx.scene.add(fist);
  const FALL = 240;
  let landed = false;
  return {
    update(now) {
      const k = now - t0;
      const p = ctx.victimPos();
      fist.position.set(p.x, 0, p.z);
      if (k < FALL) {
        fist.position.y = 5 - 5 * easeIn(k / FALL);
      } else if (!landed) {
        landed = true;
        ctx.knock(true, 1.2);
        ctx.puff(p, 0xb9b2a8, 16);
        ctx.shake(0.3);
      }
      const HOLD = 700;
      if (k >= FALL && k < HOLD) {
        // Afunda e quica de leve com o peso.
        const b = (k - FALL) / 160;
        fist.position.y = b < 1 ? -0.08 * Math.sin(b * Math.PI) : 0;
      } else if (k >= HOLD) {
        // Sobe de volta e some, deixando o perdedor estatelado no chão.
        const u = clamp01((k - HOLD) / 300);
        fist.position.y = easeIn(u) * 4;
        fist.scale.setScalar(1.1 * (1 - u * 0.5));
      }
      return k < HOLD + 300;
    },
    dispose: () => fist.removeFromParent(),
  };
}

// ------------------------------------------------------------------ Tesoura

/** Tesoura gigante deitada: lâminas ao longo de +X, abertura no eixo Y do grupo. */
function giantScissors(): { group: THREE.Group; setOpen(rad: number): void } {
  const group = new THREE.Group();
  const steel = std(0xdfe5ea, { metalness: 0.6, roughness: 0.3 });
  const red = std(0xd8443c);
  const half = () => {
    const h = new THREE.Group();
    const blade = part(new THREE.BoxGeometry(1.5, 0.06, 0.2), steel, 0.75, 0, 0);
    // Ponta afinada.
    const tip = part(new THREE.ConeGeometry(0.1, 0.35, 4), steel, 1.65, 0, 0, [0, 0, -Math.PI / 2]);
    tip.scale.set(1, 1, 0.6);
    const ring = part(new THREE.TorusGeometry(0.2, 0.06, 6, 12), red, -0.38, 0, 0, [Math.PI / 2, 0, 0]);
    h.add(blade, tip, ring);
    return h;
  };
  const a = half();
  const b = half();
  b.position.y = 0.07;
  group.add(a, b);
  group.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), std(0x2b1d22), 0, 0.035, 0));
  addOutline(group);
  return {
    group,
    setOpen(rad) {
      a.rotation.y = rad / 2;
      b.rotation.y = -rad / 2;
    },
  };
}

function scissorsFx(ctx: FinisherCtx, t0: number): Fx {
  const s = giantScissors();
  s.group.scale.setScalar(1.25);
  ctx.scene.add(s.group);
  const v0 = ctx.victimPos().clone();
  const dir = v0.clone().sub(ctx.winnerPos).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  s.group.rotation.y = yaw;
  // Rastro branco do corte, atravessando o perdedor.
  const slash = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  slash.rotation.set(-Math.PI / 2, 0, yaw);
  slash.position.copy(v0).setY(0.75);
  ctx.scene.add(slash);
  const PASS = 420;
  let cut = false;
  return {
    update(now) {
      const k = now - t0;
      const u = clamp01(k / PASS);
      const pos = v0.clone().addScaledVector(dir, -2.4 + 4.8 * easeInOut(u));
      s.group.position.set(pos.x, 0.75, pos.z);
      // Aberta na chegada, fecha de uma vez no meio (o "snip"), reabre um pouco depois.
      s.setOpen(u < 0.45 ? 0.9 : u < 0.55 ? 0.9 * (1 - (u - 0.45) / 0.1) : 0.25);
      if (!cut && u >= 0.5) {
        cut = true;
        ctx.knock(false, 1.4);
        ctx.puff(ctx.victimPos(), 0xffffff, 8);
        ctx.shake(0.15);
      }
      const m = slash.material as THREE.MeshBasicMaterial;
      m.opacity = cut ? Math.max(0, 0.9 - (k - PASS / 2) / 380) : 0;
      if (k > PASS) {
        const f = clamp01((k - PASS) / 180);
        s.group.scale.setScalar(1.25 * (1 - f));
      }
      return k < PASS + 380;
    },
    dispose() {
      s.group.removeFromParent();
      slash.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------ Papel

let notebook: THREE.Texture | null = null;

/** Folha de caderno (pautas azuis + margem vermelha): é o que faz a bola ler como papel. */
function notebookTexture(): THREE.Texture {
  if (notebook) return notebook;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fbf8ef';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#8fb6e0';
  x.lineWidth = 3;
  for (let y = 16; y < 256; y += 22) {
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(256, y);
    x.stroke();
  }
  x.strokeStyle = '#e07a7a';
  x.beginPath();
  x.moveTo(52, 0);
  x.lineTo(52, 256);
  x.stroke();
  notebook = new THREE.CanvasTexture(c);
  notebook.colorSpace = THREE.SRGBColorSpace;
  notebook.wrapS = notebook.wrapT = THREE.RepeatWrapping;
  notebook.repeat.set(2, 2);
  return notebook;
}

/** Bola de papel amassado (icosaedro com vértices sacudidos, sempre igual). */
function paperBall(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(0.62, 1);
  const pos = geo.getAttribute('position');
  const seen = new Map<string, number>();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    const f = seen.get(key) ?? seen.set(key, 0.82 + rnd() * 0.3).get(key)!;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  const ball = new THREE.Mesh(geo, std(0xffffff, { roughness: 0.95, map: notebookTexture() }));
  ball.castShadow = true;
  addOutline(ball);
  return ball;
}

function paperFx(ctx: FinisherCtx, t0: number): Fx {
  const ball = paperBall();
  ball.scale.setScalar(0.01);
  ctx.scene.add(ball);
  const WRAP = 170;
  const FLY = 760;
  let hidden = false;
  let burst = false;
  const show = () => (ctx.victimRoot.visible = true);
  return {
    update(now) {
      const k = now - t0;
      const p = ctx.victimPos();
      // Fora do "if" de cada fase: se um quadro travar e pular o embrulho, ainda assim esconde.
      if (!hidden && !burst && k > WRAP * 0.7) {
        hidden = true;
        ctx.victimRoot.visible = false;
        ctx.shake(0.12);
      }
      if (k < WRAP) {
        // Embrulha: o papel cresce em volta do perdedor.
        ball.position.set(p.x, 0.6, p.z);
        ball.scale.setScalar(Math.max(0.01, k / WRAP));
        ball.rotation.y = k * 0.01;
      } else if (k < WRAP + FLY) {
        // Arremessado como bola de neve: segue o empurrão da simulação num arco, rolando.
        const u = (k - WRAP) / FLY;
        ball.position.set(p.x, 0.6 + Math.sin(u * Math.PI) * 1.5, p.z);
        ball.scale.setScalar(1);
        ball.rotation.x = u * 9;
        ball.rotation.z = u * 4;
      } else if (!burst) {
        burst = true;
        show();
        ctx.knock(true, 1);
        ctx.puff(p, 0xf6f1e4, 14);
      }
      if (burst) {
        const f = clamp01((k - WRAP - FLY) / 160);
        ball.scale.setScalar(1 + f * 0.5);
        ball.visible = f < 1;
      }
      return k < WRAP + FLY + 170;
    },
    dispose() {
      show();
      ball.removeFromParent();
    },
  };
}

/** Um modelo de cada golpe, para pré-compilar os shaders no início da partida (evita tranco no 1º golpe). */
export function finisherModels(): THREE.Object3D[] {
  return [stoneFist(), giantScissors().group, paperBall()];
}

export function startFinisher(sym: Rps, ctx: FinisherCtx, nowMs: number): Fx {
  return sym === 'rock' ? rockFx(ctx, nowMs) : sym === 'scissors' ? scissorsFx(ctx, nowMs) : paperFx(ctx, nowMs);
}
