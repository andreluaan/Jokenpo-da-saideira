import {
  BOT_PROFILES,
  BotBrain,
  DEFAULT_CONFIG,
  GameSimulation,
  type BotDifficulty,
  type GameConfig,
  type GameEvent,
  type PlayerInput,
  type PlayerSetup,
  type Snapshot,
} from '@ppt/shared';
import type { GameConnection } from './connection';

const STEP_MS = 1000 / 60;
const BOT_NAMES = ['Zé da Esquina', 'Tia do Bar', 'Garçom Juca'];

export interface LocalMatchOptions {
  playerName: string;
  botCount: number;
  difficulty: BotDifficulty;
  config?: GameConfig;
}

/** Hospeda a partida no próprio navegador, contra NPCs. Não é multiplayer. */
export class LocalConnection implements GameConnection {
  readonly localPlayerId = 'you';
  readonly config: GameConfig;
  private readonly sim: GameSimulation;
  private readonly bots: BotBrain[];
  private readonly listeners = new Set<(e: GameEvent[]) => void>();
  private snapshot: Snapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private lastWall = 0;
  /** Instante de relógio de parede que corresponde a sim.now. */
  private simWall = 0;

  constructor(opts: LocalMatchOptions) {
    this.config = opts.config ?? DEFAULT_CONFIG;
    const count = Math.max(1, Math.min(3, opts.botCount));
    const setups: PlayerSetup[] = [{ id: this.localPlayerId, name: opts.playerName || 'Jogador' }];
    for (let i = 0; i < count; i++) setups.push({ id: `bot${i}`, name: BOT_NAMES[i], isBot: true });
    this.sim = new GameSimulation(setups, this.config);
    const seed = Math.floor(Math.random() * 1e9);
    this.bots = setups
      .slice(1)
      .map((s, i) => new BotBrain(s.id, BOT_PROFILES[opts.difficulty], this.config, seed + i));
    this.snapshot = this.sim.snapshotFor(this.localPlayerId);
  }

  start(): void {
    this.lastWall = this.simWall = performance.now();
    this.timer = setInterval(() => this.tick(), 8);
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  now(): number {
    return this.sim.now + Math.min(STEP_MS * 2, performance.now() - this.simWall);
  }

  latest(): Snapshot | null {
    return this.snapshot;
  }

  send(input: PlayerInput): void {
    const msg = input.type === 'commit' ? { ...input, at: this.now() } : input;
    this.sim.applyInput(this.localPlayerId, msg);
  }

  onEvents(cb: (events: GameEvent[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private tick(): void {
    const wall = performance.now();
    // Limita o salto (aba em segundo plano) para não "teletransportar" a partida.
    this.acc += Math.min(250, wall - this.lastWall);
    this.lastWall = wall;
    const events: GameEvent[] = [];
    while (this.acc >= STEP_MS) {
      for (const bot of this.bots) {
        for (const input of bot.think(this.sim.snapshotFor(bot.id))) this.sim.applyInput(bot.id, input);
      }
      const ev = this.sim.step(STEP_MS);
      for (const bot of this.bots) bot.observe(ev);
      events.push(...ev);
      this.acc -= STEP_MS;
    }
    this.simWall = wall - this.acc;
    this.snapshot = this.sim.snapshotFor(this.localPlayerId);
    if (events.length) for (const cb of this.listeners) cb(events);
  }
}
