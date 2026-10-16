# 09 — Testes e depuração

## Testes automáticos
`npm test` (Vitest, `packages/shared/test`): `rules.test.ts` (tabela RPS/QTE), `simulation.test.ts` (ataque, duelo, blefe, multi-jogador, informação oculta, fim, arena, cerveja), `bot.test.ts` (partida 4 NPCs termina, determinismo). Hoje: **46 testes**.
`packages/server/test/server.test.ts`: rede real (servidor numa porta livre + `socket.io-client`). Total hoje: **56 testes**.
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

## Checklist antes de commitar
`npm run typecheck` · `npm test` · `npm run build` · olhar no navegador (ou captura) a área mexida.
