# 03 — NPCs (`packages/shared/src/bot.ts`)

## Conceito
`BotBrain` joga **pelas mesmas regras** que um humano: recebe `snapshotFor(botId)` (sem ver símbolos alheios) e
eventos públicos, devolve `PlayerInput[]`. Roda onde a simulação roda (navegador agora; servidor na Etapa 2).

## Perfis (`BOT_PROFILES`: easy/normal/hard)
`reactionMs`, `timingSigmaMs` (erro do QTE), `earlyLockChance`, `readChance` (usa histórico do oponente), `swapOnSignalChance`,
`feintChance`, `respondChance`, `dashChance`, `aggression` (ataques/s em alcance), `beerGreed`.

## Comportamento
- **Com mão:** planeja o instante da trava para o próximo impacto relevante (próprio ou de quem o ataca): cedo (chance) ou T + ruído gaussiano; reage a sinais ↻ com troca; finta às vezes; mantém o alvo ao alcance.
- **Sem mão:** se atacado, após tempo de reação responde (duelo), investe para longe ou foge; se machucado e ninguém a < 300 px, vai à mesa beber; senão caça o mais próximo (com linha de visão) e ataca.
- **Leitura:** memoriza símbolos revelados de cada oponente; prevê o mais usado recente e joga o que vence.
- **Mão cansada:** nunca escolhe o próprio símbolo cansado; se o adversário está cansado de X, joga (com chance `readChance + 0,25`) o símbolo que X vence — ganha de uma opção dele e empata com a outra.
- `steer()` desvia de obstáculos e da cerca testando direções giradas.
- PRNG determinístico `makeRng(seed)` (testes reproduzíveis).

## Armadilhas
- Bots não sabem o raio da mesa pela view: buscam o obstáculo `beerTable` na config pela posição da cerveja.
- Estatísticas atuais (4 bots): partidas ~40–56 s, 0 empates por tempo, 0,3–0,7 bebidas/partida.
