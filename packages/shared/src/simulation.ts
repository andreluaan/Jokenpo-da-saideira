import { DEFAULT_CONFIG, type GameConfig } from './config';
import { clamp, clampInArena, dist, distToObstacle, insideObstacle, lineBlocked, normalize, obstacleCenter, pushOutOfObstacle } from './geometry';
import { makeRng } from './bot';
import type { Obstacle } from './config';
import { gradePick, qteEnd, resolveExchange } from './rules';
import { CHARACTER_IDS } from './types';
import type {
  BarEventKind,
  BarEventView,
  CharacterId,
  ItemKind,
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

/** Lado de um jogador num duelo (os dois duelistas têm um, apontando um para o outro). */
interface Attack {
  /** Adversário do duelo. */
  targetId: string;
  /** Quem chamou (Espaço). */
  challenger: boolean;
  startedAt: number;
  /** PÔ! (centro da faixa verde). */
  impactAt: number;
  symbol: Rps | null;
  pickedAt: number | null;
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
  drinkingUntil: number;
  drinkStation: number;
  dashX: number;
  dashY: number;
  /** Lento até este instante (golpe final de Tesoura). */
  slowUntil: number;
  /** Escudo de gelo do freezer (segura 1 golpe). */
  shield: boolean;
  /** Quando o escudo de gelo derrete (se não quebrar antes). */
  shieldUntil: number;
  openingUntil: number;
  openingFreezer: number;
  burnReadyAt: number;
  bumpReadyAt: number;
}

interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
}

interface Puddle {
  id: number;
  x: number;
  y: number;
  r: number;
  until: number;
}

interface Waiter {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Distância total do trajeto e quanto já andou. */
  length: number;
  walked: number;
  /** Pontos do trajeto (0–1) onde larga cerveja (evento do Zé). */
  drops: number[];
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
  /** Mesas de cerveja (índices em config.obstacles) e quando cada cerveja fica pronta. */
  private readonly stations: { index: number; readyAt: number }[];
  private readonly freezers: { index: number; readyAt: number }[];
  private readonly rng: () => number;
  private items: Item[] = [];
  private itemSeq = 0;
  private puddles: Puddle[] = [];
  private puddleSeq = 0;
  private readonly crateHp = new Map<number, number>();
  private readonly crateHitAt = new Map<number, number>();
  private readonly broken = new Set<number>();
  /** Obstáculos que ainda bloqueiam (sem os engradados quebrados). */
  private active: Obstacle[];
  private barEvent: (BarEventView & { stage: 'planned' | 'announce' | 'active' | 'done' }) | null = null;
  private waiter: Waiter | null = null;

  constructor(setups: PlayerSetup[], config: GameConfig = DEFAULT_CONFIG, seed = 1) {
    this.rng = makeRng(seed);
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
        drinkingUntil: 0,
        drinkStation: -1,
        dashX: 0,
        dashY: 0,
        slowUntil: 0,
        shield: false,
        shieldUntil: 0,
        openingUntil: 0,
        openingFreezer: -1,
        burnReadyAt: 0,
        bumpReadyAt: 0,
      };
      this.players.push(p);
      this.byId.set(p.id, p);
    });
    this.phaseEndsAt = config.match.countdownMs;
    this.stations = config.obstacles.flatMap((o, index) => (o.prop === 'beerTable' ? [{ index, readyAt: 0 }] : []));
    this.freezers = config.obstacles.flatMap((o, index) => (o.prop === 'freezer' ? [{ index, readyAt: 0 }] : []));
    config.obstacles.forEach((o, i) => o.prop === 'crates' && this.crateHp.set(i, config.hazards.crate.hp));
    this.active = [...config.obstacles];
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
      case 'challenge':
        return this.challenge(p, input.targetId);
      case 'symbol':
        return this.pick(p, input.symbol, input.at);
      case 'dash':
        return this.dash(p, input.x, input.y);
      case 'drink':
        return this.drink(p);
    }
  }

  /** Espaço: chama o alvo para um Jo-Ken-Pô. Os dois entram no duelo; ninguém mais mexe com eles até acabar. */
  private challenge(p: Player, targetId: string | undefined): void {
    const now = this.now;
    if (p.attack) return this.deny(p, 'locked');
    if (!this.free(p)) return this.deny(p, 'busy');
    const t = targetId ? this.byId.get(targetId) : undefined;
    if (!t || t === p || !t.alive) return this.deny(p, 'target');
    if (t.attack) return this.deny(p, 'engaged');
    if (now < t.graceUntil) return this.deny(p, 'grace');
    if (dist(p.x, p.y, t.x, t.y) > this.config.attack.engageRange) return this.deny(p, 'range');
    const impactAt = now + this.config.attack.windupMs;
    p.attack = { targetId: t.id, challenger: true, startedAt: now, impactAt, symbol: null, pickedAt: null };
    t.attack = { targetId: p.id, challenger: false, startedAt: now, impactAt, symbol: null, pickedAt: null };
    // Quem foi chamado larga o que estava fazendo (cerveja derrama, freezer fica aberto).
    this.spill(t);
    this.interruptOpening(t);
    this.emit({ type: 'duel', at: now, a: p.id, b: t.id, impactAt });
  }

  /** Livre para chamar um duelo (sem atordoamento, investida, bebida ou freezer em andamento). */
  private free(p: Player): boolean {
    const now = this.now;
    return now >= p.busyUntil && now >= p.stunUntil && now >= p.dashUntil && now >= p.drinkingUntil && now >= p.openingUntil;
  }

  /** Bota o símbolo (uma vez por duelo). Aparece na hora para todo mundo: quem bota cedo pode ser lido. */
  private pick(p: Player, symbol: Rps, at: number | undefined): void {
    if (!isRps(symbol)) return;
    const atk = p.attack;
    if (!atk) return this.deny(p, 'noduel');
    if (atk.symbol !== null) return this.deny(p, 'locked');
    const { qte } = this.config;
    const pressedAt = clamp(Number.isFinite(at) ? (at as number) : this.now, Math.max(atk.startedAt, this.now - qte.maxRewindMs), this.now);
    atk.symbol = symbol;
    atk.pickedAt = pressedAt;
    this.emit({ type: 'pick', at: this.now, playerId: p.id, symbol, grade: gradePick(pressedAt, atk.impactAt, qte) });
  }

  /**
   * E (interagir): perto da mesa com cerveja e machucado → bebe (parado e vulnerável; se completar, recupera vida).
   * Perto do freezer → abre (parado) e ganha um escudo de gelo que segura 1 golpe.
   */
  private drink(p: Player): void {
    const now = this.now;
    if (p.attack || now < p.stunUntil || now < p.dashUntil || now < p.drinkingUntil || now < p.openingUntil) return this.deny(p, 'busy');
    const { reach } = this.config.beer;
    const R = this.config.player.radius;
    const near = this.stations.find((s) => distToObstacle(p.x, p.y, this.config.obstacles[s.index]) <= R + reach);
    if (!near || p.hp >= this.config.player.maxHp || now < near.readyAt) {
      const fz = this.freezers.find((f) => distToObstacle(p.x, p.y, this.config.obstacles[f.index]) <= R + this.config.hazards.freezer.reach);
      if (fz) return this.openFreezer(p, fz);
      if (!near) return this.deny(p, 'range');
      return this.deny(p, p.hp >= this.config.player.maxHp ? 'full' : 'empty');
    }
    near.readyAt = Number.POSITIVE_INFINITY; // cerveja na mão de quem pegou
    p.drinkStation = this.stations.indexOf(near);
    p.drinkingUntil = now + this.config.beer.drinkMs;
    p.vx = p.vy = 0;
    this.emit({ type: 'drink', at: now, playerId: p.id, stage: 'start', hp: p.hp });
  }

  /** Interrompe a bebida (levou dano): a cerveja é derramada e o garçom traz outra depois. */
  private spill(p: Player): void {
    if (p.drinkingUntil <= this.now) return;
    p.drinkingUntil = 0;
    this.addPuddle(p.x, p.y);
    const s = this.stations[p.drinkStation];
    if (s) s.readyAt = this.now + this.config.beer.respawnMs;
    p.drinkStation = -1;
    this.emit({ type: 'drink', at: this.now, playerId: p.id, stage: 'spilled', hp: p.hp });
  }

  private dash(p: Player, x?: number, y?: number): void {
    const now = this.now;
    // No duelo, dá para fugir com a investida enquanto não botou o símbolo (longe demais no PÔ! = escapou).
    if (p.attack?.symbol) return this.deny(p, 'locked');
    if (now < p.stunUntil || now < p.dashUntil || now < p.drinkingUntil) return this.deny(p, 'busy');
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
      this.planRound();
    }
    if (this.phase === 'playing') {
      this.integrate(dtMs);
      this.finishDrinks();
      this.finishOpenings();
      this.updateItems();
      this.updateBarEvent();
      this.updateWaiter(dtMs);
      this.puddles = this.puddles.filter((q) => q.until > this.now);
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
        const stunned = this.now < p.stunUntil || this.now < p.drinkingUntil || this.now < p.openingUntil;
        const slow = this.now < p.slowUntil ? this.config.finisher.scissors.slowMul : 1;
        const speed = stunned ? 0 : (player.speed / 1000) * slow * (p.attack ? player.holdingSpeedMul : 1);
        // Pisando em poça de cerveja: escorrega (acelera e freia pouco).
        const { puddle } = this.config.hazards;
        const wet = this.puddles.some((q) => dist(p.x, p.y, q.x, q.y) < q.r);
        const accelMul = wet ? puddle.accelMul : 1;
        const decelMul = wet ? puddle.decelMul : 1;
        const tx = p.moveX * speed;
        const ty = p.moveY * speed;
        const dvx = tx - p.vx;
        const dvy = ty - p.vy;
        const dv = Math.hypot(dvx, dvy);
        const speeding = tx * tx + ty * ty >= p.vx * p.vx + p.vy * p.vy;
        const maxStep = ((speeding ? player.accel * accelMul : player.decel * decelMul) / 1e6) * dt;
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

      const kbSpeed = Math.hypot(p.kbX, p.kbY);
      obstacles.forEach((o, i) => {
        if (this.broken.has(i)) return;
        const pos = pushOutOfObstacle(p.x, p.y, player.radius, o);
        if (pos.x !== p.x || pos.y !== p.y) this.bumpInto(p, o, i, kbSpeed);
        p.x = pos.x;
        p.y = pos.y;
      });
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

  private finishDrinks(): void {
    for (const p of this.players) {
      if (!p.alive || p.drinkingUntil === 0 || this.now < p.drinkingUntil) continue;
      p.drinkingUntil = 0;
      p.hp = Math.min(this.config.player.maxHp, p.hp + this.config.beer.heal);
      const s = this.stations[p.drinkStation];
      if (s) s.readyAt = this.now + this.config.beer.respawnMs;
      p.drinkStation = -1;
      this.emit({ type: 'drink', at: this.now, playerId: p.id, stage: 'done', hp: p.hp });
    }
  }

  /** Duelos prontos: os dois já botaram (e já passou do PÔ!) ou a barra acabou. Resolvido pelo lado de quem chamou. */
  private resolveDue(): void {
    const { qte } = this.config;
    const due = this.players
      .filter((p) => p.alive && p.attack?.challenger)
      .filter((p) => {
        const atk = p.attack!;
        const other = this.byId.get(atk.targetId)?.attack;
        const both = atk.symbol !== null && other?.symbol != null;
        return this.now >= (both ? atk.impactAt : qteEnd(atk.impactAt, qte));
      })
      .sort((a, b) => a.attack!.impactAt - b.attack!.impactAt || (a.id < b.id ? -1 : 1));
    for (const x of due) if (x.alive && x.attack?.challenger) this.resolveAttack(x);
  }

  private resolveAttack(x: Player): void {
    const atk = x.attack!;
    const y = this.byId.get(atk.targetId)!;
    const yAtk = y.attack && y.attack.targetId === x.id ? y.attack : null;
    const T = atk.impactAt;
    const { timings, knockback, qte } = this.config;

    if (!y.alive || !yAtk) return this.whiff([x], y, 'gone');
    if (dist(x.x, x.y, y.x, y.y) > this.config.attack.hitRange) return this.whiff([x, y], y, 'range');
    if (lineBlocked(x.x, x.y, y.x, y.y, this.active)) return this.whiff([x, y], y, 'blocked');

    const aGrade = gradePick(atk.pickedAt, T, qte);
    const bGrade = gradePick(yAtk.pickedAt, T, qte);
    const r = resolveExchange({ symbol: atk.symbol, grade: aGrade }, { symbol: yAtk.symbol, grade: bGrade });

    const ev: ExchangeEvent = {
      type: 'exchange',
      at: this.now,
      attackerId: x.id,
      defenderId: y.id,
      duel: true,
      attackerSymbol: atk.symbol,
      defenderSymbol: yAtk.symbol,
      attackerGrade: aGrade,
      defenderGrade: bGrade,
      kind: r.kind,
      winnerId: null,
      damagedId: null,
      protectedId: null,
      staggeredId: null,
      finisher: null,
      x: (x.x + y.x) / 2,
      y: (x.y + y.y) / 2,
    };
    this.emit(ev);

    const recovery = r.kind === 'both-fumble' ? timings.whiffMs : timings.afterResolveMs;
    this.consume(x, recovery);
    this.consume(y, recovery);

    switch (r.kind) {
      case 'caught':
      case 'defenseless':
      case 'win': {
        const winner = r.winner === 'a' ? x : y;
        const loser = winner === x ? y : x;
        ev.winnerId = winner.id;
        if (r.strong) winner.focus = Math.min(this.config.player.maxFocus, winner.focus + this.config.perfectFocusBonus);
        const fin = r.finisher ? (winner === x ? atk.symbol : yAtk.symbol) : null;
        if (fin) {
          // Golpe final do símbolo: Pedra prende, Tesoura corta e deixa lento, Papel arremessa longe.
          const f = this.config.finisher[fin];
          // Na Saideira dupla o golpe final tira mais vida.
          const dmg = this.eventActive('saideira') ? this.config.barEvents.saideira.finisherDamage : this.config.attack.damage;
          if (this.hit(loser, winner, f.knockback, f.stunMs, this.config.finisher.graceMs, dmg)) ev.protectedId = loser.id;
          else {
            ev.damagedId = loser.id;
            ev.finisher = fin;
            if (fin === 'scissors') loser.slowUntil = this.now + this.config.finisher.scissors.stunMs + this.config.finisher.scissors.slowMs;
          }
        } else {
          // Golpe simples (rasteira): venceu botando cedo, o outro não botou, ou o outro foi pego roubando.
          const stun = r.softened ? timings.softenedHitstunMs : r.punished || r.kind === 'caught' ? timings.punishedHitstunMs : timings.hitstunMs;
          if (this.hit(loser, winner, knockback.normal, stun)) ev.protectedId = loser.id;
          else ev.damagedId = loser.id;
        }
        break;
      }
      case 'tie-stagger': {
        const s = r.staggered === 'a' ? x : y;
        ev.staggeredId = s.id;
        s.stunUntil = Math.max(s.stunUntil, this.now + timings.staggerMs);
        this.pushApart(x, y, knockback.clank);
        break;
      }
      case 'both-caught':
        // O Zé viu os dois roubando: anula e os dois cambaleiam.
        for (const s of [x, y]) s.stunUntil = Math.max(s.stunUntil, this.now + timings.staggerMs);
        this.pushApart(x, y, knockback.clank);
        break;
      case 'clank':
        this.pushApart(x, y, knockback.clank);
        break;
      case 'both-fumble':
        break;
    }
  }

  /** Aplica um golpe vencedor. Retorna true se o alvo estava protegido (graça). */
  private hit(loser: Player, winner: Player, pushDist: number, stunMs: number, graceMs = this.config.timings.graceMs, damage = this.config.attack.damage): boolean {
    if (this.now < loser.graceUntil) {
      this.push(loser, winner.x, winner.y, this.config.knockback.protectedPush);
      return true;
    }
    if (loser.shield) {
      // Escudo de gelo do freezer segura este golpe inteiro.
      loser.shield = false;
      this.push(loser, winner.x, winner.y, this.config.knockback.softened);
      this.emit({ type: 'shield', at: this.now, playerId: loser.id, stage: 'broken' });
      return true;
    }
    this.spill(loser);
    this.interruptOpening(loser);
    loser.hp = Math.max(0, loser.hp - damage);
    this.consume(loser, 0);
    loser.stunUntil = this.now + stunMs;
    loser.graceUntil = this.now + graceMs;
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

  /** Encerra o duelo de p (o adversário também sai dele) e aplica recuperação. */
  private consume(p: Player, recoveryMs: number): void {
    const atk = p.attack;
    if (atk) {
      const partner = this.byId.get(atk.targetId);
      if (partner?.attack?.targetId === p.id) partner.attack = null;
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

  // ------------------------------------------------------------------ boteco: itens, arena e eventos

  /** Sorteia o evento da rodada (ao começar a luta). */
  private planRound(): void {
    const { barEvents } = this.config;
    if (!barEvents.enabled) return;
    const kinds: BarEventKind[] = ['saideira', 'blackout', 'ze'];
    const kind = kinds[Math.floor(this.rng() * kinds.length)];
    const [a, b] = barEvents.startMs;
    const startAt = this.now + a + this.rng() * (b - a);
    const ms = kind === 'saideira' ? barEvents.saideira.ms : kind === 'blackout' ? barEvents.blackout.ms : barEvents.ze.ms;
    this.barEvent = { kind, announceAt: startAt - barEvents.announceMs, startAt, endAt: startAt + ms, stage: 'planned' };
  }

  eventActive(kind: BarEventKind): boolean {
    const e = this.barEvent;
    return !!e && e.kind === kind && this.now >= e.startAt && this.now < e.endAt;
  }

  private updateBarEvent(): void {
    const e = this.barEvent;
    if (!e || e.stage === 'done') return;
    if (e.stage === 'planned' && this.now >= e.announceAt) {
      e.stage = 'announce';
      this.emit({ type: 'barEvent', at: this.now, kind: e.kind, stage: 'announce' });
    }
    if (e.stage === 'announce' && this.now >= e.startAt) {
      e.stage = 'active';
      this.emit({ type: 'barEvent', at: this.now, kind: e.kind, stage: 'start' });
      // O garçom atravessa a arena junto com o evento (no do Zé, ele vai largando as cervejas).
      this.startWaiter(e.kind === 'ze' ? this.config.barEvents.ze.beers : 0);
    }
    if (e.stage === 'active' && this.now >= e.endAt) {
      e.stage = 'done';
      this.emit({ type: 'barEvent', at: this.now, kind: e.kind, stage: 'end' });
    }
  }

  /** Garçom: entra por um lado da cerca e sai pelo outro, numa faixa que evita a mesa do meio. */
  private startWaiter(beers: number): void {
    const { arena } = this.config;
    const side = this.rng() < 0.5 ? -1 : 1;
    // Procura um corredor horizontal livre de obstáculos (testa faixas a partir de um lado sorteado).
    const top = this.rng() < 0.5 ? -1 : 1;
    const lanes = [100, 160, 220, 280, 40].flatMap((d) => [top * d, -top * d]);
    const clear = (lane: number) => {
      const h = (arena.rx - 40) * Math.sqrt(Math.max(0.05, 1 - (lane / arena.ry) ** 2));
      for (let x = arena.cx - h; x <= arena.cx + h; x += 20) if (insideObstacle(x, arena.cy + lane, this.config.waiter.radius + 6, this.active)) return false;
      return true;
    };
    const lane = lanes.find(clear) ?? lanes[0];
    const half = (arena.rx - 30) * Math.sqrt(Math.max(0.05, 1 - (lane / arena.ry) ** 2));
    const x0 = arena.cx - side * half;
    const x1 = arena.cx + side * half;
    const drops = Array.from({ length: beers }, (_, i) => (i + 1) / (beers + 1));
    this.waiter = { x: x0, y: arena.cy + lane, dx: side, dy: 0, length: Math.abs(x1 - x0), walked: 0, drops };
  }

  private updateWaiter(dt: number): void {
    const w = this.waiter;
    if (!w) return;
    const { waiter, player } = this.config;
    const step = (waiter.speed / 1000) * dt;
    w.walked += step;
    w.x += w.dx * step;
    w.y += w.dy * step;
    // Contorna obstáculos (sai do caminho e segue).
    for (const o of this.active) {
      const pos = pushOutOfObstacle(w.x, w.y, waiter.radius, o);
      w.x = pos.x;
      w.y = pos.y;
    }
    while (w.drops.length && w.walked / w.length >= w.drops[0]) {
      w.drops.shift();
      this.spawnItem('beer', w.x, w.y + (this.rng() - 0.5) * 60);
    }
    for (const p of this.players) {
      if (!p.alive || this.now < p.bumpReadyAt) continue;
      if (dist(p.x, p.y, w.x, w.y) < player.radius + waiter.radius) {
        // Esbarrou no garçom: tropeça e é empurrado para longe da bandeja.
        p.bumpReadyAt = this.now + 1000;
        this.consume(p, 0);
        this.interruptOpening(p);
        p.stunUntil = Math.max(p.stunUntil, this.now + waiter.stunMs);
        this.push(p, w.x, w.y, waiter.push);
        this.emit({ type: 'waiterBump', at: this.now, playerId: p.id, x: p.x, y: p.y });
      }
    }
    if (w.walked >= w.length) this.waiter = null;
  }

  private updateItems(): void {
    const { items, player } = this.config;
    for (const p of this.players) {
      if (!p.alive || this.now < p.stunUntil) continue;
      const it = this.items.find((i) => dist(p.x, p.y, i.x, i.y) < player.radius + items.pickupRadius);
      if (!it) continue;
      // Cerveja do chão: gole rápido (parado e vulnerável), só se precisar de vida e estiver de mãos livres.
      if (p.hp >= player.maxHp || p.attack || this.now < p.drinkingUntil || this.now < p.openingUntil) continue;
      p.drinkingUntil = this.now + items.beerDrinkMs;
      p.drinkStation = -1;
      p.vx = p.vy = 0;
      this.emit({ type: 'drink', at: this.now, playerId: p.id, stage: 'start', hp: p.hp });
      this.items = this.items.filter((i) => i !== it);
      this.emit({ type: 'pickup', at: this.now, playerId: p.id, kind: it.kind, x: it.x, y: it.y });
    }
  }

  private spawnItem(kind: ItemKind, x: number, y: number): void {
    const { player, arena } = this.config;
    let pos = clampInArena(x, y, player.radius + 10, arena);
    for (const o of this.active) pos = pushOutOfObstacle(pos.x, pos.y, 30, o);
    this.items.push({ id: ++this.itemSeq, kind, x: pos.x, y: pos.y });
  }

  private addPuddle(x: number, y: number, r = this.config.hazards.puddle.r): void {
    this.puddles.push({ id: ++this.puddleSeq, x, y, r, until: this.now + this.config.hazards.puddle.ms });
  }

  /** Jogador encostou num obstáculo: se veio empurrado com força, a churrasqueira queima e o engradado racha. */
  private bumpInto(p: Player, o: Obstacle, index: number, kbSpeed: number): void {
    const { grill, crate } = this.config.hazards;
    if (o.prop === 'grill' && kbSpeed > grill.minSpeed && this.now >= p.burnReadyAt) {
      p.burnReadyAt = this.now + grill.cooldownMs;
      this.consume(p, 0);
      this.interruptOpening(p);
      p.stunUntil = Math.max(p.stunUntil, this.now + grill.stunMs);
      const c = obstacleCenter(o);
      this.push(p, c.x, c.y, grill.push);
      this.emit({ type: 'burn', at: this.now, playerId: p.id, x: p.x, y: p.y });
    } else if (o.prop === 'crates' && kbSpeed > crate.minSpeed && this.now >= (this.crateHitAt.get(index) ?? -Infinity) + crate.cooldownMs) {
      this.crateHitAt.set(index, this.now);
      const hp = (this.crateHp.get(index) ?? crate.hp) - 1;
      this.crateHp.set(index, hp);
      if (hp <= 0) {
        this.broken.add(index);
        this.active = this.config.obstacles.filter((_, i) => !this.broken.has(i));
        const c = obstacleCenter(o);
        // As garrafas quebram e a cerveja escorre pelo chão.
        this.addPuddle(c.x, c.y, this.config.hazards.puddle.r * 1.4);
      }
      this.emit({ type: 'crate', at: this.now, index, broken: hp <= 0 });
    }
  }

  private openFreezer(p: Player, fz: { index: number; readyAt: number }): void {
    if (p.shield) return this.deny(p, 'full');
    if (this.now < fz.readyAt) return this.deny(p, 'empty');
    p.openingUntil = this.now + this.config.hazards.freezer.openMs;
    p.openingFreezer = this.freezers.indexOf(fz);
    fz.readyAt = Number.POSITIVE_INFINITY;
    p.vx = p.vy = 0;
    this.emit({ type: 'shield', at: this.now, playerId: p.id, stage: 'start' });
  }

  private finishOpenings(): void {
    for (const p of this.players) {
      // Escudo dura shieldMs (pedido do usuário: ~10 s) e derrete sozinho.
      if (p.shield && this.now >= p.shieldUntil) {
        p.shield = false;
        this.emit({ type: 'shield', at: this.now, playerId: p.id, stage: 'expired' });
      }
      if (!p.alive || p.openingUntil === 0 || this.now < p.openingUntil) continue;
      p.openingUntil = 0;
      p.shield = true;
      p.shieldUntil = this.now + this.config.hazards.freezer.shieldMs;
      const fz = this.freezers[p.openingFreezer];
      if (fz) fz.readyAt = this.now + this.config.hazards.freezer.cooldownMs;
      p.openingFreezer = -1;
      this.emit({ type: 'shield', at: this.now, playerId: p.id, stage: 'ready' });
    }
  }

  /** Levou golpe abrindo o freezer: larga a porta (sem escudo) e o freezer volta a ficar disponível logo. */
  private interruptOpening(p: Player): void {
    if (p.openingUntil <= this.now) return;
    p.openingUntil = 0;
    const fz = this.freezers[p.openingFreezer];
    if (fz) fz.readyAt = this.now + 2000;
    p.openingFreezer = -1;
    this.emit({ type: 'shield', at: this.now, playerId: p.id, stage: 'interrupted' });
  }

  /** Obstáculos que ainda bloqueiam (para NPCs e testes). */
  get activeObstacles(): readonly Obstacle[] {
    return this.active;
  }

  debugSpawnItem(kind: ItemKind, x: number, y: number): void {
    this.items.push({ id: ++this.itemSeq, kind, x, y });
  }

  debugStartEvent(kind: BarEventKind): void {
    const { barEvents } = this.config;
    const ms = kind === 'saideira' ? barEvents.saideira.ms : kind === 'blackout' ? barEvents.blackout.ms : barEvents.ze.ms;
    this.barEvent = { kind, announceAt: this.now, startAt: this.now, endAt: this.now + ms, stage: 'planned' };
  }

  // ------------------------------------------------------------------ visão

  /** Estado de cada jogador. O símbolo é público assim que botado (malandragem: quem bota por último vê o do outro). */
  // (O parâmetro fica para a rede: hoje nada é escondido de ninguém.)
  snapshotFor(_viewerId: string | null): Snapshot {
    const now = this.now;
    const players: PlayerView[] = this.players.map((p) => {
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
        locked: p.attack?.symbol != null,
        symbol: p.attack?.symbol ?? null,
        pickedAt: p.attack?.pickedAt ?? null,
        targetId: p.attack?.targetId ?? null,
        impactAt: p.attack?.impactAt ?? null,
        challenger: !!p.attack?.challenger,
        stunned: now < p.stunUntil,
        busy: now < p.busyUntil,
        graceUntil: p.graceUntil,
        dashReadyAt: p.dashReadyAt,
        drinkingUntil: now < p.drinkingUntil ? p.drinkingUntil : 0,
        slowed: now < p.slowUntil,
        shielded: p.shield,
        openingUntil: now < p.openingUntil ? p.openingUntil : 0,
      };
    });
    const beers = this.stations.map((s) => {
      const o = this.config.obstacles[s.index];
      return { x: o.x, y: o.y, readyAt: s.readyAt };
    });
    const ev = this.barEvent;
    return {
      now,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      winnerId: this.winnerId,
      players,
      beers,
      items: this.items.map((i) => ({ ...i })),
      puddles: this.puddles.map((q) => ({ ...q })),
      broken: [...this.broken],
      freezers: this.freezers.map((f) => ({ ...f })),
      barEvent: ev && ev.stage !== 'planned' ? { kind: ev.kind, announceAt: ev.announceAt, startAt: ev.startAt, endAt: ev.endAt } : null,
      waiter: this.waiter ? { x: this.waiter.x, y: this.waiter.y, faceX: this.waiter.dx, faceY: this.waiter.dy } : null,
    };
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
