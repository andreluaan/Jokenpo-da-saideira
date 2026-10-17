import { describe, expect, it } from 'vitest';
import { GameSimulation, makeConfig, type ExchangeEvent, type GameConfig, type GameEvent } from '../src';

// Itens/eventos automáticos desligados: cada teste liga o que precisa à mão.
const base = makeConfig({ match: { countdownMs: 0 }, items: { enabled: false }, barEvents: { enabled: false } });

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

/** A ataca B (indefeso) com `symbol`, confirmando cedo (BOM) → golpe final. */
function finisher(sim: GameSimulation, symbol: 'rock' | 'paper' | 'scissors'): GameEvent[] {
  sim.applyInput('A', { type: 'symbol', symbol, targetId: 'B' });
  sim.applyInput('A', { type: 'commit' });
  return advanceTo(sim, sim.debugPlayer('A').attack!.impactAt + base.qte.lateMs + 1);
}

const view = (sim: GameSimulation, id: string) => sim.snapshotFor(null).players.find((p) => p.id === id)!;

describe('itens do chão', () => {
  it('cachaça: deixa bêbado e turbina o próximo golpe final (empurra mais)', () => {
    const plain = newSim();
    plain.debugPlace('A', 780, 520);
    plain.debugPlace('B', 880, 520);
    finisher(plain, 'paper');
    advanceTo(plain, plain.now + 800);
    const plainDist = plain.debugPlayer('B').x - 880;

    const sim = newSim();
    sim.debugPlace('A', 780, 520);
    sim.debugPlace('B', 880, 520);
    sim.debugSpawnItem('cachaca', 780, 520);
    const ev = sim.step(10);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'pickup', kind: 'cachaca', playerId: 'A' }));
    expect(view(sim, 'A')).toMatchObject({ buzzed: true, boosted: true });
    finisher(sim, 'paper');
    advanceTo(sim, sim.now + 800);
    expect(sim.debugPlayer('B').x - 880).toBeGreaterThan(plainDist);
    expect(view(sim, 'A').boosted).toBe(false);
  });

  it('amendoim: investida de graça (não gasta foco)', () => {
    const sim = newSim();
    sim.debugPlace('A', 780, 520);
    sim.debugSpawnItem('amendoim', 780, 520);
    sim.step(10);
    expect(view(sim, 'A').nuts).toBe(true);
    const f0 = sim.debugPlayer('A').focus;
    sim.applyInput('A', { type: 'dash', x: 1, y: 0 });
    expect(sim.debugPlayer('A').focus).toBeGreaterThanOrEqual(f0);
    expect(sim.debugPlayer('A').dashUntil).toBeGreaterThan(sim.now);
  });
});

describe('arena interativa', () => {
  it('churrasqueira quente: quem é arremessado nela queima e fica atordoado', () => {
    const sim = newSim();
    // Churrasqueira em (520,600) r34. B entre A e ela; o Papel arremessa B na brasa.
    sim.debugPlace('A', 690, 600);
    sim.debugPlace('B', 600, 600);
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
    // Freezer de cima: retângulo (900,255) 120×62 → embaixo dele.
    sim.debugPlace('B', 960, 350);
    sim.debugPlace('A', 960, 440);
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
    const cfg = makeConfig({ match: { countdownMs: 0 }, items: { enabled: false } });
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
