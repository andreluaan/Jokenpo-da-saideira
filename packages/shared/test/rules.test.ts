import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, beats, gradePick, qteEnd, resolveExchange, type Grade, type Rps } from '../src';

const qte = DEFAULT_CONFIG.qte;

describe('relação clássica', () => {
  it('pedra > tesoura > papel > pedra', () => {
    expect(beats('rock', 'scissors')).toBe(true);
    expect(beats('scissors', 'paper')).toBe(true);
    expect(beats('paper', 'rock')).toBe(true);
    expect(beats('scissors', 'rock')).toBe(false);
    expect(beats('rock', 'rock')).toBe(false);
  });
});

describe('barra do Jo-Ken-Pô (malandragem)', () => {
  const T = 10_000;
  it('antes do verde = CEDO; no verde = PERFEITO', () => {
    expect(gradePick(T - qte.greenBeforeMs - 1, T, qte)).toBe('good');
    expect(gradePick(T - 1000, T, qte)).toBe('good');
    expect(gradePick(T - qte.greenBeforeMs, T, qte)).toBe('perfect');
    expect(gradePick(T, T, qte)).toBe('perfect');
    expect(gradePick(T + qte.greenAfterMs, T, qte)).toBe('perfect');
  });

  it('depois do verde = ROUBOU; sem apertar = NADA', () => {
    expect(gradePick(T + qte.greenAfterMs + 1, T, qte)).toBe('caught');
    expect(gradePick(qteEnd(T, qte), T, qte)).toBe('caught');
    expect(gradePick(null, T, qte)).toBe('fail');
  });
});

const side = (symbol: Rps | null, grade: Grade) => ({ symbol, grade });

describe('resolução do duelo', () => {
  it('quem rouba perde e apanha, mesmo com o símbolo que ganharia', () => {
    const r = resolveExchange(side('rock', 'caught'), side('scissors', 'perfect'));
    expect(r).toMatchObject({ kind: 'caught', winner: 'b', finisher: false });
    expect(resolveExchange(side('paper', 'good'), side('scissors', 'caught')).winner).toBe('a');
    // Roubou contra quem nem botou: ainda é pego.
    expect(resolveExchange(side(null, 'fail'), side('rock', 'caught')).winner).toBe('a');
  });

  it('os dois roubaram: o Zé anula', () => {
    expect(resolveExchange(side('rock', 'caught'), side('paper', 'caught'))).toMatchObject({ kind: 'both-caught', winner: null });
  });

  it('quem não bota nada apanha; golpe final só se o outro botou no verde', () => {
    expect(resolveExchange(side('rock', 'perfect'), side(null, 'fail'))).toMatchObject({ kind: 'defenseless', winner: 'a', finisher: true });
    expect(resolveExchange(side(null, 'fail'), side('rock', 'good'))).toMatchObject({ kind: 'defenseless', winner: 'b', finisher: false });
    expect(resolveExchange(side(null, 'fail'), side(null, 'fail')).kind).toBe('both-fumble');
  });

  it('os dois botaram: o símbolo decide; verde = golpe final, cedo = golpe simples', () => {
    expect(resolveExchange(side('rock', 'perfect'), side('scissors', 'good'))).toMatchObject({ kind: 'win', winner: 'a', finisher: true, strong: true });
    expect(resolveExchange(side('rock', 'good'), side('scissors', 'perfect'))).toMatchObject({ kind: 'win', winner: 'a', finisher: false, softened: true });
    // O verde NUNCA vira um símbolo perdedor.
    expect(resolveExchange(side('scissors', 'perfect'), side('rock', 'good')).winner).toBe('b');
  });

  it('empate: mesma nota = choque; quem botou cedo cambaleia diante do verde', () => {
    expect(resolveExchange(side('rock', 'perfect'), side('rock', 'perfect')).kind).toBe('clank');
    expect(resolveExchange(side('rock', 'good'), side('rock', 'good')).kind).toBe('clank');
    expect(resolveExchange(side('rock', 'good'), side('rock', 'perfect'))).toMatchObject({ kind: 'tie-stagger', staggered: 'a' });
  });

  it('todas as 9 combinações com a mesma nota seguem a tabela clássica', () => {
    const all: Rps[] = ['rock', 'paper', 'scissors'];
    for (const a of all)
      for (const b of all) {
        const r = resolveExchange(side(a, 'perfect'), side(b, 'perfect'));
        expect(r.winner).toBe(a === b ? null : beats(a, b) ? 'a' : 'b');
      }
  });
});
