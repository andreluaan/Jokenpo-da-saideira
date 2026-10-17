# 09 — Testes e depuração

## Testes automáticos
`npm test` (Vitest, `packages/shared/test`): `rules.test.ts` (tabela RPS/QTE), `simulation.test.ts` (ataque, duelo, blefe, multi-jogador, informação oculta, fim, arena, cerveja), `bot.test.ts` (partida 4 NPCs termina, determinismo), `boteco.test.ts` (churrasqueira, engradado, freezer, poça, eventos, garçom).
`packages/server/test/server.test.ts`: rede real (servidor numa porta livre + `socket.io-client`). Total hoje: **66 testes**.
Helpers de teste: `newSim(n)` posiciona A(780,520) B(880,520) C(880,420) D(1300,900); `advanceTo(sim, t)`.

## Estatística bot × bot (balanceamento)
Criar `packages/shared/test/_stats.test.ts` temporário que roda N partidas com `BotBrain`s, grava um resumo num arquivo (`process.env.OUT`) e depois apagar o arquivo:
```bash
OUT="$TEMP/ppt_stats.txt" npx vitest run packages/shared/test/_stats.test.ts > /dev/null 2>&1; cat "$TEMP/ppt_stats.txt"
```
(Saída do console do Vitest não aparece com `grep` confiável; por isso grava em arquivo.)

## Ver o jogo "de verdade"
- `npm run dev` e abrir http://localhost:5173 (o servidor de dev pode ser iniciado em segundo plano).
- **O painel do navegador do app reduz o rAF para ~1 fps quando sem foco** → screenshots parecem congeladas/lentas. Soluções:
  1. Passo manual pelo console: parar o relógio (`clearInterval(__ppt.timer)`), e em laço: `sim.step(1000/60)`, atualizar `__ppt.snapshot = sim.snapshotFor('you')`, `__ppt.simWall = performance.now()`, repassar eventos para `__ppt.listeners`, chamar `__ppt3d.frame()` (com espera ativa de 16 ms por quadro).
  2. **Capturas do canvas:** `node tools/shotserver.mjs` (porta 5199) e, na página, `fetch('http://127.0.0.1:5199/shot?name=x', {method:'POST', body: renderer.domElement.toDataURL('image/jpeg')})` logo após `renderer.render(...)`. Arquivo vai para `tools/shots/` (fora do Git) e pode ser aberto como imagem.
  3. Close-up: mover `camera` temporariamente para perto do ponto, renderizar, capturar e restaurar.
- Erros antigos no console: depois de recarregamentos (HMR) ficam mensagens velhas — compare o carimbo `?t=` antes de concluir que é bug atual.

## Dicas que funcionaram (sessões de arte v0.5–v0.9)
- Antes de capturar: `resize_window` 1280×800 no painel e `__ppt3d.resize()`; o painel pequeno gera canvas minúsculo.
- Simulação local roda em `setInterval`: para avançar use `await new Promise(r=>setTimeout(r,16))` entre `frame()`s (espera ocupada trava a simulação).
- Forçar cenas: `__ppt.bots.length = 0` (NPCs parados), `__ppt.sim.debugSet/debugPlace/debugStartEvent/debugSpawnItem`, métodos privados acessíveis no console (ex.: `sim.bumpInto`, `sim.addPuddle`).
- Câmera de close: mover `camera.position`/`lookAt`, renderizar, `toDataURL` → `tools/shotserver.mjs`, restaurar. No menu, `camera.clearViewOffset()` antes e restaurar o `view` depois.
- Elementos HTML (faixas de evento, HUD) só aparecem em `computer screenshot`, não no canvas.
- `renderer.info.render.calls` = desenhos por quadro (meta: < ~1.200).
- **Painel oculto** (screenshot "congelado"): pare o `setInterval` da conexão e avance à mão (`bots.think` → `sim.step(1000/60)` → `snapshot` → `listeners` → espera ocupada 16 ms → `__ppt3d.frame()`).
- **Fotos com o HUD 3D junto** (crachás, arco do QTE, faixas de evento): depois de `frame()` **duas vezes** (a 1ª atualiza a câmera), clonar `.overlay3d` com os estilos computados em linha, pôr num `<svg><foreignObject>` com as fontes embutidas (`@font-face` em data URL) e desenhar por cima do canvas num `<canvas>` 2D. Animações/transições não andam com o painel oculto: force `opacity:1` nas `.barfx` antes. Foi assim que saíram as fotos de `public/howto/`.
- Retratos grandes dos personagens para comparar: criar `Character3D` num renderer à parte (como `portraits.ts`) com câmera de frente e de 3/4.

## Checklist antes de commitar
`npm run typecheck` · `npm test` · `npm run build` · olhar no navegador (ou captura) a área mexida.
