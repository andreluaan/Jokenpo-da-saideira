import Phaser from 'phaser';
import {
  CHARACTER_IDS,
  CHARACTER_INFO,
  DEFAULT_CONFIG,
  PLAYER_COLORS,
  type CharacterId,
  type PlayerView,
} from '@ppt/shared';
import { DEPTH, FONT, buildArena } from '../art/arena';
import { drawCharacter, drawGroundMarker } from '../art/character';
import { WobbleRig } from '../art/rig';

/** Cartões de personagem no menu lateral. */
export class CharacterSelect {
  private selected: CharacterId;

  constructor(
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
    this.render();
  }

  get value(): CharacterId {
    return this.selected;
  }

  select(c: CharacterId): void {
    if (c === this.selected) return;
    this.selected = c;
    this.render();
    this.onChange(c);
  }

  private render(): void {
    this.cards.querySelectorAll<HTMLButtonElement>('.char-card').forEach((b) => b.classList.toggle('selected', b.dataset.char === this.selected));
  }
}

export interface MenuState {
  character: CharacterId;
  bots: number;
  name: string;
}

const R = DEFAULT_CONFIG.player.radius;
const BODY_SCALE = 1.3;
const WALK_SPEED = 0.42; // px/ms
/** Onde ficam, perto da porta do bar, os personagens que não estão na partida. */
const BAR_SPOTS = [
  { x: 120, y: 290 },
  { x: 190, y: 300 },
  { x: 260, y: 290 },
  { x: 330, y: 300 },
];

interface Actor {
  id: CharacterId;
  x: number;
  y: number;
  faceX: number;
  faceY: number;
  walk: number;
  moving: boolean;
  rig: WobbleRig;
  body: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

/**
 * Fundo do menu: o próprio quintal do Bar do Zé, com cada personagem andando até o ponto
 * de largada que terá na partida (você no lugar 1, NPCs nos seguintes). Os que não jogam ficam no bar.
 */
export class MenuBackground {
  private game: Phaser.Game | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly sidebar: HTMLElement,
    private readonly state: () => MenuState,
    private readonly onPick: (c: CharacterId) => void,
  ) {}

  show(): void {
    if (this.game) return;
    const self = this;
    const cfg = DEFAULT_CONFIG;

    class MenuScene extends Phaser.Scene {
      private ground!: Phaser.GameObjects.Graphics;
      private actors: Actor[] = [];
      private last = performance.now();

      create(): void {
        buildArena(this, cfg);
        this.ground = this.add.graphics().setDepth(DEPTH.floor + 10);
        this.actors = CHARACTER_IDS.map((id, i) => ({
          id,
          ...BAR_SPOTS[i],
          faceX: 0,
          faceY: 1,
          walk: 0,
          moving: false,
          rig: new WobbleRig(),
          body: this.add.graphics(),
          label: this.add
            .text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff4e6' })
            .setOrigin(0.5)
            .setDepth(DEPTH.ui)
            .setStroke('#2b1d22', 6),
        }));
        // Começa já com todo mundo no lugar (sem a caminhada inicial).
        const targets = this.targets();
        for (const a of this.actors) Object.assign(a, targets.get(a.id)!.pos);

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          const hit = this.actors
            .map((a) => ({ a, d: Math.hypot(a.x - p.worldX, a.y - R * 1.5 - p.worldY) }))
            .sort((u, v) => u.d - v.d)[0];
          if (hit && hit.d < R * 3) {
            hit.a.rig.hit(p.worldX - 30, p.worldY, hit.a.x, hit.a.y, 0.8);
            self.onPick(hit.a.id);
          }
        });
        this.scale.on('resize', () => this.frame());
        this.frame();
      }

      /** Destino de cada personagem: largada (se joga) ou balcão do bar (se não joga). */
      private targets(): Map<CharacterId, { pos: { x: number; y: number }; slot: number }> {
        const s = self.state();
        const playing = [s.character, ...CHARACTER_IDS.filter((c) => c !== s.character).slice(0, s.bots)];
        const out = new Map<CharacterId, { pos: { x: number; y: number }; slot: number }>();
        CHARACTER_IDS.forEach((c, i) => {
          const slot = playing.indexOf(c);
          out.set(c, { pos: slot >= 0 ? cfg.spawns[slot] : BAR_SPOTS[i], slot });
        });
        return out;
      }

      /** Enquadra a arena na área livre à direita do menu lateral. */
      private frame(): void {
        const W = this.scale.width;
        const H = this.scale.height;
        const side = W > 760 ? self.sidebar.getBoundingClientRect().width : 0;
        const freeW = Math.max(200, W - side);
        const zoom = Math.min(freeW / ((cfg.arena.rx + 90) * 2), H / ((cfg.arena.ry + 110) * 2), 1.25);
        const cam = this.cameras.main;
        cam.setZoom(zoom);
        cam.centerOn(cfg.arena.cx - side / 2 / zoom, cfg.arena.cy - 20);
      }

      update(): void {
        const now = performance.now();
        const dt = Math.min(50, now - this.last);
        this.last = now;
        this.frame();
        const s = self.state();
        const targets = this.targets();
        this.ground.clear();
        for (const a of this.actors) {
          const t = targets.get(a.id)!;
          const dx = t.pos.x - a.x;
          const dy = t.pos.y - a.y;
          const d = Math.hypot(dx, dy);
          a.moving = d > 2;
          if (a.moving) {
            const stepLen = Math.min(d, WALK_SPEED * dt);
            a.x += (dx / d) * stepLen;
            a.y += (dy / d) * stepLen;
            a.walk += stepLen * 0.11;
            a.faceX = dx / d;
            a.faceY = dy / d;
          } else {
            // Parado: olha para o centro da arena.
            const cx = cfg.arena.cx - a.x;
            const cy = cfg.arena.cy - a.y;
            const n = Math.hypot(cx, cy) || 1;
            a.faceX += (cx / n - a.faceX) * 0.08;
            a.faceY += (cy / n - a.faceY) * 0.08;
          }
          const isMe = t.slot === 0;
          const inMatch = t.slot >= 0;
          const view = viewOf(a, t.slot);
          a.rig.update(view, dt, now);
          if (inMatch) drawGroundMarker(this.ground, view, R, isMe, false, now);
          drawCharacter(a.body, view, { R, now, isMe, inGrace: false, walk: a.walk, moving: a.moving, rig: a.rig });
          const hop = isMe && !a.moving ? -Math.abs(Math.sin(now / 280)) * 8 : 0;
          const scale = BODY_SCALE * (isMe ? 1.25 : 1);
          a.body
            .setPosition(a.x, a.y + R * 0.6 + hop)
            .setRotation(a.rig.tilt)
            .setScale(scale)
            .setDepth(a.y + R)
            .setAlpha(inMatch ? 1 : 0.8);
          a.label
            .setText(isMe ? `${s.name || 'Você'} (você)` : inMatch ? CHARACTER_INFO[a.id].name : '')
            .setColor(isMe ? '#ffc145' : '#fff4e6')
            .setPosition(a.x, a.y + R + 34);
        }
      }
    }

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.parent,
      backgroundColor: '#d4876a',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: MenuScene,
      banner: false,
    });
  }

  hide(): void {
    this.game?.destroy(true);
    this.game = null;
  }
}

function viewOf(a: Actor, slot: number): PlayerView {
  return {
    id: a.id,
    name: CHARACTER_INFO[a.id].name,
    color: PLAYER_COLORS[Math.max(0, slot) % PLAYER_COLORS.length],
    character: a.id,
    isBot: slot !== 0,
    x: a.x,
    y: a.y,
    faceX: a.faceX,
    faceY: a.faceY,
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
