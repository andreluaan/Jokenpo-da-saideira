import type { ExchangeEvent, GameConfig, GameEvent, PlayerView } from '@ppt/shared';
import { ambience } from './ambience';
import * as sfx from './sfx';

/** Volume dos lances dos outros jogadores (o seu duelo soa cheio). */
const OTHERS = 0.5;

/**
 * Liga os eventos da partida aos sons (ART_DIRECTION §9):
 * - batidas do JO · KEN · PÔ! e clique do símbolo **só no seu duelo**;
 * - golpe especial com som próprio por símbolo, golpe normal igual para os três;
 * - boteco (cerveja, brasa, engradado, freezer, garçom, eventos do Zé) e torcida baixinha.
 */
export class MatchAudio {
  /** Adversário do seu duelo atual (null = você não está duelando). */
  private opp: string | null = null;
  private beatKey = -1;
  private beats = 0;

  constructor(
    private readonly meId: string,
    private readonly beatMs: number,
  ) {
    ambience.start();
  }

  private mine(...ids: (string | null | undefined)[]): boolean {
    return ids.some((id) => id === this.meId);
  }

  onEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'duel':
          if (e.a === this.meId) this.opp = e.b;
          else if (e.b === this.meId) this.opp = e.a;
          break;
        case 'pick':
          if (e.playerId === this.meId || e.playerId === this.opp) {
            sfx.pickClick();
            if (e.grade === 'caught') sfx.caughtWhistle();
          }
          break;
        case 'exchange': {
          const mine = this.mine(e.attackerId, e.defenderId);
          if (mine) this.opp = null;
          if (e.kind === 'clank') sfx.clink(mine ? 1 : OTHERS);
          if (e.kind === 'caught' || e.kind === 'both-caught') ambience.react('laugh');
          else if (e.finisher) ambience.react('ooh');
          break;
        }
        case 'whiff':
          sfx.whoosh(this.mine(...e.playerIds, e.targetId) ? 1 : OTHERS);
          break;
        case 'eliminated':
          // Depois do golpe aparecer (a revelação leva ~330 ms até o impacto).
          setTimeout(() => {
            sfx.knockout(e.playerId === this.meId ? 1 : 0.7);
            ambience.react(e.playerId === this.meId ? 'aww' : 'cheer', 0.8);
          }, 450);
          break;
        case 'phase':
          if (e.phase === 'playing') sfx.waiterWhistle(0.8);
          if (e.phase === 'ended') setTimeout(() => sfx.matchEnd(e.winnerId === this.meId), 600);
          break;
        case 'drink':
          if (e.stage === 'start') sfx.capOpen(this.mine(e.playerId) ? 1 : OTHERS);
          else if (e.stage === 'done') sfx.gulp(this.mine(e.playerId) ? 1 : OTHERS);
          else sfx.splash(this.mine(e.playerId) ? 1 : 0.7);
          break;
        case 'burn':
          sfx.sizzle(this.mine(e.playerId) ? 1 : 0.7);
          break;
        case 'crate':
          sfx.crate(e.broken, 0.8);
          break;
        case 'shield':
          if (e.stage !== 'interrupted') sfx.freezer(e.stage, this.mine(e.playerId) ? 1 : OTHERS);
          break;
        case 'waiterBump':
          sfx.trayBump();
          break;
        case 'barEvent':
          if (e.kind === 'saideira' && e.stage === 'announce') sfx.bell();
          if (e.kind === 'blackout' && e.stage === 'start') sfx.power(true);
          if (e.kind === 'blackout' && e.stage === 'end') sfx.power(false);
          if (e.kind === 'ze' && e.stage === 'announce') sfx.waiterWhistle();
          if (e.kind === 'ze' && e.stage === 'start') ambience.react('cheer', 0.7);
          break;
      }
    }
  }

  /**
   * Chamado pela revelação do Game3D no mesmo instante da animação:
   * `special` = começa o golpe especial (finishers.ts); `impact` = golpe normal acerta.
   */
  strike(e: ExchangeEvent, moment: 'special' | 'impact'): void {
    const vol = this.mine(e.attackerId, e.defenderId) ? 1 : OTHERS;
    if (moment === 'special' && e.finisher) {
      if (e.finisher === 'rock') sfx.finisherRock(vol);
      else if (e.finisher === 'scissors') sfx.finisherScissors(vol);
      else sfx.finisherPaper(vol);
    } else if (moment === 'impact') sfx.hit(vol);
  }

  /** A cada quadro: toca JO, KEN e PÔ! no seu duelo, no instante em que cada palavra acende (ui/qteArc.ts). */
  qte(now: number, me: PlayerView | undefined, cfg: GameConfig): void {
    if (!me?.alive || !me.holding || me.impactAt === null) {
      this.beatKey = -1;
      return;
    }
    const T = me.impactAt;
    if (T !== this.beatKey) {
      this.beatKey = T;
      this.beats = 0;
    }
    const lit = [now >= T - 2 * this.beatMs, now >= T - this.beatMs, now >= T - cfg.qte.greenBeforeMs].filter(Boolean).length;
    if (lit > this.beats) {
      this.beats = lit;
      sfx.knock(lit === 3);
    }
  }
}
