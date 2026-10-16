// Todos os números de balanceamento ficam aqui. Tempos em ms, distâncias em px, velocidades em px/s.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameConfig {
  arena: { width: number; height: number };
  obstacles: Rect[];
  spawns: { x: number; y: number }[];
  player: {
    radius: number;
    maxHp: number;
    speed: number;
    /** Multiplicador de velocidade enquanto segura um símbolo. */
    holdingSpeedMul: number;
    maxFocus: number;
    startFocus: number;
    /** Foco por segundo, apenas quando sem mão. */
    focusRegen: number;
  };
  attack: {
    /** Distância máxima para iniciar um ataque. */
    engageRange: number;
    /** Distância máxima no momento do impacto. */
    hitRange: number;
    windupMs: number;
    /** Tempo mínimo garantido a quem responde formando um duelo. */
    minResponseMs: number;
    /** Abaixo deste tempo restante não se forma mais duelo. */
    responseCutoffMs: number;
    /** Confirmar cedo multiplica o tempo restante por este fator (ataque simples). */
    earlyLockSpeedup: number;
    minAfterLockMs: number;
    damage: number;
  };
  qte: {
    /** Janela visual abre em T - leadMs. Confirmar antes disso = "confirmar cedo". */
    leadMs: number;
    perfectMs: number;
    /** Ainda vale confirmar até T + lateMs; a troca se resolve nesse instante. */
    lateMs: number;
    /** Recuo máximo aceito no carimbo de tempo de uma confirmação. */
    maxRewindMs: number;
  };
  costs: {
    swap: number;
    feint: number;
    cancel: number;
    dash: number;
    /** Trocas + fintas por ação. */
    maxSwaps: number;
  };
  timings: {
    afterResolveMs: number;
    whiffMs: number;
    cancelMs: number;
    hitstunMs: number;
    softenedHitstunMs: number;
    punishedHitstunMs: number;
    graceMs: number;
    staggerMs: number;
  };
  knockback: {
    normal: number;
    strong: number;
    softened: number;
    clank: number;
    protectedPush: number;
    /** Constante de decaimento do empurrão (distância total ≈ v0 * tau). */
    tauMs: number;
  };
  dash: { distance: number; durationMs: number; cooldownMs: number };
  perfectFocusBonus: number;
  match: { countdownMs: number; durationMs: number };
}

export const DEFAULT_CONFIG: GameConfig = {
  arena: { width: 1280, height: 720 },
  obstacles: [
    { x: 590, y: 310, w: 100, h: 100 },
    { x: 330, y: 150, w: 70, h: 70 },
    { x: 880, y: 150, w: 70, h: 70 },
    { x: 330, y: 500, w: 70, h: 70 },
    { x: 880, y: 500, w: 70, h: 70 },
  ],
  spawns: [
    { x: 150, y: 130 },
    { x: 1130, y: 590 },
    { x: 1130, y: 130 },
    { x: 150, y: 590 },
  ],
  player: {
    radius: 22,
    maxHp: 3,
    speed: 230,
    holdingSpeedMul: 0.75,
    maxFocus: 100,
    startFocus: 60,
    focusRegen: 12,
  },
  attack: {
    engageRange: 230,
    hitRange: 160,
    windupMs: 1000,
    minResponseMs: 500,
    responseCutoffMs: 200,
    earlyLockSpeedup: 0.7,
    minAfterLockMs: 250,
    damage: 1,
  },
  qte: {
    leadMs: 450,
    perfectMs: 70,
    lateMs: 150,
    maxRewindMs: 150,
  },
  costs: {
    swap: 20,
    feint: 20,
    cancel: 15,
    dash: 20,
    maxSwaps: 2,
  },
  timings: {
    afterResolveMs: 350,
    whiffMs: 650,
    cancelMs: 500,
    hitstunMs: 450,
    softenedHitstunMs: 280,
    punishedHitstunMs: 650,
    graceMs: 900,
    staggerMs: 450,
  },
  knockback: {
    normal: 120,
    strong: 190,
    softened: 70,
    clank: 60,
    protectedPush: 40,
    tauMs: 90,
  },
  dash: { distance: 150, durationMs: 150, cooldownMs: 1600 },
  perfectFocusBonus: 15,
  match: { countdownMs: 3000, durationMs: 180_000 },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

/** Cria uma config a partir da padrão, sobrescrevendo apenas o que for passado. */
export function makeConfig(overrides: DeepPartial<GameConfig> = {}): GameConfig {
  return merge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), overrides) as GameConfig;
}

function merge(base: any, extra: any): any {
  for (const key of Object.keys(extra)) {
    const v = extra[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[key] && typeof base[key] === 'object') {
      merge(base[key], v);
    } else if (v !== undefined) {
      base[key] = v;
    }
  }
  return base;
}
