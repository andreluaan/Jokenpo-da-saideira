# 07 — UI, HUD e menu (`index.html`, `src/main.ts`, `src/ui/*`, `src/style.css`)

## Telas (`index.html`)
`#loading` (copo de cerveja enchendo, `#loading-bar` altura = progresso) → `#menu` (`#menu-bg` 3D + `aside#menu-side` lousa + `aside#char-spot` card do personagem + `#howto` janela do Como jogar) → `#match` (`#game-wrap` 3D em tela cheia + HUD sobreposto) → `#end-overlay`.

## Fluxo (`main.ts`)
`boot()`: fontes → `preloadAll()` → `renderPortraits()` → mostra menu + `MenuStage3D.show()`.
`startMatch(settings)`: esconde menu (destrói o 3D do menu) → `LocalConnection` → `Game3D` → `conn.start()`. `backToMenu()` reverte. Preferências (apelido, personagem) em `localStorage` com try/catch.
Ganchos só em DEV: `window.__menu`, `__ppt` (conexão), `__ppt3d` (Game3D).

## Menu (cardápio de boteco) — v0.10: enxuto e animado
- Lousa à esquerda **só com o essencial**: placa (balança), frase curta, apelido, abas 🤖 Treino / 🍻 Online, NPCs + dificuldade, botão "🍺 Disputar a gelada" (respira + brilho passando) e "📖 Como jogar". Altura acompanha o conteúdo.
- **Coluna da esquerda** (`.menu-col`, flex em coluna, largura `--side-w` que cresce com a tela): lousa em cima (rola se faltar altura) e **card do personagem deitado logo embaixo**, com retrato e nome que crescem com a altura da tela (jeitões só aparecem acima de 800 px de altura) (`ui/characterSelect.ts`): retrato 3D, nome, frase, 2 "jeitões" (`VIBE`, só enfeite), setas ‹ › (pulam quem está ocupado na sala online), bolinhas e "ou clique nele na mesa". Ao trocar, o retrato dá um pulinho (`.swap`). `portraitOf()` devolve `url(...)` para a lista da sala.
- **Como jogar** (`ui/howto.ts`): janela com 1 card por vez — foto do jogo, título, frase, teclas — Voltar/Próximo, bolinhas, ← → e Esc; o último vira "🍺 Bora jogar!". Fotos em `public/howto/*.jpg` (960×540), capturadas do próprio jogo (ver 09). Para trocar uma foto: recapturar e sobrescrever o arquivo com o mesmo nome.
- **Câmera do menu** (`MenuStage3D.resize`): enquadra a arena e depois **se afasta até o Bar do Zé inteiro (telhado incluído) caber** na área livre à direita da lousa (`BAR`/`BAR_EXTENT` em `arena3d.ts`). Mudou o tamanho do bar → ajuste `BAR_EXTENT`.
- Entrada animada (lousa desliza, card sobe); `prefers-reduced-motion` desliga as animações contínuas.
No fundo, `MenuStage3D`: todos **sentados** na mesa de fora; os escolhidos (você = largada 1, NPCs na ordem de `CHARACTER_IDS` sem você) **levantam em sequência** (`STAND_MS`, `STAGGER_MS`), passam pela **porteira** e vão às largadas; quem sai da partida volta ao banquinho. Clicar num personagem no 3D o seleciona. **Nomes (v0.16):** quem está sentado no camarote fica sem nome (`.menulabel3d.off`); aparece só com o mouse em cima (`pointermove` → `actorAt`, 55 px).

## HUD da partida
- `ui/hud.ts` — cartões de jogadores (topo), barra de ações (🤜 Desafiar/Espaço, símbolos J/K/L só no duelo, Investida, Beber; botões não pegam foco: `mousedown`+`preventDefault`), dica contextual (`#hint`; mostra o símbolo que o adversário já botou; `warn` quando te chamaram). `update(snap, now, canDrink)`.
- Sair: botãozinho `#leave` (`.leave-btn`, "✕ Sair") no canto de cima à direita. A aba "Confrontos" (log) e `ui/describe.ts` foram removidos na v0.13 a pedido do usuário.
- No 3D (`Game3D`): crachá por jogador (`.tag3d`: mão/símbolo, nome — v0.13: só texto com contorno e risquinho na cor do jogador, sem caixinha —, ❤, foco, anel de preparação em `conic-gradient`), `.center3d` (contagem/LUTA!), `.timer3d` (selo de lousa no canto), `.beerhint3d`, `.qte3d`.

## Boteco (v0.6)
- **E contextual**: dica `.beerhint3d` muda o texto ("[E] Beber uma gelada" / "[E] Abrir o freezer (escudo de gelo)"); o botão 🍺 da barra habilita nos dois casos (`canDrink`).
- **Crachá**: linha `.st` com 🧊 (escudo). Some na queda de luz (exceto o seu).
- **Eventos**: `ui/barEventFx.ts` (ver 04) — classes `.barfx.kind-*.stage-*` em `style.css`.
- Investida na ajuda: curta, gasta metade do foco. Finta (F) removida.

## Jo-Ken-Pô (v0.16) — `ui/qteArc.ts`
Pedido: o painel lateral ficava longe do campo de visão. Agora é **só o texto JO · KEN · PÔ!** num `<svg class="jkp-arc">` com `<textPath>`
curvado **abaixo da cerca da frente**, acompanhando a elipse (caminho e tamanho da letra vêm do `Game3D.updateQte`, ver 04).
Palavras acendem no ritmo (`.lit`; a da vez `.now`); a cor vem de `data-zone`: creme = cedo, verde = PÔ!, vermelho = roubou;
ao apertar (ou passar do fim) congela na nota (`.done`, mesma regra do `gradePick`). Sem mão, faixa de tempo nem símbolo do adversário
(o símbolo botado já aparece no crachá/personagem). Fica entre a cerca e a barra de ações.

### Histórico: painel fixo na lateral (v0.15, removido na v0.16)
Lousa à direita com JO/KEN/PÔ!, mão SVG batendo o punho, faixa de tempo e o que o adversário mostrou.

### Histórico: QTE com as mãos ao lado do personagem (v0.14)
`QteHands` (dentro do `.overlay3d`): punho SVG num círculo com aro (`--zone`), mesinha embaixo, batidas JO/KEN/PÔ! e o símbolo do adversário (`.qh-opp`). `Game3D.updateQte` posiciona do lado oposto ao adversário (`.left`) e escala pelo zoom. Zona = `early`/`green`/`red` pela mesma regra do `gradePick` (ao apertar congela na nota; o punho vira o ícone do símbolo). O punho cai em T−800, T−400 e T (`BEAT_MS`, igual ao `pumpFor` dos personagens).

## Ícones dos símbolos (v0.12)
`ui/symbolIcons.ts`: pedra, papel e tesoura **desenhados em SVG** (cartunescos, contorno escuro) no lugar dos emojis de mão. `symbolSvg(s)` para HTML (barra de ações, crachá), `symbolPaths(s)` para dentro de outro SVG (marca do adversário na barra), `withSymbolIcons(texto)` troca `[rock]`/`[paper]`/`[scissors]` (teclas do Como jogar). A revelação 3D continua com as **mãos** dos personagens (`signTexture`).

## Transição menu ↔ partida (v0.12.1: voo de câmera)
- **Ida** (`flyToMatch` em `main.ts`): a coluna do menu sai pela esquerda (`#menu.leaving`) e `MenuStage3D.flyToMatch()` leva a câmera do quintal até o **enquadramento do começo da partida** (posição, alvo, lente e deslocamento da coluna, com easing); só então a partida é montada, com a câmera no mesmo lugar.
- **Volta** (`backToMenu`): `menuStage.show({ fromMatch: true })` começa no enquadramento da partida e voa até o menu; os nomes do menu reaparecem aos poucos.
- O enquadramento vem de `three/matchCamera.ts` (`matchCameraPose`), o mesmo usado pelo `Game3D` — mudou a câmera da partida, o voo acompanha.
- Garantia: o voo termina por tempo (`ms + 300`) mesmo com a aba em segundo plano (o navegador pausa os quadros).
- Jogar de novo (treino) vai direto, sem voo. O copo de cerveja da v0.12 foi descartado (não era o que o usuário queria).

## Estilo
Variáveis em `:root` (`--chalkboard`, `--wood`, `--accent` âmbar, `--chalk` = Caveat Brush). Fontes locais via `@fontsource` (Fredoka, Caveat Brush). Abaixo de 760 px o menu vai para baixo.

## Armadilhas
- Textos com "…" e emojis: editar com a ferramenta de edição (heredoc no Bash corrompeu caracteres uma vez).
- Novos botões de ação: precisam de `data-act` no HTML **e** entrada em `HudActions` + regra de `disabled` em `hud.update`.
