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
    /** Distância máxima para desafiar alguém (Espaço). */
    engageRange: number;
    /** Distância máxima no momento do PÔ! (quem fugiu para longe escapa). */
    hitRange: number;
    /** Do desafio até o PÔ! (o JO… KEN… da barra). */
    windupMs: number;
    damage: number;
  };
  /**
   * Barra do Jo-Ken-Pô (v0.11, malandragem). T = PÔ!.
   * antes de T − greenBeforeMs: CEDO (vale, mas o outro já vê o seu símbolo)
   * T ± green: PERFEITO (golpe final) · até T + greenAfterMs + redMs: ROUBOU (pego, apanha) · depois: não botou nada.
   */
  qte: {
    greenBeforeMs: number;
    greenAfterMs: number;
    redMs: number;
    /** Recuo máximo aceito no carimbo de tempo de quem apertou (compensa a rede; pequeno para não dar brecha). */
    maxRewindMs: number;
  };
  costs: {
    dash: number;
  };
  timings: {
    afterResolveMs: number;
    whiffMs: number;
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
  /** Cervejas que o garçom larga no chão no evento do Zé: pegar é só passar por cima. */
  items: {
    pickupRadius: number;
    /** Gole rápido (parado e vulnerável). */
    beerDrinkMs: number;
  };
  hazards: {
    /** Empurrado contra a churrasqueira acima desta velocidade (px/ms): queima. */
    grill: { minSpeed: number; stunMs: number; push: number; cooldownMs: number };
    /** Engradado aguenta `hp` trombadas fortes e quebra (deixa poça de cerveja). */
    crate: { hp: number; minSpeed: number; cooldownMs: number };
    /** Poça de cerveja: escorrega (acelera e freia pouco). */
    puddle: { r: number; ms: number; accelMul: number; decelMul: number };
    /** Freezer: abrir leva openMs parado; dá um escudo que segura 1 golpe e derrete após shieldMs. */
    freezer: { openMs: number; cooldownMs: number; reach: number; shieldMs: number };
  };
  /** Um evento do bar por partida, sorteado. */
  barEvents: {
    enabled: boolean;
    /** O evento começa entre estes instantes (ms desde o início da luta). */
    startMs: [number, number];
    announceMs: number;
    saideira: { ms: number; finisherDamage: number };
    blackout: { ms: number };
    ze: { ms: number; beers: number };
  };
  /** Garçom que atravessa a arena junto com o evento. */
  waiter: { speed: number; radius: number; push: number; stunMs: number };
  match: { countdownMs: number; durationMs: number };
}

export const DEFAULT_CONFIG: GameConfig = {
  // Quintal do Bar do Zé: elipse 1520 × 940 (≈ 22% mais área que o retângulo da v0.1).
  arena: { width: 1920, height: 1200, cx: 960, cy: 600, rx: 760, ry: 470 },
  // Layout pensado pela função de cada peça (v0.7), simétrico por rotação de 180° (justo para os 4 cantos):
  // mesa da cerveja no centro (prêmio); engradados colados nela (cobertura de quem disputa; quebram e viram poça);
  // churrasqueiras nos meios-campos em diagonal (onde a briga acontece: dá para arremessar alguém na brasa);
  // freezers encostados na cerca (abrir é arriscado, de costas e encurralado); isopores em pé nas pontas (esconderijo).
  obstacles: [
    { kind: 'circle', x: 960, y: 600, r: 70, prop: 'beerTable' },
    { kind: 'rect', x: 700, y: 640, w: 96, h: 72, prop: 'crates' },
    { kind: 'rect', x: 1124, y: 488, w: 96, h: 72, prop: 'crates' },
    { kind: 'circle', x: 560, y: 470, r: 34, prop: 'grill' },
    { kind: 'circle', x: 1360, y: 730, r: 34, prop: 'grill' },
    { kind: 'rect', x: 575, y: 205, w: 120, h: 62, prop: 'freezer' },
    { kind: 'rect', x: 1225, y: 933, w: 120, h: 62, prop: 'freezer' },
    { kind: 'rect', x: 226, y: 552, w: 64, h: 96, prop: 'cooler' },
    { kind: 'rect', x: 1630, y: 552, w: 64, h: 96, prop: 'cooler' },
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
    // Desafio só de perto; o PÔ! ainda pega um pouco além (quem quer fugir precisa da investida).
    engageRange: 190,
    hitRange: 215,
    windupMs: 1500,
    damage: 1,
  },
  qte: {
    // Verde de 260 ms: dá para ler quem botou CEDO; ler quem botou no começo do verde exige reflexo de malandro.
    greenBeforeMs: 130,
    greenAfterMs: 130,
    // Vermelho logo depois: quem esperou demais para ver o do outro é pego roubando.
    redMs: 300,
    maxRewindMs: 120,
  },
  costs: {
    dash: 50,
  },
  timings: {
    afterResolveMs: 550,
    whiffMs: 900,
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
  // Investida curta e cara: no máximo 2 por barra de foco cheia.
  dash: { distance: 65, durationMs: 170, cooldownMs: 1400 },
  finisher: {
    graceMs: 2000,
    // Mão de pedra cai em cima: quase não empurra, mas prende no chão.
    rock: { knockback: 40, stunMs: 1700 },
    // Tesoura corta passando: empurra médio e deixa lento.
    scissors: { knockback: 200, stunMs: 700, slowMs: 2500, slowMul: 0.55 },
    // Embrulhado e arremessado como bola de neve: vai mais longe, sem lentidão.
    paper: { knockback: 300, stunMs: 900 },
  },
  perfectFocusBonus: 15,
  beer: { drinkMs: 2200, heal: 1, respawnMs: 25_000, reach: 36 },
  items: { pickupRadius: 30, beerDrinkMs: 1300 },
  hazards: {
    grill: { minSpeed: 0.45, stunMs: 500, push: 70, cooldownMs: 1500 },
    crate: { hp: 2, minSpeed: 0.3, cooldownMs: 500 },
    puddle: { r: 55, ms: 18_000, accelMul: 0.45, decelMul: 0.2 },
    freezer: { openMs: 1500, cooldownMs: 20_000, reach: 40, shieldMs: 10_000 },
  },
  barEvents: {
    enabled: true,
    startMs: [22_000, 40_000],
    announceMs: 3000,
    saideira: { ms: 14_000, finisherDamage: 2 },
    blackout: { ms: 10_000 },
    ze: { ms: 12_000, beers: 3 },
  },
  waiter: { speed: 150, radius: 24, push: 110, stunMs: 400 },
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
