import { gradePick, qteEnd, type GameConfig, type Grade, type Rps } from '@ppt/shared';
import { symbolSvg } from './symbolIcons';

/** Batidas do Jo-Ken-Pô: o punho bate na palma em T − 800 (JO), T − 400 (KEN) e T (PÔ!). */
export const BEAT_MS = 400;

/** Palma aberta (de lado, para cima): onde o punho bate. */
const PALM = `<path d="M6 44 C6 38 10 36 16 36 L56 36 C62 36 66 38 66 42 C66 46 62 48 56 48 L18 50 C10 51 6 49 6 44 Z" class="skin"/>
  <path d="M30 36 L30 48 M42 36 L42 48 M54 36 L54 47" class="line"/>
  <path d="M14 36 C12 30 16 26 22 28 L26 36" class="skin"/>`;
/** Punho fechado (de lado), que sobe e desce. */
const FIST = `<g class="fist"><path d="M18 4 C18 0 22 -2 27 -1 C29 -4 34 -5 38 -2 C41 -5 47 -4 49 0 C54 0 57 4 56 9 L55 22 C54 29 48 32 40 32 L30 32 C22 32 17 27 17 21 Z" class="skin"/>
  <path d="M28 0 L28 10 M38 -2 L38 10 M48 0 L47 10" class="line"/>
  <path d="M17 15 C23 13 29 15 30 20 C31 24 27 26 23 25" class="skin2"/></g>`;

type Zone = 'early' | 'green' | 'red';

/**
 * Jo-Ken-Pô fora do personagem (v0.15): um painel fixo na lateral da tela (estilo lousa), que não atrapalha
 * o duelo. As palavras JO · KEN · PÔ! acendem no ritmo; a mão desenhada bate o punho na palma em cada batida
 * e muda de cor: normal = cedo (o outro vê sua mão), verde = PÔ! (golpe final se ganhar), vermelho = roubou.
 * Embaixo, a faixa do tempo com o ponteiro. Ao apertar, o punho vira o seu símbolo.
 * O gesto do adversário aparece assim que ele bota — é isso que o malandro espera para ver.
 */
export class QteHands {
  readonly el = document.createElement('div');
  private readonly words: HTMLElement[];
  private readonly fist: SVGGElement;
  private readonly picked: HTMLElement;
  private readonly needle: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly opp: HTMLElement;
  private shownKey = '';
  private shownOpp = '';

  constructor(parent: HTMLElement) {
    this.el.className = 'jkp-panel';
    this.el.innerHTML = `
      <div class="jkp-words"><span>JO</span><span>KEN</span><span>PÔ!</span></div>
      <div class="jkp-stage">
        <svg viewBox="0 -8 72 62" class="jkp-hands" aria-hidden="true">${PALM}${FIST}</svg>
        <div class="jkp-picked"></div>
      </div>
      <div class="jkp-bar"><i class="z-early"></i><i class="z-green"></i><i class="z-red"></i><b class="jkp-needle"></b></div>
      <div class="jkp-opp"></div>`;
    parent.appendChild(this.el);
    this.words = [...this.el.querySelectorAll<HTMLElement>('.jkp-words span')];
    this.fist = this.el.querySelector('.fist')!;
    this.picked = this.el.querySelector('.jkp-picked')!;
    this.needle = this.el.querySelector('.jkp-needle')!;
    this.bar = this.el.querySelector('.jkp-bar')!;
    this.opp = this.el.querySelector('.jkp-opp')!;
  }

  hide(): void {
    this.el.classList.remove('on');
    this.shownKey = '';
  }

  update(o: {
    now: number;
    impactAt: number;
    /** Quando você apertou (local, para responder na hora) ou null. */
    pickedAt: number | null;
    symbol: Rps | null;
    opp: { name: string; symbol: Rps | null } | null;
    cfg: GameConfig;
  }): void {
    const { qte, attack } = o.cfg;
    const T = o.impactAt;
    const t0 = T - attack.windupMs;
    const end = qteEnd(T, qte);
    this.el.classList.add('on');

    // Faixa atual (ou a nota de quando você apertou).
    const at = o.pickedAt ?? o.now;
    const d = at - T;
    const zone: Zone = d < -qte.greenBeforeMs ? 'early' : d <= qte.greenAfterMs ? 'green' : 'red';
    const grade: Grade | null = o.pickedAt !== null ? gradePick(o.pickedAt, T, qte) : o.now > end ? 'fail' : null;
    this.el.dataset.zone = grade ? (grade === 'perfect' ? 'green' : grade === 'good' ? 'early' : 'red') : zone;
    this.el.classList.toggle('done', grade !== null);

    // Punho: sobe na preparação e bate na palma a cada batida; depois do PÔ! fica no ar, tremendo.
    let lift: number;
    const dt = T - o.now;
    if (grade !== null) lift = 0.5;
    else if (dt > BEAT_MS * 2.5) lift = Math.min(1, (attack.windupMs - dt) / 300);
    else if (dt >= 0) lift = Math.sin(((((dt % BEAT_MS) + BEAT_MS) % BEAT_MS) / BEAT_MS) * Math.PI);
    else lift = Math.min(1, -dt / 120) * 0.6 + Math.sin(o.now / 25) * 0.04;
    const hit = grade === null && lift < 0.1;
    this.fist.setAttribute('transform', `translate(0 ${(12 - lift * 18).toFixed(1)})${hit ? ' scale(1.04 0.94)' : ''}`);
    this.el.classList.toggle('hit', hit);

    // Batidas acendendo: JO, KEN e o PÔ! (na entrada do verde). Só a batida da vez fica forte.
    const lit = [o.now >= T - 2 * BEAT_MS, o.now >= T - BEAT_MS, o.now >= T - qte.greenBeforeMs];
    this.words.forEach((w, i) => {
      w.classList.toggle('on', lit[i] && (i === 2 || !lit[i + 1]));
      w.classList.toggle('past', lit[i] && i < 2 && lit[i + 1]);
    });

    // Faixa do tempo: cedo | verde | vermelho, com o ponteiro andando (congela ao apertar).
    const span = end - t0;
    const pct = (t: number) => `${(Math.max(0, Math.min(1, (t - t0) / span)) * 100).toFixed(2)}%`;
    this.bar.style.setProperty('--g0', pct(T - qte.greenBeforeMs));
    this.bar.style.setProperty('--g1', pct(T + qte.greenAfterMs));
    this.needle.style.left = pct(o.pickedAt ?? o.now);

    // Ao botar, o punho vira o símbolo (ou "?" se acabou sem botar).
    const key = o.pickedAt !== null && o.symbol ? o.symbol : grade === 'fail' ? 'none' : '';
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.picked.innerHTML = key === '' ? '' : key === 'none' ? '<b>?</b>' : symbolSvg(key as Rps);
      this.el.classList.toggle('has-pick', key !== '');
    }

    // O que o adversário mostrou.
    const ok = o.opp ? `${o.opp.name}|${o.opp.symbol ?? ''}` : '';
    if (ok !== this.shownOpp) {
      this.shownOpp = ok;
      this.opp.innerHTML = o.opp
        ? o.opp.symbol
          ? `<span>${esc(o.opp.name)} mostrou</span>${symbolSvg(o.opp.symbol)}`
          : `<span>${esc(o.opp.name)} ainda não botou</span><b>?</b>`
        : '';
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
