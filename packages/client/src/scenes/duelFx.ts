import type Phaser from 'phaser';
import type { CharacterId, ExchangeEvent, PlayerView, Rps, Snapshot } from '@ppt/shared';
import { signAnchor } from '../art/character';
import { drawNoSign, drawSign } from '../art/hands';
import type { WobbleRig } from '../art/rig';
import { DEPTH, FONT } from '../art/arena';

/** Cor da mão que aparece no sinal (luva, faixa ou pele de cada personagem). */
const HAND_COLOR: Record<CharacterId, number> = { fera: 0xf3ece8, principe: 0xf7f5ef, panca: 0xf0bf8f, sonolento: 0xf2c6a0 };
const REVEAL_MS = 1250;
const SWEEP_AT = 230;
/** Batidas do Jo-Ken-Pô: o "PÔ!" cai exatamente no instante do impacto (QTE perfeito). */
export const BEAT_MS = 400;
const CHANT = ['JO', 'KEN', 'PÔ!'];

interface Reveal {
  e: ExchangeEvent;
  start: number;
  reacted: boolean;
}

export interface PoseOverride {
  faceX: number;
  faceY: number;
  signDir: number;
  kick: number;
  kickDir: number;
}

/**
 * Efeitos de confronto (só visuais):
 * - Jo-Ken-Pô: punhos batem no ritmo e o texto JO… KEN… PÔ! marca o tempo do QTE;
 * - revelação: os dois viram de frente e mostram o sinal com a mão;
 * - rasteira: o vencedor varre a perna e o perdedor vai ao chão.
 */
export class DuelFx {
  private reveals: Reveal[] = [];
  private chantFired = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly R: number,
    private readonly bodyScale: number,
    private readonly rigOf: (id: string) => WobbleRig | undefined,
  ) {}

  onExchange(e: ExchangeEvent): void {
    this.reveals.push({ e, start: performance.now(), reacted: false });
  }

  /** Altura do punho (0–1) para quem segura símbolo: desce em cada batida até o impacto. */
  pumpFor(p: PlayerView, snap: Snapshot, now: number): number {
    if (!p.holding || p.impactAt === null) return 0;
    const T = Math.min(p.impactAt, ...snap.players.filter((o) => o.alive && o.targetId === p.id && o.impactAt !== null).map((o) => o.impactAt!));
    const d = T - now;
    if (d > BEAT_MS * 3 || d < -120) return 0;
    const k = (((d % BEAT_MS) + BEAT_MS) % BEAT_MS) / BEAT_MS;
    return Math.sin(k * Math.PI);
  }

  /** Durante a revelação, o personagem olha para o adversário, estende o braço com o sinal e (se venceu) dá a rasteira. */
  poseFor(id: string, players: PlayerView[]): PoseOverride | null {
    const now = performance.now();
    for (const r of this.reveals) {
      const t = now - r.start;
      if (t > REVEAL_MS) continue;
      const { e } = r;
      if (id !== e.attackerId && id !== e.defenderId) continue;
      const me = players.find((p) => p.id === id);
      const other = players.find((p) => p.id === (id === e.attackerId ? e.defenderId : e.attackerId));
      if (!me || !other) continue;
      const dx = other.x - me.x;
      const dy = other.y - me.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = Math.abs(dx) > 8 ? Math.sign(dx) : id === e.attackerId ? 1 : -1;
      const hasSign = id === e.attackerId || e.defenderSymbol !== null;
      const winner = e.winnerId === id && (e.damagedId || e.protectedId);
      const kick = winner && t > 170 && t < 470 ? Math.sin(((t - 170) / 300) * Math.PI) : 0;
      return { faceX: dx / len, faceY: dy / len, signDir: hasSign && t < REVEAL_MS - 200 ? dir : 0, kick, kickDir: dir };
    }
    return null;
  }

  /** Desenha os sinais revelados e dispara as reações físicas no tempo certo. */
  draw(g: Phaser.GameObjects.Graphics, players: PlayerView[], simNow: number): void {
    const now = performance.now();
    this.reveals = this.reveals.filter((r) => now - r.start <= REVEAL_MS);
    for (const r of this.reveals) {
      const t = now - r.start;
      const { e } = r;
      const a = players.find((p) => p.id === e.attackerId);
      const d = players.find((p) => p.id === e.defenderId);
      if (!a || !d) continue;
      const pop = easeOutBack(Math.min(1, t / 170));
      const fade = t > REVEAL_MS - 250 ? (REVEAL_MS - t) / 250 : 1;
      const size = this.R * 2.1 * pop;
      for (const [p, sym, o] of [
        [a, e.attackerSymbol, d],
        [d, e.defenderSymbol, a],
      ] as const) {
        const dir = Math.abs(o.x - p.x) > 8 ? Math.sign(o.x - p.x) : p === a ? 1 : -1;
        const anc = signAnchor(this.R, dir);
        const sx = p.x + anc.x * this.bodyScale;
        const sy = p.y + this.R * 0.6 + anc.y * this.bodyScale;
        if (sym) drawSign(g, sym as Rps, sx, sy, size, dir, HAND_COLOR[p.character], fade);
        else drawNoSign(g, p.x, p.y - this.R * 4.2, size * 0.8, fade);
      }
      if (!r.reacted && t >= SWEEP_AT) {
        r.reacted = true;
        this.react(e, a, d, simNow);
      }
    }
  }

  private react(e: ExchangeEvent, a: PlayerView, d: PlayerView, simNow: number): void {
    const posOf = (id: string) => (id === a.id ? a : d);
    const otherOf = (id: string) => (id === a.id ? d : a);
    if (e.damagedId) {
      // Rasteira!
      const v = posOf(e.damagedId);
      const w = otherOf(e.damagedId);
      this.rigOf(e.damagedId)?.sweep(Math.sign(v.x - w.x) || 1, simNow);
      this.dust(v.x, v.y + this.R * 0.6);
      this.popText(v.x, v.y - this.R * 5, 'RASTEIRA!', '#ffc145', 30);
    } else if (e.protectedId) {
      const v = posOf(e.protectedId);
      const w = otherOf(e.protectedId);
      this.rigOf(e.protectedId)?.hit(w.x, w.y, v.x, v.y, 0.5);
    } else if (e.kind === 'clank' || e.kind === 'wasted' || e.kind === 'tie-stagger') {
      // Mesmo sinal: os dois se esbarram.
      this.rigOf(a.id)?.hit(d.x, d.y, a.x, a.y, 0.55);
      this.rigOf(d.id)?.hit(a.x, a.y, d.x, d.y, 0.55);
      if (e.staggeredId) {
        const s = posOf(e.staggeredId);
        const o = otherOf(e.staggeredId);
        this.rigOf(e.staggeredId)?.hit(o.x, o.y, s.x, s.y, 0.8);
      }
      this.dust((a.x + d.x) / 2, (a.y + d.y) / 2, 0xfff4e6);
    } else {
      // Ninguém confirmou a tempo: o atacante se desequilibra.
      this.rigOf(a.id)?.hit(a.x - (d.x - a.x), a.y, a.x, a.y, 0.6);
    }
  }

  /** "JO… KEN… PÔ!" sobre você, nas batidas que levam ao seu próximo impacto. */
  chant(snap: Snapshot, meId: string, now: number): void {
    const me = snap.players.find((p) => p.id === meId);
    if (!me?.alive) return;
    const impacts: { key: string; T: number }[] = [];
    if (me.holding && me.impactAt !== null) impacts.push({ key: `${me.id}:${me.impactAt}`, T: me.impactAt });
    for (const p of snap.players) {
      if (p.alive && p.targetId === me.id && p.impactAt !== null) impacts.push({ key: `${p.id}:${p.impactAt}`, T: p.impactAt });
    }
    for (const { key, T } of impacts) {
      CHANT.forEach((word, i) => {
        const beat = T - (CHANT.length - 1 - i) * BEAT_MS;
        const id = `${key}:${i}`;
        if (now >= beat && now - beat < 160 && !this.chantFired.has(id)) {
          this.chantFired.add(id);
          const last = i === CHANT.length - 1;
          this.popText(me.x + (i - 1) * 46, me.y - this.R * 6.2, word, last ? '#ffc145' : '#fff4e6', last ? 46 : 32);
        }
      });
    }
    if (this.chantFired.size > 200) this.chantFired = new Set([...this.chantFired].slice(-60));
  }

  private popText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color })
      .setOrigin(0.5)
      .setDepth(DEPTH.popup + 5)
      .setStroke('#2b1d22', 8)
      .setScale(1.6);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: y - 24, delay: 380, duration: 320, onComplete: () => t.destroy() });
  }

  private dust(x: number, y: number, color = 0xe9d2b8): void {
    for (let i = 0; i < 7; i++) {
      const c = this.scene.add.circle(x, y, 7 + Math.random() * 6, color, 0.75).setDepth(y + 1);
      const ang = (i / 7) * Math.PI * 2;
      this.scene.tweens.add({
        targets: c,
        x: x + Math.cos(ang) * 44,
        y: y + Math.sin(ang) * 18 - 6,
        scale: 1.8,
        alpha: 0,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => c.destroy(),
      });
    }
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
