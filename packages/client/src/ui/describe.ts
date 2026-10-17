import { GRADE_LABEL, RPS_ICON, RPS_LABEL, type DenyReason, type ExchangeEvent, type Grade, type Rps, type WhiffReason } from '@ppt/shared';

export type NameOf = (id: string) => string;

const sym = (s: Rps | null) => (s ? `${RPS_ICON[s]} ${RPS_LABEL[s]}` : 'nada');
const grade = (g: Grade) => GRADE_LABEL[g];

/** Título curto (pop-up na arena) e frase explicativa (log). Objetivo: o jogador entender o porquê. */
export function describeExchange(e: ExchangeEvent, nameOf: NameOf): { headline: string; line: string } {
  const A = nameOf(e.attackerId);
  const B = nameOf(e.defenderId);
  const a = `${A} ${sym(e.attackerSymbol)} (${grade(e.attackerGrade)})`;
  const b = `${B} ${sym(e.defenderSymbol)} (${grade(e.defenderGrade)})`;
  const hurt = e.damagedId ? ` ${nameOf(e.damagedId)} perde 1 ❤.` : e.protectedId ? ` ${nameOf(e.protectedId)} estava protegido.` : '';

  switch (e.kind) {
    case 'caught': {
      const thief = e.winnerId === e.attackerId ? B : A;
      return { headline: 'ROUBOU!', line: `${a} × ${b} → ${thief} esperou demais para ver a mão do outro e foi pego roubando.${hurt}` };
    }
    case 'both-caught':
      return { headline: 'Os dois roubaram!', line: `${a} × ${b} → o Zé viu tudo e anulou a rodada. Os dois cambaleiam.` };
    case 'defenseless': {
      const [W, L] = e.winnerId === e.attackerId ? [A, B] : [B, A];
      return {
        headline: e.finisher ? FINISHER_HEADLINE[e.finisher] : 'Nem botou!',
        line: `${a} × ${b} → ${L} não botou nada e apanhou de ${W}${e.finisher ? ` — ${FINISHER_TEXT[e.finisher]}` : ''}.${hurt}`,
      };
    }
    case 'win': {
      const [w, l] = e.winnerId === e.attackerId ? [e.attackerSymbol!, e.defenderSymbol!] : [e.defenderSymbol!, e.attackerSymbol!];
      const how = e.finisher ? ` ${FINISHER_TEXT[e.finisher]}` : ' (golpe simples: botou cedo)';
      return {
        headline: e.finisher ? FINISHER_HEADLINE[e.finisher] : `${RPS_LABEL[w]} vence ${RPS_LABEL[l]}`,
        line: `${a} × ${b} → ${RPS_LABEL[w]} vence ${RPS_LABEL[l]}${how}.${hurt}`,
      };
    }
    case 'clank':
      return { headline: 'Choque!', line: `${a} × ${b} → mesmo símbolo, empate.` };
    case 'tie-stagger':
      return {
        headline: 'Cambaleou!',
        line: `${a} × ${b} → empate; ${nameOf(e.staggeredId!)} botou cedo e cambaleou.`,
      };
    case 'both-fumble':
      return { headline: 'Ninguém botou!', line: `${A} × ${B} → ninguém botou o símbolo a tempo.` };
  }
}

/** Golpes finais (vencer botando no verde). */
const FINISHER_HEADLINE: Record<Rps, string> = { rock: 'ESMAGOU!', scissors: 'CORTOU!', paper: 'EMBRULHOU!' };
const FINISHER_TEXT: Record<Rps, string> = {
  rock: 'mão de pedra: atordoado no chão',
  scissors: 'tesourada: arremessado e lento',
  paper: 'embrulhado e arremessado longe',
};

export const WHIFF_TEXT: Record<WhiffReason, string> = {
  range: 'Escapou! (longe demais)',
  blocked: 'Errou! (bloqueado)',
  gone: 'Alvo eliminado',
};

export const DENY_TEXT: Record<DenyReason, string> = {
  busy: 'Ocupado',
  range: 'Longe demais',
  target: 'Sem alvo',
  focus: 'Sem foco',
  locked: 'Já botou',
  phase: 'Aguarde',
  cooldown: 'Investida recarregando',
  full: 'Vida cheia',
  empty: 'Garçom ainda não trouxe',
  engaged: 'Já está num duelo',
  grace: 'Acabou de apanhar, espera',
  noduel: 'Desafie alguém (Espaço)',
};
