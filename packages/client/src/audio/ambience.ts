import { audio } from './engine';
import { capOpen, clink } from './sfx';

/**
 * Clima do quintal (canal "ambiente"), sempre bem baixinho, só de fundo:
 * - burburinho do bar: várias "vozes" sintetizadas falando sílabas sem sentido, abafadas;
 * - copos e tampinhas de vez em quando;
 * - torcida reagindo aos lances (uuuh, risada, aplauso, lamento).
 * Sem TV e sem bichos (pedido do usuário).
 */

const VOICES = 7;
const LEVEL = 0.35; // volume do burburinho dentro do canal ambiente

interface Voice {
  osc: OscillatorNode;
  form: BiquadFilterNode;
  env: GainNode;
  /** Até onde as sílabas já foram agendadas (tempo do AudioContext). */
  until: number;
  pitch: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Formantes aproximados de "a", "é", "ô", "u", "i" — muda a cada sílaba, soa como conversa ao longe.
const FORMANTS = [800, 550, 480, 350, 300, 700, 600];

class Ambience {
  private voices: Voice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextClink = 0;
  private nextCap = 0;
  private out: GainNode | null = null;

  start(): void {
    audio.whenReady(() => {
      if (this.timer) return;
      const ctx = audio.ctx!;
      this.out = ctx.createGain();
      this.out.gain.value = LEVEL;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      this.out.connect(lp).connect(audio.bus('ambient'));
      // "Sala" grave e constante por baixo (o quintal cheio de gente).
      const room = ctx.createBufferSource();
      room.buffer = audio.noise();
      room.loop = true;
      const rf = ctx.createBiquadFilter();
      rf.type = 'lowpass';
      rf.frequency.value = 350;
      const rg = ctx.createGain();
      rg.gain.value = 0.35;
      room.connect(rf).connect(rg).connect(this.out);
      room.start();
      for (let i = 0; i < VOICES; i++) {
        const pitch = i % 3 === 0 ? rnd(190, 240) : rnd(100, 145);
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = pitch;
        const form = ctx.createBiquadFilter();
        form.type = 'bandpass';
        form.Q.value = 5;
        form.frequency.value = 500;
        const env = ctx.createGain();
        env.gain.value = 0;
        osc.connect(form).connect(env).connect(this.out);
        osc.start();
        this.voices.push({ osc, form, env, until: ctx.currentTime + rnd(0, 2), pitch });
      }
      this.nextClink = ctx.currentTime + rnd(2, 5);
      this.nextCap = ctx.currentTime + rnd(8, 15);
      this.timer = setInterval(() => this.schedule(), 250);
      this.schedule();
    });
  }

  /** Agenda as próximas sílabas de cada voz (até ~1,5 s à frente) e os copos/tampinhas. */
  private schedule(): void {
    const ctx = audio.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const horizon = now + 1.5;
    for (const v of this.voices) {
      if (v.until < now) v.until = now + 0.05;
      while (v.until < horizon) {
        // Frase de 3–9 sílabas e uma pausa.
        let t = v.until;
        const n = Math.floor(rnd(3, 10));
        for (let i = 0; i < n; i++) {
          const d = rnd(0.07, 0.2);
          const peak = rnd(0.25, 0.6);
          v.form.frequency.setTargetAtTime(FORMANTS[Math.floor(Math.random() * FORMANTS.length)] * rnd(0.9, 1.15), t, 0.02);
          v.osc.frequency.setTargetAtTime(v.pitch * rnd(0.9, 1.15), t, 0.05);
          v.env.gain.setTargetAtTime(peak, t, 0.02);
          v.env.gain.setTargetAtTime(0, t + d, 0.03);
          t += d + rnd(0.03, 0.09);
        }
        v.until = t + rnd(0.4, 2.2);
      }
    }
    if (now >= this.nextClink) {
      clink(rnd(0.12, 0.25), 0, 'ambient');
      this.nextClink = now + rnd(3, 9);
    }
    if (now >= this.nextCap) {
      capOpen(rnd(0.25, 0.4), 'ambient');
      this.nextCap = now + rnd(12, 28);
    }
  }

  /**
   * Torcida reagindo (bem baixo): `ooh` = golpe bonito, `laugh` = pego roubando,
   * `cheer` = alguém eliminado / vitória, `aww` = lamento.
   */
  react(kind: 'ooh' | 'laugh' | 'cheer' | 'aww', vol = 1): void {
    const ctx = audio.ctx;
    if (!ctx || !this.out) return;
    const t0 = ctx.currentTime + 0.03;
    const dur = kind === 'laugh' ? 1.1 : kind === 'cheer' ? 1.6 : 1.2;
    const vowel = kind === 'ooh' ? [330, 800] : kind === 'aww' ? [650, 1050] : kind === 'laugh' ? [750, 1250] : [550, 1800];
    const bus = audio.bus('ambient');
    const group = ctx.createGain();
    group.gain.setValueAtTime(0.0001, t0);
    group.gain.exponentialRampToValueAtTime(0.09 * vol, t0 + (kind === 'laugh' ? 0.05 : 0.25));
    group.gain.setTargetAtTime(0.0001, t0 + dur * 0.55, dur * 0.2);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = vowel[0];
    f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = vowel[1];
    f2.Q.value = 4;
    const mix = ctx.createGain();
    mix.connect(f1).connect(group);
    mix.connect(f2).connect(group);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    group.connect(lp).connect(bus);
    // Várias gargantas levemente desafinadas.
    for (let i = 0; i < 9; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = (i % 3 === 0 ? 210 : 125) * rnd(0.85, 1.2);
      o.frequency.setValueAtTime(base, t0);
      if (kind === 'ooh') {
        o.frequency.linearRampToValueAtTime(base * 1.35, t0 + 0.35);
        o.frequency.linearRampToValueAtTime(base * 0.85, t0 + dur);
      } else if (kind === 'aww') o.frequency.linearRampToValueAtTime(base * 0.75, t0 + dur);
      else if (kind === 'cheer') o.frequency.linearRampToValueAtTime(base * 1.25, t0 + 0.4);
      const g = ctx.createGain();
      g.gain.value = 0.12;
      if (kind === 'laugh') {
        // "Ha-ha-ha": pulsos ~6 por segundo, cada voz no seu ritmo.
        const rate = rnd(5, 7);
        g.gain.setValueAtTime(0, t0);
        for (let t = rnd(0, 0.1); t < dur; t += 1 / rate) {
          g.gain.setTargetAtTime(0.16, t0 + t, 0.01);
          g.gain.setTargetAtTime(0, t0 + t + 0.07, 0.02);
        }
      }
      o.connect(g).connect(mix);
      o.start(t0);
      o.stop(t0 + dur + 0.5);
    }
    // Aplauso: chuvinha de palmas.
    if (kind === 'cheer') {
      for (let i = 0; i < 40; i++) {
        const at = rnd(0.05, dur);
        const src = ctx.createBufferSource();
        src.buffer = audio.noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(1200, 2600);
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(0.05 * vol * (1 - at / dur) + 0.001, t0 + at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.04);
        src.connect(bp).connect(g).connect(bus);
        src.start(t0 + at, Math.random());
        src.stop(t0 + at + 0.06);
      }
    }
  }
}

export const ambience = new Ambience();
