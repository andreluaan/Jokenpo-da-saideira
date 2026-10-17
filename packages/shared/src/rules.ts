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
  /** Vencedor com Perfeito: bônus de foco. */
  strong: boolean;
  /** Vencedor acertou o QTE (Bom/Perfeito): golpe final do símbolo dele. */
  finisher: boolean;
  /** Perdedor com Perfeito: impacto amortecido. */
  softened: boolean;
  /** Perdedor com Falha: atordoamento maior. */
  punished: boolean;
  staggered: 'a' | 'b' | null;
}

const none = { strong: false, finisher: false, softened: false, punished: false, staggered: null } as const;

/**
 * Resolve uma troca. `a` é sempre o atacante (tem símbolo); `b` é o alvo, com ou sem mão.
 * O símbolo decide quem vence; o QTE só decide o tamanho do golpe (vencedor que acerta = golpe final)
 * e quem cambaleia num empate. Vencedor que falha o QTE ainda vence, com um golpe simples.
 */
export function resolveExchange(a: Side & { symbol: Rps; grade: Grade }, b: Side): ExchangeResult {
  if (b.symbol === null) {
    if (a.grade === 'fail') return { ...none, kind: 'fumble', winner: null };
    return { ...none, kind: 'defenseless', winner: 'a', strong: a.grade === 'perfect', finisher: true };
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
  return {
    kind: 'win',
    winner,
    strong: wGrade === 'perfect',
    finisher: wGrade !== 'fail',
    softened: lGrade === 'perfect',
    punished: lGrade === 'fail',
    staggered: null,
  };
}

/** Mão cansada: símbolo revelado `n` vezes seguidas (no fim de `recent`) não pode ser usado de novo. */
export function tiredSymbol(recent: readonly Rps[], n: number): Rps | null {
  if (n <= 0 || recent.length < n) return null;
  const last = recent[recent.length - 1];
  return recent.slice(-n).every((s) => s === last) ? last : null;
}

export const RPS_LABEL: Record<Rps, string> = { rock: 'Pedra', paper: 'Papel', scissors: 'Tesoura' };
export const RPS_ICON: Record<Rps, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
export const GRADE_LABEL: Record<Grade, string> = { perfect: 'PERFEITO', good: 'BOM', fail: 'FALHA' };
