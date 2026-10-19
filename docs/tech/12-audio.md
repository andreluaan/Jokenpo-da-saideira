# 12 — Áudio (efeitos, ambiente, volume)

Direção e decisões do usuário: `docs/ART_DIRECTION.md` §9. 1ª entrega (v0.17): efeitos + ambiente + volume. **v0.17.1:** a versão sintetizada foi recusada ("muito robotizado") → trocada por gravações reais; vozes sintetizadas removidas. A música (rádio do YouTube, dono da sala escolhe) é a 2ª entrega.

## Arquivos (`packages/client/src/audio/`)
- `engine.ts` — `audio` (único): `AudioContext` criado no 1º clique/tecla (`unlock`, regra do navegador), canais `sfx` / `ambient` / `music` → master (mudo) → compressor. Volumes em `localStorage` `ppt.sound` (curva ao quadrado). `noise()` = ruído branco compartilhado.
- `samples.ts` — **gravações reais** CC0 em `public/sounds/` (71 `.ogg`, ~0,9 MB; créditos em `public/sounds/CREDITS.md`): Kenney Impact/RPG/Casino + aplauso "Well Done" (qubodup). Carregadas no 1º clique. `play(nome | grupo, {vol, at, rate, jitter, bus, lp, skip})` — grupo = nome sem o número final (`impactWood_light` sorteia `_000…_004`, `cloth` sorteia `cloth1…4`).
- `sfx.ts` — receitas com as gravações (`knock`, `pickClick`, `hit`, `finisherRock/Scissors/Paper`, `clink`, `capOpen`, `gulp`, `splash`, `sizzle`, `crate`, `freezer`, `trayBump`, `waiterWhistle` (= sino), `bell`, `power`, `coins`, `knockout`, `matchEnd`, `uiClick`); só o chiado/"tsss" é ruído filtrado (`hiss`).
- `ambience.ts` — `ambience.start()` (já no menu): copos e tampinhas aleatórios bem baixos; `react('cheer')` = aplauso real. `ooh/laugh/aww` mudos e **sem burburinho** até ter gravação de vozes (turma ou Freesound CC0).
- `matchAudio.ts` — `MatchAudio` (criado pelo `Game3D`): eventos → sons; `qte()` a cada quadro toca JO/KEN/PÔ! quando cada palavra acende (mesma conta de `ui/qteArc.ts`); `strike(e, 'special'|'impact')` chamado pela revelação do `Game3D` no instante da animação.
- `ui/soundPanel.ts` — botão 🔊 (canto direito; na partida fica ao lado do "✕ Sair" via `#match:not(.hidden) ~ .sound-ctl`) com barrinhas Efeitos/Ambiente e mudo; tecla **M** muta. CSS no fim de `style.css`.
- `main.ts` — monta o painel, inicia o ambiente e toca `uiClick` em botões do menu/fim de partida.

## Regras (pedidas pelo usuário)
- Batidas do Jo-Ken-Pô e clique do símbolo **só no seu duelo**; lances dos outros a 50% (`OTHERS`).
- Golpe especial: som próprio por símbolo, casado com `finishers.ts` (pedra cai em 240 ms, tesoura corta em ~210 ms, papel embrulha em 170 ms e voa até 760 ms). Golpe normal: o mesmo `hit` para os três.
- Colocar o símbolo = mesmo clique para os três. Pego roubando = lata batendo ("plém!").
- Ambiente muito baixo; **sem TV, sem cachorros/grilos**. Fim de partida discreto (ganhou ≠ perdeu).

## Armadilhas
- Volume 0 tem de ser **exato**: `apply()` usa `cancelScheduledValues` + `setValueAtTime` (`setTargetAtTime` só se aproxima do zero) e `audio.silent(bus)` nem cria o som. Pedido do usuário.
- Arquivo com silêncio no começo (ex.: `chip-lay`, ~75 ms) → use `skip`.
- `.ogg` não toca em Safari antigo (iPhone/Mac < 2024); se precisar, converter para `.mp3`/`.m4a`.
- Console (DEV): `__audio` e `__sfx` (ex.: `__sfx.finisherRock()`).
- Agende sempre com folga (~20–30 ms): som marcado "no passado" sai mudo ou pela metade.
- Medir volume: o `ScriptProcessor`/analisador ao vivo perde quadros com o painel do navegador oculto. Use `OfflineAudioContext` trocando `audio.ctx` e `audio.buses` temporariamente (ver 09).
- No console do Vite, `await import('/src/audio/...')` pode dar **outra instância** do módulo; para espiar a partida use `Object.getPrototypeOf(__ppt3d.sound)`.
- Música do YouTube/Spotify não passa pelo Web Audio (efeito de paredão impossível) — controlar só o volume do player.
