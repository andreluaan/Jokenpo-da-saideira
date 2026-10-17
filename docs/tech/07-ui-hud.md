# 07 — UI, HUD e menu (`index.html`, `src/main.ts`, `src/ui/*`, `src/style.css`)

## Telas (`index.html`)
`#loading` (copo de cerveja enchendo, `#loading-bar` altura = progresso) → `#menu` (`#menu-bg` 3D + `aside#menu-side` lousa + `aside#char-spot` card do personagem + `#howto` janela do Como jogar) → `#match` (`#game-wrap` 3D em tela cheia + HUD sobreposto) → `#end-overlay`.

## Fluxo (`main.ts`)
`boot()`: fontes → `preloadAll()` → `renderPortraits()` → mostra menu + `MenuStage3D.show()`.
`startMatch(settings)`: esconde menu (destrói o 3D do menu) → `LocalConnection` → `Game3D` → `conn.start()`. `backToMenu()` reverte. Preferências (apelido, personagem) em `localStorage` com try/catch.
Ganchos só em DEV: `window.__menu`, `__ppt` (conexão), `__ppt3d` (Game3D).

## Menu (cardápio de boteco) — v0.10: enxuto e animado
- Lousa à esquerda **só com o essencial**: placa (balança), frase curta, apelido, abas 🤖 Treino / 🍻 Online, NPCs + dificuldade, botão "🍺 Disputar a gelada" (respira + brilho passando) e "📖 Como jogar". Altura acompanha o conteúdo.
- **Personagem num card no canto inferior direito** (`ui/characterSelect.ts`): retrato 3D, nome, frase, 2 "jeitões" (`VIBE`, só enfeite), setas ‹ › (pulam quem está ocupado na sala online), bolinhas e "ou clique nele na mesa". Ao trocar, o retrato dá um pulinho (`.swap`). `portraitOf()` devolve `url(...)` para a lista da sala.
- **Como jogar** (`ui/howto.ts`): janela com 1 card por vez — foto do jogo, título, frase, teclas — Voltar/Próximo, bolinhas, ← → e Esc; o último vira "🍺 Bora jogar!". Fotos em `public/howto/*.jpg` (960×540), capturadas do próprio jogo (ver 09). Para trocar uma foto: recapturar e sobrescrever o arquivo com o mesmo nome.
- **Câmera do menu** (`MenuStage3D.resize`): enquadra a arena e depois **se afasta até o Bar do Zé inteiro (telhado incluído) caber** na área livre à direita da lousa (`BAR`/`BAR_EXTENT` em `arena3d.ts`). Mudou o tamanho do bar → ajuste `BAR_EXTENT`.
- Entrada animada (lousa desliza, card sobe); `prefers-reduced-motion` desliga as animações contínuas.
No fundo, `MenuStage3D`: todos **sentados** na mesa de fora; os escolhidos (você = largada 1, NPCs na ordem de `CHARACTER_IDS` sem você) **levantam em sequência** (`STAND_MS`, `STAGGER_MS`), passam pela **porteira** e vão às largadas; quem sai da partida volta ao banquinho. Clicar num personagem no 3D o seleciona.

## HUD da partida
- `ui/hud.ts` — cartões de jogadores (topo), log de confrontos (`#side`), barra de ações (símbolos/ações com atalho; botões não pegam foco: `mousedown`+`preventDefault`), dica contextual (`#hint`; `warn` quando atacado). `update(snap, now, canDrink)`.
- `ui/describe.ts` — frases do log e títulos (`describeExchange`), textos de erro/recusa.
- No 3D (`Game3D`): crachá por jogador (`.tag3d`: mão/símbolo próprio, nome, ❤, foco, anel de preparação em `conic-gradient`), pop-ups `.pop3d`, `.center3d` (contagem/LUTA!), `.timer3d` (selo de lousa no canto), `.beerhint3d`, `.qte3d`.

## Boteco (v0.6)
- **E contextual**: dica `.beerhint3d` muda o texto ("[E] Beber uma gelada" / "[E] Abrir o freezer (escudo de gelo)"); o botão 🍺 da barra habilita nos dois casos (`canDrink`).
- **Crachá**: linha `.st` com 🧊 (escudo). Some na queda de luz (exceto o seu).
- **Eventos**: `ui/barEventFx.ts` (ver 04) — classes `.barfx.kind-*.stage-*` em `style.css`.
- Investida na ajuda: curta, gasta metade do foco. Finta (F) removida.

## Estilo
Variáveis em `:root` (`--chalkboard`, `--wood`, `--accent` âmbar, `--chalk` = Caveat Brush). Fontes locais via `@fontsource` (Fredoka, Caveat Brush). Abaixo de 760 px o menu vai para baixo e o log some.

## Armadilhas
- Textos com "…" e emojis: editar com a ferramenta de edição (heredoc no Bash corrompeu caracteres uma vez).
- Novos botões de ação: precisam de `data-act` no HTML **e** entrada em `HudActions` + regra de `disabled` em `hud.update`.
