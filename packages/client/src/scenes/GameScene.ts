import Phaser from 'phaser';
import { GRADE_LABEL, RPS_ICON, type GameEvent, type Grade, type PlayerView, type Rps, type Snapshot } from '@ppt/shared';
import type { GameConnection } from '../net/connection';
import { Hud } from '../ui/hud';
import { DENY_TEXT, WHIFF_TEXT, describeExchange } from '../ui/describe';
import { DEPTH, FONT, buildArena } from '../art/arena';
import { drawAim, drawCharacter, drawGroundMarker } from '../art/character';
import { WobbleRig } from '../art/rig';
import { DuelFx } from './duelFx';

export interface GameSceneData {
  conn: GameConnection;
  onEnd: (winnerId: string | null) => void;
}

const SYM_KEYS: Record<string, Rps> = { ONE: 'rock', TWO: 'paper', THREE: 'scissors', J: 'rock', K: 'paper', L: 'scissors' };
const GRADE_COLOR: Record<Grade, string> = { perfect: '#5ad19a', good: '#fff4e6', fail: '#ff5a5f' };
/** Escala visual do personagem (a colisão continua com o raio da config). */
const BODY_SCALE = 1.3;
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

interface Labels {
  name: Phaser.GameObjects.Text;
  hand: Phaser.GameObjects.Text;
  body: Phaser.GameObjects.Graphics;
  /** Para animar a caminhada a partir do deslocamento entre quadros. */
  px: number;
  py: number;
  walk: number;
  movingUntil: number;
  rig: WobbleRig;
}

export class GameScene extends Phaser.Scene {
  private conn!: GameConnection;
  private onEnd!: GameSceneData['onEnd'];
  private hud!: Hud;
  /** Camada do chão (setas de mira) e camada de sobreposição (anel do QTE, seleção). */
  private ground!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Labels>();
  private centerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private qteText!: Phaser.GameObjects.Text;
  private targetId: string | null = null;
  private lastMove = { x: 0, y: 0 };
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private unsubscribe: (() => void) | null = null;
  private ended = false;
  private lastPhase = '';
  private lastFrame = 0;
  private duel!: DuelFx;
  private beerGfx!: Phaser.GameObjects.Graphics;
  private beerHint!: Phaser.GameObjects.Text;
  private canDrink = false;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.conn = data.conn;
    this.onEnd = data.onEnd;
    this.labels = new Map();
    this.targetId = null;
    this.ended = false;
    this.lastPhase = '';
  }

  create(): void {
    const cfg = this.conn.config;
    const { width, height } = cfg.arena;

    buildArena(this, cfg);
    this.ground = this.add.graphics().setDepth(DEPTH.floor + 10);
    this.gfx = this.add.graphics().setDepth(DEPTH.ui);
    this.centerText = this.add
      .text(width / 2, height / 2, '', { fontFamily: FONT, fontSize: '150px', fontStyle: '700', color: '#ffc145' })
      .setOrigin(0.5)
      .setDepth(DEPTH.popup + 10)
      .setStroke('#2b1d22', 14);
    this.timerText = this.add
      .text(width / 2, 18, '', { fontFamily: FONT, fontSize: '34px', fontStyle: '700', color: '#fff4e6' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.popup)
      .setStroke('#2b1d22', 8);
    this.qteText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#ffc145' })
      .setOrigin(0.5)
      .setDepth(DEPTH.popup)
      .setStroke('#2b1d22', 6);

    this.duel = new DuelFx(this, cfg.player.radius, BODY_SCALE, (id) => this.labels.get(id)?.rig);
    const table = cfg.obstacles.find((o) => o.prop === 'beerTable');
    this.beerGfx = this.add.graphics().setDepth(table ? table.y + (table.kind === 'circle' ? table.r : table.h) * 0.35 + 1 : 0);
    this.beerHint = this.add
      .text(0, 0, '[E] Beber', { fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: '#ffc145' })
      .setOrigin(0.5)
      .setDepth(DEPTH.popup)
      .setStroke('#2b1d22', 6)
      .setVisible(false);

    this.setupInput();
    this.hud = new Hud(this.conn.localPlayerId, {
      drink: () => this.conn.send({ type: 'drink' }),
      symbol: (s) => this.pressSymbol(s),
      commit: () => this.conn.send({ type: 'commit' }),
      feint: () => this.conn.send({ type: 'feint' }),
      cancel: () => this.conn.send({ type: 'cancel' }),
      dash: () => this.pressDash(),
    });
    this.unsubscribe = this.conn.onEvents((ev) => this.handleEvents(ev));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private cleanup(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hud?.destroy();
  }

  // ------------------------------------------------------------------ entrada

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as GameScene['keys'];
    kb.addCapture('SPACE,TAB,SHIFT,UP,DOWN,LEFT,RIGHT');
    for (const [key, s] of Object.entries(SYM_KEYS)) kb.on(`keydown-${key}`, () => this.pressSymbol(s));
    kb.on('keydown-SPACE', (e: KeyboardEvent) => !e.repeat && this.conn.send({ type: 'commit' }));
    kb.on('keydown-F', () => this.conn.send({ type: 'feint' }));
    kb.on('keydown-X', () => this.conn.send({ type: 'cancel' }));
    kb.on('keydown-SHIFT', () => this.pressDash());
    kb.on('keydown-TAB', () => this.cycleTarget());
    kb.on('keydown-E', () => this.conn.send({ type: 'drink' }));

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return this.conn.send({ type: 'cancel' });
      const snap = this.conn.latest();
      if (!snap) return;
      const hit = snap.players
        .filter((o) => o.alive && o.id !== this.conn.localPlayerId)
        .find((o) => Phaser.Math.Distance.Between(o.x, o.y, p.worldX, p.worldY) < this.conn.config.player.radius + 18);
      if (hit) this.targetId = hit.id;
    });
  }

  private me(snap: Snapshot): PlayerView | undefined {
    return snap.players.find((p) => p.id === this.conn.localPlayerId);
  }

  private pressSymbol(s: Rps): void {
    const snap = this.conn.latest();
    const me = snap && this.me(snap);
    if (!snap || !me) return;
    if (me.holding) return this.conn.send({ type: 'symbol', symbol: s });
    // Sendo atacado: o símbolo responde ao atacante mais iminente (forma duelo).
    const attacker = snap.players
      .filter((p) => p.alive && p.targetId === me.id && p.impactAt !== null)
      .sort((a, b) => a.impactAt! - b.impactAt!)[0];
    const target = attacker ?? this.currentTarget(snap, me);
    if (!target) return this.floatText(me.x, me.y - 60, 'Sem alvo', '#8b93a8');
    this.targetId = target.id;
    this.conn.send({ type: 'symbol', symbol: s, targetId: target.id });
  }

  private pressDash(): void {
    const k = this.keys;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    this.conn.send({ type: 'dash', x, y });
  }

  private cycleTarget(): void {
    const snap = this.conn.latest();
    const me = snap && this.me(snap);
    if (!snap || !me) return;
    const opts = snap.players
      .filter((p) => p.alive && p.id !== me.id)
      .sort((a, b) => dist(me, a) - dist(me, b));
    if (!opts.length) return;
    const i = opts.findIndex((p) => p.id === this.targetId);
    this.targetId = opts[(i + 1) % opts.length].id;
  }

  /** Alvo selecionado (se vivo) ou o adversário vivo mais próximo. */
  private currentTarget(snap: Snapshot, me: PlayerView): PlayerView | undefined {
    const sel = snap.players.find((p) => p.id === this.targetId && p.alive);
    if (sel) return sel;
    const nearest = snap.players.filter((p) => p.alive && p.id !== me.id).sort((a, b) => dist(me, a) - dist(me, b))[0];
    this.targetId = nearest?.id ?? null;
    return nearest;
  }

  // ------------------------------------------------------------------ eventos

  private nameOf = (id: string): string => {
    if (id === this.conn.localPlayerId) return 'Você';
    return this.conn.latest()?.players.find((p) => p.id === id)?.name ?? id;
  };

  private posOf(id: string): { x: number; y: number } | undefined {
    return this.conn.latest()?.players.find((p) => p.id === id);
  }

  private handleEvents(events: GameEvent[]): void {
    const meId = this.conn.localPlayerId;
    for (const e of events) {
      switch (e.type) {
        case 'signal': {
          const p = this.posOf(e.playerId);
          if (!p) break;
          const t = e.kind === 'swap' ? '↻' : e.kind === 'lock' ? '🔒' : '✖';
          const c = e.kind === 'swap' ? '#ffd166' : e.kind === 'lock' ? '#8ecae6' : '#ef476f';
          this.floatText(p.x + 28, p.y - 46, t, c, 26);
          break;
        }
        case 'duel': {
          const a = this.posOf(e.a);
          const b = this.posOf(e.b);
          if (a && b) this.floatText((a.x + b.x) / 2, (a.y + b.y) / 2 - 20, 'DUELO!', '#ffb703', 22);
          break;
        }
        case 'exchange': {
          this.duel.onExchange(e);
          const { headline, line } = describeExchange(e, this.nameOf);
          const involved = e.attackerId === meId || e.defenderId === meId;
          const tone = !involved ? '' : e.damagedId === meId ? 'me-loss' : e.winnerId === meId ? 'me-win' : '';
          this.hud.addLog(line, tone);
          this.floatText(e.x, e.y - this.conn.config.player.radius * 5.2, headline, e.damagedId ? '#ffc145' : '#fff4e6', 20, 1500);
          const a = this.posOf(e.attackerId);
          const d = this.posOf(e.defenderId);
          if (a) this.floatText(a.x, a.y + 42, GRADE_LABEL[e.attackerGrade], GRADE_COLOR[e.attackerGrade], 14);
          if (d && e.defenderGrade) this.floatText(d.x, d.y + 42, GRADE_LABEL[e.defenderGrade], GRADE_COLOR[e.defenderGrade], 14);
          if (e.damagedId) {
            const v = this.posOf(e.damagedId);
            if (v) this.floatText(v.x, v.y - 30, '−1 ❤', '#ef476f', 24);
            if (e.damagedId === meId) this.cameras.main.shake(140, 0.006);
            else if (e.winnerId === meId) this.cameras.main.shake(80, 0.003);
          }
          if (e.protectedId) {
            const v = this.posOf(e.protectedId);
            if (v) this.floatText(v.x, v.y - 30, 'Protegido', '#8ecae6', 16);
          }
          break;
        }
        case 'whiff': {
          // Golpe no vazio: tropeça para a frente, embalado.
          const tgt = this.posOf(e.targetId);
          for (const id of e.playerIds) {
            const q = this.posOf(id);
            if (q && tgt) this.labels.get(id)?.rig.hit(q.x - (tgt.x - q.x), q.y - (tgt.y - q.y), q.x, q.y, 0.7);
          }
          const p = this.posOf(e.playerIds[0]);
          if (p) this.floatText(p.x, p.y - 40, WHIFF_TEXT[e.reason], '#8b93a8', 15);
          if (e.playerIds.includes(meId)) this.hud.addLog(`Você: ${WHIFF_TEXT[e.reason]}`);
          break;
        }
        case 'denied': {
          if (e.playerId !== meId || e.reason === 'phase') break;
          const p = this.posOf(meId);
          if (p) this.floatText(p.x, p.y - 60, DENY_TEXT[e.reason], '#8b93a8', 14, 700);
          break;
        }
        case 'eliminated': {
          const p = this.posOf(e.playerId);
          const killer = e.byId ? this.posOf(e.byId) : undefined;
          if (p) this.labels.get(e.playerId)?.rig.knockOut(killer?.x ?? p.x - 1, p.x);
          if (p) this.floatText(p.x, p.y, 'ELIMINADO', '#ef476f', 26, 1600);
          this.hud.addLog(`${this.nameOf(e.playerId)} foi eliminado${e.byId ? ` por ${this.nameOf(e.byId)}` : ''}.`);
          break;
        }
        case 'phase':
          if (e.phase === 'playing') this.flashCenter('LUTA!');
          if (e.phase === 'ended' && !this.ended) {
            this.ended = true;
            this.time.delayedCall(1400, () => this.onEnd(e.winnerId));
          }
          break;
        case 'attackStart':
          break;
        case 'drink': {
          const p = this.posOf(e.playerId);
          const R = this.conn.config.player.radius;
          if (e.stage === 'done') {
            if (p) {
              this.floatText(p.x, p.y - R * 4.5, '+1 ❤', '#5ad19a', 26, 1300);
              this.time.delayedCall(450, () => {
                const q = this.posOf(e.playerId);
                if (q) this.floatText(q.x + 30, q.y - R * 5.5, 'hic!', '#fff4e6', 20, 900);
              });
            }
            this.labels.get(e.playerId)?.rig.drunk(this.conn.now(), 6000);
            this.hud.addLog(`${this.nameOf(e.playerId)} tomou uma gelada e recuperou 1 ❤.`, e.playerId === meId ? 'me-win' : '');
          } else if (e.stage === 'spilled') {
            if (p) this.floatText(p.x, p.y - R * 4.5, 'Derramou!', '#ff5a5f', 22, 1100);
            this.hud.addLog(`${this.nameOf(e.playerId)} levou um golpe e derramou a cerveja.`, e.playerId === meId ? 'me-loss' : '');
          }
          break;
        }
      }
    }
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16, ms = 900): void {
    const t = this.add
      .text(x, y, text, { fontFamily: `${FONT}, ${EMOJI_FONT}`, fontSize: `${Math.round(size * 1.35)}px`, fontStyle: '700', color })
      .setOrigin(0.5)
      .setDepth(DEPTH.popup)
      .setStroke('#2b1d22', 6);
    this.tweens.add({ targets: t, y: y - 28, alpha: { from: 1, to: 0 }, ease: 'Cubic.easeIn', duration: ms, onComplete: () => t.destroy() });
  }

  private flashCenter(text: string): void {
    this.centerText.setText(text).setAlpha(1).setScale(1);
    this.tweens.add({ targets: this.centerText, alpha: 0, scale: 1.4, delay: 300, duration: 500 });
  }

  // ------------------------------------------------------------------ quadro

  update(): void {
    const snap = this.conn.latest();
    if (!snap) return;
    const now = this.conn.now();
    const me = this.me(snap);

    // Movimento: envia só quando muda.
    const k = this.keys;
    const mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (mx !== this.lastMove.x || my !== this.lastMove.y) {
      this.lastMove = { x: mx, y: my };
      this.conn.send({ type: 'move', x: mx, y: my });
    }

    // Contagem e relógio.
    if (snap.phase === 'countdown') {
      const n = Math.ceil((snap.phaseEndsAt - now) / 1000);
      this.centerText.setText(n > 0 ? String(n) : '').setAlpha(1).setScale(1);
    } else if (this.lastPhase === 'countdown') {
      this.centerText.setText('');
    }
    this.lastPhase = snap.phase;
    const left = snap.phase === 'playing' ? Math.max(0, snap.phaseEndsAt - now) : 0;
    this.timerText.setText(snap.phase === 'playing' ? formatTime(left) : '');

    if (me) this.currentTarget(snap, me);
    this.draw(snap, now, me);
    this.hud.update(snap, now, this.canDrink);
  }

  private draw(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const g = this.gfx;
    const ground = this.ground;
    const cfg = this.conn.config;
    const R = cfg.player.radius;
    const frameDt = this.lastFrame ? performance.now() - this.lastFrame : 16;
    this.lastFrame = performance.now();
    g.clear();
    ground.clear();

    // Alcance do jogador local (discreto, no chão).
    if (me?.alive) {
      const fy = me.y + R * 0.55;
      ground.lineStyle(2, 0xfff4e6, 0.1).strokeEllipse(me.x, fy, cfg.attack.engageRange * 2, cfg.attack.engageRange * 2);
      ground.lineStyle(2, 0xfff4e6, 0.16).strokeEllipse(me.x, fy, cfg.attack.hitRange * 2, cfg.attack.hitRange * 2);
    }

    // Setas de mira no chão (sem revelar símbolo) e arco de preparação.
    for (const p of snap.players) {
      if (!p.alive || !p.holding || !p.targetId) continue;
      const t = snap.players.find((o) => o.id === p.targetId);
      if (!t) continue;
      drawAim(ground, p.x, p.y, t.x, t.y, R, p.color, p.clashWith === t.id, t.id === me?.id);
      const remaining = Math.max(0, (p.impactAt ?? now) - now);
      const frac = Math.min(1, remaining / cfg.attack.windupMs);
      g.lineStyle(4, p.color, 0.95).beginPath();
      g.arc(p.x, p.y - R * 0.4, R + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false).strokePath();
    }

    // Alvo selecionado.
    const sel = snap.players.find((p) => p.id === this.targetId && p.alive);
    if (sel && me?.alive) {
      const pulse = 4 + Math.sin(now / 120) * 3;
      const fy = sel.y + R * 0.55;
      ground.lineStyle(3, 0xfff4e6, 0.9).strokeEllipse(sel.x, fy, (R + 22 + pulse) * 2, (R + 22 + pulse) * 1.1);
    }

    // Jogadores (cada um na sua profundidade, para ordenar com o cenário).
    for (const p of snap.players) {
      const lab = this.labelsFor(p);
      const step = Math.hypot(p.x - lab.px, p.y - lab.py);
      lab.px = p.x;
      lab.py = p.y;
      lab.walk += step * 0.11;
      if (step > 0.4 && !p.stunned) lab.movingUntil = now + 90;
      const inGrace = now < p.graceUntil;
      const pose = this.duel.poseFor(p.id, snap.players);
      const view = pose ? { ...p, faceX: pose.faceX, faceY: pose.faceY } : p;
      lab.rig.update(p, frameDt, now);
      drawGroundMarker(ground, view, R, p.id === me?.id, inGrace, now);
      drawCharacter(lab.body, view, {
        R,
        now,
        isMe: p.id === me?.id,
        inGrace,
        walk: lab.walk,
        moving: now < lab.movingUntil,
        rig: lab.rig,
        pump: this.duel.pumpFor(p, snap, now),
        drink: p.drinkingUntil > now ? 1 - (p.drinkingUntil - now) / cfg.beer.drinkMs : undefined,
        signDir: pose?.signDir,
        kick: pose?.kick,
        kickDir: pose?.kickDir,
      });
      // O Graphics inteiro gira e amassa em torno dos pés: é aqui que o "bêbado" ganha vida.
      const sq = Math.max(-0.2, Math.min(0.3, lab.rig.squash * 0.25));
      lab.body
        .setPosition(p.x, p.y + R * 0.6)
        .setRotation(lab.rig.tilt)
        .setScale(BODY_SCALE * (1 + sq * 0.6), BODY_SCALE * (1 - sq))
        .setDepth(p.alive ? p.y + R * 0.6 : p.y - 100);
      lab.name.setPosition(p.x, p.y + R + 26).setAlpha(p.alive ? 1 : 0.45);
      if (!p.alive) {
        lab.hand.setText('');
        continue;
      }
      // Vida e foco abaixo do nome.
      for (let i = 0; i < p.maxHp; i++) {
        g.fillStyle(0x2b1d22, 0.9).fillCircle(p.x - (p.maxHp - 1) * 9 + i * 18, p.y + R + 47, 7);
        g.fillStyle(i < p.hp ? 0xff5a5f : 0x5b4a50, 1).fillCircle(p.x - (p.maxHp - 1) * 9 + i * 18, p.y + R + 47, 5);
      }
      g.fillStyle(0x2b1d22, 0.9).fillRoundedRect(p.x - 28, p.y + R + 58, 56, 7, 3);
      g.fillStyle(0x8ecae6, 1).fillRoundedRect(p.x - 27, p.y + R + 59, 54 * (p.focus / cfg.player.maxFocus), 5, 2);

      // Mão: o próprio símbolo só para você; os outros veem "?".
      let hand = '';
      if (p.holding) hand = p.symbol ? RPS_ICON[p.symbol] : '❔';
      if (p.locked) hand += '🔒';
      if (!p.holding && p.id === me?.id && snap.players.some((o) => o.alive && o.targetId === p.id)) hand = '❗';
      lab.hand.setText(hand).setPosition(p.x + Math.sin(lab.rig.tilt) * R * 3.5, p.y - R * 4.1);
    }

    this.duel.draw(g, snap.players, now);
    this.duel.chant(snap, this.conn.localPlayerId, now);
    this.drawBeer(snap, now, me);
    this.drawQte(snap, now, me);
  }

  /** Long neck em cima da mesa quando o garçom já trouxe; senão, um relógio enchendo. */
  private drawBeer(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    const g = this.beerGfx;
    const cfg = this.conn.config;
    g.clear();
    this.canDrink = false;
    this.beerHint.setVisible(false);
    for (const b of snap.beers) {
      const table = cfg.obstacles.find((o) => o.prop === 'beerTable' && o.x === b.x && o.y === b.y);
      const r = table?.kind === 'circle' ? table.r : 60;
      const bx = b.x + 14;
      const by = b.y - 46;
      if (b.readyAt <= now) {
        const shine = 0.5 + Math.sin(now / 300) * 0.5;
        g.fillStyle(0xffc145, 0.25 + shine * 0.2).fillCircle(bx, by - 10, 26);
        g.fillStyle(0x6b3a1f, 1).fillRoundedRect(bx - 7, by - 20, 14, 30, 5);
        g.fillStyle(0x6b3a1f, 1).fillRect(bx - 3, by - 34, 6, 16);
        g.fillStyle(0xe8d9a0, 1).fillRect(bx - 4, by - 37, 8, 4);
        g.fillStyle(0xfff4e6, 1).fillRect(bx - 7, by - 10, 14, 9);
        g.fillStyle(0xffffff, 0.5).fillRect(bx - 4, by - 18, 3, 22);
        if (me?.alive && !me.holding && me.hp < me.maxHp && me.drinkingUntil <= now) {
          const d = Math.hypot(me.x - b.x, me.y - b.y);
          if (d <= r + cfg.player.radius + cfg.beer.reach) {
            this.canDrink = true;
            this.beerHint.setVisible(true).setPosition(b.x, b.y - 110 - Math.abs(Math.sin(now / 250)) * 6);
          }
        }
      } else if (Number.isFinite(b.readyAt)) {
        const frac = 1 - (b.readyAt - now) / cfg.beer.respawnMs;
        g.fillStyle(0x2b1d22, 0.6).fillCircle(bx, by - 6, 13);
        g.lineStyle(4, 0xffc145, 0.9).beginPath();
        g.arc(bx, by - 6, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)), false).strokePath();
      }
    }
  }

  /** Anel do QTE: fecha no instante do impacto. Cinza = confirmar cedo, amarelo = janela, verde = perfeito. */
  private drawQte(snap: Snapshot, now: number, me: PlayerView | undefined): void {
    this.qteText.setText('');
    if (!me?.alive || !me.holding) return;
    const { qte, player } = this.conn.config;
    const impacts = [me.impactAt!, ...snap.players.filter((p) => p.alive && p.targetId === me.id && p.impactAt !== null).map((p) => p.impactAt!)];
    const T = Math.min(...impacts.filter((t) => t + qte.lateMs >= now));
    if (!Number.isFinite(T)) return;
    const g = this.gfx;
    const baseR = player.radius + 30;
    const cy = me.y - player.radius * 0.6;
    const dt = T - now;

    g.lineStyle(5, 0xfff4e6, 0.9).strokeCircle(me.x, cy, baseR);
    if (me.locked) {
      this.qteText.setText('TRAVADO').setColor('#8ecae6').setPosition(me.x, me.y - player.radius * 5.2);
      return;
    }
    const r = baseR + Math.max(0, dt) * 0.09;
    const perfect = Math.abs(dt) <= qte.perfectMs;
    const inWindow = dt <= qte.leadMs;
    const color = perfect ? 0x5ad19a : inWindow ? 0xffc145 : 0xd9cfd0;
    g.lineStyle(perfect ? 9 : 5, 0x2b1d22, 0.5).strokeCircle(me.x, cy, r + 1);
    g.lineStyle(perfect ? 8 : 4, color, 1).strokeCircle(me.x, cy, r);
    if (dt < 0) g.lineStyle(5, 0xff5a5f, 0.85).strokeCircle(me.x, cy, baseR - 7);
    this.qteText
      .setText(perfect ? 'AGORA!' : inWindow ? 'ESPAÇO' : 'confirmar cedo = BOM')
      .setColor(perfect ? '#5ad19a' : inWindow ? '#ffc145' : '#fff4e6')
      .setPosition(me.x, me.y - player.radius * 5.2);
  }

  private labelsFor(p: PlayerView): Labels {
    let l = this.labels.get(p.id);
    if (!l) {
      const name = this.add
        .text(0, 0, p.id === this.conn.localPlayerId ? `${p.name} (você)` : p.name, {
          fontFamily: FONT,
          fontSize: '19px',
          fontStyle: '600',
          color: '#fff4e6',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1)
        .setStroke('#2b1d22', 6);
      const hand = this.add
        .text(0, 0, '', { fontFamily: EMOJI_FONT, fontSize: '36px' })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      const body = this.add.graphics();
      l = { name, hand, body, px: p.x, py: p.y, walk: 0, movingUntil: 0, rig: new WobbleRig() };
      this.labels.set(p.id, l);
    }
    return l;
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
