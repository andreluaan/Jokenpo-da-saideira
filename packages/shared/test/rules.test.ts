import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, beats, gradeLock, resolveExchange } from '../src';

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

describe('nota do QTE', () => {
  const T = 10_000;
  it('perfeito dentro de ±perfectMs', () => {
    expect(gradeLock(T, T, qte)).toBe('perfect');
    expect(gradeLock(T - qte.perfectMs, T, qte)).toBe('perfect');
    expect(gradeLock(T + qte.perfectMs, T, qte)).toBe('perfect');
  });
  it('bom quando confirma cedo ou fora do centro da janela', () => {
    expect(gradeLock(T - 3000, T, qte)).toBe('good');
    expect(gradeLock(T - qte.perfectMs - 1, T, qte)).toBe('good');
    expect(gradeLock(T + qte.lateMs, T, qte)).toBe('good');
  });
  it('falha quando não confirma ou confirma tarde demais', () => {
    expect(gradeLock(null, T, qte)).toBe('fail');
    expect(gradeLock(T + qte.lateMs + 1, T, qte)).toBe('fail');
  });
});

describe('resolução da troca', () => {
  it('alvo sem mão perde, a menos que o atacante falhe', () => {
    expect(resolveExchange({ symbol: 'rock', grade: 'good' }, { symbol: null, grade: null })).toMatchObject({
      kind: 'defenseless',
      winner: 'a',
    });
    expect(resolveExchange({ symbol: 'rock', grade: 'fail' }, { symbol: null, grade: null }).kind).toBe('fumble');
  });

  it('QTE perfeito NUNCA reverte desvantagem de símbolo', () => {
    const r = resolveExchange({ symbol: 'scissors', grade: 'perfect' }, { symbol: 'rock', grade: 'good' });
    expect(r.kind).toBe('win');
    expect(r.winner).toBe('b');
    expect(r.softened).toBe(true);
  });

  it('vencedor por símbolo que falha o QTE ainda vence, mas sem golpe final', () => {
    const r = resolveExchange({ symbol: 'paper', grade: 'fail' }, { symbol: 'rock', grade: 'good' });
    expect(r).toMatchObject({ kind: 'win', winner: 'a', finisher: false });
  });

  it('vencedor que acerta o QTE (Bom ou Perfeito) faz o golpe final', () => {
    expect(resolveExchange({ symbol: 'paper', grade: 'good' }, { symbol: 'rock', grade: 'good' }).finisher).toBe(true);
    expect(resolveExchange({ symbol: 'paper', grade: 'perfect' }, { symbol: 'rock', grade: 'fail' }).finisher).toBe(true);
  });


  it('perdedor que falha continua perdendo, com punição maior', () => {
    const r = resolveExchange({ symbol: 'paper', grade: 'good' }, { symbol: 'rock', grade: 'fail' });
    expect(r).toMatchObject({ kind: 'win', winner: 'a', punished: true });
  });

  it('vencedor perfeito ganha empurrão forte', () => {
    expect(resolveExchange({ symbol: 'rock', grade: 'perfect' }, { symbol: 'scissors', grade: 'good' }).strong).toBe(true);
  });

  it('empate: choque, ou cambaleio para o lado com execução pior', () => {
    expect(resolveExchange({ symbol: 'rock', grade: 'good' }, { symbol: 'rock', grade: 'good' }).kind).toBe('clank');
    expect(resolveExchange({ symbol: 'rock', grade: 'perfect' }, { symbol: 'rock', grade: 'perfect' }).kind).toBe('clank');
    expect(resolveExchange({ symbol: 'rock', grade: 'perfect' }, { symbol: 'rock', grade: 'good' })).toMatchObject({
      kind: 'tie-stagger',
      staggered: 'b',
    });
    expect(resolveExchange({ symbol: 'rock', grade: 'fail' }, { symbol: 'rock', grade: 'perfect' })).toMatchObject({
      kind: 'tie-stagger',
      staggered: 'a',
    });
  });

  it('ambos falham: nada acontece', () => {
    expect(resolveExchange({ symbol: 'rock', grade: 'fail' }, { symbol: 'paper', grade: 'fail' }).kind).toBe('both-fumble');
  });

  it('todas as 9 combinações com execução igual seguem a tabela clássica', () => {
    const syms = ['rock', 'paper', 'scissors'] as const;
    for (const a of syms) {
      for (const b of syms) {
        const r = resolveExchange({ symbol: a, grade: 'good' }, { symbol: b, grade: 'good' });
        if (a === b) expect(r.kind).toBe('clank');
        else expect(r.winner).toBe(beats(a, b) ? 'a' : 'b');
      }
    }
  });
});
