import { gradePick, qteEnd, type GameConfig, type Grade } from '@ppt/shared';

/** Batidas do Jo-Ken-Pô: T − 800 (JO), T − 400 (KEN) e T (PÔ!). Os punhos dos personagens seguem o mesmo ritmo. */
export const BEAT_MS = 400;

type Zone = 'early' | 'green' | 'red';
let uid = 0;

/**
 * Jo-Ken-Pô (v0.16): só o texto JO · KEN · PÔ! curvado logo abaixo da cerca da frente, acompanhando a elipse
 * da arena — perto do campo de visão, sem cobrir o duelo. As palavras acendem no ritmo e o texto muda de cor:
 * creme = cedo (o outro vê o que você botou), verde = PÔ! (golpe final se ganhar), vermelho = roubou.
 * Ao apertar, a cor congela na nota (mesma regra do `gradePick`).
 * O caminho (pontos na tela) vem do Game3D, que projeta a elipse da arena.
 */
export class QteArc {
  readonly el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly path: SVGPathElement;
  private readonly text: SVGTextElement;
  private readonly words: SVGTSpanElement[];

  constructor(parent: HTMLElement) {
    const id = `jkp-arc-${++uid}`;
    this.el.classList.add('jkp-arc');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<defs><path id="${id}"/></defs>
      <text><textPath href="#${id}" startOffset="50%" text-anchor="middle"><tspan>JO</tspan><tspan class="dot" dx="0.35em">·</tspan><tspan dx="0.35em">KEN</tspan><tspan class="dot" dx="0.35em">·</tspan><tspan dx="0.35em">PÔ!</tspan></textPath></text>`;
    parent.appendChild(this.el);
    this.path = this.el.querySelector('path')!;
    this.text = this.el.querySelector('text')!;
    this.words = [...this.el.querySelectorAll<SVGTSpanElement>('tspan:not(.dot)')];
  }

  hide(): void {
    this.el.classList.remove('on');
  }

  update(o: {
    now: number;
    impactAt: number;
    /** Quando você apertou (local, para responder na hora) ou null. */
    pickedAt: number | null;
    cfg: GameConfig;
    /** Caminho do texto na tela (da esquerda para a direita) e o tamanho da letra em px. */
    arc: { x: number; y: number }[];
    size: number;
  }): void {
    const { qte } = o.cfg;
    const T = o.impactAt;
    const end = qteEnd(T, qte);
    this.el.classList.add('on');
    this.path.setAttribute('d', o.arc.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(''));
    this.text.style.fontSize = `${o.size.toFixed(1)}px`;

    // Cor: faixa atual, ou a nota de quando você apertou (ou "não botou" quando passou do fim).
    const at = o.pickedAt ?? o.now;
    const d = at - T;
    const zone: Zone = d < -qte.greenBeforeMs ? 'early' : d <= qte.greenAfterMs ? 'green' : 'red';
    const grade: Grade | null = o.pickedAt !== null ? gradePick(o.pickedAt, T, qte) : o.now > end ? 'fail' : null;
    this.el.dataset.zone = grade ? (grade === 'perfect' ? 'green' : grade === 'good' ? 'early' : 'red') : zone;
    this.el.classList.toggle('done', grade !== null);

    // Batidas acendendo: JO, KEN e o PÔ! (na entrada do verde). A batida da vez fica maior.
    const lit = [o.now >= T - 2 * BEAT_MS, o.now >= T - BEAT_MS, o.now >= T - qte.greenBeforeMs];
    this.words.forEach((w, i) => {
      w.classList.toggle('lit', lit[i]);
      w.classList.toggle('now', grade === null && lit[i] && (i === 2 || !lit[i + 1]));
    });
  }
}
