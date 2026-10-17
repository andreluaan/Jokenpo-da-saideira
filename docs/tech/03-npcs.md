# 03 — NPCs (`packages/shared/src/bot.ts`)

## Conceito
`BotBrain` joga **pelas mesmas regras** que um humano: recebe `snapshotFor(botId)` (vê o símbolo de quem já botou, como um humano) e
eventos públicos, devolve `PlayerInput[]`. Roda onde a simulação roda (navegador agora; servidor na Etapa 2).

## Perfis (`BOT_PROFILES`: easy/normal/hard)
`reactionMs`, `readReactMs` (tempo para perceber a mão que o outro mostrou), `timingSigmaMs` (erro de tempo), `earlyChance` (bota cedo),
`lateBiasMs` (malandro: mira depois do PÔ! para ler mais — e às vezes cai no vermelho), `readRevealChance`, `readChance` (histórico), `fleeChance`,
`dashChance`, `aggression` (desafios/s em alcance), `beerGreed`.

## Comportamento
- **No duelo (`thinkDuel`):** um plano por duelo — botar cedo (chance) ou em T + `lateBiasMs` + ruído. Se o adversário botou e o NPC percebe (`pickedAt + readReactMs`) antes da hora planejada, vira para o símbolo que ganha (`readRevealChance`). Quem foi chamado às vezes foge com a investida. Mantém o adversário em alcance.
- **Livre:** se machucado e ninguém a < 300 px, vai à mesa beber; senão caça o mais próximo que esteja livre (sem duelo, sem graça) e com linha de visão, e desafia (Espaço).
- **Boteco:** com ninguém a < 300 px pega itens a < 380 px (cerveja do chão só machucado); às vezes abre o freezer; usa `view.broken` para linha de visão/desvio.
- **Leitura:** memoriza símbolos revelados de cada oponente; prevê o mais usado recente e joga o que vence.
- `steer()` desvia de obstáculos e da cerca testando direções giradas.
- PRNG determinístico `makeRng(seed)` (testes reproduzíveis).

## Armadilhas
- Bots não sabem o raio da mesa pela view: buscam o obstáculo `beerTable` na config pela posição da cerveja.
- Estatísticas v0.11 (4 bots, 30 partidas): partidas 46–54 s, 0 empates por tempo, ~14–16 duelos e ~3 fugas por partida; pego roubando em 9% (difícil) a 14% (fácil) dos duelos.
