export type Rps = 'rock' | 'paper' | 'scissors';
export const RPS_LIST: readonly Rps[] = ['rock', 'paper', 'scissors'];

/** Personagem é só cosmético: todos jogam exatamente igual. */
export type CharacterId = 'fera' | 'principe' | 'panca' | 'sonolento';
export const CHARACTER_IDS: readonly CharacterId[] = ['fera', 'principe', 'panca', 'sonolento'];

/**
 * Nota do símbolo no Jo-Ken-Pô (v0.11, "malandragem"):
 * `good` = botou cedo (antes do verde: o outro vê e pode virar) · `perfect` = no verde (PÔ!)
 * · `caught` = no vermelho (pego roubando: apanha) · `fail` = não botou nada (apanha de quem botou).
 */
export type Grade = 'perfect' | 'good' | 'caught' | 'fail';
export type Phase = 'countdown' | 'playing' | 'ended';

// ---------- Entradas (intenções do cliente; nunca resultados) ----------

export type PlayerInput =
  | { type: 'move'; x: number; y: number }
  /** Espaço: desafia `targetId` para um Jo-Ken-Pô (1 contra 1; os dois entram no duelo). */
  | { type: 'challenge'; targetId: string }
  /** Durante o duelo: bota o símbolo (uma vez só, aparece na hora para todos). `at` = instante em que apertou. */
  | { type: 'symbol'; symbol: Rps; at?: number }
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
  /** Está num duelo (Jo-Ken-Pô). Público. */
  holding: boolean;
  /** Já botou o símbolo neste duelo. */
  locked: boolean;
  /** Símbolo que botou (público: quem bota aparece na hora — é aí que o malandro lê). */
  symbol: Rps | null;
  /** Instante em que botou (para a barra e para os NPCs). */
  pickedAt: number | null;
  /** Adversário do duelo. */
  targetId: string | null;
  /** Instante do PÔ! (centro da faixa verde). */
  impactAt: number | null;
  /** Quem chamou o duelo. */
  challenger: boolean;
  stunned: boolean;
  busy: boolean;
  graceUntil: number;
  dashReadyAt: number;
  /** > agora enquanto está bebendo (público). */
  drinkingUntil: number;
  /** Lento por golpe final de Tesoura (público). */
  slowed: boolean;
  /** Escudo de gelo do freezer (segura 1 golpe; público). */
  shielded: boolean;
  /** > agora enquanto abre o freezer (público). */
  openingUntil: number;
}

/** Só a cerveja do chão (evento do Zé). Cachaça e amendoim foram removidos na v0.7. */
export type ItemKind = 'beer';
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

export type DenyReason = 'busy' | 'range' | 'target' | 'focus' | 'locked' | 'phase' | 'cooldown' | 'full' | 'empty' | 'engaged' | 'grace' | 'noduel';
export type WhiffReason = 'range' | 'blocked' | 'gone';
export type ExchangeKind =
  | 'defenseless'
  | 'win'
  | 'clank'
  | 'tie-stagger'
  | 'both-fumble'
  /** Um dos dois botou no vermelho: pego roubando, apanha. */
  | 'caught'
  /** Os dois roubaram: o Zé anula e os dois cambaleiam. */
  | 'both-caught';

export interface ExchangeEvent {
  type: 'exchange';
  at: number;
  attackerId: string;
  defenderId: string;
  duel: boolean;
  /** null = não botou nada (ou o símbolo não valeu por ter roubado: veja a nota). */
  attackerSymbol: Rps | null;
  defenderSymbol: Rps | null;
  attackerGrade: Grade;
  defenderGrade: Grade;
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
  | { type: 'duel'; at: number; a: string; b: string; impactAt: number }
  /** Alguém botou o símbolo (público; a nota já sai aqui: cedo/verde/vermelho). */
  | { type: 'pick'; at: number; playerId: string; symbol: Rps; grade: Grade }
  | { type: 'denied'; at: number; playerId: string; reason: DenyReason }
  | { type: 'whiff'; at: number; playerIds: string[]; targetId: string; reason: WhiffReason }
  | ExchangeEvent
  | { type: 'eliminated'; at: number; playerId: string; byId: string | null }
  | { type: 'phase'; at: number; phase: Phase; winnerId: string | null }
  | { type: 'drink'; at: number; playerId: string; stage: 'start' | 'done' | 'spilled'; hp: number }
  | { type: 'pickup'; at: number; playerId: string; kind: ItemKind; x: number; y: number }
  | { type: 'burn'; at: number; playerId: string; x: number; y: number }
  | { type: 'crate'; at: number; index: number; broken: boolean }
  | { type: 'shield'; at: number; playerId: string; stage: 'start' | 'ready' | 'broken' | 'interrupted' | 'expired' }
  | { type: 'barEvent'; at: number; kind: BarEventKind; stage: 'announce' | 'start' | 'end' }
  | { type: 'waiterBump'; at: number; playerId: string; x: number; y: number };
