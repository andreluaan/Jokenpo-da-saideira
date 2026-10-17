/** Um passo do "Como jogar": imagem do jogo + título + frase curta + teclas. */
interface Step {
  img: string;
  title: string;
  body: string;
  keys: string[];
}

/** Imagens em `public/howto/` (capturas do próprio jogo — ver docs/tech/07-ui-hud.md). */
const STEPS: Step[] = [
  {
    img: 'howto/1-objetivo.jpg',
    title: 'Só tem uma gelada',
    body: 'Até 4 na arena do quintal. Quem ficar de pé por último leva a cerveja do freezer.',
    keys: [],
  },
  {
    img: 'howto/2-mover.jpg',
    title: 'Movimentação',
    body: 'Ande pela arena e use os engradados e churrasqueiras como cobertura. A investida é curta e gasta foco.',
    keys: ['W A S D', 'Shift investida'],
  },
  {
    img: 'howto/3-alvo.jpg',
    title: 'Escolha o alvo e ataque',
    body: 'Clique num adversário (ou Tab) e aperte um símbolo. Ninguém vê o seu até a revelação.',
    keys: ['Clique / Tab', '1 ✊', '2 ✋', '3 ✌️'],
  },
  {
    img: 'howto/4-duelo.jpg',
    title: 'Jo… Ken… PÔ!',
    body: 'Atacado? Responda com um símbolo e vira duelo. Aperte Espaço bem no PÔ! para o golpe perfeito.',
    keys: ['Espaço no PÔ!', 'X cancela'],
  },
  {
    img: 'howto/5-golpe.jpg',
    title: 'Golpe final',
    body: 'Quem ganha no símbolo derruba o outro (−1 ❤). Acertou o tempo? Sai o golpe especial do símbolo.',
    keys: [],
  },
  {
    img: 'howto/6-gelada.jpg',
    title: 'Machucou? Toma uma gelada',
    body: 'Na mesa amarela, aperte E para beber (+1 ❤). Se apanhar bebendo, derrama! No freezer, E dá escudo de gelo.',
    keys: ['E beber / freezer'],
  },
  {
    img: 'howto/7-boteco.jpg',
    title: 'O boteco também joga',
    body: 'Churrasqueira queima, cerveja derramada escorrega e toda rodada o Zé apronta um evento.',
    keys: [],
  },
];

const url = (img: string) => `${import.meta.env.BASE_URL}${img}`;

/** Janela do "Como jogar": um card por vez, com Voltar/Próximo, bolinhas e teclado (← → Esc). */
export class HowTo {
  private i = 0;
  private readonly $ = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;

  constructor(
    private readonly root: HTMLElement,
    opener: HTMLElement,
  ) {
    opener.addEventListener('click', () => this.open());
    this.$('#howto-close').addEventListener('click', () => this.close());
    this.$('#howto-prev').addEventListener('click', () => this.go(this.i - 1));
    this.$('#howto-next').addEventListener('click', () => (this.i === STEPS.length - 1 ? this.close() : this.go(this.i + 1)));
    root.addEventListener('click', (e) => e.target === root && this.close());
    this.$('#howto-dots').innerHTML = STEPS.map((s, k) => `<button type="button" data-k="${k}" aria-label="${s.title}"></button>`).join('');
    this.$('#howto-dots')
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => b.addEventListener('click', () => this.go(Number(b.dataset.k))));
    window.addEventListener('keydown', (e) => {
      if (root.classList.contains('hidden')) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.go(this.i + 1);
      else if (e.key === 'ArrowLeft') this.go(this.i - 1);
    });
    // Pré-carrega as imagens para a troca de card não piscar.
    for (const s of STEPS) new Image().src = url(s.img);
  }

  open(): void {
    this.root.classList.remove('hidden');
    this.go(0, true);
    this.$<HTMLButtonElement>('#howto-next').focus();
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  private go(k: number, first = false): void {
    if (k < 0 || k >= STEPS.length) return;
    const dir = k >= this.i ? 1 : -1;
    this.i = k;
    const s = STEPS[k];
    this.$<HTMLImageElement>('#howto-img').src = url(s.img);
    this.$('#howto-img').setAttribute('alt', s.title);
    this.$('#howto-step').textContent = `${k + 1} de ${STEPS.length}`;
    this.$('#howto-title').textContent = s.title;
    this.$('#howto-body').textContent = s.body;
    this.$('#howto-keys').innerHTML = s.keys.map((key) => `<kbd>${key}</kbd>`).join('');
    this.$<HTMLButtonElement>('#howto-prev').disabled = k === 0;
    this.$('#howto-next').textContent = k === STEPS.length - 1 ? '🍺 Bora jogar!' : 'Próximo ›';
    this.$('#howto-dots')
      .querySelectorAll('button')
      .forEach((b, j) => b.classList.toggle('on', j === k));
    // Card desliza para o lado em que se andou.
    const card = this.$('.howto-card');
    card.classList.remove('slide-l', 'slide-r', 'enter');
    void card.offsetWidth;
    card.classList.add(first ? 'enter' : dir > 0 ? 'slide-r' : 'slide-l');
  }
}
