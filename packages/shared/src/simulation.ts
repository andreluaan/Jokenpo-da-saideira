import { DEFAULT_CONFIG, type GameConfig } from './config';
import { clamp, clampInArena, dist, lineBlocked, normalize, pushOutOfObstacle } from './geometry';
import { gradeLock, resolveExchange } from './rules';
import { CHARACTER_IDS } from './types';
import type {
  CharacterId,
  DenyReason,
  ExchangeEvent,
  GameEvent,
  Phase,
  PlayerInput,
  PlayerView,
  Rps,
  Snapshot,
  WhiffReason,
} from './types';

export const PLAYER_COLORS = [0x3b9be8, 0xa35ce0, 0xf2a93b, 0x3dbf7a];

export interface PlayerSetup {
  id: string;
  name: string;
  isBot?: boolean;
  character?: CharacterId;
}

interface Attack {
  symbol: Rps;
  targetId: string;
  startedAt: number;
  impactAt: number;
  lockedAt: number | null;
  swaps: number;
  clashWith: string | null;
}

interface Player {
  id: string;
  name: string;
  color: number;
  character: CharacterId;
  isBot: boolean;
  x: number;
  y: number;
  moveX: number;
  moveY: number;
  faceX: number;
  faceY: number;
  /** Velocidade de caminhada (px/ms), com inércia. */
  vx: number;
  vy: number;
  /** Velocidade de empurrão em px/ms, decai exponencialmente. */
  kbX: number;
  kbY: number;
  hp: number;
  focus: number;
  alive: boolean;
  attack: Attack | null;
  busyUntil: number;
  stunUntil: number;
  graceUntil: number;
  dashUntil: number;
  dashReadyAt: number;
  dashX: number;
  dashY: number;
}

export type PlayerDebugState = Readonly<Player>;

/**
 * Simulação autoritativa de uma partida. Pura: não sabe nada de rede nem de renderização.
 * Quem hospeda (navegador na Etapa 1, servidor na Etapa 2) chama applyInput() e step().
 */
export class GameSimulation {
  readonly config: GameConfig;
  now = 0;
  phase: Phase = 'countdown';
  phaseEndsAt: number;
  winnerId: string | null = null;

  private readonly players: Player[] = [];
  private readonly byId = new Map<string, Player>();
  private events: GameEvent[] = [];

  constructor(setups: PlayerSetup[], config: GameConfig = DEFAULT_CONFIG) {
    if (setups.length < 2 || setups.length > 4) throw new Error('A partida precisa de 2 a 4 jogadores');
    this.config = config;
    // Quem não escolheu personagem recebe um livre, na ordem padrão.
    const taken = new Set(setups.map((s) => s.character).filter(Boolean));
    const free = CHARACTER_IDS.filter((c) => !taken.has(c));
    setups.forEach((s, i) => {
      const character = s.character ?? free.shift() ?? CHARACTER_IDS[i % CHARACTER_IDS.length];
      const spawn = config.spawns[i % config.spawns.length];
      const face = normalize(config.arena.cx - spawn.x, config.arena.cy - spawn.y);
      const p: Player = {
        id: s.id,
        name: s.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        character,
        isBot: !!s.isBot,
        x: spawn.x,
        y: spawn.y,
        moveX: 0,
        moveY: 0,
        faceX: face.x,
        faceY: face.y,
        vx: 0,
        vy: 0,
        kbX: 0,
        kbY: 0,
        hp: config.player.maxHp,
        focus: config.player.startFocus,
        alive: true,
        attack: null,
        busyUntil: 0,
        stunUntil: 0,
        graceUntil: 0,
        dashUntil: 0,
        dashReadyAt: 0,
        dashX: 0,
        dashY: 0,
      };
      this.players.push(p);
      this.byId.set(p.id, p);
    });
    this.phaseEndsAt = config.match.countdownMs;
  }

  get playerIds(): string[] {
    return this.players.map((p) => p.id);
  }

  // ------------------------------------------------------------------ entradas

  applyInput(playerId: string, input: PlayerInput): void {
    const p = this.byId.get(playerId);
    if (!p) return;
    if (input.type === 'move') {
      const n = normalize(Number(input.x) || 0, Number(input.y) || 0);
      p.moveX = n.x;
      p.moveY = n.y;
      return;
    }
    if (this.phase !== 'playing' || !p.alive) return this.deny(p, 'phase');

    switch (input.type) {
      case 'symbol':
        return p.attack ? this.swap(p, input.symbol) : this.startAttack(p, input.symbol, input.targetId);
      case 'commit':
        return this.commit(p, input.at);
      case 'feint':
        return this.feint(p);
      case 'cancel':
        return this.cancel(p);
      case 'dash':
        return this.dash(p, input.x, input.y);
    }
  }

  private startAttack(p: Player, symbol: Rps, targetId: string | undefined): void {
    if (!isRps(symbol)) return;
    const now = this.now;
    if (now < p.busyUntil || now < p.stunUntil || now < p.dashUntil) return this.deny(p, 'busy');
    const t = targetId ? this.byId.get(targetId) : undefined;
    if (!t || t === p || !t.alive) return this.deny(p, 'target');

    const respondingTo = t.attack && t.attack.targetId === p.id ? t.attack : null;
    const range = this.config.attack.engageRange + (respondingTo ? 60 : 0);
    if (dist(p.x, p.y, t.x, t.y) > range) return this.deny(p, 'range');

    const attack: Attack = {
      symbol,
      targetId: t.id,
      startedAt: now,
      impactAt: now + this.config.attack.windupMs,
      lockedAt: null,
      swaps: 0,
      clashWith: null,
    };
    p.attack = attack;

    if (respondingTo && respondingTo.impactAt - now >= this.config.attack.responseCutoffMs) {
      const T = Math.max(respondingTo.impactAt, now + this.config.attack.minResponseMs);
      respondingTo.impactAt = T;
      respondingTo.clashWith = p.id;
      attack.impactAt = T;
      attack.clashWith = t.id;
      this.emit({ type: 'duel', at: now, a: t.id, b: p.id, impactAt: T });
    } else {
      this.emit({ type: 'attackStart', at: now, attackerId: p.id, targetId: t.id, impactAt: attack.impactAt });
    }
  }

  private swap(p: Player, symbol: Rps): void {
    const atk = p.attack!;
    if (!isRps(symbol) || symbol === atk.symbol) return;
    if (atk.lockedAt !== null) return this.deny(p, 'locked');
    if (atk.swaps >= this.config.costs.maxSwaps) return this.deny(p, 'limit');
    if (p.focus < this.config.costs.swap) return this.deny(p, 'focus');
    p.focus -= this.config.costs.swap;
    atk.swaps++;
    atk.symbol = symbol;
    this.emit({ type: 'signal', at: this.now, playerId: p.id, kind: 'swap' });
  }

  /** Finta: sinal idêntico ao da troca, mesmo custo, símbolo não muda. */
  private feint(p: Player): void {
    const atk = p.attack;
    if (!atk) return this.deny(p, 'busy');
    if (atk.lockedAt !== null) return this.deny(p, 'locked');
    if (atk.swaps >= this.config.costs.maxSwaps) return this.deny(p, 'limit');
    if (p.focus < this.config.costs.feint) return this.deny(p, 'focus');
    p.focus -= this.config.costs.feint;
    atk.swaps++;
    this.emit({ type: 'signal', at: this.now, playerId: p.id, kind: 'swap' });
  }

  private cancel(p: Player): void {
    const atk = p.attack;
    if (!atk) return;
    if (atk.lockedAt !== null) return this.deny(p, 'locked');
    if (p.focus < this.config.costs.cancel) return this.deny(p, 'focus');
    p.focus -= this.config.costs.cancel;
    this.consume(p, this.config.timings.cancelMs);
    this.emit({ type: 'signal', at: this.now, playerId: p.id, kind: 'cancel' });
  }

  /** Última Palavra: trava a mão. */
  private commit(p: Player, at: number | undefined): void {
    const atk = p.attack;
    if (!atk) return;
    if (atk.lockedAt !== null) return;
    const { qte, attack } = this.config;
    const pressedAt = clamp(Number.isFinite(at) ? (at as number) : this.now, this.now - qte.maxRewindMs, this.now + 34);
    atk.lockedAt = pressedAt;
    this.emit({ type: 'signal', at: this.now, playerId: p.id, kind: 'lock' });
    // Confirmar cedo num ataque simples acelera o impacto.
    if (!atk.clashWith && pressedAt < atk.impactAt - qte.leadMs) {
      const remaining = atk.impactAt - this.now;
      atk.impactAt = this.now + Math.max(attack.minAfterLockMs, remaining * attack.earlyLockSpeedup);
    }
  }

  private dash(p: Player, x?: number, y?: number): void {
    const now = this.now;
    if (p.attack) return this.deny(p, 'busy');
    if (now < p.stunUntil || now < p.dashUntil) return this.deny(p, 'busy');
    if (now < p.dashReadyAt) return this.deny(p, 'cooldown');
    if (p.focus < this.config.costs.dash) return this.deny(p, 'focus');
    let dir = normalize(x ?? 0, y ?? 0);
    if (dir.x === 0 && dir.y === 0) dir = normalize(p.moveX, p.moveY);
    if (dir.x === 0 && dir.y === 0) dir = { x: p.faceX, y: p.faceY };
    p.focus -= this.config.costs.dash;
    p.dashX = dir.x;
    p.dashY = dir.y;
    p.dashUntil = now + this.config.dash.durationMs;
    p.dashReadyAt = now + this.config.dash.cooldownMs;
  }

  // ------------------------------------------------------------------ passo

  step(dtMs: number): GameEvent[] {
    this.now += dtMs;
    if (this.phase === 'countdown' && this.now >= this.phaseEndsAt) {
      this.phase = 'playing';
      this.phaseEndsAt = this.now + this.config.match.durationMs;
      this.emit({ type: 'phase', at: this.now, phase: 'playing', winnerId: null });
    }
    if (this.phase === 'playing') {
      this.integrate(dtMs);
      this.resolveDue();
      this.checkEnd();
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  private integrate(dt: number): void {
    const { player, knockback, dash, arena, obstacles } = this.config;
    const decay = Math.exp(-dt / knockback.tauMs);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (this.now - dt < p.dashUntil) {
        const v = dash.distance / dash.durationMs;
        p.vx = p.dashX * v;
        p.vy = p.dashY * v;
      } else {
        // Inércia: acelera até a velocidade desejada; ao soltar (ou atordoado) escorrega até parar.
        const stunned = this.now < p.stunUntil;
        const speed = stunned ? 0 : (player.speed / 1000) * (p.attack ? player.holdingSpeedMul : 1);
        const tx = p.moveX * speed;
        const ty = p.moveY * speed;
        const dvx = tx - p.vx;
        const dvy = ty - p.vy;
        const dv = Math.hypot(dvx, dvy);
        const speeding = tx * tx + ty * ty >= p.vx * p.vx + p.vy * p.vy;
        const maxStep = ((speeding ? player.accel : player.decel) / 1e6) * dt;
        if (dv <= maxStep) {
          p.vx = tx;
          p.vy = ty;
        } else {
          p.vx += (dvx / dv) * maxStep;
          p.vy += (dvy / dv) * maxStep;
        }
      }
      const vx = p.vx + p.kbX;
      const vy = p.vy + p.kbY;
      p.kbX *= decay;
      p.kbY *= decay;
      p.x += vx * dt;
      p.y += vy * dt;

      for (const o of obstacles) {
        const pos = pushOutOfObstacle(p.x, p.y, player.radius, o);
        p.x = pos.x;
        p.y = pos.y;
      }
      const inside = clampInArena(p.x, p.y, player.radius, arena);
      if (inside.x !== p.x || inside.y !== p.y) {
        // Bateu na cerca: perde o embalo.
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
      p.x = inside.x;
      p.y = inside.y;

      const target = p.attack ? this.byId.get(p.attack.targetId) : undefined;
      const face = target ? normalize(target.x - p.x, target.y - p.y) : normalize(p.moveX, p.moveY);
      if (face.x !== 0 || face.y !== 0) {
        p.faceX = face.x;
        p.faceY = face.y;
      }
      if (!p.attack) p.focus = Math.min(player.maxFocus, p.focus + (player.focusRegen * dt) / 1000);
    }

    // Separação entre jogadores.
    const minD = player.radius * 2;
    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.players.length; j++) {
        const b = this.players[j];
        if (!b.alive) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < minD) {
          const n = d > 1e-6 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
          const push = (minD - d) / 2;
          a.x -= n.x * push;
          a.y -= n.y * push;
          b.x += n.x * push;
          b.y += n.y * push;
        }
      }
    }
  }

  private resolveDue(): void {
    const late = this.config.qte.lateMs;
    const due = this.players
      .filter((p) => p.alive && p.attack && this.now >= p.attack.impactAt + late)
      .sort((a, b) => a.attack!.impactAt - b.attack!.impactAt || (a.id < b.id ? -1 : 1));
    for (const x of due) {
      if (!x.alive || !x.attack || this.now < x.attack.impactAt + late) continue;
      this.resolveAttack(x);
    }
  }

  private resolveAttack(x: Player): void {
    const atk = x.attack!;
    const y = this.byId.get(atk.targetId)!;
    const T = atk.impactAt;
    const { timings, knockback, qte } = this.config;
    const duel = y.alive && atk.clashWith === y.id && y.attack?.clashWith === x.id;

    if (!y.alive) return this.whiff([x], y, 'gone');
    if (dist(x.x, x.y, y.x, y.y) > this.config.attack.hitRange) return this.whiff(duel ? [x, y] : [x], y, 'range');
    if (lineBlocked(x.x, x.y, y.x, y.y, this.config.obstacles)) {
      return this.whiff(duel ? [x, y] : [x], y, 'blocked');
    }

    const aGrade = gradeLock(atk.lockedAt, T, qte);
    const yAtk = y.attack;
    const bGrade = yAtk ? gradeLock(yAtk.lockedAt, T, qte) : null;
    const r = resolveExchange({ symbol: atk.symbol, grade: aGrade }, { symbol: yAtk?.symbol ?? null, grade: bGrade });

    const ev: ExchangeEvent = {
      type: 'exchange',
      at: this.now,
      attackerId: x.id,
      defenderId: y.id,
      duel,
      attackerSymbol: atk.symbol,
      defenderSymbol: yAtk?.symbol ?? null,
      attackerGrade: aGrade,
      defenderGrade: bGrade,
      kind: r.kind,
      winnerId: null,
      damagedId: null,
      protectedId: null,
      staggeredId: null,
      x: (x.x + y.x) / 2,
      y: (x.y + y.y) / 2,
    };
    this.emit(ev);

    // O ataque de X sempre termina aqui; o de Y só se for duelo (defensor que vence mantém a ação).
    const recovery = r.kind === 'fumble' || r.kind === 'both-fumble' ? timings.whiffMs : timings.afterResolveMs;
    this.consume(x, recovery);
    if (duel) this.consume(y, recovery);

    switch (r.kind) {
      case 'defenseless':
      case 'win': {
        const winner = r.winner === 'a' ? x : y;
        const loser = winner === x ? y : x;
        ev.winnerId = winner.id;
        if (r.strong) winner.focus = Math.min(this.config.player.maxFocus, winner.focus + this.config.perfectFocusBonus);
        const pushDist = r.strong ? knockback.strong : r.softened ? knockback.softened : knockback.normal;
        const stun = r.softened ? timings.softenedHitstunMs : r.punished ? timings.punishedHitstunMs : timings.hitstunMs;
        if (this.hit(loser, winner, pushDist, stun)) ev.protectedId = loser.id;
        else ev.damagedId = loser.id;
        break;
      }
      case 'tie-stagger': {
        const s = r.staggered === 'a' ? x : y;
        ev.staggeredId = s.id;
        this.consume(s, 0);
        s.stunUntil = Math.max(s.stunUntil, this.now + timings.staggerMs);
        this.pushApart(x, y, knockback.clank);
        break;
      }
      case 'clank':
      case 'wasted':
        this.pushApart(x, y, knockback.clank);
        break;
      case 'fumble':
      case 'both-fumble':
        break;
    }
  }

  /** Aplica um golpe vencedor. Retorna true se o alvo estava protegido (graça). */
  private hit(loser: Player, winner: Player, pushDist: number, stunMs: number): boolean {
    if (this.now < loser.graceUntil) {
      this.push(loser, winner.x, winner.y, this.config.knockback.protectedPush);
      return true;
    }
    loser.hp = Math.max(0, loser.hp - this.config.attack.damage);
    this.consume(loser, 0);
    loser.stunUntil = this.now + stunMs;
    loser.graceUntil = this.now + this.config.timings.graceMs;
    loser.dashUntil = 0;
    this.push(loser, winner.x, winner.y, pushDist);
    if (loser.hp <= 0) {
      loser.alive = false;
      loser.kbX = loser.kbY = 0;
      this.emit({ type: 'eliminated', at: this.now, playerId: loser.id, byId: winner.id });
    }
    return false;
  }

  private whiff(players: Player[], target: Player, reason: WhiffReason): void {
    for (const p of players) this.consume(p, this.config.timings.whiffMs);
    this.emit({ type: 'whiff', at: this.now, playerIds: players.map((p) => p.id), targetId: target.id, reason });
  }

  /** Encerra a ação de p (desfazendo o duelo do parceiro, se houver) e aplica recuperação. */
  private consume(p: Player, recoveryMs: number): void {
    const atk = p.attack;
    if (atk?.clashWith) {
      const partner = this.byId.get(atk.clashWith);
      if (partner?.attack?.clashWith === p.id) partner.attack.clashWith = null;
    }
    p.attack = null;
    if (recoveryMs > 0) p.busyUntil = Math.max(p.busyUntil, this.now + recoveryMs);
  }

  private push(p: Player, fromX: number, fromY: number, distance: number): void {
    let n = normalize(p.x - fromX, p.y - fromY);
    if (n.x === 0 && n.y === 0) n = { x: 1, y: 0 };
    const v0 = distance / this.config.knockback.tauMs;
    p.kbX = n.x * v0;
    p.kbY = n.y * v0;
  }

  private pushApart(a: Player, b: Player, distance: number): void {
    this.push(a, b.x, b.y, distance);
    this.push(b, a.x, a.y, distance);
  }

  private checkEnd(): void {
    const alive = this.players.filter((p) => p.alive);
    if (alive.length <= 1) return this.end(alive[0]?.id ?? null);
    if (this.now >= this.phaseEndsAt) {
      const best = Math.max(...alive.map((p) => p.hp));
      const leaders = alive.filter((p) => p.hp === best);
      this.end(leaders.length === 1 ? leaders[0].id : null);
    }
  }

  private end(winnerId: string | null): void {
    this.phase = 'ended';
    this.winnerId = winnerId;
    for (const p of this.players) {
      p.attack = null;
      p.moveX = p.moveY = 0;
    }
    this.emit({ type: 'phase', at: this.now, phase: 'ended', winnerId });
  }

  private deny(p: Player, reason: DenyReason): void {
    this.emit({ type: 'denied', at: this.now, playerId: p.id, reason });
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  // ------------------------------------------------------------------ visão

  /** Estado filtrado: só o próprio jogador vê o próprio símbolo. */
  snapshotFor(viewerId: string | null): Snapshot {
    const now = this.now;
    const players: PlayerView[] = this.players.map((p) => {
      const self = p.id === viewerId;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        character: p.character,
        isBot: p.isBot,
        x: p.x,
        y: p.y,
        faceX: p.faceX,
        faceY: p.faceY,
        hp: p.hp,
        maxHp: this.config.player.maxHp,
        focus: p.focus,
        alive: p.alive,
        holding: !!p.attack,
        locked: p.attack?.lockedAt != null,
        symbol: self && p.attack ? p.attack.symbol : null,
        targetId: p.attack?.targetId ?? null,
        impactAt: p.attack?.impactAt ?? null,
        clashWith: p.attack?.clashWith ?? null,
        stunned: now < p.stunUntil,
        busy: now < p.busyUntil,
        graceUntil: p.graceUntil,
        dashReadyAt: p.dashReadyAt,
        swapsLeft: self && p.attack ? this.config.costs.maxSwaps - p.attack.swaps : null,
      };
    });
    return { now, phase: this.phase, phaseEndsAt: this.phaseEndsAt, winnerId: this.winnerId, players };
  }

  // ------------------------------------------------------------------ apoio a testes

  debugPlayer(id: string): PlayerDebugState {
    const p = this.byId.get(id);
    if (!p) throw new Error(`Jogador ${id} não existe`);
    return { ...p, attack: p.attack ? { ...p.attack } : null };
  }

  debugPlace(id: string, x: number, y: number): void {
    const p = this.byId.get(id)!;
    p.x = x;
    p.y = y;
  }

  debugSet(id: string, patch: Partial<Pick<Player, 'hp' | 'focus' | 'graceUntil'>>): void {
    Object.assign(this.byId.get(id)!, patch);
  }
}

function isRps(s: unknown): s is Rps {
  return s === 'rock' || s === 'paper' || s === 'scissors';
}
