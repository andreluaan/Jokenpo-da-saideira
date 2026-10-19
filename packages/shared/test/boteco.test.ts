import { describe, expect, it } from 'vitest';
import { GameSimulation, makeConfig, qteEnd, type ExchangeEvent, type GameConfig, type GameEvent } from '../src';

// Eventos automáticos desligados: cada teste liga o que precisa à mão.
const base = makeConfig({ match: { countdownMs: 0 }, barEvents: { enabled: false } });

function newSim(cfg: GameConfig = base): GameSimulation {
  const sim = new GameSimulation(
    [
      { id: 'A', name: 'A' },
      { id: 'B', name: 'B' },
    ],
    cfg,
  );
  sim.step(1);
  return sim;
}

function advanceTo(sim: GameSimulation, t: number, events: GameEvent[] = []): GameEvent[] {
  while (sim.now < t) events.push(...sim.step(Math.min(10, t - sim.now)));
  return events;
}

/** A desafia B e bota `symbol` no verde; B não bota nada → golpe final de A. */
function finisher(sim: GameSimulation, symbol: 'rock' | 'paper' | 'scissors'): GameEvent[] {
  sim.applyInput('A', { type: 'challenge', targetId: 'B' });
  const T = sim.debugPlayer('A').attack!.impactAt;
  const ev = advanceTo(sim, T);
  sim.applyInput('A', { type: 'symbol', symbol, at: T });
  return advanceTo(sim, qteEnd(T, base.qte) + 20, ev);
}

const view = (sim: GameSimulation, id: string) => sim.snapshotFor(null).players.find((p) => p.id === id)!;

describe('arena interativa', () => {
  it('churrasqueira quente: quem é arremessado nela queima e fica atordoado', () => {
    const sim = newSim();
    // B entre A e a churrasqueira; o Papel arremessa B na brasa.
    const g = sim.config.obstacles.find((o) => o.prop === 'grill') as { x: number; y: number };
    sim.debugPlace('A', g.x + 170, g.y);
    sim.debugPlace('B', g.x + 80, g.y);
    const ev = finisher(sim, 'paper');
    advanceTo(sim, sim.now + 600, ev);
    expect(ev.some((e) => e.type === 'burn' && e.playerId === 'B')).toBe(true);
  });

  it('engradado aguenta 2 trombadas fortes, quebra, deixa poça e para de bloquear', () => {
    const sim = newSim();
    const crate = sim.config.obstacles.findIndex((o) => o.prop === 'crates');
    const o = sim.config.obstacles[crate] as { x: number; y: number; w: number; h: number };
    const cx = o.x + o.w / 2;
    const below = o.y + o.h + 30;
    const ev: GameEvent[] = [];
    for (let i = 0; i < 2; i++) {
      sim.debugPlace('A', cx, below + 90);
      sim.debugPlace('B', cx, below);
      sim.debugSet('B', { graceUntil: 0, hp: 3 });
      ev.push(...finisher(sim, 'paper'));
      advanceTo(sim, sim.now + 2500, ev);
    }
    const crates = ev.filter((e) => e.type === 'crate');
    expect(crates.length).toBe(2);
    expect(crates.at(-1)).toMatchObject({ broken: true, index: crate });
    const snap = sim.snapshotFor(null);
    expect(snap.broken).toContain(crate);
    expect(snap.puddles.length).toBeGreaterThan(0);
    expect(sim.activeObstacles.length).toBe(sim.config.obstacles.length - 1);
  });

  it('freezer aberto: escudo de gelo segura o próximo golpe inteiro', () => {
    const sim = newSim();
    // Logo embaixo do primeiro freezer (encostado na cerca).
    const f = sim.config.obstacles.find((o) => o.prop === 'freezer') as { x: number; y: number; w: number; h: number };
    sim.debugPlace('B', f.x + f.w / 2, f.y + f.h + 30);
    sim.debugPlace('A', f.x + f.w / 2, f.y + f.h + 120);
    sim.applyInput('B', { type: 'drink' });
    expect(view(sim, 'B').openingUntil).toBeGreaterThan(sim.now);
    advanceTo(sim, sim.now + sim.config.hazards.freezer.openMs + 20);
    expect(view(sim, 'B').shielded).toBe(true);
    const ev = finisher(sim, 'rock');
    const x = ev.find((e): e is ExchangeEvent => e.type === 'exchange')!;
    expect(x.protectedId).toBe('B');
    expect(sim.debugPlayer('B').hp).toBe(sim.config.player.maxHp);
    expect(view(sim, 'B').shielded).toBe(false);
  });

  it('escudo de gelo derrete sozinho depois de shieldMs', () => {
    const sim = newSim();
    const f = sim.config.obstacles.find((o) => o.prop === 'freezer') as { x: number; y: number; w: number; h: number };
    sim.debugPlace('B', f.x + f.w / 2, f.y + f.h + 30);
    sim.applyInput('B', { type: 'drink' });
    advanceTo(sim, sim.now + sim.config.hazards.freezer.openMs + 20);
    expect(view(sim, 'B').shielded).toBe(true);
    advanceTo(sim, sim.now + sim.config.hazards.freezer.shieldMs - 200);
    expect(view(sim, 'B').shielded).toBe(true);
    const ev: GameEvent[] = [];
    while (view(sim, 'B').shielded) ev.push(...sim.step(1000 / 60));
    expect(ev.some((e) => e.type === 'shield' && e.stage === 'expired')).toBe(true);
  });

  it('cerveja derramada vira poça no chão', () => {
    const sim = newSim();
    sim.debugSet('B', { hp: 2 });
    sim.debugPlace('B', 960, 690); // logo abaixo da mesa (960,600) r70
    sim.debugPlace('A', 960, 780);
    sim.applyInput('B', { type: 'drink' });
    expect(view(sim, 'B').drinkingUntil).toBeGreaterThan(sim.now);
    finisher(sim, 'rock');
    expect(sim.snapshotFor(null).puddles.length).toBe(1);
  });
});

describe('eventos do bar', () => {
  it('sorteia exatamente 1 evento por rodada, com aviso antes', () => {
    const cfg = makeConfig({ match: { countdownMs: 0 } });
    const sim = newSim(cfg);
    sim.debugPlace('A', 400, 400);
    sim.debugPlace('B', 1500, 800);
    const ev = advanceTo(sim, cfg.barEvents.startMs[1] + 15_000);
    const stages = ev.filter((e) => e.type === 'barEvent').map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual(['announce', 'start', 'end']);
  });

  it('Saideira dupla: golpe final tira 2 de vida', () => {
    const sim = newSim();
    sim.debugPlace('A', 780, 520);
    sim.debugPlace('B', 880, 520);
    sim.debugStartEvent('saideira');
    sim.step(10);
    finisher(sim, 'rock');
    expect(sim.debugPlayer('B').hp).toBe(sim.config.player.maxHp - 2);
  });

  it('Zé grita: o garçom atravessa a arena largando cervejas', () => {
    const sim = newSim();
    sim.debugPlace('A', 400, 900);
    sim.debugPlace('B', 1500, 900);
    sim.debugStartEvent('ze');
    sim.step(10);
    expect(sim.snapshotFor(null).waiter).not.toBeNull();
    advanceTo(sim, sim.now + 12_000);
    const snap = sim.snapshotFor(null);
    expect(snap.waiter).toBeNull();
    expect(snap.items.filter((i) => i.kind === 'beer').length).toBe(sim.config.barEvents.ze.beers);
  });
});
