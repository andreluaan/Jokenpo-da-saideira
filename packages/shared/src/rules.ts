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

/** Nota de QTE de uma mão travada em `lockedAt` para um impacto em `impactAt`. */
export function gradeLock(lockedAt: number | null, impactAt: number, qte: GameConfig['qte']): Grade {
  if (lockedAt === null || lockedAt > impactAt + qte.lateMs) return 'fail';
  if (Math.abs(lockedAt - impactAt) <= qte.perfectMs) return 'perfect';
  return 'good';
}

export interface Side {
  symbol: Rps | null;
  grade: Grade | null;
}

export interface ExchangeResult {
  kind: ExchangeKind;
  winner: 'a' | 'b' | null;
  /** Vencedor com Perfeito: empurrão forte e bônus de foco. */
  strong: boolean;
  /** Perdedor com Perfeito: impacto amortecido. */
  softened: boolean;
  /** Perdedor com Falha: atordoamento maior. */
  punished: boolean;
  staggered: 'a' | 'b' | null;
}

const none = { strong: false, softened: false, punished: false, staggered: null } as const;

/**
 * Resolve uma troca. `a` é sempre o atacante (tem símbolo); `b` é o alvo, com ou sem mão.
 * O QTE nunca transforma uma derrota de símbolo em vitória: Falha rebaixa um degrau, Perfeito só amplia/amortece.
 */
export function resolveExchange(a: Side & { symbol: Rps; grade: Grade }, b: Side): ExchangeResult {
  if (b.symbol === null) {
    if (a.grade === 'fail') return { ...none, kind: 'fumble', winner: null };
    return { ...none, kind: 'defenseless', winner: 'a', strong: a.grade === 'perfect' };
  }
  const bGrade = b.grade ?? 'fail';
  if (a.grade === 'fail' && bGrade === 'fail') return { ...none, kind: 'both-fumble', winner: null };

  if (a.symbol === b.symbol) {
    if (a.grade === 'fail') return { ...none, kind: 'tie-stagger', winner: null, staggered: 'a' };
    if (bGrade === 'fail') return { ...none, kind: 'tie-stagger', winner: null, staggered: 'b' };
    if (a.grade === 'perfect' && bGrade !== 'perfect') return { ...none, kind: 'tie-stagger', winner: null, staggered: 'b' };
    if (bGrade === 'perfect' && a.grade !== 'perfect') return { ...none, kind: 'tie-stagger', winner: null, staggered: 'a' };
    return { ...none, kind: 'clank', winner: null };
  }

  const winner: 'a' | 'b' = beats(a.symbol, b.symbol) ? 'a' : 'b';
  const wGrade = winner === 'a' ? a.grade : bGrade;
  const lGrade = winner === 'a' ? bGrade : a.grade;
  if (wGrade === 'fail') return { ...none, kind: 'wasted', winner: null };
  return {
    kind: 'win',
    winner,
    strong: wGrade === 'perfect',
    softened: lGrade === 'perfect',
    punished: lGrade === 'fail',
    staggered: null,
  };
}

export const RPS_LABEL: Record<Rps, string> = { rock: 'Pedra', paper: 'Papel', scissors: 'Tesoura' };
export const RPS_ICON: Record<Rps, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
export const GRADE_LABEL: Record<Grade, string> = { perfect: 'PERFEITO', good: 'BOM', fail: 'FALHA' };
