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
(duelos em que os dois já botaram e passou do PÔ!, ou a barra acabou — `qteEnd`; ordem por `impactAt` e id) → `checkEnd`. Retorna eventos do passo.

## Entradas (`applyInput`)
`move` (sempre aceito) · `challenge` (Espaço: cria um duelo 1×1; os dois ganham `attack` apontando um para o outro) · `symbol` (só no duelo, uma vez; `at` com recuo ≤ `maxRewindMs`; emite `pick` com a nota) ·
`dash` (no duelo só antes de botar) · `drink`. Recusas emitem `denied` com `DenyReason` (`engaged`, `grace`, `noduel` são da v0.11).

## Pontos-chave
- **Golpe final:** `resolveExchange` marca `finisher` quando o vencedor não falhou; `resolveAttack` aplica `config.finisher[símbolo]` (empurrão, atordoamento, `graceMs` único) e preenche `ExchangeEvent.finisher`. Tesoura seta `slowUntil` (view `slowed`; `integrate` multiplica a velocidade). Vencedor com Falha = golpe simples (não existe mais `wasted`).
- **Boteco (v0.6, DESIGN §9):** `rng` próprio (seed no construtor). `planRound()` ao começar: agenda itens e sorteia o evento. `updateItems` (spawn em `freeSpot`, pegar = encostar), `bumpInto` (empurrão forte contra `grill` queima, contra `crates` tira hp → `broken` + poça), poças (`puddles`, escorrega no `integrate`), freezer (`drink` perto → `openFreezer` → `shield`), `updateBarEvent` + `updateWaiter` (corredor y≈cy±100, larga cervejas no evento do Zé). `active` = obstáculos sem os quebrados (linha de visão). Snapshot: `items`, `puddles`, `broken`, `freezers`, `barEvent`, `waiter`.
- Testes de combate desligam `items`/`barEvents` na config; `test/boteco.test.ts` testa cada peça com `debugSpawnItem`/`debugStartEvent`.
- **Malandragem (v0.11, DESIGN §5):** `rules.gradePick` → `good` (cedo) / `perfect` (verde) / `caught` (vermelho) / `fail` (nada). `resolveExchange(a, b)`: roubou sempre perde (os dois = `both-caught`), quem não botou apanha, senão o símbolo decide; golpe final só para quem venceu no verde. O símbolo é público na view assim que botado.
- **Graça** após dano → ninguém te desafia (`grace`) e golpes durante ela viram `protectedId`.
- `consume(p)` encerra o duelo dos dois lados.
- **Inércia:** `player.accel`/`decel` (px/s²); `vx/vy` internos + empurrão `kbX/kbY` (decai com `tauMs`).
- **Cerveja:** obstáculo `prop: 'beerTable'` vira estação; `drink` perto (raio + `beer.reach`), parado `drinkMs`, +`heal`; dano → `spill` (evento `drink` stage `spilled`); `respawnMs`. Snapshot `beers[].readyAt` (∞ = alguém pegou).

## Valores atuais (ritmo "lento", v0.4)
windup 1500 · barra: verde −130/+130, vermelho 300, recuo 120 · desafio ≤190 px, PÔ! pega até 215 px · speed 200, accel 800, decel 650 · hitstun 700 · grace 1300 · dash 65px/170ms custo 50 cd 1400 · golpe final: graça 2000, pedra stun 1700, tesoura slow 2500 · partida 240 s · HP 3.

## Armadilhas
- Obstáculos (layout v0.7 em `config.ts`, com a lógica de cada peça comentada). Os testes buscam churrasqueira/freezer/engradado na config; só a mesa (960,600) r70 e as posições A(780,520)/B(880,520) são fixas — não ponha obstáculo nessa faixa. Garçom procura corredor livre (`startWaiter`).
- `debugSet(hp)` não ressuscita (`alive`). Ações fora de `playing` → `denied: phase`.
- Bots e cliente leem a mesma `PlayerView`; campo novo na view → atualize `fakeView/viewOf` em `three/portraits.ts` e `three/MenuStage3D.ts`.

## Como mudar com segurança
Altere `config.ts`/`simulation.ts` → `npm test` → rode a estatística bot×bot (09-testes) para ver duração das partidas.
