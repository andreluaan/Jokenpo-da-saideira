# 04 — Renderização 3D (`packages/client/src/three`)

## Conceito
Three.js (WebGL) desenha a cena; HUD e textos são **HTML por cima** (`.overlay3d`), posicionados projetando pontos 3D.
Nada aqui altera regras: tudo lê `conn.latest()` e eventos.

## Arquivos
| Arquivo | Papel |
|---|---|
| `Game3D.ts` | Partida: renderer, câmera, atores, setas de mira, anel de seleção, revelação/rasteira, Jo-Ken-Pô, cerveja na mesa, anel do QTE (SVG), pop-ups, entrada, `Hud` |
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
- **Jo-Ken-Pô:** `pumpFor()` faz os punhos descerem a cada `BEAT_MS=400` até T; `updateChant()` mostra JO (T−800), KEN (T−400), **PÔ!** (T) só para o jogador local.
- **Revelação** (`REVEAL_MS=1300`, relógio de parede): estágio 0 → `attack-melee-right` + sprites de sinal (`signTexture`) na mão; 120 ms → vencedor `attack-kick-right`; 330 ms → perdedor `hit(..., sweep=true)` (tombo), poeira, "RASTEIRA!". Empate → os dois `hit`.
- **QTE (barra estilo "shot meter" do NBA 2K):** SVG curvo à direita do jogador (arco de +62° a −62°, raio ≈ 1,25 × 0,75 un. projetado, mín. 46 px). Tempo → posição: `u(t) = (t − (T − windupMs)) / (windupMs + lateMs)`. Faixa âmbar = janela (`T − leadMs` até o topo), fatia verde = `T ± perfectMs` com risquinho em T. Enchimento branco sobe até agora; ao apertar (`pressCommit` guarda `localLock = conn.now()`), **congela** e mostra a nota calculada com a mesma regra do `gradeLock` (PERFEITO/BOM/BOM (cedo)/TARDE); passou do topo sem apertar = FALHA.
- **Fim:** vencedor vivo toma a cerveja em loop (`drink`).

## Menos poluição (várias pessoas perto)
- `relevant(id)`: você, seu alvo ou quem te ataca. Só isso vira pop-up (sinais ↻🔒✖, DUELO!, manchete do confronto, sua nota, Errou!, RASTEIRA!, Protegido). O resto fica no log.
- Setas de mira de terceiros: opacidade 0,28 e sem pontinhos.
- Crachás dos outros: compactos e sem barra de foco (CSS `.tag3d:not(.me)`).

## Entrada
`KeyboardEvent.code`: WASD/setas, Digit1-3/J/K/L (símbolo), Space (commit), F, X, Shift, Tab, E (beber). Clique: raycast no plano y=0,5 → oponente mais próximo (<0,9 un). Botão direito = cancelar. Ignora teclas em `<input>`.

## Armadilhas
- O painel do navegador do app **estrangula requestAnimationFrame (~1 fps)** quando sem foco → use passo manual (09-testes).
- Estado por quadro baseado em `performance.now()` (efeitos) vs `conn.now()` (simulação) — não misture nas molas do rig (usam `conn.now()`).
- Sprites de sinal usam `depthTest:false` (ficam sempre na frente).
