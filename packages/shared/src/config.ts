// Todos os números de balanceamento ficam aqui. Tempos em ms, distâncias em px, velocidades em px/s.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Elementos de cenário dentro da arena; todos bloqueiam movimento e linha de visão. */
/** `beerTable` é a mesa amarela de boteco: além de obstáculo, é onde se bebe para recuperar vida. */
export type PropKind = 'beerTable' | 'crates' | 'cooler' | 'freezer' | 'grill';

export type Obstacle = ({ kind: 'rect' } & Rect & { prop: PropKind }) | { kind: 'circle'; x: number; y: number; r: number; prop: PropKind };

/** Mundo (width × height) com a arena jogável em forma de elipse. */
export interface Arena {
  width: number;
  height: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface GameConfig {
  arena: Arena;
  obstacles: Obstacle[];
  spawns: { x: number; y: number }[];
  player: {
    radius: number;
    maxHp: number;
    speed: number;
    /** Inércia "de bêbado": aceleração até a velocidade desejada e desaceleração ao soltar (px/s²). */
    accel: number;
    decel: number;
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
  /**
   * Golpe final: vencer pelo símbolo E acertar o QTE (Bom/Perfeito). Cada símbolo tem seu efeito;
   * a invulnerabilidade depois (graceMs) é a mesma para os três.
   */
  finisher: {
    graceMs: number;
    rock: { knockback: number; stunMs: number };
    scissors: { knockback: number; stunMs: number; slowMs: number; slowMul: number };
    paper: { knockback: number; stunMs: number };
  };
  perfectFocusBonus: number;
  beer: {
    /** Tempo parado bebendo (vulnerável: levar dano derrama a cerveja). */
    drinkMs: number;
    heal: number;
    /** O garçom traz outra cerveja depois deste tempo. */
    respawnMs: number;
    /** Distância extra, além da borda da mesa, em que dá para alcançar a cerveja. */
    reach: number;
  };
  match: { countdownMs: number; durationMs: number };
}

export const DEFAULT_CONFIG: GameConfig = {
  // Quintal do Bar do Zé: elipse 1520 × 940 (≈ 22% mais área que o retângulo da v0.1).
  arena: { width: 1920, height: 1200, cx: 960, cy: 600, rx: 760, ry: 470 },
  obstacles: [
    // Boteco brasileiro: mesa amarela no centro (é onde se bebe), engradados, isopores, freezers e churrasqueiras de tambor.
    { kind: 'circle', x: 960, y: 600, r: 70, prop: 'beerTable' },
    { kind: 'rect', x: 640, y: 395, w: 96, h: 72, prop: 'crates' },
    { kind: 'rect', x: 1184, y: 395, w: 96, h: 64, prop: 'cooler' },
    { kind: 'rect', x: 640, y: 733, w: 96, h: 64, prop: 'cooler' },
    { kind: 'rect', x: 1184, y: 733, w: 96, h: 72, prop: 'crates' },
    { kind: 'rect', x: 900, y: 255, w: 120, h: 62, prop: 'freezer' },
    { kind: 'rect', x: 900, y: 880, w: 120, h: 62, prop: 'freezer' },
    { kind: 'circle', x: 520, y: 600, r: 34, prop: 'grill' },
    { kind: 'circle', x: 1400, y: 600, r: 34, prop: 'grill' },
  ],
  spawns: [
    { x: 440, y: 400 },
    { x: 1480, y: 800 },
    { x: 1480, y: 400 },
    { x: 440, y: 800 },
  ],
  player: {
    radius: 26,
    maxHp: 3,
    speed: 200,
    accel: 800,
    decel: 650,
    holdingSpeedMul: 0.75,
    maxFocus: 100,
    startFocus: 60,
    focusRegen: 9,
  },
  attack: {
    engageRange: 250,
    hitRange: 175,
    windupMs: 1500,
    minResponseMs: 700,
    responseCutoffMs: 300,
    earlyLockSpeedup: 0.7,
    minAfterLockMs: 400,
    damage: 1,
  },
  qte: {
    leadMs: 650,
    perfectMs: 100,
    lateMs: 220,
    maxRewindMs: 200,
  },
  costs: {
    swap: 20,
    feint: 20,
    cancel: 15,
    dash: 20,
    maxSwaps: 2,
  },
  timings: {
    afterResolveMs: 550,
    whiffMs: 900,
    cancelMs: 700,
    hitstunMs: 700,
    softenedHitstunMs: 450,
    punishedHitstunMs: 950,
    graceMs: 1300,
    staggerMs: 700,
  },
  knockback: {
    normal: 120,
    strong: 190,
    softened: 70,
    clank: 60,
    protectedPush: 40,
    tauMs: 140,
  },
  dash: { distance: 150, durationMs: 230, cooldownMs: 2200 },
  finisher: {
    graceMs: 1600,
    // Mão de pedra cai em cima: quase não empurra, mas prende no chão.
    rock: { knockback: 40, stunMs: 1300 },
    // Tesoura corta passando: empurra médio e deixa lento.
    scissors: { knockback: 200, stunMs: 700, slowMs: 1800, slowMul: 0.55 },
    // Embrulhado e arremessado como bola de neve: vai mais longe, sem lentidão.
    paper: { knockback: 300, stunMs: 900 },
  },
  perfectFocusBonus: 15,
  beer: { drinkMs: 2200, heal: 1, respawnMs: 25_000, reach: 36 },
  match: { countdownMs: 3000, durationMs: 240_000 },
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
