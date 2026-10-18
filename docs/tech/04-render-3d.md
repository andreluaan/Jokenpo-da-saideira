# 04 — Renderização 3D (`packages/client/src/three`)

## Conceito
Three.js (WebGL) desenha a cena; HUD e textos são **HTML por cima** (`.overlay3d`), posicionados projetando pontos 3D.
Nada aqui altera regras: tudo lê `conn.latest()` e eventos.

## Arquivos
| Arquivo | Papel |
|---|---|
| `Game3D.ts` | Partida: renderer, câmera, atores, setas de mira, anel de seleção, revelação/rasteira, Jo-Ken-Pô, cerveja na mesa, painel do Jo-Ken-Pô (`QteHands`, ver 07), entrada, `Hud` (sem pop-ups de texto na arena desde a v0.11.1 e sem log de confrontos desde a v0.13: o resultado se vê na revelação 3D, no golpe/rasteira e no painel) |
| `MenuStage3D.ts` | Fundo do menu: mesma arena, turma sentada → porteira → largadas (ver 06/07) |
| `arena3d.ts` | Cenário inteiro + luzes (ver 06) |
| `character3d.ts` | Personagem 3D (ver 05) |
| `assets.ts` | `S`, `toWorld`, carregamento GLB (`preloadAll`, `gltf`, `instance`, `fit`, `place`, `recolor`) |
| `textures.ts` | Texturas geradas: repintura de paleta, texto, manchas, círculo suave, sinais de mão |
| `portraits.ts` | Retratos 3D dos cartões do menu (renderer offscreen → dataURL) |

## Renderer e luz
`ACESFilmicToneMapping`, sombras `PCFSoftShadowMap` (sol 2048², câmera de sombra ±13×±10), hemisfério quente + sol baixo + point lights (bar, brasas). Névoa = distância da câmera +5 / +30 (recalculada no `resize`).

## Câmera
Perspectiva fov 36, direção fixa `(0,1,0.95)` (~46°, mostra mais corpo/rosto que topo de cabeça); distância calculada no `resize()` para caber a elipse com margem curta (+0,7 lateral) — mais perto = personagens maiores. `shake` decai nos golpes.
Névoa e fundo usam `SKY` (exportado de `arena3d.ts`, mesma cor do chão de fora); CSS `#menu`/`#match` usam a mesma cor.
Menu usa `setViewOffset(W,H,-side/2,…)` para centralizar a cena à direita da barra lateral.

## Quadro (`Game3D.frame`)
1. envia `move` se mudou · 2. contagem/relógio · 3. poses da revelação · 4. atualiza cada `Character3D` (velocidade estimada pelo deslocamento, `pump`, `drink`, olhar) + anel + crachá · 5. setas, revelações, Jo-Ken-Pô, cerveja, QTE, poeira · 6. render · 7. `hud.update`.

## Efeitos de combate
- **Jo-Ken-Pô:** `pumpFor()` faz os punhos descerem a cada `BEAT_MS=400` até T; as palavras do ritmo (JO ~T−800, KEN ~T−400, **PÔ!** em T) acendem no **painel fixo da lateral** (v0.15), só para o jogador local.
- **Revelação** (`REVEAL_MS=1300`, relógio de parede): estágio 0 → `attack-melee-right` + sprites de sinal (`signTexture`) na mão; 120 ms → vencedor `attack-kick-right`; 330 ms → perdedor `hit(..., sweep=true)` (tombo), poeira (sem texto: animação + manchete bastam). Empate → os dois `hit`.
- **QTE (até a v0.13 — barra estilo "shot meter"; desde a v0.14 é `ui/qteHands.ts`, ver 07):** SVG curvo à direita do jogador (arco de +62° a −62°, raio ≈ 1,25 × 0,75 un. projetado, mín. 46 px). Tempo → posição: `u(t) = (t − (T − windupMs)) / (qteEnd(T) − (T − windupMs))`. Trilho creme = CEDO, fatia verde = `T − greenBeforeMs … T + greenAfterMs` com risquinho em T, fatia **vermelha** até o fim (ROUBOU). Risquinho `.opp` + `.oppsym` na cor do adversário = quando ele botou e o quê. Enchimento sobe até agora; ao apertar (`pressSymbol` guarda `localLock = conn.now()`), **congela** e mostra a nota com a mesma regra do `gradePick` (PERFEITO / CEDO! / ROUBOU!); no vermelho sem apertar pisca "VAI DAR ROUBO!"; passou do topo = NADA!. Uma seta no chão por duelo (de quem desafiou). Crachá: símbolo público com aro âmbar (`.hand.shown`).
- **Fim:** vencedor vivo toma a cerveja em loop (`drink`).

## Golpes finais (`finishers.ts`)
Quando o `ExchangeEvent` tem `finisher` (vencedor acertou o QTE), aos 120 ms da revelação `Game3D.finisher()` cria um `Fx`
(atualizado em `updateFx`, por relógio de parede) no lugar da rasteira:
- **Pedra:** punho de pedra (dedos + polegar virados para a câmera, braço inclinado para trás) cai em 240 ms, `knock(sweep)`, poeira, tremor; sobe aos 700 ms.
- **Tesoura:** tesoura gigante deitada atravessa o perdedor na direção vencedor→perdedor (aberta → "snip" no meio → reabre), rastro branco; perdedor tomba. Enquanto `view.slowed`, o anel dele pisca em azul-gelo.
- **Papel:** bola de papel amassado com textura de caderno embrulha (esconde `c.root`), segue o empurrão da simulação num arco rolando e estoura em papel; perdedor reaparece deitado.
- `finisherModels()` + `renderer.compile` no construtor pré-compilam os shaders. **Armadilha vivida:** sem isso o 1º golpe dava um tranco que pulava a fase de "embrulhar" e o perdedor nunca sumia — por isso o esconder também roda fora do `if` de cada fase.
- O pisca da invulnerabilidade esconde os contornos (`userData.outline`) em vez de mexer na opacidade: o material do contorno é compartilhado por todos.

## Boteco vivo (`boteco3d.ts`, `ui/barEventFx.ts`)
`Boteco3D` (criado no Game3D; recebe todos os eventos em `onEvent` e o snapshot em `update`):
- **Cervejas do chão** (`snap.items`, só evento do Zé): long neck em pé no chão com brilho fraco embaixo; pegar = `pickup` → poeira. (Cachaça/amendoim removidos na v0.7.)
- **Poças** (`snap.puddles`): forma irregular âmbar e brilhante; espalha ao nascer e seca no fim.
- **Engradado**: `crate` rachou → chacoalha/tomba; quebrou → some (`arena.props[i]`) e solta cacos com gravidade. `snap.broken` sincroniza quem entra depois.
- **Freezer**: tampa de vidro (`props[i].userData.lid`) abre enquanto alguém está abrindo (`openingUntil` + distância). **Escudo de gelo**: icosaedro translúcido azul em volta de quem tem `shielded`; ao quebrar, estilhaços.
- Crachá mostra 🧊 (escudo).
- **Churrasqueira**: `burn` → fogo + fumaça + "AI, QUENTE!" + tranco no rig.
- **Garçom**: `Extra3D` (Kenney male-e repintado: gravata preta) com bandeja erguida; anda pelo `snap.waiter`; esbarrão balança a bandeja.
- **Queda de luz**: `arena.setDim(k)` (hemisfério/sol caem, luz do bar sobe, fundo/névoa escurecem; brasas, anéis e lâmpadas continuam). Durante o escuro o Game3D esconde crachás e setas dos outros (`boteco.blackout`).
- **E** contextual: perto da mesa machucado = beber; perto do freezer = "[E] Abrir o freezer".
`BarEventFx` (DOM): `.barfx.kind-*.stage-announce|active|end` → vinheta nas bordas (brasa pulsando / escuro / dourado de festa) + faixa grande (lousa; no Zé vira balão de fala) com contagem no aviso e barra de tempo. Cada estágio é uma classe CSS (gancho para sons depois).

## Vida no entorno (`ambient3d.ts`, `paredao3d.ts`) — "evento da cidade"
`Ambient3D` (só visual; usado na **partida e no menu**):
- **Torcida** (v0.8, menos aperto): só ~10 espaçados na cerca (elipse +0,78, fora das faixas `NO_CROWD`); a maioria **sentada** nas mesas vermelhas (`arena.fanSeats`, y=0,14) e em **rodinhas** em pé (`arena.hangouts`), todos com long neck na mão (`Extra3D.holdBottle`, garrafa presa no osso do braço via `handPoint`) dando **gole** de vez em quando (braço à boca + cabeça para trás, como os jogadores). Modelos Kenney variados (`CROWD`) com a camisa repintada (`SHIRTS`); `Extra3D.offset()` desencontra as animações. Mesmo tamanho dos jogadores (`CHAR_SCALE`).
- Reações: golpe → `emote-yes`/`jump` (golpe final = quase todos), eliminação → todos pulam e os cães latem, início de evento → comemoram. Sem briga (menu), alguém comemora sozinho de vez em quando.
- **3 cachorros** (caramelo, preto, branco) fazendo **ronda** em trechos diferentes da elipse (+1,65 a +2,5), vão e voltam, param, sentam e abanam o rabo.
- **Garçom no balcão** do Bar do Zé (`arena.barWaiter`); some enquanto o garçom do evento atravessa (`setWaiterAway`).
- **Picape com paredão** (`buildParedao`, procedural, sem marca) nos fundos à direita (`arena.truck`), caçamba virada para o ringue; falantes pulsam a ~120 bpm e a "energia" sobe com golpes e eventos.
- Faíscas nas churrasqueiras; vapor do freezer aberto está no `boteco3d`.
- **Desempenho:** ~840 draw calls na partida depois de juntar a decoração parada (ver 06-arena, `merge.ts`); a maior parte que sobra é a torcida.

## Menos poluição (várias pessoas perto)
- Setas de mira de terceiros: opacidade 0,28 e sem pontinhos.
- Crachás dos outros: compactos e sem barra de foco (CSS `.tag3d:not(.me)`).

## Entrada
`KeyboardEvent.code`: WASD/setas, Space (desafiar o alvo), Digit1-3/J/K/L (símbolo, só no duelo), Shift, Tab, E (beber). Clique: raycast no plano y=0,5 → oponente mais próximo (<0,9 un). Ignora teclas em `<input>`.

## Armadilhas
- O painel do navegador do app **estrangula requestAnimationFrame (~1 fps)** quando sem foco → use passo manual (09-testes).
- Estado por quadro baseado em `performance.now()` (efeitos) vs `conn.now()` (simulação) — não misture nas molas do rig (usam `conn.now()`).
- Sprites de sinal usam `depthTest:false` (ficam sempre na frente).
