# 02 — Simulação (`packages/shared`)

## Conceito
`GameSimulation` é a fonte da verdade: posição, vida, foco, ataques, QTE, dano, cerveja, vitória. Determinística dado
o mesmo `step(dt)` e as mesmas entradas. Regras de design em `docs/DESIGN.md` (seções 5, 7, 8).

## Arquivos
- `config.ts` — **todos os números** (`DEFAULT_CONFIG`, `makeConfig(overrides)`), arena, obstáculos (`Obstacle` rect|circle com `prop`), spawns.
- `types.ts` — `Rps`, `Grade`, `PlayerInput`, `PlayerView`, `Snapshot` (+ `beers`), `GameEvent`, `CharacterId`.
- `rules.ts` — `beats`, `gradeLock` (nota do QTE pelo instante da trava), `resolveExchange` (tabela de resultados), rótulos/ícones.
- `geometry.ts` — colisão círculo×retângulo/círculo, elipse da arena (`clampInArena`), linha de visão (`lineBlocked`).
- `simulation.ts` — a classe; métodos `debug*` só para testes/depuração.
- `characters.ts` — nomes e frases dos personagens (`CHARACTER_INFO`).

## Ciclo
`step(dt)`: avança `now` → contagem→`playing` → `integrate` (inércia, empurrão, colisões) → `finishDrinks` → `resolveDue`
(ataques com `now ≥ impactAt + lateMs`, ordem por `impactAt` e id) → `checkEnd`. Retorna eventos do passo.

## Entradas (`applyInput`)
`move` (sempre aceito) · `symbol` (sem mão: inicia ataque contra `targetId`; com mão destravada: troca) · `commit` (trava; `at` com recuo ≤ `maxRewindMs`) ·
`feint` · `cancel` · `dash` · `drink`. Recusas emitem `denied` com `DenyReason`.

## Pontos-chave
- **Mão cansada:** `Player.recent` (últimos 2 símbolos revelados, público na view) + `tiredSymbol(recent, tiredAfter)` (rules.ts). `startAttack`/`swap` recusam com `denied: 'tired'`.
- **Golpe final:** `resolveExchange` marca `finisher` quando o vencedor não falhou; `resolveAttack` aplica `config.finisher[símbolo]` (empurrão, atordoamento, `graceMs` único) e preenche `ExchangeEvent.finisher`. Tesoura seta `slowUntil` (view `slowed`; `integrate` multiplica a velocidade). Vencedor com Falha = golpe simples (não existe mais `wasted`).
- **Duelo:** atacar quem já te ataca (com ≥ `responseCutoffMs` restantes) une os impactos (`clashWith`), T ≥ agora + `minResponseMs`.
- **Uma mão só:** a mão atual do defensor vale contra qualquer atacante; defensor que vence (não-duelo) mantém a ação.
- **Graça** após dano → no máximo 1 de dano por janela (ataques simultâneos viram `protectedId`).
- **Confirmar cedo** (antes de T − `leadMs`) acelera ataque simples (não duelo).
- **Inércia:** `player.accel`/`decel` (px/s²); `vx/vy` internos + empurrão `kbX/kbY` (decai com `tauMs`).
- **Cerveja:** obstáculo `prop: 'beerTable'` vira estação; `drink` perto (raio + `beer.reach`), parado `drinkMs`, +`heal`; dano → `spill` (evento `drink` stage `spilled`); `respawnMs`. Snapshot `beers[].readyAt` (∞ = alguém pegou).

## Valores atuais (ritmo "lento", v0.4)
windup 1500 · QTE: lead 650 / perfect ±100 / late 220 · speed 200, accel 800, decel 650 · hitstun 700 · grace 1300 · dash 150px/230ms cd 2200 · partida 240 s · HP 3.

## Armadilhas
- Mudou coordenada/raio de obstáculo? Testes usam posições fixas (barril/churrasqueira em (520,600) r34; mesa (960,600) r70) — ajuste `test/simulation.test.ts`.
- `debugSet(hp)` não ressuscita (`alive`). Ações fora de `playing` → `denied: phase`.
- Bots e cliente leem a mesma `PlayerView`; campo novo na view → atualize `fakeView/viewOf` em `three/portraits.ts` e `three/MenuStage3D.ts`.

## Como mudar com segurança
Altere `config.ts`/`simulation.ts` → `npm test` → rode a estatística bot×bot (09-testes) para ver duração das partidas.
