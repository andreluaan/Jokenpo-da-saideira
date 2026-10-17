import { describe, expect, it } from 'vitest';
import { GameSimulation, makeConfig, type ExchangeEvent, type GameEvent } from '../src';

// Itens e eventos do bar desligados nos testes de combate (são testados à parte).
const cfg = makeConfig({ match: { countdownMs: 0 }, items: { enabled: false }, barEvents: { enabled: false } });
const LATE = cfg.qte.lateMs;

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

describe('ataque simples', () => {
  it('alvo indefeso leva 1 de dano; confirmação no instante exato = Perfeito', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    const T = impactOf(sim, 'A');
    advanceTo(sim, T);
    sim.applyInput('A', { type: 'commit', at: T });
    const ev = advanceTo(sim, T + LATE + 1);
    const [x] = exchanges(ev);
    expect(x).toMatchObject({ kind: 'defenseless', attackerGrade: 'perfect', winnerId: 'A', damagedId: 'B' });
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp - 1);
  });

  it('atacante que não confirma erra (Falha) e o alvo não sofre dano', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    const ev = advanceTo(sim, impactOf(sim, 'A') + LATE + 1);
    expect(exchanges(ev)[0].kind).toBe('fumble');
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp);
  });

  it('confirmar cedo acelera o impacto e garante nota Bom', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    const before = impactOf(sim, 'A');
    sim.applyInput('A', { type: 'commit' });
    const after = impactOf(sim, 'A');
    expect(after).toBeLessThan(before);
    const ev = advanceTo(sim, after + LATE + 1);
    expect(exchanges(ev)[0].attackerGrade).toBe('good');
  });

  it('não pode iniciar ataque fora de alcance', () => {
    const sim = newSim();
    sim.debugPlace('B', 780 + cfg.attack.engageRange + 50, 520);
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).toBeNull();
  });

  it('alvo que se afasta além do alcance faz o ataque errar', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    sim.debugPlace('B', 1300, 900);
    const ev = advanceTo(sim, impactOf(sim, 'A') + LATE + 1);
    expect(ev.find((e) => e.type === 'whiff')).toMatchObject({ reason: 'range' });
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp);
  });

  it('obstáculo entre os dois bloqueia o golpe', () => {
    const sim = newSim();
    sim.debugPlace('A', 455, 600);
    sim.debugPlace('B', 585, 600); // barril em (520, 600)
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    const ev = advanceTo(sim, impactOf(sim, 'A') + LATE + 1);
    expect(ev.find((e) => e.type === 'whiff')).toMatchObject({ reason: 'blocked' });
  });
});

describe('duelo (resposta)', () => {
  function duel(aSym: 'rock' | 'paper' | 'scissors', bSym: 'rock' | 'paper' | 'scissors', aAt: 'T' | 'early' | null, bAt: 'T' | 'early' | null) {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: aSym, targetId: 'B' });
    advanceTo(sim, sim.now + 200);
    sim.applyInput('B', { type: 'symbol', symbol: bSym, targetId: 'A' });
    const T = impactOf(sim, 'A');
    expect(impactOf(sim, 'B')).toBe(T);
    if (aAt === 'early') sim.applyInput('A', { type: 'commit' });
    if (bAt === 'early') sim.applyInput('B', { type: 'commit' });
    advanceTo(sim, T);
    if (aAt === 'T') sim.applyInput('A', { type: 'commit', at: T });
    if (bAt === 'T') sim.applyInput('B', { type: 'commit', at: T });
    const ev = advanceTo(sim, T + LATE + 1);
    return { sim, x: exchanges(ev)[0], ev };
  }

  it('resposta forma duelo com impacto compartilhado e resolve numa única troca', () => {
    const { x, ev } = duel('rock', 'paper', 'early', 'early');
    expect(exchanges(ev)).toHaveLength(1);
    expect(x).toMatchObject({ duel: true, winnerId: 'B', damagedId: 'A' });
  });

  it('confirmar cedo em duelo NÃO acelera o impacto', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('B', { type: 'symbol', symbol: 'rock', targetId: 'A' });
    const T = impactOf(sim, 'A');
    sim.applyInput('A', { type: 'commit' });
    expect(impactOf(sim, 'A')).toBe(T);
  });

  it('Perfeito com símbolo perdedor continua perdendo (estratégia > execução)', () => {
    const { x, sim } = duel('scissors', 'rock', 'T', 'early');
    expect(x).toMatchObject({ attackerGrade: 'perfect', defenderGrade: 'good', winnerId: 'B', damagedId: 'A' });
    expect(sim.debugPlayer('A').hp).toBe(cfg.player.maxHp - 1);
  });

  it('vencedor que não confirma ainda vence, mas sem golpe final', () => {
    const { x, sim } = duel('paper', 'rock', null, 'early');
    expect(x).toMatchObject({ kind: 'win', winnerId: 'A', damagedId: 'B', finisher: null });
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp - 1);
  });

  it('golpe final de Pedra: atordoa mais e quase não empurra', () => {
    const { x, sim } = duel('rock', 'scissors', 'early', 'early');
    expect(x).toMatchObject({ winnerId: 'A', damagedId: 'B', finisher: 'rock' });
    const b = sim.debugPlayer('B');
    expect(b.stunUntil - sim.now).toBeGreaterThan(cfg.finisher.rock.stunMs - 50);
    expect(b.graceUntil - sim.now).toBeGreaterThan(cfg.finisher.graceMs - 50);
  });

  it('golpe final de Tesoura deixa lento; Papel empurra mais longe e não deixa lento', () => {
    const cut = duel('scissors', 'paper', 'early', 'early');
    expect(cut.x.finisher).toBe('scissors');
    expect(cut.sim.snapshotFor(null).players.find((p) => p.id === 'B')!.slowed).toBe(true);

    const wrap = duel('paper', 'rock', 'early', 'early');
    expect(wrap.x.finisher).toBe('paper');
    advanceTo(wrap.sim, wrap.sim.now + 800);
    advanceTo(cut.sim, cut.sim.now + 800);
    const paperDist = wrap.sim.debugPlayer('B').x - 880;
    const scissorsDist = cut.sim.debugPlayer('B').x - 880;
    expect(paperDist).toBeGreaterThan(scissorsDist);
    expect(wrap.sim.snapshotFor(null).players.find((p) => p.id === 'B')!.slowed).toBe(false);
  });


  it('a invulnerabilidade depois do golpe final é igual para os três símbolos', () => {
    const graces = (['rock', 'paper', 'scissors'] as const).map((s) => {
      const loser = s === 'rock' ? 'scissors' : s === 'paper' ? 'rock' : 'paper';
      const { sim } = duel(s, loser, 'early', 'early');
      return sim.debugPlayer('B').graceUntil - sim.now;
    });
    expect(new Set(graces).size).toBe(1);
  });

  it('mesmo símbolo: choque sem dano; Perfeito faz o outro cambalear', () => {
    expect(duel('rock', 'rock', 'early', 'early').x.kind).toBe('clank');
    const { x } = duel('rock', 'rock', 'T', 'early');
    expect(x).toMatchObject({ kind: 'tie-stagger', staggeredId: 'B' });
  });

  it('resposta garante tempo mínimo de reação', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    advanceTo(sim, impactOf(sim, 'A') - 300);
    sim.applyInput('B', { type: 'symbol', symbol: 'paper', targetId: 'A' });
    expect(impactOf(sim, 'A')).toBe(sim.now + cfg.attack.minResponseMs);
  });
});

describe('blefe: troca e cancelamento', () => {
  it('troca custa foco, emite sinal e tem limite', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    const f0 = sim.debugPlayer('A').focus;
    sim.applyInput('A', { type: 'symbol', symbol: 'paper' });
    const ev = sim.step(1);
    expect(sim.debugPlayer('A').attack!.symbol).toBe('paper');
    expect(sim.debugPlayer('A').focus).toBeCloseTo(f0 - cfg.costs.swap, 5);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'signal', kind: 'swap', playerId: 'A' }));
    sim.applyInput('A', { type: 'symbol', symbol: 'scissors' });
    sim.applyInput('A', { type: 'symbol', symbol: 'rock' }); // 3ª troca: negada
    expect(sim.debugPlayer('A').attack!.symbol).toBe('scissors');
  });

  it('depois de travar não é possível trocar nem cancelar', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    sim.applyInput('A', { type: 'symbol', symbol: 'paper' });
    sim.applyInput('A', { type: 'cancel' });
    expect(sim.debugPlayer('A').attack!.symbol).toBe('rock');
  });

  it('cancelar custa foco e gera hesitação (não pode atacar logo em seguida)', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'cancel' });
    expect(sim.debugPlayer('A').attack).toBeNull();
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).toBeNull();
    advanceTo(sim, sim.now + cfg.timings.cancelMs + 1);
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).not.toBeNull();
  });

  it('sem foco suficiente a troca é negada', () => {
    const sim = newSim();
    sim.debugSet('A', { focus: 5 });
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'symbol', symbol: 'paper' });
    expect(sim.debugPlayer('A').attack!.symbol).toBe('rock');
  });
});

describe('vários jogadores', () => {
  it('dois atacantes simultâneos tiram no máximo 1 de vida (graça)', () => {
    const sim = newSim(3);
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('C', { type: 'symbol', symbol: 'paper', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    sim.applyInput('C', { type: 'commit' });
    const T = Math.max(impactOf(sim, 'A'), impactOf(sim, 'C'));
    const ev = advanceTo(sim, T + LATE + 1);
    const xs = exchanges(ev);
    expect(xs).toHaveLength(2);
    expect(xs.filter((x) => x.damagedId === 'B')).toHaveLength(1);
    expect(xs.filter((x) => x.protectedId === 'B')).toHaveLength(1);
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp - 1);
  });

  it('uma mão só: o símbolo do defensor vale contra quem o ataca, e ao vencer ele mantém a ação', () => {
    const sim = newSim(3);
    sim.applyInput('B', { type: 'symbol', symbol: 'paper', targetId: 'C' }); // B mira C
    advanceTo(sim, sim.now + 50);
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' }); // A ataca B
    sim.applyInput('A', { type: 'commit' }); // confirma cedo: impacto de A chega antes do de B
    const TA = impactOf(sim, 'A');
    expect(TA).toBeLessThan(impactOf(sim, 'B'));
    advanceTo(sim, TA);
    sim.applyInput('B', { type: 'commit', at: TA }); // B dá a Última Palavra no impacto de A
    const ev = advanceTo(sim, TA + LATE + 1);
    const vsA = exchanges(ev).find((x) => x.attackerId === 'A')!;
    expect(vsA).toMatchObject({ defenderSymbol: 'paper', defenderGrade: 'perfect', winnerId: 'B', damagedId: 'A' });
    expect(sim.debugPlayer('B').attack?.targetId).toBe('C');
  });

  it('quem leva dano perde a própria ação (interrupção)', () => {
    const sim = newSim(3);
    sim.applyInput('B', { type: 'symbol', symbol: 'scissors', targetId: 'C' });
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    sim.applyInput('B', { type: 'commit' });
    advanceTo(sim, impactOf(sim, 'A') + LATE + 1);
    expect(sim.debugPlayer('B').hp).toBe(cfg.player.maxHp - 1);
    expect(sim.debugPlayer('B').attack).toBeNull();
  });
});

describe('informação oculta', () => {
  it('só o próprio jogador vê o próprio símbolo', () => {
    const sim = newSim();
    sim.applyInput('A', { type: 'symbol', symbol: 'scissors', targetId: 'B' });
    const own = sim.snapshotFor('A').players.find((p) => p.id === 'A')!;
    const seenByB = sim.snapshotFor('B').players.find((p) => p.id === 'A')!;
    expect(own.symbol).toBe('scissors');
    expect(seenByB.symbol).toBeNull();
    expect(seenByB.holding).toBe(true);
    expect(seenByB.swapsLeft).toBeNull();
    expect(JSON.stringify(sim.snapshotFor('B'))).not.toContain('scissors');
  });
});

describe('fim de partida', () => {
  it('último vivo vence', () => {
    const sim = newSim();
    sim.debugSet('B', { hp: 1 });
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    const ev = advanceTo(sim, impactOf(sim, 'A') + LATE + 1);
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
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
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

  it('barril redondo bloqueia o movimento', () => {
    const sim = newSim();
    sim.debugPlace('A', 420, 600);
    sim.applyInput('A', { type: 'move', x: 1, y: 0 });
    advanceTo(sim, sim.now + 300);
    expect(sim.debugPlayer('A').x).toBeLessThanOrEqual(520 - 34 - cfg.player.radius + 0.01);
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
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    expect(sim.debugPlayer('A').attack).toBeNull();
  });

  it('levar dano enquanto bebe derrama a cerveja (sem cura)', () => {
    const sim = newSim();
    sim.debugSet('B', { hp: 2 });
    sim.debugPlace('B', 960, 480);
    sim.debugPlace('A', 960, 380);
    sim.applyInput('B', { type: 'drink' });
    sim.applyInput('A', { type: 'symbol', symbol: 'rock', targetId: 'B' });
    sim.applyInput('A', { type: 'commit' });
    const ev = advanceTo(sim, impactOf(sim, 'A') + LATE + 1);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'drink', playerId: 'B', stage: 'spilled' }));
    advanceTo(sim, sim.now + B.drinkMs);
    expect(sim.debugPlayer('B').hp).toBe(1);
  });
});
