import { io, type Socket } from 'socket.io-client';
import type { Ack, BotDifficulty, CharacterId, ClientToServer, JoinResult, LobbyState, MatchStart, ServerToClient } from '@ppt/shared';

type ClientSocket = Socket<ServerToClient, ClientToServer>;

const SESSION_KEY = 'ppt.session';

interface Session {
  code: string;
  token: string;
  playerId: string;
}

export interface OnlineHandlers {
  lobby(s: LobbyState | null): void;
  matchStart(m: MatchStart): void;
  matchEnd(winnerId: string | null): void;
  connection(state: 'online' | 'offline' | 'reconnecting'): void;
}

/**
 * Conexão com o servidor fora da partida: criar/entrar na sala, lobby, prontos e reconexão.
 * Em desenvolvimento o Vite repassa /socket.io para o servidor (porta 3001); em produção é a mesma origem.
 */
export class OnlineClient {
  readonly socket: ClientSocket;
  lobbyState: LobbyState | null = null;
  playerId: string | null = null;
  private session: Session | null = load();

  constructor(private readonly h: OnlineHandlers) {
    this.socket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    this.socket.on('connect', () => {
      h.connection('online');
      // Voltou (rede caiu ou página recarregou): tenta retomar o mesmo lugar.
      if (this.session) this.rejoin();
    });
    this.socket.on('disconnect', () => h.connection(this.session ? 'reconnecting' : 'offline'));
    this.socket.on('room:state', (s) => {
      this.lobbyState = s;
      h.lobby(s);
    });
    this.socket.on('match:start', (m) => h.matchStart(m));
    this.socket.on('match:end', (w) => h.matchEnd(w));
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  get isHost(): boolean {
    return !!this.lobbyState && this.lobbyState.hostId === this.playerId;
  }

  async create(name: string, character: CharacterId): Promise<JoinResult> {
    return this.enter(await this.socket.timeout(5000).emitWithAck('room:create', { name, character }).catch(netFail));
  }

  async join(code: string, name: string, character: CharacterId): Promise<JoinResult> {
    return this.enter(await this.socket.timeout(5000).emitWithAck('room:join', { code, name, character }).catch(netFail));
  }

  private async rejoin(): Promise<void> {
    const s = this.session!;
    const r = await this.socket.timeout(5000).emitWithAck('room:rejoin', { code: s.code, token: s.token }).catch(netFail);
    if (!r.ok) {
      this.forget();
      this.h.lobby(null);
      return;
    }
    this.enter(r);
  }

  private enter(r: JoinResult): JoinResult {
    if (r.ok) {
      this.playerId = r.playerId;
      this.lobbyState = r.lobby;
      this.session = { code: r.code, token: r.token, playerId: r.playerId };
      save(this.session);
      this.h.lobby(r.lobby);
    }
    return r;
  }

  leave(): void {
    this.socket.emit('room:leave');
    this.forget();
    this.h.lobby(null);
  }

  private forget(): void {
    this.session = null;
    this.lobbyState = null;
    this.playerId = null;
    save(null);
  }

  ready(v: boolean): void {
    this.socket.emit('room:ready', v);
  }

  character(c: CharacterId): Promise<Ack> {
    return this.socket.timeout(5000).emitWithAck('room:character', c).catch(netFail);
  }

  settings(s: { bots?: number; difficulty?: BotDifficulty }): void {
    this.socket.emit('room:settings', s);
  }

  start(): Promise<Ack> {
    return this.socket.timeout(5000).emitWithAck('room:start').catch(netFail);
  }
}

function netFail(): { ok: false; error: string } {
  return { ok: false, error: 'Sem resposta do servidor. Ele está rodando? (npm run dev)' };
}

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function save(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem armazenamento: só não reconecta após recarregar */
  }
}
