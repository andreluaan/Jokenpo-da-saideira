import { describe, expect, it } from 'vitest';
import { BOT_PROFILES, BotBrain, GameSimulation, makeConfig, type BotDifficulty, type GameEvent } from '../src';

function botMatch(difficulty: BotDifficulty, seed: number) {
  const cfg = makeConfig();
  const ids = ['b1', 'b2', 'b3', 'b4'];
  const sim = new GameSimulation(
    ids.map((id) => ({ id, name: id, isBot: true })),
    cfg,
  );
  const bots = ids.map((id, i) => new BotBrain(id, BOT_PROFILES[difficulty], cfg, seed * 10 + i));
  const all: GameEvent[] = [];
  const limit = cfg.match.countdownMs + cfg.match.durationMs + 1000;
  while (sim.phase !== 'ended' && sim.now < limit) {
    for (const b of bots) for (const input of b.think(sim.snapshotFor(b.id))) sim.applyInput(b.id, input);
    const ev = sim.step(1000 / 30);
    for (const b of bots) b.observe(ev);
    all.push(...ev);
  }
  return { sim, all };
}

describe('NPCs', () => {
  it.each(['easy', 'normal', 'hard'] as const)('partida de 4 NPCs (%s) termina e tem confrontos', (difficulty) => {
    const { sim, all } = botMatch(difficulty, 7);
    expect(sim.phase).toBe('ended');
    expect(all.filter((e) => e.type === 'exchange').length).toBeGreaterThan(5);
  });

  it('é determinística com a mesma semente', () => {
    const a = botMatch('normal', 3);
    const b = botMatch('normal', 3);
    expect(a.sim.winnerId).toBe(b.sim.winnerId);
    expect(a.sim.now).toBe(b.sim.now);
  });
});
