export type Rps = 'rock' | 'paper' | 'scissors';
export const RPS_LIST: readonly Rps[] = ['rock', 'paper', 'scissors'];

export type Grade = 'perfect' | 'good' | 'fail';
export type Phase = 'countdown' | 'playing' | 'ended';

// ---------- Entradas (intenções do cliente; nunca resultados) ----------

export type PlayerInput =
  | { type: 'move'; x: number; y: number }
  /** Sem mão: inicia ataque contra targetId. Com mão destravada: troca de símbolo. */
  | { type: 'symbol'; symbol: Rps; targetId?: string }
  /** Última Palavra: trava a mão. `at` = instante (tempo da simulação) em que o jogador apertou. */
  | { type: 'commit'; at?: number }
  | { type: 'cancel' }
  | { type: 'feint' }
  | { type: 'dash'; x?: number; y?: number };

// ---------- Visão filtrada enviada a cada jogador ----------

export interface PlayerView {
  id: string;
  name: string;
  color: number;
  isBot: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  focus: number;
  alive: boolean;
  /** Tem um símbolo em mãos (ataque ativo). Público. */
  holding: boolean;
  locked: boolean;
  /** Só preenchido na visão do próprio jogador. */
  symbol: Rps | null;
  targetId: string | null;
  impactAt: number | null;
  clashWith: string | null;
  stunned: boolean;
  busy: boolean;
  graceUntil: number;
  dashReadyAt: number;
  /** Só preenchido na visão do próprio jogador. */
  swapsLeft: number | null;
}

export interface Snapshot {
  now: number;
  phase: Phase;
  phaseEndsAt: number;
  winnerId: string | null;
  players: PlayerView[];
}

// ---------- Eventos (feedback; todos públicos) ----------

export type SignalKind = 'swap' | 'lock' | 'cancel';
export type DenyReason = 'busy' | 'range' | 'target' | 'focus' | 'locked' | 'limit' | 'phase' | 'cooldown';
export type WhiffReason = 'range' | 'blocked' | 'gone';
export type ExchangeKind =
  | 'defenseless'
  | 'win'
  | 'wasted'
  | 'clank'
  | 'tie-stagger'
  | 'fumble'
  | 'both-fumble';

export interface ExchangeEvent {
  type: 'exchange';
  at: number;
  attackerId: string;
  defenderId: string;
  duel: boolean;
  attackerSymbol: Rps;
  defenderSymbol: Rps | null;
  attackerGrade: Grade;
  defenderGrade: Grade | null;
  kind: ExchangeKind;
  winnerId: string | null;
  damagedId: string | null;
  protectedId: string | null;
  staggeredId: string | null;
  x: number;
  y: number;
}

export type GameEvent =
  | { type: 'signal'; at: number; playerId: string; kind: SignalKind }
  | { type: 'attackStart'; at: number; attackerId: string; targetId: string; impactAt: number }
  | { type: 'duel'; at: number; a: string; b: string; impactAt: number }
  | { type: 'denied'; at: number; playerId: string; reason: DenyReason }
  | { type: 'whiff'; at: number; playerIds: string[]; targetId: string; reason: WhiffReason }
  | ExchangeEvent
  | { type: 'eliminated'; at: number; playerId: string; byId: string | null }
  | { type: 'phase'; at: number; phase: Phase; winnerId: string | null };
