import { audio } from './engine';
import { loop, onLoaded, play } from './samples';

/** Burburinho de fundo ("crowd murmur loop", escolhido pelo usuário): quase imperceptível. */
const MURMUR = 'crowd-murmur-loop';
const MURMUR_VOL = 0.35;

/**
 * Clima do quintal (canal "ambiente"), bem baixinho, só de fundo: burburinho gravado em loop, copos tilintando e
 * tampinhas de vez em quando, e aplauso real quando alguém cai. (As vozes sintetizadas da v0.17 foram recusadas.)
 * Sem TV e sem bichos.
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

class Ambience {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextClink = 0;
  private nextCap = 0;
  private murmur = false;

  start(): void {
    audio.whenReady(() => {
      if (this.timer) return;
      const now = audio.now();
      this.nextClink = now + rnd(2, 5);
      this.nextCap = now + rnd(8, 15);
      this.timer = setInterval(() => this.tick(), 250);
      const startMurmur = () => {
        if (!this.murmur) this.murmur = !!loop(MURMUR, MURMUR_VOL, 'ambient');
      };
      startMurmur();
      onLoaded((name) => name === MURMUR && startMurmur());
    });
  }

  private tick(): void {
    const now = audio.now();
    if (now >= this.nextClink) {
      play('impactGlass_light', { vol: rnd(0.12, 0.25), bus: 'ambient', lp: 3500, jitter: 0.15 });
      this.nextClink = now + rnd(3, 9);
    }
    if (now >= this.nextCap) {
      play('metalClick', { vol: rnd(0.15, 0.25), bus: 'ambient', lp: 3000, rate: 1.2 });
      this.nextCap = now + rnd(12, 28);
    }
  }

  /**
   * Torcida reagindo. Só o aplauso tem gravação real por enquanto (`cheer`);
   * `ooh`, `laugh` e `aww` ficam mudos até ter gravação.
   */
  react(kind: 'ooh' | 'laugh' | 'cheer' | 'aww', vol = 1): void {
    if (kind === 'cheer') play('applause', { vol: 0.25 * vol, bus: 'ambient', lp: 4000 });
  }
}

export const ambience = new Ambience();
