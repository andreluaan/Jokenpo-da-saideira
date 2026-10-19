import { audio, type Bus } from './engine';
import { play } from './samples';

/**
 * Efeitos da partida e do menu, montados com **gravações reais** (Kenney CC0, ver samples.ts) — a 1ª versão
 * sintetizada soou robótica e foi recusada. Só sobra ruído filtrado onde ele soa natural (chiado, "tsss").
 * `vol` = volume relativo (1 = normal); os atrasos casam com as animações de finishers.ts.
 */

/** Folga ao agendar: som marcado "no passado" sai mudo. */
const LOOKAHEAD = 0.02;

/** Ruído filtrado com envelope (chiado da brasa, gás da cerveja, respingo). */
function hiss(o: { type: BiquadFilterType; f: number; f2?: number; dur: number; vol: number; at?: number; attack?: number; bus?: Bus }): void {
  const ctx = audio.ctx;
  if (!ctx || audio.silent(o.bus ?? 'sfx')) return;
  const t = ctx.currentTime + LOOKAHEAD + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = audio.noise();
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.f, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(audio.bus(o.bus ?? 'sfx'));
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

// ---------------------------------------------------------------- Jo-Ken-Pô

/** Punho batendo na mesa de madeira: JO e KEN = "toc"; PÔ! = "TUM" mais forte. */
export function knock(strong: boolean, vol = 1): void {
  if (strong) play('impactWood_heavy', { vol: 0.9 * vol, rate: 0.9 });
  else play('impactWood_light', { vol: 0.7 * vol, rate: 0.95 });
}

/** Botou o símbolo: o mesmo "clac" para os três (o símbolo já aparece na tela). */
export function pickClick(vol = 1): void {
  play('chip-lay', { vol: 0.8 * vol, skip: 0.075 });
}

/** Pego roubando: lata batendo ("plém!"). */
export function caughtWhistle(vol = 1): void {
  play('impactTin_medium', { vol: 0.8 * vol });
}

// ---------------------------------------------------------------- golpes

/** Golpe normal / rasteira (qualquer símbolo): "uhh" de anime (escolhido pelo usuário). */
export function hit(vol = 1): void {
  play('meme-uhh-anime', { vol: 0.75 * vol, jitter: 0 });
}

/** Esquiva/erro: roupa passando no vento. */
export function whoosh(vol = 1, at = 0): void {
  play('cloth', { vol: 0.7 * vol, at, rate: 1.3 });
}

/** Empate com choque: copos tilintando. */
export function clink(vol = 1, at = 0, bus: Bus = 'sfx'): void {
  play('impactGlass_light', { vol: 0.6 * vol, at, bus, jitter: 0.1 });
}

/** Golpe especial da PEDRA. */
export function finisherRock(vol = 1): void {
  // Escolhido pelo usuário ("the rock sound effect"); o estouro cai junto do punho (240 ms).
  play('meme-the-rock', { vol: 0.65 * vol, at: 0.15, jitter: 0 });
}

/** Golpe especial da TESOURA. */
export function finisherScissors(vol = 1): void {
  // Escolhido pelo usuário ("FAAAH"), entrando junto do corte (~210 ms).
  play('meme-faaah', { vol: 0.85 * vol, at: 0.05, jitter: 0 });
}

/** Golpe especial do PAPEL: amassa (papel), voa (vento) e cai ("plof") em ~760 ms. */
export function finisherPaper(vol = 1): void {
  play('bookFlip', { vol: 0.9 * vol, rate: 1.1 });
  play('bookFlip', { vol: 0.7 * vol, at: 0.08, rate: 0.9 });
  play('cloth', { vol: 0.6 * vol, at: 0.2, rate: 0.8 });
  play('impactSoft_heavy', { vol: 0.9 * vol, at: 0.76 });
}

/** Alguém foi eliminado: corpo caindo no chão. */
export function knockout(vol = 1): void {
  play('impactSoft_heavy', { vol: 0.9 * vol, rate: 0.85 });
  play('impactPlank_medium', { vol: 0.4 * vol, at: 0.05 });
}

// ---------------------------------------------------------------- boteco

/** Abrindo a long neck: estalo da tampinha + "tsss". */
export function capOpen(vol = 1, bus: Bus = 'sfx'): void {
  play('metalClick', { vol: 0.6 * vol, bus, rate: 1.2 });
  hiss({ type: 'highpass', f: 3000, f2: 5000, dur: 0.35, vol: 0.08 * vol, attack: 0.01, at: 0.02, bus });
}

/** Pegou a cerveja para beber: latinha abrindo (escolhido pelo usuário, "Cerveja#Mike"). */
export function beerOpen(vol = 1): void {
  play('meme-cerveja-mike', { vol: 0.35 * vol, skip: 0.65, dur: 2.5, jitter: 0 });
}

/** Terminou o gole: garrafa voltando para a mesa. */
export function gulp(vol = 1): void {
  play('impactGlass_medium', { vol: 0.6 * vol });
}

/** Derramou: garrafa quebrando + respingo. */
export function splash(vol = 1): void {
  play('impactGlass_heavy', { vol: 0.7 * vol });
  hiss({ type: 'lowpass', f: 2500, f2: 600, dur: 0.4, vol: 0.12 * vol, attack: 0.01 });
}

/** Caiu na churrasqueira: batida no tambor + chiado da brasa. */
export function sizzle(vol = 1): void {
  play('impactMetal_medium', { vol: 0.7 * vol });
  hiss({ type: 'highpass', f: 4000, dur: 0.9, vol: 0.1 * vol, attack: 0.03 });
}

/** Engradado rachou / quebrou (madeira + garrafas). */
export function crate(broken: boolean, vol = 1): void {
  play('impactPlank_medium', { vol: 0.8 * vol });
  if (broken) play('impactWood_heavy', { vol: 0.7 * vol, at: 0.05 });
  clink(0.8 * vol, broken ? 0.08 : 0.04);
}

/** Freezer: abrindo a porta, escudo pronto, escudo quebrado (vidro). */
export function freezer(stage: 'start' | 'ready' | 'broken', vol = 1): void {
  if (stage === 'start') play('doorOpen', { vol: 0.6 * vol, rate: 1.2 });
  // Escudo pronto: "Cabeça de Gelo" (escolhido pelo usuário).
  else if (stage === 'ready') play('meme-cabeca-de-gelo', { vol: 0.55 * vol, jitter: 0 });
  else play('impactGlass_heavy', { vol: 0.8 * vol, rate: 1.2 });
}

/** Garçom esbarrou: bandeja e copos. */
export function trayBump(vol = 1): void {
  play('impactPlate_medium', { vol: 0.7 * vol });
  clink(0.7 * vol, 0.04);
}

/** Começo da partida e "rodada por conta da casa": sino do balcão. */
export function waiterWhistle(vol = 1): void {
  play('impactBell_heavy', { vol: 0.5 * vol, rate: 1.3 });
}

/** Saideira dupla: sino batendo duas vezes. */
export function bell(vol = 1): void {
  play('impactBell_heavy', { vol: 0.6 * vol, rate: 1.1 });
  play('impactBell_heavy', { vol: 0.5 * vol, rate: 1.1, at: 0.3 });
}

/** Queda de luz (disjuntor "plá!") e a luz voltando (clique). */
export function power(off: boolean, vol = 1): void {
  if (off) {
    play('metalLatch', { vol: 0.9 * vol });
    play('impactGeneric_light', { vol: 0.5 * vol, at: 0.03, rate: 0.7 });
  } else play('metalClick', { vol: 0.7 * vol });
}

/** Rodada por conta da casa: moedas no balcão. */
export function coins(vol = 1): void {
  play('handleCoins', { vol: 0.7 * vol });
}

// ---------------------------------------------------------------- fim e menu

/** Fim da partida. */
export function matchEnd(won: boolean): void {
  // Escolhidos pelo usuário: ganhou = "BEBER"; perdeu = "Perdeu!" do Galvão.
  if (won) play('meme-beber', { vol: 0.5, jitter: 0 });
  else play('meme-perdeu-galvao', { vol: 1.5, jitter: 0 });
}

/** Clique de botão no menu: ficha batendo na mesa. */
export function uiClick(): void {
  play('chip-lay', { vol: 0.45, rate: 1.1, skip: 0.075 });
}
