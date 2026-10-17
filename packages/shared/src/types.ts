export type Rps = 'rock' | 'paper' | 'scissors';
export const RPS_LIST: readonly Rps[] = ['rock', 'paper', 'scissors'];

/** Personagem é só cosmético: todos jogam exatamente igual. */
export type CharacterId = 'fera' | 'principe' | 'panca' | 'sonolento';
export const CHARACTER_IDS: readonly CharacterId[] = ['fera', 'principe', 'panca', 'sonolento'];

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
  | { type: 'dash'; x?: number; y?: number }
  /** Beber a cerveja da mesa mais próxima (recupera vida). */
  | { type: 'drink' };

// ---------- Visão filtrada enviada a cada jogador ----------

export interface PlayerView {
  id: string;
  name: string;
  color: number;
  character: CharacterId;
  isBot: boolean;
  x: number;
  y: number;
  faceX: number;
  faceY: number;
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
  /** > agora enquanto está bebendo (público). */
  drinkingUntil: number;
  /** Lento por golpe final de Tesoura (público). */
  slowed: boolean;
  /** Tomou cachaça: cambaleando (público). */
  buzzed: boolean;
  /** Próximo golpe final turbinado pela cachaça (público). */
  boosted: boolean;
  /** Efeito do amendoim ativo (público). */
  nuts: boolean;
  /** Escudo de gelo do freezer (segura 1 golpe; público). */
  shielded: boolean;
  /** > agora enquanto abre o freezer (público). */
  openingUntil: number;
}

export type ItemKind = 'cachaca' | 'amendoim' | 'beer';
export interface ItemView {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
}
export interface PuddleView {
  id: number;
  x: number;
  y: number;
  r: number;
  until: number;
}
export type BarEventKind = 'saideira' | 'blackout' | 'ze';
export interface BarEventView {
  kind: BarEventKind;
  /** Aviso começa em announceAt; efeito entre startAt e endAt. */
  announceAt: number;
  startAt: number;
  endAt: number;
}
export interface WaiterView {
  x: number;
  y: number;
  faceX: number;
  faceY: number;
}

export interface BeerView {
  x: number;
  y: number;
  /** Instante em que a cerveja estará na mesa (≤ now = disponível). */
  readyAt: number;
}

export interface Snapshot {
  now: number;
  phase: Phase;
  phaseEndsAt: number;
  winnerId: string | null;
  players: PlayerView[];
  beers: BeerView[];
  items: ItemView[];
  puddles: PuddleView[];
  /** Índices (em config.obstacles) dos engradados quebrados: não bloqueiam mais. */
  broken: number[];
  /** Freezers: índice do obstáculo e quando dá para abrir de novo. */
  freezers: { index: number; readyAt: number }[];
  /** Evento do bar sorteado para a partida (null antes do aviso). */
  barEvent: BarEventView | null;
  waiter: WaiterView | null;
}

// ---------- Eventos (feedback; todos públicos) ----------

export type SignalKind = 'swap' | 'lock' | 'cancel';
export type DenyReason = 'busy' | 'range' | 'target' | 'focus' | 'locked' | 'limit' | 'phase' | 'cooldown' | 'full' | 'empty';
export type WhiffReason = 'range' | 'blocked' | 'gone';
export type ExchangeKind =
  | 'defenseless'
  | 'win'
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
  /** Golpe final (vencedor acertou o QTE): símbolo do vencedor, que define o efeito e a animação. */
  finisher: Rps | null;
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
  | { type: 'phase'; at: number; phase: Phase; winnerId: string | null }
  | { type: 'drink'; at: number; playerId: string; stage: 'start' | 'done' | 'spilled'; hp: number }
  | { type: 'pickup'; at: number; playerId: string; kind: ItemKind; x: number; y: number }
  | { type: 'burn'; at: number; playerId: string; x: number; y: number }
  | { type: 'crate'; at: number; index: number; broken: boolean }
  | { type: 'shield'; at: number; playerId: string; stage: 'start' | 'ready' | 'broken' | 'interrupted' }
  | { type: 'barEvent'; at: number; kind: BarEventKind; stage: 'announce' | 'start' | 'end' }
  | { type: 'waiterBump'; at: number; playerId: string; x: number; y: number };
