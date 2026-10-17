import type { Socket } from 'socket.io-client';
import {
  SNAPSHOT_HZ,
  type ClientToServer,
  type GameConfig,
  type GameEvent,
  type MatchStart,
  type PlayerInput,
  type ServerToClient,
  type Snapshot,
} from '@ppt/shared';
import type { GameConnection } from './connection';

type ClientSocket = Socket<ServerToClient, ClientToServer>;

/** Atraso de interpolação: desenha o mundo um pouquinho no passado para o movimento ficar liso entre snapshots. */
const INTERP_MS = Math.round((1000 / SNAPSHOT_HZ) * 2);
const PING_EVERY_MS = 1000;

/**
 * Partida online: o servidor é a autoridade. Aqui só enviamos intenções, sincronizamos o relógio
 * (para o anel do QTE e o "PÔ!" baterem com o servidor) e interpolamos posições entre snapshots.
 */
export class SocketConnection implements GameConnection {
  readonly localPlayerId: string;
  readonly config: GameConfig;
  private readonly buffer: Snapshot[] = [];
  private readonly listeners = new Set<(e: GameEvent[]) => void>();
  /** tempo do servidor ≈ performance.now() + offset */
  private offset = 0;
  private offsetReady = false;
  private samples: { rtt: number; off: number }[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onSnap = (s: Snapshot) => this.push(s);
  private readonly onEv = (e: GameEvent[]) => this.listeners.forEach((cb) => cb(e));
  /** Último RTT medido (ms), para mostrar no HUD. */
  rtt = 0;

  constructor(
    private readonly socket: ClientSocket,
    start: MatchStart,
  ) {
    this.localPlayerId = start.playerId;
    this.config = start.config;
    this.push(start.snapshot);
    this.offset = start.snapshot.now - performance.now();
  }

  start(): void {
    this.socket.on('snap', this.onSnap);
    this.socket.on('ev', this.onEv);
    this.ping();
    this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
  }

  destroy(): void {
    this.socket.off('snap', this.onSnap);
    this.socket.off('ev', this.onEv);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.listeners.clear();
  }

  now(): number {
    return performance.now() + this.offset;
  }

  send(input: PlayerInput): void {
    // A confirmação leva o instante em que o jogador apertou, no relógio do servidor.
    const msg = input.type === 'symbol' ? { ...input, at: this.now() } : input;
    this.socket.emit('input', msg);
  }

  onEvents(cb: (events: GameEvent[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Snapshot mais recente, com posições interpoladas no tempo (agora − INTERP_MS). */
  latest(): Snapshot | null {
    const last = this.buffer[this.buffer.length - 1];
    if (!last) return null;
    const t = this.now() - INTERP_MS;
    let a = this.buffer[0];
    let b = last;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].now <= t && this.buffer[i + 1].now >= t) {
        a = this.buffer[i];
        b = this.buffer[i + 1];
        break;
      }
    }
    if (t >= last.now) a = b = last;
    const k = b.now > a.now ? Math.max(0, Math.min(1, (t - a.now) / (b.now - a.now))) : 1;
    return {
      ...last,
      players: last.players.map((p) => {
        const pa = a.players.find((q) => q.id === p.id) ?? p;
        const pb = b.players.find((q) => q.id === p.id) ?? p;
        return {
          ...p,
          x: pa.x + (pb.x - pa.x) * k,
          y: pa.y + (pb.y - pa.y) * k,
          faceX: pa.faceX + (pb.faceX - pa.faceX) * k,
          faceY: pa.faceY + (pb.faceY - pa.faceY) * k,
        };
      }),
    };
  }

  private push(s: Snapshot): void {
    const last = this.buffer[this.buffer.length - 1];
    if (last && s.now < last.now) return;
    this.buffer.push(s);
    if (this.buffer.length > 12) this.buffer.shift();
    // Sem medição de ping ainda: usa o snapshot como referência grosseira.
    if (!this.offsetReady) this.offset = s.now - performance.now();
  }

  /** Sincronia de relógio: guarda as últimas amostras e usa a de menor RTT (a mais confiável). */
  private ping(): void {
    const t0 = performance.now();
    this.socket.emit('ping', (simNow) => {
      const t1 = performance.now();
      if (simNow < 0) return;
      const rtt = t1 - t0;
      this.rtt = rtt;
      this.samples.push({ rtt, off: simNow + rtt / 2 - t1 });
      if (this.samples.length > 8) this.samples.shift();
      const best = this.samples.reduce((x, y) => (y.rtt < x.rtt ? y : x));
      // Suaviza para não "pular" o anel do QTE.
      this.offset = this.offsetReady ? this.offset + (best.off - this.offset) * 0.3 : best.off;
      this.offsetReady = true;
    });
  }
}
