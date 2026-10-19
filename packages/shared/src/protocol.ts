import type { BotDifficulty } from './bot';
import type { GameConfig } from './config';
import type { CharacterId, GameEvent, PlayerInput, Snapshot } from './types';

/** Protocolo Socket.IO entre cliente e servidor (Etapa 2). O cliente só manda intenções. */

export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
/** Frequência da simulação no servidor e de envio de snapshots. */
export const SERVER_TICK_HZ = 30;
export const SNAPSHOT_HZ = 20;

export interface LobbyPlayer {
  id: string;
  name: string;
  character: CharacterId;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
}

/** Rádio do Zé (YouTube): o que está tocando na sala. Só o dono troca; todos ouvem a mesma, no mesmo ponto. */
export interface RadioState {
  /** Id do vídeo do YouTube (11 caracteres). */
  id: string;
  title: string;
  /** Instante (relógio do servidor, ms) em que a música estaria no segundo 0. */
  startedAt: number;
}

export interface LobbyState {
  code: string;
  hostId: string;
  phase: 'lobby' | 'match';
  players: LobbyPlayer[];
  /** NPCs que completam a mesa ao começar (0–3, limitado ao espaço livre). */
  bots: number;
  difficulty: BotDifficulty;
  /** null = rádio desligada pelo dono. */
  radio: RadioState | null;
  /** Relógio do servidor (ms) quando este estado saiu — para o cliente achar o ponto da música. */
  serverTime: number;
}

export interface JoinOk {
  ok: true;
  code: string;
  playerId: string;
  /** Guardar para reconectar (mesmo id) se a conexão cair ou a página recarregar. */
  token: string;
  lobby: LobbyState;
}
export interface Fail {
  ok: false;
  error: string;
}
export type JoinResult = JoinOk | Fail;
export type Ack = { ok: true } | Fail;

export interface MatchStart {
  config: GameConfig;
  playerId: string;
  /** Snapshot inicial já filtrado para este jogador. */
  snapshot: Snapshot;
}

export interface ClientToServer {
  'room:create': (p: { name: string; character: CharacterId }, ack: (r: JoinResult) => void) => void;
  'room:join': (p: { code: string; name: string; character: CharacterId }, ack: (r: JoinResult) => void) => void;
  'room:rejoin': (p: { code: string; token: string }, ack: (r: JoinResult) => void) => void;
  'room:leave': () => void;
  'room:ready': (ready: boolean) => void;
  'room:character': (character: CharacterId, ack: (r: Ack) => void) => void;
  'room:settings': (p: { bots?: number; difficulty?: BotDifficulty }) => void;
  'room:start': (ack: (r: Ack) => void) => void;
  /** Só o dono: troca a música (`pos` = segundo em que está agora) ou desliga (null). */
  'room:radio': (r: { id: string; title: string; pos: number } | null) => void;
  input: (input: PlayerInput) => void;
  /** Sincronia de relógio: devolve o tempo da simulação no servidor (ou -1 fora de partida). */
  ping: (ack: (simNow: number) => void) => void;
}

export interface ServerToClient {
  'room:state': (s: LobbyState) => void;
  'match:start': (m: MatchStart) => void;
  snap: (s: Snapshot) => void;
  ev: (e: GameEvent[]) => void;
  'match:end': (winnerId: string | null) => void;
}

/** Id de vídeo do YouTube válido? */
export function isYoutubeId(id: unknown): boolean {
  return typeof id === 'string' && /^[\w-]{11}$/.test(id);
}

/** Limpa apelido vindo da rede. */
export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Jogador';
}
