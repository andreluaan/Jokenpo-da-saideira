import type { PlayerView } from '@ppt/shared';

/**
 * "Ragdoll ativo" simplificado, inspirado em Gang Beasts: o corpo é um conjunto de molas
 * pouco amortecidas que tentam voltar à pose, então tudo bamboleia, atrasa e passa do ponto.
 * Puramente visual (cliente): não afeta a simulação nem revela o símbolo escolhido.
 */
interface Spring {
  x: number;
  v: number;
}

const spring = (): Spring => ({ x: 0, v: 0 });

function step(s: Spring, target: number, k: number, c: number, dt: number): void {
  s.v += (-k * (s.x - target) - c * s.v) * dt;
  s.x += s.v * dt;
}

export interface RigPose {
  /** Inclinação do corpo inteiro em torno dos pés (rad). */
  tilt: number;
  headX: number;
  headY: number;
  lX: number;
  lY: number;
  rX: number;
  rY: number;
  /** >0 achata, <0 estica. */
  squash: number;
}

export class WobbleRig implements RigPose {
  private readonly t = spring();
  private readonly hx = spring();
  private readonly hy = spring();
  private readonly lx = spring();
  private readonly ly = spring();
  private readonly rx = spring();
  private readonly ry = spring();
  private readonly sq = spring();
  private vx = 0;
  private vy = 0;
  private px = NaN;
  private py = NaN;
  private koDir = 0;
  private readonly phase = Math.random() * Math.PI * 2;

  get tilt(): number {
    return this.t.x;
  }
  get headX(): number {
    return this.hx.x;
  }
  get headY(): number {
    return this.hy.x;
  }
  get lX(): number {
    return this.lx.x;
  }
  get lY(): number {
    return this.ly.x;
  }
  get rX(): number {
    return this.rx.x;
  }
  get rY(): number {
    return this.ry.x;
  }
  get squash(): number {
    return this.sq.x;
  }

  update(p: Pick<PlayerView, 'x' | 'y' | 'alive' | 'stunned' | 'holding'>, dtMs: number, now: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    if (dt <= 0) return;
    if (Number.isNaN(this.px)) {
      this.px = p.x;
      this.py = p.y;
    }
    // Velocidade suavizada a partir do deslocamento, e aceleração (que "empurra" as partes moles).
    const nvx = (p.x - this.px) / dt;
    const nvy = (p.y - this.py) / dt;
    this.px = p.x;
    this.py = p.y;
    const k = Math.min(1, dt * 10);
    const ax = ((nvx - this.vx) * k) / dt;
    const ay = ((nvy - this.vy) * k) / dt;
    this.vx += (nvx - this.vx) * k;
    this.vy += (nvy - this.vy) * k;

    if (!p.alive && this.koDir === 0) this.koDir = Math.random() < 0.5 ? -1 : 1;
    if (p.alive) this.koDir = 0;

    // Balanço de bêbado: soma de senos lentos, mais forte quando atordoado.
    const drunk = p.stunned ? 2.6 : p.holding ? 0.6 : 1;
    const ts = now / 1000;
    const sway = (Math.sin(ts * 1.7 + this.phase) * 0.07 + Math.sin(ts * 2.9 + this.phase * 2) * 0.04) * drunk;
    const lean = Math.max(-0.28, Math.min(0.28, (this.vx / 200) * 0.2));
    const tiltTarget = this.koDir !== 0 ? this.koDir * 1.45 : lean + sway;
    step(this.t, tiltTarget, this.koDir !== 0 ? 40 : 55, this.koDir !== 0 ? 5 : 5.5, dt);

    // Cabeça atrasa em relação ao corpo e balança.
    const bob = Math.sin(ts * 2.2 + this.phase) * 1.5 * drunk;
    this.hx.v += -ax * 0.012 * dt;
    this.hy.v += -ay * 0.008 * dt;
    step(this.hx, -this.vx * 0.012 + bob, 80, 7, dt);
    step(this.hy, -Math.abs(this.vy) * 0.006, 80, 7, dt);

    // Braços soltos: a aceleração arremessa as mãos, molas fracas trazem de volta.
    for (const [sx, sy, side] of [
      [this.lx, this.ly, -1],
      [this.rx, this.ry, 1],
    ] as const) {
      sx.v += -ax * 0.03 * dt;
      sy.v += -ay * 0.03 * dt;
      const flail = p.stunned ? Math.sin(ts * 14 + side) * 6 : 0;
      step(sx, flail, 40, 4, dt);
      step(sy, Math.sin(ts * 3 + this.phase + side) * 1.2 * drunk, 40, 4, dt);
      sx.x = Math.max(-22, Math.min(22, sx.x));
      sy.x = Math.max(-22, Math.min(22, sy.x));
    }

    step(this.sq, 0, 140, 9, dt);
  }

  /** Golpe recebido vindo de (fromX, fromY): o corpo é arremessado e chacoalha. */
  hit(fromX: number, fromY: number, x: number, y: number, strength: number): void {
    const dx = x - fromX;
    const dy = y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    this.t.v += (nx >= 0 ? 1 : -1) * 7 * strength;
    this.hx.v += nx * 320 * strength;
    this.hy.v += ny * 220 * strength - 120 * strength;
    this.lx.v += (nx * 260 - 160) * strength;
    this.rx.v += (nx * 260 + 160) * strength;
    this.ly.v += -260 * strength;
    this.ry.v += -260 * strength;
    this.sq.v += 6 * strength;
  }

  /** Nocaute: desaba para o lado oposto de quem bateu, como ragdoll. */
  knockOut(fromX: number, x: number): void {
    this.koDir = x >= fromX ? 1 : -1;
    this.t.v += this.koDir * 6;
    this.sq.v += 5;
  }
}
