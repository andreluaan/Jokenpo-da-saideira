import type { GameConfig } from './config';
import type { ExchangeKind, Grade, Rps } from './types';

const BEATS: Record<Rps, Rps> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function beats(a: Rps, b: Rps): boolean {
  return BEATS[a] === b;
}

/** Símbolo que vence `s`. */
export function counterOf(s: Rps): Rps {
  return s === 'rock' ? 'paper' : s === 'paper' ? 'scissors' : 'rock';
}

/** Fim da barra: depois do vermelho, quem não botou não bota mais. */
export function qteEnd(impactAt: number, qte: GameConfig['qte']): number {
  return impactAt + qte.greenAfterMs + qte.redMs;
}

/** Nota de quem botou o símbolo em `pickedAt` para um PÔ! em `impactAt`. */
export function gradePick(pickedAt: number | null, impactAt: number, qte: GameConfig['qte']): Grade {
  if (pickedAt === null) return 'fail';
  if (pickedAt < impactAt - qte.greenBeforeMs) return 'good';
  if (pickedAt <= impactAt + qte.greenAfterMs) return 'perfect';
  if (pickedAt <= qteEnd(impactAt, qte)) return 'caught';
  return 'fail';
}

export interface Side {
  symbol: Rps | null;
  grade: Grade;
}

export interface ExchangeResult {
  kind: ExchangeKind;
  winner: 'a' | 'b' | null;
  /** Vencedor no verde: bônus de foco. */
  strong: boolean;
  /** Vencedor no verde: golpe final do símbolo dele. */
  finisher: boolean;
  /** Perdedor no verde: impacto amortecido. */
  softened: boolean;
  /** Perdedor que não botou nada: atordoamento maior. */
  punished: boolean;
  staggered: 'a' | 'b' | null;
}

const none = { strong: false, finisher: false, softened: false, punished: false, staggered: null } as const;
const valid = (g: Grade) => g === 'good' || g === 'perfect';

/**
 * Resolve um duelo entre `a` (quem desafiou) e `b`.
 * 1. Roubou (vermelho) sempre perde e apanha; os dois roubaram = o Zé anula e os dois cambaleiam.
 * 2. Quem não botou nada apanha de quem botou; ninguém botou = nada acontece.
 * 3. Os dois botaram: o símbolo decide. Vencedor no verde = golpe final; vencedor que botou cedo = golpe simples.
 *    Empate: quem botou cedo cambaleia diante de quem botou no verde; mesma nota = choque.
 */
export function resolveExchange(a: Side, b: Side): ExchangeResult {
  if (a.grade === 'caught' && b.grade === 'caught') return { ...none, kind: 'both-caught', winner: null };
  if (a.grade === 'caught' || b.grade === 'caught') {
    return { ...none, kind: 'caught', winner: a.grade === 'caught' ? 'b' : 'a' };
  }
  const aOk = valid(a.grade) && a.symbol !== null;
  const bOk = valid(b.grade) && b.symbol !== null;
  if (!aOk && !bOk) return { ...none, kind: 'both-fumble', winner: null };
  if (!aOk || !bOk) {
    const w = aOk ? a : b;
    return { ...none, kind: 'defenseless', winner: aOk ? 'a' : 'b', strong: w.grade === 'perfect', finisher: w.grade === 'perfect', punished: true };
  }

  if (a.symbol === b.symbol) {
    if (a.grade === b.grade) return { ...none, kind: 'clank', winner: null };
    return { ...none, kind: 'tie-stagger', winner: null, staggered: a.grade === 'good' ? 'a' : 'b' };
  }

  const winner: 'a' | 'b' = beats(a.symbol!, b.symbol!) ? 'a' : 'b';
  const wGrade = winner === 'a' ? a.grade : b.grade;
  const lGrade = winner === 'a' ? b.grade : a.grade;
  return {
    kind: 'win',
    winner,
    strong: wGrade === 'perfect',
    finisher: wGrade === 'perfect',
    softened: lGrade === 'perfect',
    punished: false,
    staggered: null,
  };
}

export const RPS_LABEL: Record<Rps, string> = { rock: 'Pedra', paper: 'Papel', scissors: 'Tesoura' };
export const RPS_ICON: Record<Rps, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
export const GRADE_LABEL: Record<Grade, string> = { perfect: 'PERFEITO', good: 'CEDO', caught: 'ROUBOU!', fail: 'NADA' };
