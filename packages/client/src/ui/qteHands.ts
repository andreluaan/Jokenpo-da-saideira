import { gradePick, qteEnd, type GameConfig, type Grade, type Rps } from '@ppt/shared';
import { symbolSvg } from './symbolIcons';

/** Batidas do Jo-Ken-Pô: o punho bate na mesa em T − 800 (JO), T − 400 (KEN) e T (PÔ!). */
export const BEAT_MS = 400;

/** Punho de desenho (luva clara com contorno escuro), visto de lado, batendo para baixo. */
const FIST = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M14 22 C14 15 19 12 25 13 C27 9 33 8 37 11 C40 8 46 9 48 13 C53 13 56 17 55 23 L54 40 C53 49 46 54 36 54 L26 54 C18 54 13 48 13 40 Z" fill="#fff4e6" stroke="#2b1d22" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M25 14 L25 26 M37 12 L37 26 M48 14 L47 26" fill="none" stroke="#2b1d22" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M13 34 C20 31 27 33 29 39 C30 44 26 47 21 46" fill="#ffe9cf" stroke="#2b1d22" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M30 54 L30 62 M42 54 L42 62" stroke="#2b1d22" stroke-width="3" stroke-linecap="round"/>
</svg>`;

type Zone = 'early' | 'green' | 'red';

/**
 * QTE com as mãos (v0.14, no lugar da barra curva): ao lado do seu personagem, um punho sobe e desce no ritmo
 * do JO… KEN… PÔ! e bate numa mesinha. A cor da mesinha e do aro do punho mostra a faixa da malandragem:
 * amarelo = cedo (o outro vê sua mão), verde = PÔ! (golpe final se ganhar), vermelho = pego roubando.
 * Ao apertar, o punho vira o símbolo que você botou. O símbolo do adversário aparece no cantinho assim que ele bota.
 */
export class QteHands {
  readonly el = document.createElement('div');
  private readonly fist: HTMLElement;
  private readonly table: HTMLElement;
  private readonly beats: HTMLElement[];
  private readonly opp: HTMLElement;
  private shownKey = '';
  private shownOpp: Rps | null = null;

  constructor(parent: HTMLElement) {
    this.el.className = 'qhand';
    this.el.innerHTML = `
      <div class="qh-opp"></div>
      <div class="qh-stage"><div class="qh-fist"></div><div class="qh-table"></div></div>
      <div class="qh-beats"><span>JO</span><span>KEN</span><span>PÔ!</span></div>`;
    parent.appendChild(this.el);
    this.fist = this.el.querySelector('.qh-fist')!;
    this.table = this.el.querySelector('.qh-table')!;
    this.beats = [...this.el.querySelectorAll<HTMLElement>('.qh-beats span')];
    this.opp = this.el.querySelector('.qh-opp')!;
  }

  hide(): void {
    this.el.style.display = 'none';
    this.shownKey = '';
  }

  /**
   * `x, y` = canto do personagem na tela; `scale` acompanha o zoom da câmera.
   * `pickedAt` = quando você apertou (local, para responder na hora) ou null.
   */
  update(o: {
    x: number;
    y: number;
    /** Fica à esquerda do ponto (o adversário está à direita). */
    left: boolean;
    scale: number;
    now: number;
    impactAt: number;
    pickedAt: number | null;
    symbol: Rps | null;
    opp: { symbol: Rps | null; pickedAt: number | null } | null;
    cfg: GameConfig;
  }): void {
    const { qte } = o.cfg;
    const T = o.impactAt;
    const end = qteEnd(T, qte);
    this.el.style.display = '';
    this.el.style.transform = `translate(${o.x}px, ${o.y}px) scale(${o.scale.toFixed(3)})`;
    this.el.classList.toggle('left', o.left);

    // Faixa atual (ou a nota de quando você apertou).
    const at = o.pickedAt ?? o.now;
    const d = at - T;
    const zone: Zone = d < -qte.greenBeforeMs ? 'early' : d <= qte.greenAfterMs ? 'green' : 'red';
    const grade: Grade | null = o.pickedAt !== null ? gradePick(o.pickedAt, T, qte) : o.now > end ? 'fail' : null;
    this.el.dataset.zone = grade ? (grade === 'perfect' ? 'green' : grade === 'good' ? 'early' : 'red') : zone;
    this.el.classList.toggle('done', grade !== null);

    // Punho: sobe na preparação e bate na mesa em cada batida (JO, KEN, PÔ!); depois do PÔ! fica em cima, tremendo.
    let lift: number;
    const dt = T - o.now;
    if (grade !== null) lift = 0.15;
    else if (dt > BEAT_MS * 2 + BEAT_MS / 2) lift = 1 - Math.min(1, Math.max(0, (dt - BEAT_MS * 2.5) / 300)) * 0.4;
    else if (dt >= 0) {
      const k = (((dt % BEAT_MS) + BEAT_MS) % BEAT_MS) / BEAT_MS;
      lift = Math.sin(k * Math.PI);
    } else lift = Math.min(1, -dt / 120) * 0.35 + Math.sin(o.now / 25) * 0.04;
    this.fist.style.transform = `translateY(${(-lift * 34).toFixed(1)}px)`;

    // O punho vira o símbolo que você botou (ou "?" se a barra acabou sem nada).
    const key = o.pickedAt !== null && o.symbol ? o.symbol : grade === 'fail' ? 'none' : 'fist';
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.fist.innerHTML = key === 'fist' ? FIST : key === 'none' ? '<b class="qh-none">?</b>' : symbolSvg(key as Rps);
      this.fist.classList.toggle('picked', key !== 'fist');
    }

    // Batidas acendendo: JO e KEN quando passam, PÔ! na entrada do verde.
    const lit = [o.now >= T - 2 * BEAT_MS, o.now >= T - BEAT_MS, o.now >= T - qte.greenBeforeMs];
    this.beats.forEach((b, i) => b.classList.toggle('on', lit[i]));
    // Mesinha pisca na batida.
    this.table.classList.toggle('hit', grade === null && lift < 0.15);

    // Símbolo do adversário (se ele já botou): é isso que o malandro espera para ver.
    const os = o.opp?.symbol ?? null;
    if (os !== this.shownOpp) {
      this.shownOpp = os;
      this.opp.innerHTML = os ? symbolSvg(os) : '';
    }
  }
}
