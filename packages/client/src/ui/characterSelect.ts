import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId } from '@ppt/shared';

/** Cartões de personagem no menu lateral (com retrato renderizado em 3D, quando disponível). */
export class CharacterSelect {
  private selected: CharacterId;

  constructor(
    private readonly cards: HTMLElement,
    initial: CharacterId,
    private readonly onChange: (c: CharacterId) => void,
  ) {
    this.selected = initial;
    this.cards.innerHTML = CHARACTER_IDS.map(
      (c) =>
        `<button type="button" class="char-card" data-char="${c}"><span class="portrait"></span><b>${CHARACTER_INFO[c].name}</b><span class="tg">${CHARACTER_INFO[c].tagline}</span></button>`,
    ).join('');
    this.cards.querySelectorAll<HTMLButtonElement>('.char-card').forEach((b) =>
      b.addEventListener('click', () => this.select(b.dataset.char as CharacterId)),
    );
    this.render();
  }

  get value(): CharacterId {
    return this.selected;
  }

  /** Personagens já escolhidos por outras pessoas na sala (online). */
  private taken = new Set<CharacterId>();

  setTaken(taken: Iterable<CharacterId>): void {
    this.taken = new Set(taken);
    this.render();
  }

  isTaken(c: CharacterId): boolean {
    return this.taken.has(c);
  }

  /** Muda a seleção sem avisar (quando o servidor decide, ex.: personagem trocado ao entrar). */
  force(c: CharacterId): void {
    this.selected = c;
    this.render();
  }

  select(c: CharacterId): void {
    if (c === this.selected || this.taken.has(c)) return;
    this.selected = c;
    this.render();
    this.onChange(c);
  }

  portraitOf(c: CharacterId): string {
    return this.cards.querySelector<HTMLElement>(`.char-card[data-char="${c}"] .portrait`)?.style.backgroundImage ?? '';
  }

  setPortrait(c: CharacterId, url: string): void {
    const el = this.cards.querySelector<HTMLElement>(`.char-card[data-char="${c}"] .portrait`);
    if (el) el.style.backgroundImage = `url(${url})`;
  }

  private render(): void {
    this.cards.querySelectorAll<HTMLButtonElement>('.char-card').forEach((b) => {
      b.classList.toggle('selected', b.dataset.char === this.selected);
      b.classList.toggle('taken', this.taken.has(b.dataset.char as CharacterId));
    });
  }
}
