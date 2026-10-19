import { randomBytes } from 'node:crypto';
import {
  BOT_PROFILES,
  BotBrain,
  CHARACTER_IDS,
  CHARACTER_INFO,
  DEFAULT_CONFIG,
  GameSimulation,
  MAX_PLAYERS,
  SERVER_TICK_HZ,
  SNAPSHOT_HZ,
  isYoutubeId,
  sanitizeName,
  type Ack,
  type BotDifficulty,
  type CharacterId,
  type GameConfig,
  type GameEvent,
  type JoinResult,
  type LobbyState,
  type PlayerInput,
  type RadioState,
  type PlayerSetup,
  type ServerToClient,
} from '@ppt/shared';

/** Quem está do outro lado da conexão (um socket, ou um falso nos testes). */
export interface Peer {
  emit<E extends keyof ServerToClient>(event: E, ...args: Parameters<ServerToClient[E]>): void;
}

interface RoomPlayer {
  id: string;
  name: string;
  character: CharacterId;
  ready: boolean;
  token: string;
  peer: Peer | null;
  /** Limite de entradas por segundo (proteção contra spam). */
  inputs: number;
  inputWindow: number;
  dropAt: number;
}

export interface RoomOptions {
  config?: GameConfig;
  /** Tempo para remover quem caiu no lobby, e para fechar a sala vazia. */
  lobbyDropMs?: number;
  emptyCloseMs?: number;
  /** Pausa no fim da partida antes de voltar ao lobby. */
  endPauseMs?: number;
  now?: () => number;
}

const INPUT_LIMIT_PER_S = 60;

/**
 * Uma sala: lobby (entrar, escolher personagem, prontos) e, depois, a partida autoritativa
 * (GameSimulation + NPCs) rodando a SERVER_TICK_HZ, com snapshots filtrados por jogador a SNAPSHOT_HZ.
 */
export class Room {
  hostId = '';
  phase: 'lobby' | 'match' = 'lobby';
  bots = 0;
  difficulty: BotDifficulty = 'normal';
  sim: GameSimulation | null = null;
  radio: RadioState | null = null;

  private readonly players: RoomPlayer[] = [];
  private brains: BotBrain[] = [];
  private loop: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private lastWall = 0;
  private snapAcc = 0;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private readonly config: GameConfig;
  private readonly opts: Required<Omit<RoomOptions, 'config'>>;

  constructor(
    readonly code: string,
    private readonly onClose: (room: Room) => void,
    options: RoomOptions = {},
  ) {
    this.config = options.config ?? DEFAULT_CONFIG;
    this.opts = {
      lobbyDropMs: options.lobbyDropMs ?? 20_000,
      emptyCloseMs: options.emptyCloseMs ?? 60_000,
      endPauseMs: options.endPauseMs ?? 5_000,
      now: options.now ?? (() => performance.now()),
    };
  }

  get size(): number {
    return this.players.length;
  }

  // ------------------------------------------------------------------ lobby

  add(rawName: string, character: CharacterId, peer: Peer): JoinResult {
    if (this.phase === 'match') return { ok: false, error: 'A partida já começou nessa sala.' };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, error: 'Sala cheia (4 jogadores).' };
    const taken = new Set(this.players.map((p) => p.character));
    const pick = CHARACTER_IDS.includes(character) && !taken.has(character) ? character : CHARACTER_IDS.find((c) => !taken.has(c))!;
    const p: RoomPlayer = {
      id: `p${this.nextId++}`,
      name: sanitizeName(rawName),
      character: pick,
      ready: false,
      token: randomBytes(12).toString('hex'),
      peer,
      inputs: 0,
      inputWindow: 0,
      dropAt: 0,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.bots = Math.min(this.bots, MAX_PLAYERS - this.players.length);
    this.cancelEmptyClose();
    this.broadcastLobby();
    return { ok: true, code: this.code, playerId: p.id, token: p.token, lobby: this.lobby() };
  }

  /** Volta com o mesmo id (conexão caiu / página recarregou). */
  rejoin(token: string, peer: Peer): JoinResult {
    const p = this.players.find((q) => q.token === token);
    if (!p) return { ok: false, error: 'Não achei seu lugar nessa sala.' };
    p.peer = peer;
    p.dropAt = 0;
    this.cancelEmptyClose();
    this.broadcastLobby();
    if (this.phase === 'match' && this.sim) {
      peer.emit('match:start', { config: this.config, playerId: p.id, snapshot: this.sim.snapshotFor(p.id) });
    }
    return { ok: true, code: this.code, playerId: p.id, token: p.token, lobby: this.lobby() };
  }

  leave(id: string): void {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    // Saiu no meio da partida: o personagem fica parado (e pode ser eliminado).
    if (this.sim) this.sim.applyInput(p.id, { type: 'move', x: 0, y: 0 });
    this.afterDeparture();
  }

  disconnect(id: string): void {
    const p = this.players.find((q) => q.id === id);
    if (!p) return;
    p.peer = null;
    p.ready = false;
    if (this.sim) this.sim.applyInput(p.id, { type: 'move', x: 0, y: 0 });
    if (this.phase === 'lobby') {
      p.dropAt = this.opts.now() + this.opts.lobbyDropMs;
      setTimeout(() => {
        if (!p.peer && p.dropAt && this.opts.now() >= p.dropAt - 5 && this.phase === 'lobby') this.leave(p.id);
      }, this.opts.lobbyDropMs + 10);
    }
    this.afterDeparture();
  }

  private afterDeparture(): void {
    const connected = this.players.filter((p) => p.peer);
    if (!this.players.some((p) => p.id === this.hostId) || !this.players.find((p) => p.id === this.hostId)?.peer) {
      this.hostId = connected[0]?.id ?? this.players[0]?.id ?? '';
    }
    if (!connected.length) this.scheduleEmptyClose();
    this.broadcastLobby();
  }

  setReady(id: string, ready: boolean): void {
    const p = this.players.find((q) => q.id === id);
    if (!p || this.phase !== 'lobby') return;
    p.ready = !!ready;
    this.broadcastLobby();
  }

  setCharacter(id: string, character: CharacterId): Ack {
    const p = this.players.find((q) => q.id === id);
    if (!p || this.phase !== 'lobby') return { ok: false, error: 'Agora não dá para trocar.' };
    if (!CHARACTER_IDS.includes(character)) return { ok: false, error: 'Personagem inválido.' };
    if (this.players.some((q) => q !== p && q.character === character)) return { ok: false, error: 'Esse freguês já foi escolhido.' };
    p.character = character;
    this.broadcastLobby();
    return { ok: true };
  }

  settings(id: string, s: { bots?: number; difficulty?: BotDifficulty }): void {
    if (id !== this.hostId || this.phase !== 'lobby') return;
    if (typeof s.bots === 'number' && Number.isFinite(s.bots)) this.bots = Math.max(0, Math.min(MAX_PLAYERS - this.players.length, Math.floor(s.bots)));
    if (s.difficulty && s.difficulty in BOT_PROFILES) this.difficulty = s.difficulty;
    this.broadcastLobby();
  }

  /** Só o dono começa; todos os outros conectados precisam estar prontos; mínimo 2 participantes. */
  start(id: string): Ack {
    if (this.phase !== 'lobby') return { ok: false, error: 'A partida já está rolando.' };
    if (id !== this.hostId) return { ok: false, error: 'Só o dono da sala pode começar.' };
    const humans = this.players.filter((p) => p.peer);
    if (humans.some((p) => p.id !== this.hostId && !p.ready)) return { ok: false, error: 'Falta gente ficar pronta.' };
    const bots = Math.min(this.bots, MAX_PLAYERS - humans.length);
    if (humans.length + bots < 2) return { ok: false, error: 'Precisa de pelo menos 2 na arena (chame alguém ou adicione NPC).' };

    // Quem caiu antes de começar fica de fora.
    for (const p of this.players.filter((q) => !q.peer)) this.players.splice(this.players.indexOf(p), 1);
    const setups: PlayerSetup[] = this.players.map((p) => ({ id: p.id, name: p.name, character: p.character }));
    const free = CHARACTER_IDS.filter((c) => !this.players.some((p) => p.character === c));
    const seed = randomBytes(4).readUInt32LE(0);
    this.brains = [];
    for (let i = 0; i < bots; i++) {
      const character = free[i];
      const bid = `bot${i}`;
      setups.push({ id: bid, name: CHARACTER_INFO[character].name, character, isBot: true });
      this.brains.push(new BotBrain(bid, BOT_PROFILES[this.difficulty], this.config, seed + i));
    }
    this.sim = new GameSimulation(setups, this.config, (Math.random() * 2 ** 31) | 0);
    this.phase = 'match';
    for (const p of this.players) {
      p.peer?.emit('match:start', { config: this.config, playerId: p.id, snapshot: this.sim.snapshotFor(p.id) });
    }
    this.broadcastLobby();
    this.acc = 0;
    this.snapAcc = 0;
    this.lastWall = this.opts.now();
    this.loop = setInterval(() => this.tick(), 1000 / (SERVER_TICK_HZ * 2));
    return { ok: true };
  }

  input(id: string, input: PlayerInput): void {
    if (!this.sim || this.phase !== 'match') return;
    const p = this.players.find((q) => q.id === id);
    if (!p || !input || typeof input !== 'object' || typeof (input as { type?: unknown }).type !== 'string') return;
    const now = this.opts.now();
    if (now - p.inputWindow > 1000) {
      p.inputWindow = now;
      p.inputs = 0;
    }
    if (++p.inputs > INPUT_LIMIT_PER_S) return;
    this.sim.applyInput(id, input);
  }

  simNow(): number {
    return this.sim ? this.sim.now + Math.min(1000 / SERVER_TICK_HZ, this.opts.now() - this.lastWall) : -1;
  }

  // ------------------------------------------------------------------ partida

  /** Avança a simulação no ritmo do relógio real (passo fixo) e envia estado. Público para testes. */
  tick(): void {
    const sim = this.sim;
    if (!sim) return;
    const wall = this.opts.now();
    const elapsed = Math.min(250, wall - this.lastWall);
    this.lastWall = wall;
    this.acc += elapsed;
    this.snapAcc += elapsed;
    const step = 1000 / SERVER_TICK_HZ;
    const events: GameEvent[] = [];
    while (this.acc >= step) {
      for (const b of this.brains) for (const inp of b.think(sim.snapshotFor(b.id))) sim.applyInput(b.id, inp);
      const ev = sim.step(step);
      for (const b of this.brains) b.observe(ev);
      events.push(...ev);
      this.acc -= step;
    }
    if (events.length) {
      for (const p of this.players) {
        // "denied" só interessa a quem foi negado.
        const mine = events.filter((e) => e.type !== 'denied' || e.playerId === p.id);
        if (mine.length) p.peer?.emit('ev', mine);
      }
    }
    if (this.snapAcc >= 1000 / SNAPSHOT_HZ) {
      this.snapAcc = 0;
      for (const p of this.players) p.peer?.emit('snap', sim.snapshotFor(p.id));
    }
    if (sim.phase === 'ended' && !this.endTimer) {
      for (const p of this.players) p.peer?.emit('snap', sim.snapshotFor(p.id));
      for (const p of this.players) p.peer?.emit('match:end', sim.winnerId);
      this.endTimer = setTimeout(() => this.backToLobby(), this.opts.endPauseMs);
    }
  }

  private backToLobby(): void {
    this.stopLoop();
    this.endTimer = null;
    this.sim = null;
    this.brains = [];
    this.phase = 'lobby';
    for (const p of this.players.filter((q) => !q.peer)) this.players.splice(this.players.indexOf(p), 1);
    for (const p of this.players) p.ready = false;
    if (!this.players.some((p) => p.id === this.hostId)) this.hostId = this.players[0]?.id ?? '';
    if (!this.players.length) return this.close();
    this.broadcastLobby();
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Rádio do Zé: só o dono troca a música (vale no lobby e na partida). */
  setRadio(id: string, r: { id: string; title: string; pos: number } | null): void {
    if (id !== this.hostId) return;
    if (r === null) this.radio = null;
    else {
      if (!r || !isYoutubeId(r.id)) return;
      const pos = Number.isFinite(r.pos) ? Math.max(0, Math.min(36_000, r.pos)) : 0;
      const title = typeof r.title === 'string' ? r.title.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80) : '';
      this.radio = { id: r.id, title, startedAt: Date.now() - pos * 1000 };
    }
    this.broadcastLobby();
  }

  // ------------------------------------------------------------------ apoio

  lobby(): LobbyState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      bots: this.bots,
      difficulty: this.difficulty,
      radio: this.radio,
      serverTime: Date.now(),
      players: this.players.map((p) => ({ id: p.id, name: p.name, character: p.character, ready: p.ready, connected: !!p.peer, isBot: false })),
    };
  }

  private broadcastLobby(): void {
    const s = this.lobby();
    for (const p of this.players) p.peer?.emit('room:state', s);
  }

  private scheduleEmptyClose(): void {
    if (this.emptyTimer) return;
    this.emptyTimer = setTimeout(() => {
      if (!this.players.some((p) => p.peer)) this.close();
    }, this.opts.emptyCloseMs);
  }

  private cancelEmptyClose(): void {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  close(): void {
    this.stopLoop();
    this.cancelEmptyClose();
    if (this.endTimer) clearTimeout(this.endTimer);
    this.onClose(this);
  }
}
