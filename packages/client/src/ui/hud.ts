import type { Rps, Snapshot } from '@ppt/shared';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export interface HudActions {
  symbol(s: Rps): void;
  commit(): void;
  cancel(): void;
  dash(): void;
  drink(): void;
}

/** Interface DOM ao redor da arena: cartões de jogadores, log, barra de ações e dicas. */
export class Hud {
  private readonly cards = $('#player-cards');
  private readonly log = $('#log');
  private readonly hint = $('#hint');
  private readonly symButtons = [...document.querySelectorAll<HTMLButtonElement>('.sym')];
  private readonly actButtons = [...document.querySelectorAll<HTMLButtonElement>('.act')];
  private cardsKey = '';
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly meId: string, actions: HudActions) {
    this.log.innerHTML = '';
    const bind = (el: HTMLButtonElement, fn: () => void) => {
      // mousedown + preventDefault: o botão não ganha foco (senão Espaço "clicaria" de novo).
      const down = (ev: MouseEvent) => {
        ev.preventDefault();
        if (ev.button === 0) fn();
      };
      el.addEventListener('mousedown', down);
      this.cleanups.push(() => el.removeEventListener('mousedown', down));
    };
    for (const b of this.symButtons) bind(b, () => actions.symbol(b.dataset.sym as Rps));
    for (const b of this.actButtons) {
      const act = b.dataset.act as keyof HudActions;
      bind(b, () => (actions[act] as () => void)());
    }
  }

  destroy(): void {
    this.cleanups.forEach((f) => f());
  }

  update(snap: Snapshot, now: number, canDrink = false): void {
    // Cartões só são reconstruídos quando algo visível muda.
    const key = snap.players.map((p) => `${p.id}:${p.hp}:${p.alive}:${Math.round(p.focus / 5)}`).join('|');
    if (key !== this.cardsKey) {
      this.cardsKey = key;
      this.cards.innerHTML = snap.players
        .map((p) => {
          const hearts = '❤'.repeat(p.hp) + '<span style="opacity:.25">' + '❤'.repeat(Math.max(0, p.maxHp - p.hp)) + '</span>';
          const name = p.id === this.meId ? `${escapeHtml(p.name)} (você)` : escapeHtml(p.name);
          return `<div class="pcard ${p.id === this.meId ? 'me' : ''} ${p.alive ? '' : 'dead'}">
            <span class="dot" style="background:${hex(p.color)}"></span>
            <span class="nm">${name}</span><span class="hp">${hearts}</span>
            <span class="fb" title="Foco"><i style="width:${Math.round(p.focus)}%"></i></span></div>`;
        })
        .join('');
    }

    const me = snap.players.find((p) => p.id === this.meId);
    if (!me) return;
    const playing = snap.phase === 'playing' && me.alive;
    for (const b of this.symButtons) {
      b.classList.toggle('current', me.symbol === b.dataset.sym);
      b.disabled = !playing || me.locked;
    }
    for (const b of this.actButtons) {
      const act = b.dataset.act;
      b.disabled =
        !playing ||
        (act === 'drink'
          ? !canDrink
          : act === 'dash'
            ? me.holding || now < me.dashReadyAt || me.drinkingUntil > now
            : !me.holding || me.locked);
    }

    const attackers = snap.players.filter((p) => p.alive && p.targetId === this.meId);
    let text = '';
    let warn = false;
    if (!me.alive) text = 'Você foi eliminado. Assista ao fim da partida.';
    else if (snap.phase !== 'playing') text = '';
    else if (me.drinkingUntil > now) {
      warn = attackers.length > 0;
      text = 'Glub, glub… bebendo! Se levar um golpe agora, derrama.';
    } else if (me.stunned) text = 'Atordoado!';
    else if (me.holding && !me.locked) {
      text = `Segurando ${me.symbol ? labelOf(me.symbol) : ''} — troque (1/2/3), cancele (X) ou dê a Última Palavra (Espaço). Trocas restantes: ${me.swapsLeft}`;
    } else if (me.holding) text = 'Símbolo travado. Aguarde o impacto.';
    else if (attackers.length) {
      warn = true;
      text = `${attackers.map((a) => a.name).join(' e ')} está atacando você! Responda (1/2/3), afaste-se ou use a investida (Shift).`;
    } else if (canDrink) text = 'Tem uma gelada na mesa: aperte E para beber e recuperar 1 ❤ (fica parado e vulnerável).';
    else if (me.busy) text = 'Recuperando…';
    else text = 'Escolha um alvo (clique/Tab) e um símbolo (1/2/3) para atacar.';
    this.hint.textContent = text;
    this.hint.classList.toggle('warn', warn);
  }

  addLog(line: string, tone: 'me-win' | 'me-loss' | '' = ''): void {
    const li = document.createElement('li');
    li.textContent = line;
    if (tone) li.className = tone;
    this.log.prepend(li);
    while (this.log.children.length > 30) this.log.lastElementChild?.remove();
  }
}

function labelOf(s: Rps): string {
  return s === 'rock' ? '✊ Pedra' : s === 'paper' ? '✋ Papel' : '✌️ Tesoura';
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
