import type { GameConfig, GameEvent, PlayerInput, Snapshot } from '@ppt/shared';

/**
 * O que a cena do jogo precisa de quem hospeda a partida.
 * Etapa 1: LocalConnection (simulação no navegador + NPCs).
 * Etapa 2: SocketConnection (servidor autoritativo via Socket.IO), com a mesma interface.
 */
export interface GameConnection {
  readonly localPlayerId: string;
  readonly config: GameConfig;
  /** Tempo estimado da simulação agora (para animar anéis de QTE). */
  now(): number;
  latest(): Snapshot | null;
  send(input: PlayerInput): void;
  onEvents(cb: (events: GameEvent[]) => void): () => void;
  start(): void;
  destroy(): void;
}
