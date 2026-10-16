import type { GameConfig } from './config';
import { arenaDepth, dist, insideObstacle, lineBlocked, normalize } from './geometry';
import { counterOf } from './rules';
import { RPS_LIST, type GameEvent, type PlayerInput, type PlayerView, type Rps, type Snapshot } from './types';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotProfile {
  reactionMs: [number, number];
  /** Desvio padrão do erro de tempo do QTE. */
  timingSigmaMs: number;
  earlyLockChance: number;
  /** Chance de usar o histórico do adversário em vez de escolher ao acaso. */
  readChance: number;
  swapOnSignalChance: number;
  feintChance: number;
  respondChance: number;
  dashChance: number;
  /** Ataques iniciados por segundo quando em alcance e livre. */
  aggression: number;
  /** Chance de ir beber quando machucado e sem ameaça por perto. */
  beerGreed: number;
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    reactionMs: [480, 750],
    timingSigmaMs: 140,
    earlyLockChance: 0.5,
    readChance: 0.15,
    swapOnSignalChance: 0.1,
    feintChance: 0.05,
    respondChance: 0.45,
    dashChance: 0.15,
    aggression: 0.35,
    beerGreed: 0.5,
  },
  normal: {
    reactionMs: [330, 540],
    timingSigmaMs: 85,
    earlyLockChance: 0.35,
    readChance: 0.4,
    swapOnSignalChance: 0.3,
    feintChance: 0.15,
    respondChance: 0.7,
    dashChance: 0.3,
    aggression: 0.55,
    beerGreed: 0.7,
  },
  hard: {
    reactionMs: [230, 380],
    timingSigmaMs: 50,
    earlyLockChance: 0.25,
    readChance: 0.65,
    swapOnSignalChance: 0.4,
    feintChance: 0.25,
    respondChance: 0.85,
    dashChance: 0.45,
    aggression: 0.8,
    beerGreed: 0.85,
  },
};

/** PRNG determinístico (mulberry32), para partidas e testes reproduzíveis. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * NPC. Recebe apenas o snapshot filtrado (não vê símbolos alheios) e os eventos públicos,
 * e devolve as mesmas entradas que um humano enviaria.
 */
export class BotBrain {
  private readonly rng: () => number;
  private readonly history = new Map<string, Rps[]>();
  private readonly bias: Record<Rps, number>;
  private signals: { playerId: string; at: number }[] = [];
  private plannedImpact: number | null = null;
  private commitAt: number | null = null;
  private feintAt: number | null = null;
  private reactedSignalAt = -1;
  private reaction: { at: number; attackerId: string } | null = null;
  private handledAttackKey = '';
  private strafeDir = 1;
  private strafeUntil = 0;
  private lastStep = 0;
  private wantsBeer = false;
  private beerDecisionAt = 0;

  constructor(
    readonly id: string,
    readonly profile: BotProfile,
    private readonly config: GameConfig,
    seed = 1,
  ) {
    this.rng = makeRng(seed);
    // Cada NPC tem uma leve preferência pessoal — um "vício" que dá para ler.
    const fav = RPS_LIST[Math.floor(this.rng() * 3)];
    this.bias = { rock: 1, paper: 1, scissors: 1 };
    this.bias[fav] = 1.8;
  }

  observe(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'exchange') {
        this.remember(e.attackerId, e.attackerSymbol);
        if (e.defenderSymbol) this.remember(e.defenderId, e.defenderSymbol);
      } else if (e.type === 'signal' && e.kind === 'swap' && e.playerId !== this.id) {
        this.signals.push({ playerId: e.playerId, at: e.at });
      }
    }
    if (this.signals.length > 20) this.signals = this.signals.slice(-20);
  }

  think(view: Snapshot): PlayerInput[] {
    const now = view.now;
    const dt = Math.max(1, now - this.lastStep);
    this.lastStep = now;
    const me = view.players.find((p) => p.id === this.id);
    if (!me || !me.alive || view.phase !== 'playing') return [{ type: 'move', x: 0, y: 0 }];

    const out: PlayerInput[] = [];
    const others = view.players.filter((p) => p.alive && p.id !== this.id);
    const incoming = others.filter((p) => p.targetId === this.id && p.impactAt !== null);

    if (me.holding) {
      this.reaction = null;
      this.thinkHolding(view, me, incoming, out);
    } else {
      this.plannedImpact = this.commitAt = this.feintAt = null;
      this.thinkFree(view, me, others, incoming, dt, out);
    }
    return out;
  }

  // ---------------------------------------------------------------- com mão

  private thinkHolding(view: Snapshot, me: PlayerView, incoming: PlayerView[], out: PlayerInput[]): void {
    const now = view.now;
    const { qte } = this.config;
    const target = view.players.find((p) => p.id === me.targetId);

    // Próximo impacto relevante: o meu ou o de quem me ataca, o que vier primeiro.
    const impacts = [me.impactAt!, ...incoming.map((p) => p.impactAt!)].filter((t) => t + qte.lateMs >= now);
    const T = Math.min(...impacts);

    if (!me.locked && Number.isFinite(T) && T !== this.plannedImpact) {
      this.plannedImpact = T;
      const ownAttack = T === me.impactAt && !me.clashWith;
      if (ownAttack && T - now > qte.leadMs + 150 && this.rng() < this.profile.earlyLockChance) {
        this.commitAt = now + 80 + this.rng() * 200;
      } else {
        this.commitAt = T + this.gauss() * this.profile.timingSigmaMs;
      }
      if (this.feintAt === null && this.rng() < this.profile.feintChance) {
        this.feintAt = now + this.rng() * Math.max(0, T - now - qte.leadMs);
      }
    }

    if (!me.locked) {
      // Reage a sinais de troca de quem está envolvido comigo.
      const involved = new Set([me.targetId, ...incoming.map((p) => p.id)]);
      const sig = this.signals.find((s) => involved.has(s.playerId) && s.at > this.reactedSignalAt && now - s.at < 350);
      if (sig) {
        this.reactedSignalAt = sig.at;
        if ((me.swapsLeft ?? 0) > 0 && me.focus >= this.config.costs.swap && this.rng() < this.profile.swapOnSignalChance) {
          const opp = me.targetId ?? sig.playerId;
          const next = this.choose(opp, me.symbol);
          if (next !== me.symbol) out.push({ type: 'symbol', symbol: next });
        }
      }
      if (this.feintAt !== null && now >= this.feintAt) {
        this.feintAt = Number.POSITIVE_INFINITY;
        if ((me.swapsLeft ?? 0) > 0 && me.focus >= this.config.costs.feint) out.push({ type: 'feint' });
      }
      if (this.commitAt !== null && now >= this.commitAt) {
        out.push({ type: 'commit', at: this.commitAt });
        this.commitAt = null;
      }
    }

    // Mantém o alvo em alcance.
    if (target) {
      const d = dist(me.x, me.y, target.x, target.y);
      const n = normalize(target.x - me.x, target.y - me.y);
      const want = this.config.attack.hitRange * 0.65;
      const k = d > want ? 1 : d < want * 0.6 ? -0.6 : 0;
      out.push(this.steer(me, n.x * k - n.y * 0.25 * this.strafeDir, n.y * k + n.x * 0.25 * this.strafeDir));
    }
  }

  // ---------------------------------------------------------------- sem mão

  private thinkFree(
    view: Snapshot,
    me: PlayerView,
    others: PlayerView[],
    incoming: PlayerView[],
    dt: number,
    out: PlayerInput[],
  ): void {
    const now = view.now;
    const cfg = this.config;

    // 1) Sendo atacado: decide (após tempo de reação) responder, investir para longe ou fugir.
    const threat = incoming.sort((a, b) => a.impactAt! - b.impactAt!)[0];
    if (threat) {
      const key = `${threat.id}:${threat.impactAt}`;
      if (this.handledAttackKey !== key && !this.reaction) {
        this.reaction = { at: now + this.reactionDelay(), attackerId: threat.id };
      }
      if (this.reaction && now >= this.reaction.at) {
        this.handledAttackKey = key;
        this.reaction = null;
        const d = dist(me.x, me.y, threat.x, threat.y);
        const canRespond = !me.busy && !me.stunned && d <= cfg.attack.engageRange + 50 && threat.impactAt! - now > 150;
        if (canRespond && this.rng() < this.profile.respondChance) {
          out.push({ type: 'symbol', symbol: this.choose(threat.id, null), targetId: threat.id });
          return;
        }
        const away = normalize(me.x - threat.x, me.y - threat.y);
        if (now >= me.dashReadyAt && me.focus >= cfg.costs.dash && this.rng() < this.profile.dashChance) {
          out.push({ type: 'dash', x: away.x, y: away.y });
        }
      }
      if (this.handledAttackKey === key) {
        const away = normalize(me.x - threat.x, me.y - threat.y);
        out.push(this.steer(me, away.x, away.y));
        return;
      }
    } else {
      this.reaction = null;
    }

    // 2) Machucado e sem ninguém perto? Vai até a mesa tomar uma.
    if (me.drinkingUntil > now) {
      out.push({ type: 'move', x: 0, y: 0 });
      return;
    }
    if (now >= this.beerDecisionAt) {
      this.beerDecisionAt = now + 800;
      this.wantsBeer = me.hp < me.maxHp && this.rng() < this.profile.beerGreed;
    }
    const beer = view.beers.find((b) => b.readyAt <= now);
    const table = beer && cfg.obstacles.find((o) => o.prop === 'beerTable' && o.x === beer.x && o.y === beer.y);
    const safe = !others.some((o) => dist(me.x, me.y, o.x, o.y) < 300);
    if (beer && table && this.wantsBeer && safe && me.hp < me.maxHp) {
      const r = table.kind === 'circle' ? table.r : Math.max(table.w, table.h) / 2;
      const d = dist(me.x, me.y, beer.x, beer.y);
      if (d <= r + cfg.player.radius + cfg.beer.reach - 10) {
        out.push({ type: 'move', x: 0, y: 0 }, { type: 'drink' });
      } else {
        out.push(this.steer(me, beer.x - me.x, beer.y - me.y));
      }
      return;
    }

    // 3) Caça o adversário mais próximo (com preferência por quem tem menos vida).
    const target = others
      .map((p) => ({ p, score: dist(me.x, me.y, p.x, p.y) + p.hp * 40 }))
      .sort((a, b) => a.score - b.score)[0]?.p;
    if (!target) {
      out.push({ type: 'move', x: 0, y: 0 });
      return;
    }

    if (now > this.strafeUntil) {
      this.strafeDir = this.rng() < 0.5 ? -1 : 1;
      this.strafeUntil = now + 600 + this.rng() * 900;
    }
    const d = dist(me.x, me.y, target.x, target.y);
    const n = normalize(target.x - me.x, target.y - me.y);
    const want = me.busy ? cfg.attack.engageRange : cfg.attack.hitRange * 0.55;
    const k = d > want + 20 ? 1 : d < want - 20 ? -0.7 : 0;
    out.push(this.steer(me, n.x * k - n.y * 0.55 * this.strafeDir, n.y * k + n.x * 0.55 * this.strafeDir));

    const clear = !lineBlocked(me.x, me.y, target.x, target.y, cfg.obstacles);
    const ready = clear && !me.busy && !me.stunned && d <= cfg.attack.hitRange * 0.85;
    if (ready && this.rng() < (this.profile.aggression * dt) / 1000) {
      out.push({ type: 'symbol', symbol: this.choose(target.id, null), targetId: target.id });
    }
  }

  /** Desvia de obstáculos e da cerca: testa a direção desejada e, se bloqueada, gira até achar caminho. */
  private steer(me: PlayerView, x: number, y: number): PlayerInput {
    const dir = normalize(x, y);
    if (dir.x === 0 && dir.y === 0) return { type: 'move', x: 0, y: 0 };
    const { obstacles, arena, player } = this.config;
    const probe = player.radius + 30;
    const free = (a: number) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const px = me.x + (dir.x * c - dir.y * s) * probe;
      const py = me.y + (dir.x * s + dir.y * c) * probe;
      return !insideObstacle(px, py, player.radius, obstacles) && arenaDepth(px, py, arena) < 0.96;
    };
    for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const turn = a * this.strafeDir;
      if (free(turn)) {
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        return { type: 'move', x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
      }
    }
    return { type: 'move', x: (arena.cx - me.x) / arena.rx, y: (arena.cy - me.y) / arena.ry };
  }

  // ---------------------------------------------------------------- escolha

  private choose(opponentId: string, current: Rps | null): Rps {
    const hist = this.history.get(opponentId) ?? [];
    if (hist.length > 0 && this.rng() < this.profile.readChance) {
      // Leitura simples: o adversário tende a repetir o que mais usou recentemente.
      const counts = { rock: 0, paper: 0, scissors: 0 };
      hist.slice(-4).forEach((s, i) => (counts[s] += 1 + i * 0.5));
      const predicted = RPS_LIST.reduce((a, b) => (counts[b] > counts[a] ? b : a));
      const pick = counterOf(predicted);
      if (pick !== current) return pick;
    }
    const options = RPS_LIST.filter((s) => s !== current);
    const total = options.reduce((sum, s) => sum + this.bias[s], 0);
    let r = this.rng() * total;
    for (const s of options) {
      r -= this.bias[s];
      if (r <= 0) return s;
    }
    return options[options.length - 1];
  }

  private remember(playerId: string, s: Rps): void {
    if (playerId === this.id) return;
    const h = this.history.get(playerId) ?? [];
    h.push(s);
    if (h.length > 8) h.shift();
    this.history.set(playerId, h);
  }

  private reactionDelay(): number {
    const [a, b] = this.profile.reactionMs;
    return a + this.rng() * (b - a);
  }

  private gauss(): number {
    const u = Math.max(1e-9, this.rng());
    const v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
