import { withSymbolIcons } from './symbolIcons';

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
    body: 'Até 4 no ringue do quintal do Bar do Zé, com a cidade toda assistindo. Quem ficar de pé por último leva a cerveja.',
    keys: [],
  },
  {
    img: 'howto/2-mover.jpg',
    title: 'Movimentação',
    body: 'Ande pela arena e use engradados, isopores e churrasqueiras como cobertura. A investida é curta e gasta metade do foco: serve pra escapar de um duelo antes de botar o símbolo.',
    keys: ['W A S D', 'Shift investida'],
  },
  {
    img: 'howto/3-alvo.jpg',
    title: 'Chame pro Jo-Ken-Pô',
    body: 'Chegue perto, escolha o adversário (clique ou Tab) e aperte Espaço. Os dois entram no duelo, 1 contra 1.',
    keys: ['Clique / Tab', 'Espaço desafia'],
  },
  {
    img: 'howto/4-duelo.jpg',
    title: 'Bote no verde',
    body: 'Embaixo da arena aparece JO · KEN · PÔ! no ritmo dos punhos. No PÔ! o texto fica verde: aperte seu símbolo ali. Botou antes? O outro já vê sua mão. Não botou nada? Apanha.',
    keys: ['1 [rock]', '2 [paper]', '3 [scissors]'],
  },
  {
    img: 'howto/5-malandragem.jpg',
    title: 'Malandragem tem limite',
    body: 'O símbolo de quem botou aparece em cima da cabeça dele. Dá pra esperar e virar no último instante… mas se o JO · KEN · PÔ! ficar vermelho, é pego roubando e apanha.',
    keys: [],
  },
  {
    img: 'howto/6-golpe.jpg',
    title: 'Golpe final',
    body: 'Quem ganha no símbolo derruba o outro (−1 ❤). Ganhou botando no verde? Sai o golpe especial: a pedra esmaga, a tesoura corta e deixa lento, o papel embrulha e arremessa.',
    keys: [],
  },
  {
    img: 'howto/7-gelada.jpg',
    title: 'Machucou? Toma uma gelada',
    body: 'Na mesa GELADA do meio, aperte E para beber (+1 ❤). Se te chamarem pro duelo bebendo, derrama! Nos freezers da cerca, E dá um escudo de gelo que segura um golpe.',
    keys: ['E beber / freezer'],
  },
  {
    img: 'howto/8-boteco.jpg',
    title: 'O boteco também joga',
    body: 'Quem é jogado na churrasqueira queima, engradado quebra e cerveja derramada escorrega. E toda rodada o Zé apronta: Saideira dupla, queda de luz ou rodada por conta da casa.',
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
    window.addEventListener('resize', () => !root.classList.contains('hidden') && (this.fitText(), this.go(this.i, true, false)));
    window.addEventListener('keydown', (e) => {
      if (root.classList.contains('hidden')) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.go(this.i + 1);
      else if (e.key === 'ArrowLeft') this.go(this.i - 1);
    });
    // Arrastar para o lado (dedo ou mouse) também troca de card.
    const stage = this.$('.howto-stage');
    let startX: number | null = null;
    stage.addEventListener('pointerdown', (e) => (startX = e.clientX));
    stage.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) this.go(this.i + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener('pointercancel', () => (startX = null));
    // Pré-carrega (e decodifica) as imagens para a troca de card não piscar.
    for (const s of STEPS) {
      const im = new Image();
      im.src = url(s.img);
      im.decode?.().catch(() => {});
    }
  }

  open(): void {
    this.root.classList.remove('hidden');
    this.fitText();
    this.go(0, true);
    this.$<HTMLButtonElement>('#howto-next').focus();
    // Mede de novo com a janela já desenhada e as fontes carregadas (no 1º instante a medida sai curta).
    const refit = () => {
      if (this.root.classList.contains('hidden')) return;
      this.fitText();
      this.go(this.i, false, false);
    };
    requestAnimationFrame(refit);
    document.fonts?.ready.then(refit);
  }

  /** Altura do texto = a do card mais comprido: a janela não muda de tamanho ao trocar de página. */
  private fitText(): void {
    const box = this.$('.howto-text');
    box.style.setProperty('--howto-text-h', '0px');
    let max = 0;
    for (const s of STEPS) {
      this.$('#howto-title').textContent = s.title;
      this.$('#howto-body').textContent = s.body;
      this.$('#howto-keys').innerHTML = s.keys.map((key) => `<kbd>${withSymbolIcons(key)}</kbd>`).join('');
      max = Math.max(max, box.scrollHeight);
    }
    box.style.setProperty('--howto-text-h', `${Math.ceil(max)}px`);
  }

  close(): void {
    this.root.classList.add('hidden');
  }

  private go(k: number, first = false, animate = true): void {
    if (k < 0 || k >= STEPS.length) return;
    const dir = k >= this.i ? 1 : -1;
    this.i = k;
    const s = STEPS[k];
    this.$<HTMLImageElement>('#howto-img').src = url(s.img);
    this.$('#howto-img').setAttribute('alt', s.title);
    this.$('#howto-step').textContent = `${k + 1} de ${STEPS.length}`;
    this.$('#howto-title').textContent = s.title;
    this.$('#howto-body').textContent = s.body;
    this.$('#howto-keys').innerHTML = s.keys.map((key) => `<kbd>${withSymbolIcons(key)}</kbd>`).join('');
    this.$<HTMLButtonElement>('#howto-prev').disabled = k === 0;
    this.$('#howto-next').textContent = k === STEPS.length - 1 ? '🍺 Bora jogar!' : 'Próximo ›';
    this.$('#howto-dots')
      .querySelectorAll('button')
      .forEach((b, j) => b.classList.toggle('on', j === k));
    // Card desliza para o lado em que se andou.
    const card = this.$('.howto-card');
    card.classList.remove('slide-l', 'slide-r', 'enter');
    if (!animate) return;
    void card.offsetWidth;
    card.classList.add(first ? 'enter' : dir > 0 ? 'slide-r' : 'slide-l');
  }
}
