import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId } from '@ppt/shared';

/** Jeitão de cada um (só enfeite: a jogabilidade é igual para todos). */
const VIBE: Record<CharacterId, string[]> = {
  fera: ['💪 Fogo da juventude', '🍾 Garrafa na mão'],
  principe: ['👑 Marrento', '💸 Nunca paga'],
  panca: ['🍺 Caneca cheia', '😄 Paizão'],
  sonolento: ['😴 Preguiça', '🧠 Estrategista'],
};

/**
 * Personagem escolhido, num card no canto da tela: retrato 3D, nome, frase e setas para trocar.
 * Também dá para escolher clicando no personagem na mesa do quintal (MenuStage3D chama `select`).
 */
export class CharacterSelect {
  private selected: CharacterId;
  private readonly portraits = new Map<CharacterId, string>();
  /** Personagens já escolhidos por outras pessoas na sala (online). */
  private taken = new Set<CharacterId>();

  constructor(
    private readonly card: HTMLElement,
    initial: CharacterId,
    private readonly onChange: (c: CharacterId) => void,
  ) {
    this.selected = initial;
    this.card.innerHTML = `
      <span class="cs-label">Seu personagem</span>
      <div class="cs-stage">
        <button type="button" class="cs-arrow" data-dir="-1" aria-label="Personagem anterior">‹</button>
        <div class="cs-portrait"></div>
        <button type="button" class="cs-arrow" data-dir="1" aria-label="Próximo personagem">›</button>
      </div>
      <h3 class="cs-name"></h3>
      <p class="cs-tag"></p>
      <div class="cs-vibe"></div>
      <div class="cs-dots">${CHARACTER_IDS.map((c) => `<button type="button" data-char="${c}" aria-label="${CHARACTER_INFO[c].name}"></button>`).join('')}</div>
      <span class="cs-hint">ou clique nele na mesa</span>`;
    this.card.querySelectorAll<HTMLButtonElement>('.cs-arrow').forEach((b) =>
      b.addEventListener('click', () => this.step(Number(b.dataset.dir))),
    );
    this.card.querySelectorAll<HTMLButtonElement>('.cs-dots button').forEach((b) =>
      b.addEventListener('click', () => this.select(b.dataset.char as CharacterId)),
    );
    this.render(false);
  }

  get value(): CharacterId {
    return this.selected;
  }

  setTaken(taken: Iterable<CharacterId>): void {
    this.taken = new Set(taken);
    this.render(false);
  }

  isTaken(c: CharacterId): boolean {
    return this.taken.has(c);
  }

  /** Muda a seleção sem avisar (quando o servidor decide, ex.: personagem trocado ao entrar). */
  force(c: CharacterId): void {
    this.selected = c;
    this.render(true);
  }

  select(c: CharacterId): void {
    if (c === this.selected || this.taken.has(c)) return;
    this.selected = c;
    this.render(true);
    this.onChange(c);
  }

  /** Próximo/anterior livre (pula quem já está ocupado na sala). */
  private step(dir: number): void {
    const n = CHARACTER_IDS.length;
    let i = CHARACTER_IDS.indexOf(this.selected);
    for (let k = 0; k < n - 1; k++) {
      i = (i + dir + n) % n;
      if (!this.taken.has(CHARACTER_IDS[i])) return this.select(CHARACTER_IDS[i]);
    }
  }

  /** Valor pronto para `background-image` (usado na lista de jogadores da sala). */
  portraitOf(c: CharacterId): string {
    const url = this.portraits.get(c);
    return url ? `url(${url})` : '';
  }

  setPortrait(c: CharacterId, url: string): void {
    this.portraits.set(c, url);
    if (c === this.selected) this.render(false);
  }

  private render(animate: boolean): void {
    const c = this.selected;
    const q = <T extends HTMLElement>(s: string) => this.card.querySelector(s) as T;
    q('.cs-portrait').style.backgroundImage = this.portraitOf(c);
    q('.cs-name').textContent = CHARACTER_INFO[c].name;
    q('.cs-tag').textContent = CHARACTER_INFO[c].tagline;
    q('.cs-vibe').innerHTML = VIBE[c].map((v) => `<span>${v}</span>`).join('');
    this.card.querySelectorAll<HTMLButtonElement>('.cs-dots button').forEach((b) => {
      b.classList.toggle('on', b.dataset.char === c);
      b.classList.toggle('taken', this.taken.has(b.dataset.char as CharacterId));
      b.disabled = this.taken.has(b.dataset.char as CharacterId);
    });
    if (animate) {
      // Reinicia a animação de "troca" (pulinho do retrato e do texto).
      this.card.classList.remove('swap');
      void this.card.offsetWidth;
      this.card.classList.add('swap');
    }
  }
}
