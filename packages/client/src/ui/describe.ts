import { GRADE_LABEL, RPS_ICON, RPS_LABEL, type DenyReason, type ExchangeEvent, type Grade, type Rps, type WhiffReason } from '@ppt/shared';

export type NameOf = (id: string) => string;

const sym = (s: Rps | null) => (s ? `${RPS_ICON[s]} ${RPS_LABEL[s]}` : 'sem defesa');
const grade = (g: Grade | null) => (g ? GRADE_LABEL[g] : '—');

/** Título curto (pop-up na arena) e frase explicativa (log). Objetivo: o jogador entender o porquê. */
export function describeExchange(e: ExchangeEvent, nameOf: NameOf): { headline: string; line: string } {
  const A = nameOf(e.attackerId);
  const B = nameOf(e.defenderId);
  const a = `${A} ${sym(e.attackerSymbol)} (${grade(e.attackerGrade)})`;
  const b = e.defenderSymbol ? `${B} ${sym(e.defenderSymbol)} (${grade(e.defenderGrade)})` : `${B} sem símbolo`;
  const hurt = e.damagedId ? ` ${nameOf(e.damagedId)} perde 1 ❤.` : e.protectedId ? ` ${nameOf(e.protectedId)} estava protegido.` : '';

  switch (e.kind) {
    case 'defenseless':
      return {
        headline: e.finisher ? FINISHER_HEADLINE[e.finisher] : 'Indefeso!',
        line: `${a} acertou ${B}, que estava sem defesa${e.finisher ? ` — ${FINISHER_TEXT[e.finisher]}` : ''}.${hurt}`,
      };
    case 'win': {
      const [w, l] = e.winnerId === e.attackerId ? [e.attackerSymbol, e.defenderSymbol!] : [e.defenderSymbol!, e.attackerSymbol];
      const how = e.finisher ? ` ${FINISHER_TEXT[e.finisher]}` : ' (golpe simples: vencedor errou o QTE)';
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
        line: `${a} × ${b} → empate; ${nameOf(e.staggeredId!)} executou pior e cambaleou.`,
      };
    case 'fumble':
      return { headline: 'Falhou!', line: `${A} não confirmou a tempo (FALHA) e perdeu o ataque.` };
    case 'both-fumble':
      return { headline: 'Os dois falharam!', line: `${a} × ${b} → ninguém confirmou a tempo.` };
  }
}

/** Golpes finais (vencer + acertar o QTE). */
const FINISHER_HEADLINE: Record<Rps, string> = { rock: 'ESMAGOU!', scissors: 'CORTOU!', paper: 'EMBRULHOU!' };
const FINISHER_TEXT: Record<Rps, string> = {
  rock: 'mão de pedra: atordoado no chão',
  scissors: 'tesourada: arremessado e lento',
  paper: 'embrulhado e arremessado longe',
};

export const WHIFF_TEXT: Record<WhiffReason, string> = {
  range: 'Errou! (fora de alcance)',
  blocked: 'Errou! (bloqueado)',
  gone: 'Alvo eliminado',
};

export const DENY_TEXT: Record<DenyReason, string> = {
  tired: 'Mão cansada! Use outro símbolo',
  busy: 'Ocupado',
  range: 'Fora de alcance',
  target: 'Sem alvo',
  focus: 'Sem foco',
  locked: 'Já travado',
  limit: 'Limite de trocas',
  phase: 'Aguarde',
  cooldown: 'Investida recarregando',
  full: 'Vida cheia',
  empty: 'Garçom ainda não trouxe',
};
