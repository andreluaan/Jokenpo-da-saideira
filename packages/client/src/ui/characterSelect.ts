import Phaser from 'phaser';
import { CHARACTER_IDS, CHARACTER_INFO, PLAYER_COLORS, type CharacterId, type PlayerView } from '@ppt/shared';
import { drawCharacter, drawGroundMarker } from '../art/character';
import { WobbleRig } from '../art/rig';
import { PAL } from '../art/palette';

const W = 760;
const H = 230;
const R = 26;

/** Prévia animada dos quatro personagens no menu; clicar em um deles (ou no cartão) o seleciona. */
export class CharacterSelect {
  private game: Phaser.Game | null = null;
  private selected: CharacterId;

  constructor(
    private readonly parent: HTMLElement,
    private readonly cards: HTMLElement,
    initial: CharacterId,
    private readonly onChange: (c: CharacterId) => void,
  ) {
    this.selected = initial;
    this.cards.innerHTML = CHARACTER_IDS.map(
      (c) => `<button type="button" class="char-card" data-char="${c}"><b>${CHARACTER_INFO[c].name}</b><span>${CHARACTER_INFO[c].tagline}</span></button>`,
    ).join('');
    this.cards.querySelectorAll<HTMLButtonElement>('.char-card').forEach((b) =>
      b.addEventListener('click', () => this.select(b.dataset.char as CharacterId)),
    );
    this.renderCards();
  }

  get value(): CharacterId {
    return this.selected;
  }

  select(c: CharacterId): void {
    this.selected = c;
    this.renderCards();
    this.onChange(c);
  }

  /** Cria a prévia (Phaser) quando o menu fica visível; destrói ao sair, para não rodar em segundo plano. */
  show(): void {
    if (this.game) return;
    const self = this;
    class Preview extends Phaser.Scene {
      private bodies: Phaser.GameObjects.Graphics[] = [];
      private ground!: Phaser.GameObjects.Graphics;
      private rigs = CHARACTER_IDS.map(() => new WobbleRig());
      private last = performance.now();
      create(): void {
        const bg = this.add.graphics();
        bg.fillStyle(PAL.ground, 1).fillRect(0, 0, W, H);
        bg.fillStyle(PAL.dirt, 1).fillEllipse(W / 2, H * 0.62, W * 0.95, H * 0.62);
        bg.lineStyle(8, PAL.rim, 1).strokeEllipse(W / 2, H * 0.62, W * 0.95, H * 0.62);
        this.ground = this.add.graphics();
        this.bodies = CHARACTER_IDS.map(() => this.add.graphics());
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          const i = Math.floor((p.x / W) * CHARACTER_IDS.length);
          const c = CHARACTER_IDS[Math.max(0, Math.min(CHARACTER_IDS.length - 1, i))];
          self.select(c);
          this.rigs[i].hit(p.x - 30, p.y, p.x, p.y, 0.8);
        });
      }
      update(): void {
        const now = performance.now();
        const dt = now - this.last;
        this.last = now;
        this.ground.clear();
        CHARACTER_IDS.forEach((c, i) => {
          const x = ((i + 0.5) * W) / CHARACTER_IDS.length;
          const y = H * 0.72;
          const sel = c === self.selected;
          const view = fakeView(c, x, y, i, now);
          this.rigs[i].update(view, dt, now);
          drawGroundMarker(this.ground, view, R, sel, false, now);
          drawCharacter(this.bodies[i], view, { R, now, isMe: sel, inGrace: false, walk: 0, moving: false, rig: this.rigs[i] });
          const hop = sel ? -Math.abs(Math.sin(now / 260)) * 6 : 0;
          this.bodies[i].setPosition(x, y + R * 0.6 + hop).setRotation(this.rigs[i].tilt).setScale(sel ? 1.7 : 1.45);
        });
      }
    }
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.parent,
      width: W,
      height: H,
      backgroundColor: '#d4876a',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: Preview,
      banner: false,
    });
  }

  hide(): void {
    this.game?.destroy(true);
    this.game = null;
  }

  private renderCards(): void {
    this.cards.querySelectorAll<HTMLButtonElement>('.char-card').forEach((b) => b.classList.toggle('selected', b.dataset.char === this.selected));
  }
}

function fakeView(character: CharacterId, x: number, y: number, i: number, now: number): PlayerView {
  return {
    id: character,
    name: CHARACTER_INFO[character].name,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    character,
    isBot: false,
    x,
    y,
    faceX: Math.sin(now / 1500 + i) * 0.3,
    faceY: 0.95,
    hp: 3,
    maxHp: 3,
    focus: 100,
    alive: true,
    holding: false,
    locked: false,
    symbol: null,
    targetId: null,
    impactAt: null,
    clashWith: null,
    stunned: false,
    busy: false,
    graceUntil: 0,
    dashReadyAt: 0,
    swapsLeft: null,
  };
}
