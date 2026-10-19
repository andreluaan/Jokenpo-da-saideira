import { audio, type Bus } from './engine';

/**
 * Efeitos sintetizados na hora (nenhum arquivo baixado). Cada função toca um som curto;
 * `at` = atraso em segundos (para casar com a animação) e `vol` = volume relativo (1 = normal).
 * Tom: golpes exagerados de desenho; copos, tampinhas e brasa mais realistas (ART_DIRECTION §9).
 */

/** Pequena folga ao agendar: o relógio do áudio anda à frente do JavaScript e um som "no passado" sai mudo. */
const LOOKAHEAD = 0.03;

interface ToneOpts {
  f: number;
  f2?: number;
  type?: OscillatorType;
  dur: number;
  vol: number;
  at?: number;
  attack?: number;
  bus?: Bus;
  vibrato?: { rate: number; depth: number };
  lp?: number;
}

function tone(o: ToneOpts): void {
  const ctx = audio.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + LOOKAHEAD + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    lg.gain.value = o.vibrato.depth;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  const g = ctx.createGain();
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc.connect(g);
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    node = node.connect(f);
  }
  node.connect(audio.bus(o.bus ?? 'sfx'));
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

interface NoiseOpts {
  type: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  dur: number;
  vol: number;
  at?: number;
  attack?: number;
  bus?: Bus;
}

function noise(o: NoiseOpts): void {
  const ctx = audio.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + LOOKAHEAD + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = audio.noise();
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = ctx.createGain();
  const a = o.attack ?? 0.003;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(audio.bus(o.bus ?? 'sfx'));
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- Jo-Ken-Pô

/** Punho batendo na mesa: JO e KEN = "toc"; PÔ! = "TUM" mais forte. */
export function knock(strong: boolean, vol = 1): void {
  const v = vol * (strong ? 1 : 0.6);
  tone({ f: strong ? 120 : 170, f2: strong ? 45 : 75, dur: strong ? 0.32 : 0.16, vol: 0.9 * v });
  noise({ type: 'bandpass', f: strong ? 700 : 1100, q: 1.2, dur: strong ? 0.09 : 0.05, vol: 0.5 * v });
  if (strong) tone({ f: 260, f2: 130, type: 'triangle', dur: 0.12, vol: 0.25 * v });
}

/** Botou o símbolo: o mesmo clique seco para os três (o símbolo já aparece na tela). */
export function pickClick(vol = 1): void {
  noise({ type: 'highpass', f: 2500, dur: 0.035, vol: 0.5 * vol });
  tone({ f: 1500, f2: 900, type: 'triangle', dur: 0.06, vol: 0.4 * vol });
}

/** Pego roubando: apito curto de juiz. */
export function caughtWhistle(vol = 1): void {
  tone({ f: 2700, type: 'square', dur: 0.1, vol: 0.2 * vol, lp: 5000, vibrato: { rate: 38, depth: 90 } });
  tone({ f: 2700, type: 'square', dur: 0.28, at: 0.14, vol: 0.2 * vol, lp: 5000, vibrato: { rate: 38, depth: 90 } });
}

// ---------------------------------------------------------------- golpes

/** Golpe normal (qualquer símbolo): "pof" de desenho. */
export function hit(vol = 1): void {
  tone({ f: 230, f2: 70, dur: 0.2, vol: 0.8 * vol });
  noise({ type: 'lowpass', f: 1400, f2: 300, dur: 0.14, vol: 0.5 * vol });
  tone({ f: 520, f2: 260, type: 'triangle', dur: 0.08, vol: 0.18 * vol });
}

/** Esquiva/erro: vento passando. */
export function whoosh(vol = 1, at = 0): void {
  noise({ type: 'bandpass', f: 700, f2: 2400, q: 1.2, dur: 0.26, vol: 1.2 * vol, attack: 0.08, at });
}

/** Empate com choque: copos tilintando. */
export function clink(vol = 1, at = 0, bus: Bus = 'sfx'): void {
  const base = rnd(1900, 2300);
  for (const [k, v] of [[1, 0.3], [1.52, 0.18], [2.3, 0.1]] as const) tone({ f: base * k, dur: rnd(0.35, 0.55), vol: v * vol, at, bus });
}

/** Golpe especial da PEDRA: o punho gigante cai (vento) e esmaga (BONK pesado). Casado com finishers.ts (cai em 240 ms). */
export function finisherRock(vol = 1): void {
  noise({ type: 'bandpass', f: 300, f2: 1400, q: 1.5, dur: 0.24, vol: 0.3 * vol, attack: 0.18 });
  const at = 0.24;
  tone({ f: 150, f2: 35, dur: 0.6, vol: 1 * vol, at });
  noise({ type: 'lowpass', f: 600, f2: 120, dur: 0.5, vol: 0.7 * vol, at });
  tone({ f: 640, f2: 300, type: 'triangle', dur: 0.14, vol: 0.35 * vol, at });
  // Pedrinhas rolando depois.
  for (let i = 0; i < 4; i++) noise({ type: 'bandpass', f: rnd(1500, 3000), q: 4, dur: 0.04, vol: 0.12 * vol, at: at + 0.12 + i * rnd(0.05, 0.09) });
}

/** Golpe especial da TESOURA: chega zunindo e dá dois "tsc" metálicos (corte em 210 ms). */
export function finisherScissors(vol = 1): void {
  noise({ type: 'bandpass', f: 1500, f2: 6000, q: 3, dur: 0.21, vol: 0.25 * vol, attack: 0.15 });
  for (const at of [0.2, 0.27]) {
    noise({ type: 'highpass', f: 4500, dur: 0.03, vol: 0.5 * vol, at });
    tone({ f: 3300, f2: 2600, type: 'square', dur: 0.05, vol: 0.08 * vol, at, lp: 7000 });
  }
  tone({ f: 4200, dur: 0.5, vol: 0.08 * vol, at: 0.28 });
  tone({ f: 6350, dur: 0.4, vol: 0.05 * vol, at: 0.28 });
  tone({ f: 200, f2: 80, dur: 0.18, vol: 0.5 * vol, at: 0.22 });
}

/** Golpe especial do PAPEL: amassa (farfalhar), "fuuush" do voo e "plof" no chão (embrulha em 170 ms, voa até 760 ms). */
export function finisherPaper(vol = 1): void {
  for (let i = 0; i < 6; i++) noise({ type: 'bandpass', f: rnd(2000, 4500), q: 2, dur: 0.05, vol: 0.25 * vol, at: i * 0.028 });
  noise({ type: 'bandpass', f: 500, f2: 1800, q: 1.2, dur: 0.35, vol: 0.35 * vol, attack: 0.12, at: 0.17 });
  noise({ type: 'bandpass', f: 1800, f2: 400, q: 1.2, dur: 0.3, vol: 0.25 * vol, at: 0.5 });
  tone({ f: 180, f2: 70, dur: 0.18, vol: 0.5 * vol, at: 0.76 });
  noise({ type: 'lowpass', f: 900, dur: 0.12, vol: 0.3 * vol, at: 0.76 });
}

/** Alguém foi eliminado: "fiiiu-tum" de desenho. */
export function knockout(vol = 1): void {
  tone({ f: 700, f2: 160, type: 'triangle', dur: 0.4, vol: 0.18 * vol });
  tone({ f: 110, f2: 45, dur: 0.3, vol: 0.7 * vol, at: 0.38 });
}

// ---------------------------------------------------------------- boteco

/** Abrindo a long neck: "tsss" da tampinha. */
export function capOpen(vol = 1, bus: Bus = 'sfx'): void {
  tone({ f: 900, f2: 500, type: 'triangle', dur: 0.04, vol: 0.2 * vol, bus });
  noise({ type: 'highpass', f: 2200, f2: 4000, dur: 0.4, vol: 0.22 * vol, attack: 0.01, bus });
}

/** Gole: glu-glu. */
export function gulp(vol = 1): void {
  for (let i = 0; i < 3; i++) {
    const at = i * 0.17;
    tone({ f: rnd(260, 300), f2: rnd(120, 150), dur: 0.11, vol: 0.4 * vol, at });
    noise({ type: 'bandpass', f: 600, q: 3, dur: 0.08, vol: 0.15 * vol, at });
  }
}

/** Derramou: splash e pinguinhos. */
export function splash(vol = 1): void {
  noise({ type: 'lowpass', f: 2500, f2: 500, dur: 0.45, vol: 0.45 * vol, attack: 0.01 });
  for (let i = 0; i < 4; i++) tone({ f: rnd(900, 1500), f2: rnd(1600, 2200), dur: 0.06, vol: 0.12 * vol, at: 0.15 + i * rnd(0.07, 0.13) });
}

/** Queimou na churrasqueira: chiado + estalos de brasa. */
export function sizzle(vol = 1): void {
  noise({ type: 'highpass', f: 3500, dur: 0.9, vol: 0.28 * vol, attack: 0.02 });
  tone({ f: 140, f2: 60, dur: 0.25, vol: 0.4 * vol });
  for (let i = 0; i < 7; i++) noise({ type: 'bandpass', f: rnd(1500, 4000), q: 6, dur: 0.02, vol: 0.3 * vol, at: rnd(0.05, 0.8) });
}

/** Engradado rachou / quebrou. */
export function crate(broken: boolean, vol = 1): void {
  const n = broken ? 5 : 2;
  for (let i = 0; i < n; i++) {
    const at = i * rnd(0.03, 0.07);
    noise({ type: 'bandpass', f: rnd(500, 1200), q: 2.5, dur: 0.07, vol: 0.5 * vol, at });
    tone({ f: rnd(180, 320), f2: 90, type: 'triangle', dur: 0.09, vol: 0.25 * vol, at });
  }
  // Garrafas balançando no engradado.
  clink(0.5 * vol, broken ? 0.12 : 0.05);
}

/** Freezer: abrindo (porta + vapor), escudo pronto (cristais), escudo quebrado (vidro). */
export function freezer(stage: 'start' | 'ready' | 'broken', vol = 1): void {
  if (stage === 'start') {
    tone({ f: 150, f2: 90, dur: 0.12, vol: 0.4 * vol });
    noise({ type: 'bandpass', f: 1200, f2: 3000, q: 0.8, dur: 0.5, vol: 0.18 * vol, attack: 0.05 });
  } else if (stage === 'ready') {
    [1760, 2350, 2960, 3520].forEach((f, i) => tone({ f, dur: 0.5, vol: 0.12 * vol, at: i * 0.06 }));
  } else {
    for (let i = 0; i < 9; i++) {
      const at = rnd(0, 0.25);
      noise({ type: 'highpass', f: rnd(3000, 6000), dur: rnd(0.03, 0.08), vol: 0.3 * vol, at });
      tone({ f: rnd(2500, 5500), dur: rnd(0.1, 0.25), vol: 0.06 * vol, at });
    }
  }
}

/** Garçom esbarrou: bandeja chacoalhando. */
export function trayBump(vol = 1): void {
  tone({ f: 880, dur: 0.35, vol: 0.12 * vol, type: 'triangle' });
  tone({ f: 1330, dur: 0.3, vol: 0.08 * vol, at: 0.03 });
  clink(0.6 * vol, 0.05);
  noise({ type: 'bandpass', f: 1800, q: 1, dur: 0.12, vol: 0.2 * vol });
}

/** Apito de garçom (começo da partida e "rodada por conta da casa"). */
export function waiterWhistle(vol = 1): void {
  tone({ f: 2300, f2: 2500, type: 'square', dur: 0.18, vol: 0.15 * vol, lp: 4500, vibrato: { rate: 30, depth: 60 } });
  tone({ f: 2500, f2: 3000, type: 'square', dur: 0.32, vol: 0.15 * vol, lp: 4500, at: 0.22, vibrato: { rate: 30, depth: 60 } });
}

/** Sino do balcão (Saideira dupla): "dlim-dlim". */
export function bell(vol = 1): void {
  for (const at of [0, 0.22]) {
    tone({ f: 1320, dur: 1.1, vol: 0.22 * vol, at });
    tone({ f: 1320 * 2.76, dur: 0.6, vol: 0.06 * vol, at });
    tone({ f: 1320 * 5.4, dur: 0.25, vol: 0.03 * vol, at });
  }
}

/** Queda de luz: "plá!" do disjuntor + zumbido morrendo. Volta da luz: estalo + zumbido subindo. */
export function power(off: boolean, vol = 1): void {
  noise({ type: 'lowpass', f: 900, dur: 0.12, vol: 0.6 * vol });
  tone({ f: 90, f2: 50, dur: 0.15, vol: 0.6 * vol });
  if (off) tone({ f: 120, f2: 30, type: 'sawtooth', dur: 0.7, vol: 0.12 * vol, lp: 500, at: 0.05 });
  else tone({ f: 40, f2: 120, type: 'sawtooth', dur: 0.4, vol: 0.08 * vol, lp: 500, at: 0.05 });
}

// ---------------------------------------------------------------- fim e menu

/** Fim da partida (discreto): ganhou = festinha com copos; perdeu = "fom-fom-fom-fooom" triste e engraçado. */
export function matchEnd(won: boolean): void {
  if (won) {
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.25, vol: 0.18, at: i * 0.1 }));
    clink(0.6, 0.45);
    capOpen(0.7);
  } else {
    [392, 370, 349].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.32, vol: 0.2, at: i * 0.36, lp: 1200, attack: 0.03 }));
    tone({ f: 330, f2: 300, type: 'sawtooth', dur: 1.0, vol: 0.2, at: 1.08, lp: 1200, attack: 0.03, vibrato: { rate: 5, depth: 8 } });
  }
}

/** Clique de botão no menu: toque de giz/tampinha bem curto. */
export function uiClick(): void {
  noise({ type: 'bandpass', f: 3200, q: 1.5, dur: 0.025, vol: 0.25 });
  tone({ f: 1100, f2: 800, type: 'triangle', dur: 0.04, vol: 0.12 });
}
