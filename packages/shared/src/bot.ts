import type { GameConfig } from './config';
import { arenaDepth, dist, distToObstacle, insideObstacle, lineBlocked, normalize } from './geometry';
import type { Obstacle } from './config';
import { counterOf } from './rules';
import { RPS_LIST, type GameEvent, type PlayerInput, type PlayerView, type Rps, type Snapshot } from './types';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotProfile {
  reactionMs: [number, number];
  /** Tempo para perceber o símbolo que o outro botou e virar a mão (reflexo de malandro). */
  readReactMs: [number, number];
  /** Desvio padrão do erro de tempo no Jo-Ken-Pô. */
  timingSigmaMs: number;
  /** Chance de botar cedo (antes do verde): seguro, mas entrega o símbolo. */
  earlyChance: number;
  /** Mira este tanto depois do PÔ! para ver o do outro (malandro: mais leitura, mais risco de vermelho). */
  lateBiasMs: number;
  /** Chance de aproveitar o símbolo que o outro mostrou (se percebeu a tempo). */
  readRevealChance: number;
  /** Chance de usar o histórico do adversário em vez de escolher ao acaso. */
  readChance: number;
  /** Chance de tentar fugir (investida) quando é chamado para um duelo. */
  fleeChance: number;
  dashChance: number;
  /** Ataques iniciados por segundo quando em alcance e livre. */
  aggression: number;
  /** Chance de ir beber quando machucado e sem ameaça por perto. */
  beerGreed: number;
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    reactionMs: [480, 750],
    readReactMs: [380, 600],
    timingSigmaMs: 120,
    earlyChance: 0.45,
    lateBiasMs: 0,
    readRevealChance: 0.5,
    readChance: 0.15,
    fleeChance: 0.12,
    dashChance: 0.15,
    aggression: 0.35,
    beerGreed: 0.5,
  },
  normal: {
    reactionMs: [330, 540],
    readReactMs: [260, 400],
    timingSigmaMs: 75,
    earlyChance: 0.25,
    lateBiasMs: 30,
    readRevealChance: 0.75,
    readChance: 0.4,
    fleeChance: 0.12,
    dashChance: 0.3,
    aggression: 0.55,
    beerGreed: 0.7,
  },
  hard: {
    reactionMs: [230, 380],
    readReactMs: [190, 290],
    timingSigmaMs: 50,
    earlyChance: 0.12,
    lateBiasMs: 55,
    readRevealChance: 0.95,
    readChance: 0.65,
    fleeChance: 0.1,
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
 * NPC. Recebe o mesmo snapshot que um humano (vê o símbolo de quem já botou) e os eventos públicos,
 * e devolve as mesmas entradas que um humano enviaria.
 */
export class BotBrain {
  private readonly rng: () => number;
  private readonly history = new Map<string, Rps[]>();
  private readonly bias: Record<Rps, number>;
  /** Plano do duelo atual: quando e o que botar, e se vai tentar fugir. */
  private plan: { key: string; pickAt: number; symbol: Rps; flee: boolean; running: boolean; read: boolean } | null = null;
  private strafeDir = 1;
  private strafeUntil = 0;
  private lastStep = 0;
  private wantsBeer = false;
  private beerDecisionAt = 0;
  /** Obstáculos que ainda bloqueiam (engradados quebrados saem). */
  private obstacles: readonly Obstacle[] = [];
  private freezerWish = 0;

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
        if (e.attackerSymbol) this.remember(e.attackerId, e.attackerSymbol);
        if (e.defenderSymbol) this.remember(e.defenderId, e.defenderSymbol);
      }
    }
  }

  think(view: Snapshot): PlayerInput[] {
    this.obstacles = view.broken.length ? this.config.obstacles.filter((_, i) => !view.broken.includes(i)) : this.config.obstacles;
    const now = view.now;
    const dt = Math.max(1, now - this.lastStep);
    this.lastStep = now;
    const me = view.players.find((p) => p.id === this.id);
    if (!me || !me.alive || view.phase !== 'playing') return [{ type: 'move', x: 0, y: 0 }];

    const out: PlayerInput[] = [];
    const others = view.players.filter((p) => p.alive && p.id !== this.id);

    if (me.holding) this.thinkDuel(view, me, out);
    else {
      this.plan = null;
      this.thinkFree(view, me, others, dt, out);
    }
    return out;
  }

  // ---------------------------------------------------------------- no duelo

  private thinkDuel(view: Snapshot, me: PlayerView, out: PlayerInput[]): void {
    const now = view.now;
    const { qte } = this.config;
    const opp = view.players.find((p) => p.id === me.targetId);
    const T = me.impactAt!;
    const key = `${me.targetId}:${T}`;

    if (!this.plan || this.plan.key !== key) {
      // Cedo (seguro, mas mostra a mão) ou mirando no verde — o malandro mira mais tarde para ver a do outro.
      const early = this.rng() < this.profile.earlyChance;
      const pickAt = early
        ? now + this.reactionDelay() * 0.6
        : T + this.profile.lateBiasMs + this.gauss() * this.profile.timingSigmaMs;
      const flee = !me.challenger && this.rng() < this.profile.fleeChance * (me.hp < me.maxHp ? 2 : 1);
      this.plan = { key, pickAt, symbol: this.choose(me.targetId!, null), flee, running: flee, read: false };
    }
    const plan = this.plan;

    if (!me.locked) {
      // O outro já botou? Se percebeu a tempo (antes da hora em que ia apertar), vira a mão para ganhar.
      if (opp?.symbol && opp.pickedAt !== null && !plan.read) {
        const [a, b] = this.profile.readReactMs;
        const noticeAt = opp.pickedAt + a + this.rng() * (b - a);
        if (noticeAt <= plan.pickAt) {
          plan.read = true;
          if (this.rng() < this.profile.readRevealChance) plan.symbol = counterOf(opp.symbol);
        } else if (now >= noticeAt) plan.read = true;
      }
      if (plan.flee && now >= me.dashReadyAt && me.focus >= this.config.costs.dash && opp) {
        const away = normalize(me.x - opp.x, me.y - opp.y);
        out.push({ type: 'dash', x: away.x, y: away.y });
        plan.flee = false;
        plan.pickAt = Math.max(plan.pickAt, T - qte.greenBeforeMs);
      }
      if (now >= plan.pickAt) out.push({ type: 'symbol', symbol: plan.symbol, at: plan.pickAt });
    }

    // Fica em alcance do adversário (ou corre dele, se decidiu fugir).
    if (opp) {
      const d = dist(me.x, me.y, opp.x, opp.y);
      const n = normalize(opp.x - me.x, opp.y - me.y);
      if (plan.running) {
        out.push(this.steer(me, -n.x, -n.y));
        return;
      }
      const want = this.config.attack.hitRange * 0.65;
      const k = d > want ? 1 : d < want * 0.6 ? -0.6 : 0;
      out.push(this.steer(me, n.x * k - n.y * 0.25 * this.strafeDir, n.y * k + n.x * 0.25 * this.strafeDir));
    }
  }

  // ---------------------------------------------------------------- sem mão

  private thinkFree(view: Snapshot, me: PlayerView, others: PlayerView[], dt: number, out: PlayerInput[]): void {
    const now = view.now;
    const cfg = this.config;

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

    // 3) Cerveja do chão (evento do Zé) por perto, machucado e ninguém em cima? Vai pegar.
    if (safe && me.openingUntil <= now && me.hp < me.maxHp) {
      const item = view.items
        .map((i) => ({ i, d: dist(me.x, me.y, i.x, i.y) }))
        .filter((x) => x.d < 380)
        .sort((a, b) => a.d - b.d)[0]?.i;
      if (item) {
        out.push(this.steer(me, item.x - me.x, item.y - me.y));
        return;
      }
    }

    // 4) Às vezes vai abrir o freezer para ganhar o escudo de gelo (se ninguém estiver perto).
    if (me.openingUntil > now) {
      out.push({ type: 'move', x: 0, y: 0 });
      return;
    }
    if (now >= this.freezerWish) this.freezerWish = now + 4000 + this.rng() * 6000;
    const fz = !me.shielded && safe ? view.freezers.find((f) => f.readyAt <= now) : undefined;
    const fo = fz && cfg.obstacles[fz.index];
    if (fo && this.freezerWish - now > 3500 && this.rng() < this.profile.beerGreed) {
      const d = distToObstacle(me.x, me.y, fo);
      if (d < 260) {
        const c = fo.kind === 'rect' ? { x: fo.x + fo.w / 2, y: fo.y + fo.h / 2 } : fo;
        if (d <= cfg.player.radius + cfg.hazards.freezer.reach - 8) out.push({ type: 'move', x: 0, y: 0 }, { type: 'drink' });
        else out.push(this.steer(me, c.x - me.x, c.y - me.y));
        return;
      }
    }

    // 5) Caça o adversário mais próximo (com preferência por quem tem menos vida) que esteja livre para duelar.
    const target = others
      .filter((p) => !p.holding && p.graceUntil <= now)
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

    const clear = !lineBlocked(me.x, me.y, target.x, target.y, this.obstacles);
    const ready = clear && !me.busy && !me.stunned && d <= cfg.attack.hitRange * 0.85;
    if (ready && this.rng() < (this.profile.aggression * dt) / 1000) {
      out.push({ type: 'challenge', targetId: target.id });
    }
  }

  /** Desvia de obstáculos e da cerca: testa a direção desejada e, se bloqueada, gira até achar caminho. */
  private steer(me: PlayerView, x: number, y: number): PlayerInput {
    const dir = normalize(x, y);
    if (dir.x === 0 && dir.y === 0) return { type: 'move', x: 0, y: 0 };
    const { arena, player } = this.config;
    const obstacles = this.obstacles;
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
    const allowed = (s: Rps) => s !== current;
    const hist = this.history.get(opponentId) ?? [];
    if (hist.length > 0 && this.rng() < this.profile.readChance) {
      // Leitura simples: o adversário tende a repetir o que mais usou recentemente.
      const counts = { rock: 0, paper: 0, scissors: 0 };
      hist.slice(-4).forEach((s, i) => (counts[s] += 1 + i * 0.5));
      const predicted = RPS_LIST.reduce((a, b) => (counts[b] > counts[a] ? b : a));
      const pick = counterOf(predicted);
      if (allowed(pick)) return pick;
    }
    const options = RPS_LIST.filter(allowed);
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
