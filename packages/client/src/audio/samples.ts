import { audio, type Bus } from './engine';

/**
 * Gravações reais (CC0, ver public/sounds/CREDITS.md). Carregadas uma vez, logo que o som é liberado.
 * `play('impactWood_light', …)` sorteia entre as variações `_000`, `_001`… que existirem.
 */
const FILES = [
  ...range('impactWood_light', 5), ...range('impactWood_heavy', 5), ...range('impactPunch_medium', 5), ...range('impactPunch_heavy', 3),
  ...range('impactMining', 3), ...range('impactSoft_heavy', 3), ...range('impactSoft_medium', 2), ...range('impactGlass_light', 5),
  ...range('impactGlass_medium', 2), ...range('impactGlass_heavy', 2), ...range('impactPlank_medium', 3), ...range('impactPlate_light', 2),
  'impactPlate_medium_000', 'impactMetal_light_000', ...range('impactMetal_medium', 2), ...range('impactTin_medium', 2),
  ...range('impactBell_heavy', 2), 'impactGeneric_light_000',
  'bookFlip1', 'bookFlip2', 'bookFlip3', 'cloth1', 'cloth2', 'cloth3', 'cloth4', 'drawKnife1', 'drawKnife2', 'knifeSlice', 'knifeSlice2',
  'doorOpen_1', 'metalClick', 'metalLatch', 'handleCoins', 'creak1', 'dropLeather', 'chip-lay-1', 'chip-lay-2', 'chip-lay-3', 'card-place-1', 'applause',
];

function range(base: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${base}_00${i}`);
}

const buffers = new Map<string, AudioBuffer>();
/** Grupo → arquivos (ex.: "impactWood_light" → as 5 variações; "cloth" → cloth1…4). */
const groups = new Map<string, string[]>();
for (const f of FILES) {
  const g = f.replace(/[-_]?\d+$/, '');
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g)!.push(f);
}

audio.whenReady(() => {
  const ctx = audio.ctx!;
  for (const f of FILES) {
    fetch(`${import.meta.env.BASE_URL}sounds/${f}.ogg`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => buffers.set(f, buf))
      .catch(() => undefined);
  }
});

export interface PlayOpts {
  vol?: number;
  /** Atraso em segundos. */
  at?: number;
  /** Velocidade (1 = normal; menor = mais grave e lento). */
  rate?: number;
  /** Sorteio de ± na velocidade, para repetir sem soar igual. */
  jitter?: number;
  bus?: Bus;
  /** Corta agudos (Hz) — som "abafado". */
  lp?: number;
  /** Pula o começo do arquivo (s) — alguns têm silêncio antes da batida. */
  skip?: number;
}

/** Toca um arquivo (nome exato) ou um grupo (sorteia a variação). Sem efeito se ainda não carregou. */
export function play(name: string, o: PlayOpts = {}): void {
  const ctx = audio.ctx;
  if (!ctx || audio.silent(o.bus ?? 'sfx')) return;
  const list = groups.get(name) ?? [name];
  const buf = buffers.get(list[Math.floor(Math.random() * list.length)]);
  if (!buf) return;
  const t = ctx.currentTime + 0.02 + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.jitter ?? 0.05));
  const g = ctx.createGain();
  g.gain.value = o.vol ?? 1;
  let node: AudioNode = src.connect(g);
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    node = node.connect(f);
  }
  node.connect(audio.bus(o.bus ?? 'sfx'));
  src.start(t, o.skip ?? 0);
}
