import type { CharacterId } from './types';

/** Nomes e frases dos personagens (cosméticos). Ficam no pacote compartilhado porque o servidor também nomeia NPCs. */
export const CHARACTER_INFO: Record<CharacterId, { name: string; tagline: string }> = {
  fera: { name: 'Fera Verde', tagline: 'Treina 500 flexões antes da saideira.' },
  principe: { name: 'Príncipe Marrento', tagline: 'Nunca pagou uma rodada. Nunca vai pagar.' },
  panca: { name: 'Seu Pança', tagline: 'Caneca cheia, coração maior ainda.' },
  sonolento: { name: 'Sonolento', tagline: 'Que preguiça… mas já calculou sua jogada.' },
};
