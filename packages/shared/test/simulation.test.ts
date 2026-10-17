import { describe, expect, it } from 'vitest';
import { GameSimulation, makeConfig, qteEnd, type ExchangeEvent, type GameEvent, type Rps } from '../src';

// Eventos do bar desligados nos testes de combate (são testados à parte).
const cfg = makeConfig({ match: { countdownMs: 0 }, barEvents: { enabled: false } });
const Q = cfg.qte;

function newSim(n = 2): GameSimulation {
  const ids = ['A', 'B', 'C', 'D'].slice(0, n);
  const sim = new GameSimulation(
    ids.map((id) => ({ id, name: id })),
    cfg,
  );
  sim.step(1); // contagem zerada → partida começa
  // Posições previsíveis, longe de obstáculos.
  sim.debugPlace('A', 780, 520);
  sim.debugPlace('B', 880, 520);
  if (n > 2) sim.debugPlace('C', 880, 420);
  if (n > 3) sim.debugPlace('D', 1300, 900);
  return sim;
}

/** Avança a simulação até o instante t exato, acumulando eventos. */
function advanceTo(sim: GameSimulation, t: number, events: GameEvent[] = []): GameEvent[] {
  while (sim.now < t) events.push(...sim.step(Math.min(10, t - sim.now)));
  return events;
}

const exchanges = (ev: GameEvent[]) => ev.filter((e): e is ExchangeEvent => e.type === 'exchange');
const impactOf = (sim: GameSimulation, id: string) => sim.debugPlayer(id).attack!.impactAt;
const view = (sim: GameSimulation, id: string) => sim.snapshotFor(null).players.find((p) => p.id === id)!;

/** Quando cada um aperta, relativo ao PÔ! (T): 'cedo', 'verde' (no PÔ!), 'vermelho' ou null (não aperta). */
type When = 'cedo' | 'verde' | 'vermelho' | null;
const offset = (w: Exclude<When, null>) => (w === 'cedo' ? -600 : w === 'verde' ? 0 : Q.greenAfterMs + 100);

/** A desafia B; cada um bota seu símbolo no momento pedido. Devolve a troca e a simulação. */
function duel(aSym: Rps, bSym: Rps, aAt: When, bAt: When) {
  const sim = newSim();
  sim.applyInput('A', { type: 'challenge', targetId: 'B' });
  const T = impactOf(sim, 'A');
  const ev: GameEvent[] = [];
  const presses = [
    ['A', aSym, aAt],
    ['B', bSym, bAt],
  ] as const;
  const order = presses.filter((p) => p[2] !== null).sort((x, y) => offset(x[2]!) - offset(y[2]!));
  for (const [id, sym, w] of order) {
    const at = T + offset(w!);
    if (sim.debugPlayer(id).attack === null) break; // já resolveu
    advanceTo(sim, at, ev);
    sim.applyInput(id, { type: 'symbol', symbol: sym, at });
  }
  advanceTo(sim, qteEnd(T, Q) + 20, ev);
  return { sim, x: exchanges(ev)[0], ev, T };
}

describe('desafio (Espaço)', () => {
  it('desafiar põe os dois no duelo, com o mesmo PÔ!', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).toMatchObject({ targetId: 'B', challenger: true, symbol: null });
    expect(sim.debugPlayer('B').attack).toMatchObject({ targetId: 'A', challenger: false, symbol: null });
    expect(impactOf(sim, 'B')).toBe(impactOf(sim, 'A'));
  });

  it('não pode desafiar fora de alcance', () => {
    const sim = newSim();
    sim.debugPlace('B', 780 + cfg.attack.engageRange + 50, 520);
    const ev = [...sim.step(1)];
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    ev.push(...sim.step(1));
    expect(ev).toContainEqual(expect.objectContaining({ type: 'denied', playerId: 'A', reason: 'range' }));
    expect(sim.debugPlayer('A').attack).toBeNull();
  });

  it('1 contra 1: ninguém desafia quem já está num duelo', () => {
    const sim = newSim(3);
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    sim.applyInput('C', { type: 'challenge', targetId: 'B' });
    const ev = sim.step(1);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'denied', playerId: 'C', reason: 'engaged' }));
    expect(sim.debugPlayer('C').attack).toBeNull();
  });

  it('símbolo sem duelo é recusado', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock' });
    expect(sim.step(1)).toContainEqual(expect.objectContaining({ type: 'denied', playerId: 'A', reason: 'noduel' }));
  });

  it('o símbolo aparece para todos assim que é botado e não troca mais', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    sim.applyInput('B', { type: 'symbol', symbol: 'paper' });
    expect(sim.snapshotFor('A').players.find((p) => p.id === 'B')).toMatchObject({ symbol: 'paper', locked: true });
    sim.applyInput('B', { type: 'symbol', symbol: 'rock' });
    expect(sim.debugPlayer('B').attack!.symbol).toBe('paper');
  });

  it('quem foge para longe antes do PÔ! escapa (os dois erram)', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    sim.debugPlace('B', 780 + cfg.attack.hitRange + 60, 520);
    const ev = advanceTo(sim, qteEnd(impactOf(sim, 'A'), Q) + 20);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'whiff', reason: 'range' }));
    expect(exchanges(ev)).toHaveLength(0);
  });

  it('obstáculo entre os dois bloqueia o golpe', () => {
    const sim = newSim();
    const g = cfg.obstacles.find((o) => o.prop === 'grill') as { x: number; y: number };
    sim.debugPlace('A', g.x - 65, g.y);
    sim.debugPlace('B', g.x + 65, g.y); // churrasqueira entre os dois
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    const ev = advanceTo(sim, qteEnd(impactOf(sim, 'A'), Q) + 20);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'whiff', reason: 'blocked' }));
  });
});

describe('Jo-Ken-Pô com malandragem', () => {
  it('quem não bota nada apanha de quem botou no verde (golpe final)', () => {
    const { x, sim } = duel('rock', 'paper', 'verde', null);
    expect(x).toMatchObject({ kind: 'defenseless', attackerGrade: 'perfect', defenderGrade: 'fail', winnerId: 'A', damagedId: 'B', finisher: 'rock' });
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp - 1);
  });

  it('ninguém botou: nada acontece', () => {
    const { x, sim } = duel('rock', 'paper', null, null);
    expect(x.kind).toBe('both-fumble');
    expect(sim.debugPlayer('A').hp).toBe(cfg.player.maxHp);
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp);
  });

  it('o símbolo decide: verde com símbolo perdedor continua perdendo', () => {
    const { x, sim } = duel('scissors', 'rock', 'verde', 'cedo');
    expect(x).toMatchObject({ attackerGrade: 'perfect', defenderGrade: 'good', winnerId: 'B', damagedId: 'A', finisher: null });
    expect(sim.debugPlayer('A').hp).toBe(cfg.player.maxHp - 1);
  });

  it('malandro: viu o símbolo cedo do outro e virou no verde → golpe final', () => {
    const { x } = duel('paper', 'rock', 'verde', 'cedo');
    expect(x).toMatchObject({ kind: 'win', winnerId: 'A', finisher: 'paper' });
  });

  it('esperou demais: pego roubando no vermelho apanha, mesmo com o símbolo que ganharia', () => {
    const { x, sim } = duel('paper', 'rock', 'vermelho', 'verde');
    expect(x).toMatchObject({ kind: 'caught', attackerGrade: 'caught', winnerId: 'B', damagedId: 'A', finisher: null });
    expect(sim.debugPlayer('A').hp).toBe(cfg.player.maxHp - 1);
  });

  it('os dois roubaram: o Zé anula, ninguém perde vida e os dois cambaleiam', () => {
    const { x, sim } = duel('paper', 'rock', 'vermelho', 'vermelho');
    expect(x.kind).toBe('both-caught');
    expect(sim.debugPlayer('A').hp).toBe(cfg.player.maxHp);
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp);
  });

  it('os dois botaram: resolve logo no PÔ!, sem esperar o vermelho', () => {
    const { x, T } = duel('rock', 'scissors', 'cedo', 'cedo');
    expect(x.at).toBeLessThan(T + 20);
  });

  it('o carimbo de tempo não volta mais que maxRewindMs (sem roubo pela rede)', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    const T = impactOf(sim, 'A');
    advanceTo(sim, T + Q.greenAfterMs + 200);
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', at: T });
    expect(sim.debugPlayer('A').attack!.pickedAt).toBe(sim.now - Q.maxRewindMs);
  });

  it('golpe final de Pedra: atordoa mais; a invulnerabilidade é igual para os três', () => {
    const { x, sim } = duel('rock', 'scissors', 'verde', 'cedo');
    expect(x).toMatchObject({ winnerId: 'A', damagedId: 'B', finisher: 'rock' });
    expect(sim.debugPlayer('B').stunUntil - x.at).toBeGreaterThan(cfg.finisher.rock.stunMs - 50);
    const graces = (['rock', 'paper', 'scissors'] as const).map((s) => {
      const loser = s === 'rock' ? 'scissors' : s === 'paper' ? 'rock' : 'paper';
      const d = duel(s, loser, 'verde', 'cedo');
      return d.sim.debugPlayer('B').graceUntil - d.x.at;
    });
    expect(new Set(graces).size).toBe(1);
  });

  it('golpe final de Tesoura deixa lento', () => {
    const { x, sim } = duel('scissors', 'paper', 'verde', 'cedo');
    expect(x.finisher).toBe('scissors');
    expect(view(sim, 'B').slowed).toBe(true);
  });

  it('empate: mesma nota = choque; quem botou cedo cambaleia diante do verde', () => {
    expect(duel('rock', 'rock', 'cedo', 'cedo').x.kind).toBe('clank');
    const { x } = duel('rock', 'rock', 'verde', 'cedo');
    expect(x).toMatchObject({ kind: 'tie-stagger', staggeredId: 'B' });
  });

  it('não pode desafiar quem acabou de apanhar (graça)', () => {
    const { sim } = duel('rock', 'scissors', 'verde', 'cedo');
    advanceTo(sim, sim.now + 700);
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    expect(sim.step(1)).toContainEqual(expect.objectContaining({ type: 'denied', reason: 'grace' }));
  });
});

describe('fim de partida', () => {
  it('último vivo vence', () => {
    const sim = newSim();
    sim.debugSet('B', { hp: 1 });
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    sim.applyInput('A', { type: 'symbol', symbol: 'rock' });
    const ev = advanceTo(sim, qteEnd(impactOf(sim, 'A'), Q) + 20);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'eliminated', playerId: 'B', byId: 'A' }));
    expect(sim.phase).toBe('ended');
    expect(sim.winnerId).toBe('A');
  });

  it('fim do tempo: vence quem tem mais vida; igualdade = empate', () => {
    const sim = newSim();
    sim.debugSet('B', { hp: 2 });
    advanceTo(sim, sim.phaseEndsAt + 1);
    expect(sim.winnerId).toBe('A');

    const sim2 = newSim();
    advanceTo(sim2, sim2.phaseEndsAt + 1);
    expect(sim2.phase).toBe('ended');
    expect(sim2.winnerId).toBeNull();
  });

  it('entradas são ignoradas fora da fase de jogo', () => {
    const sim = new GameSimulation(
      [
        { id: 'A', name: 'A' },
        { id: 'B', name: 'B' },
      ],
      makeConfig(),
    );
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).toBeNull();
  });
});

describe('arena', () => {
  it('a cerca elíptica segura o jogador dentro da arena', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'move', x: -1, y: -1 });
    advanceTo(sim, sim.now + 6000);
    const a = sim.debugPlayer('A');
    const { cx, cy, rx, ry } = cfg.arena;
    expect(((a.x - cx) / rx) ** 2 + ((a.y - cy) / ry) ** 2).toBeLessThanOrEqual(1);
  });

  it('churrasqueira redonda bloqueia o movimento', () => {
    const sim = newSim();
    const g = cfg.obstacles.find((o) => o.prop === 'grill') as { x: number; y: number; r: number };
    sim.debugPlace('A', g.x - 100, g.y);
    sim.applyInput('A', { type: 'move', x: 1, y: 0 });
    advanceTo(sim, sim.now + 300);
    expect(sim.debugPlayer('A').x).toBeLessThanOrEqual(g.x - g.r - cfg.player.radius + 0.01);
  });
});

describe('cerveja na mesa', () => {
  const nearTable = (sim: GameSimulation, id: string) => sim.debugPlace(id, 960, 480);
  const B = cfg.beer;

  it('beber perto da mesa recupera vida e consome a cerveja até o garçom trazer outra', () => {
    const sim = newSim();
    sim.debugSet('A', { hp: 1 });
    nearTable(sim, 'A');
    sim.applyInput('A', { type: 'drink' });
    expect(sim.snapshotFor('B').players.find((p) => p.id === 'A')!.drinkingUntil).toBeGreaterThan(sim.now);
    expect(sim.snapshotFor('A').beers[0].readyAt).toBe(Number.POSITIVE_INFINITY);
    const ev = advanceTo(sim, sim.now + B.drinkMs + 20);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'drink', playerId: 'A', stage: 'done', hp: 2 }));
    expect(sim.debugPlayer('A').hp).toBe(1 + B.heal);
    const readyAt = sim.snapshotFor('A').beers[0].readyAt;
    expect(readyAt).toBeGreaterThan(sim.now);
    sim.applyInput('A', { type: 'drink' });
    expect(sim.debugPlayer('A').drinkingUntil).toBe(0); // mesa vazia
    advanceTo(sim, readyAt + 1);
    sim.applyInput('A', { type: 'drink' });
    expect(sim.debugPlayer('A').drinkingUntil).toBeGreaterThan(sim.now);
  });

  it('não bebe com vida cheia nem longe da mesa', () => {
    const sim = newSim();
    nearTable(sim, 'A');
    sim.applyInput('A', { type: 'drink' });
    expect(sim.debugPlayer('A').drinkingUntil).toBe(0);
    sim.debugSet('B', { hp: 1 });
    sim.debugPlace('B', 700, 560); // longe da mesa
    sim.applyInput('B', { type: 'drink' });
    expect(sim.debugPlayer('B').drinkingUntil).toBe(0);
  });

  it('bebendo fica parado e não pode atacar', () => {
    const sim = newSim();
    sim.debugSet('A', { hp: 2 });
    nearTable(sim, 'A');
    sim.applyInput('A', { type: 'drink' });
    sim.applyInput('A', { type: 'move', x: 1, y: 0 });
    advanceTo(sim, sim.now + 500);
    expect(sim.debugPlayer('A').x).toBeCloseTo(960, 0);
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).toBeNull();
  });

  it('ser chamado para um duelo enquanto bebe derrama a cerveja (sem cura)', () => {
    const sim = newSim();
    sim.debugSet('B', { hp: 2 });
    sim.debugPlace('B', 960, 480);
    sim.debugPlace('A', 960, 380);
    sim.applyInput('B', { type: 'drink' });
    sim.applyInput('A', { type: 'challenge', targetId: 'B' });
    const ev = sim.step(1);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'drink', playerId: 'B', stage: 'spilled' }));
    sim.applyInput('A', { type: 'symbol', symbol: 'rock' });
    advanceTo(sim, sim.now + B.drinkMs);
    expect(sim.debugPlayer('B').hp).toBe(1);
  });
});
