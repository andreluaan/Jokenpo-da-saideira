# 07 — UI, HUD e menu (`index.html`, `src/main.ts`, `src/ui/*`, `src/style.css`)

## Telas (`index.html`)
`#loading` (copo de cerveja enchendo, `#loading-bar` altura = progresso) → `#menu` (`#menu-bg` 3D + `aside#menu-side` lousa) → `#match` (`#game-wrap` 3D em tela cheia + HUD sobreposto) → `#end-overlay`.

## Fluxo (`main.ts`)
`boot()`: fontes → `preloadAll()` → `renderPortraits()` → mostra menu + `MenuStage3D.show()`.
`startMatch(settings)`: esconde menu (destrói o 3D do menu) → `LocalConnection` → `Game3D` → `conn.start()`. `backToMenu()` reverte. Preferências (apelido, personagem) em `localStorage` com try/catch.
Ganchos só em DEV: `window.__menu`, `__ppt` (conexão), `__ppt3d` (Game3D).

## Menu (cardápio de boteco)
Placa amarela (logo), tagline do tema ("só tem uma gelada… quem ficar de pé por último leva"), cartões de personagem com retrato 3D (`ui/characterSelect.ts` → `setPortrait`), apelido, nº de NPCs, dificuldade, botão "🍺 Disputar a gelada", "Como jogar".
No fundo, `MenuStage3D`: todos **sentados** na mesa de fora; os escolhidos (você = largada 1, NPCs na ordem de `CHARACTER_IDS` sem você) **levantam em sequência** (`STAND_MS`, `STAGGER_MS`), passam pela **porteira** e vão às largadas; quem sai da partida volta ao banquinho. Clicar num personagem no 3D o seleciona.

## HUD da partida
- `ui/hud.ts` — cartões de jogadores (topo), log de confrontos (`#side`), barra de ações (símbolos/ações com atalho; botões não pegam foco: `mousedown`+`preventDefault`), dica contextual (`#hint`; `warn` quando atacado). `update(snap, now, canDrink)`.
- `ui/describe.ts` — frases do log e títulos (`describeExchange`), textos de erro/recusa.
- No 3D (`Game3D`): crachá por jogador (`.tag3d`: mão/símbolo próprio, nome, ❤, foco, anel de preparação em `conic-gradient`), pop-ups `.pop3d`, `.center3d` (contagem/LUTA!), `.timer3d` (selo de lousa no canto), `.beerhint3d`, `.qte3d`.

## Estilo
Variáveis em `:root` (`--chalkboard`, `--wood`, `--accent` âmbar, `--chalk` = Caveat Brush). Fontes locais via `@fontsource` (Fredoka, Caveat Brush). Abaixo de 760 px o menu vai para baixo e o log some.

## Armadilhas
- Textos com "…" e emojis: editar com a ferramenta de edição (heredoc no Bash corrompeu caracteres uma vez).
- Novos botões de ação: precisam de `data-act` no HTML **e** entrada em `HudActions` + regra de `disabled` em `hud.update`.
