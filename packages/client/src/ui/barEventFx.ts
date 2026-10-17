import type { BarEventKind, BarEventView } from '@ppt/shared';

/**
 * Clima na tela dos eventos do bar: borda/vinheta que muda o tom do jogo e uma faixa grande de aviso.
 * Aviso (3 s antes) → efeito ligado → some. Pensado para ganhar som depois (cada fase é uma classe CSS).
 */

const TEXT: Record<BarEventKind, { title: string; sub: string; teaser: string }> = {
  saideira: { title: '🍺 SAIDEIRA DUPLA! 🍺', sub: 'Golpe final tira 2 ❤', teaser: 'O Zé tá enchendo os copos…' },
  blackout: { title: '⚡ ACABOU A LUZ!', sub: 'No escuro ninguém vê o crachá de ninguém', teaser: 'As luzes estão piscando…' },
  ze: { title: '📣 ZÉ: "RODADA POR CONTA DA CASA!"', sub: 'O garçom vai largar cervejas no chão (+1 ❤)', teaser: 'O Zé subiu no banquinho…' },
};

export class BarEventFx {
  private readonly root = document.createElement('div');
  private readonly banner = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly sub = document.createElement('div');
  private readonly bar = document.createElement('i');
  private key = '';

  constructor(parent: HTMLElement) {
    this.root.className = 'barfx';
    this.banner.className = 'barfx-banner';
    this.title.className = 't';
    this.sub.className = 's';
    const track = document.createElement('div');
    track.className = 'barfx-time';
    track.append(this.bar);
    this.banner.append(this.title, this.sub, track);
    this.root.append(this.banner);
    parent.appendChild(this.root);
  }

  update(ev: BarEventView | null, now: number): void {
    let stage: 'off' | 'announce' | 'active' | 'end' = 'off';
    if (ev) {
      if (now < ev.startAt) stage = 'announce';
      else if (now < ev.endAt) stage = 'active';
      else if (now < ev.endAt + 900) stage = 'end';
    }
    const key = `${ev?.kind}:${stage}`;
    if (key !== this.key) {
      this.key = key;
      this.root.className = stage === 'off' || !ev ? 'barfx' : `barfx on kind-${ev.kind} stage-${stage}`;
      if (ev) {
        const t = TEXT[ev.kind];
        this.title.textContent = stage === 'announce' ? t.teaser : t.title;
        this.sub.textContent = stage === 'announce' ? '' : stage === 'end' ? 'Acabou!' : t.sub;
      }
    }
    if (!ev || stage === 'off') return;
    if (stage === 'announce') {
      // Contagem regressiva do aviso: 3… 2… 1…
      const n = Math.ceil((ev.startAt - now) / 1000);
      this.sub.textContent = n > 0 ? `${'●'.repeat(n)}` : '';
      this.bar.style.width = '0%';
    } else if (stage === 'active') {
      this.bar.style.width = `${Math.max(0, ((ev.endAt - now) / (ev.endAt - ev.startAt)) * 100)}%`;
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
