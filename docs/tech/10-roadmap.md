# 10 — Roadmap, pendências e próximos passos

## Etapas
| Etapa | Status |
|---|---|
| 1. Protótipo de combate + NPCs | ✅ feita (com passes de arte: 3D, personagens, boteco, cerveja, menu) |
| 2. Multiplayer real | ✅ feita (salas por código, lobby, servidor autoritativo, reconexão) |
| 3. Testes e balanceamento | — |
| 4. Acabamento e publicação | — |

## Plano da Etapa 2 (multiplayer) — executado (detalhes reais em 11-multiplayer.md)
1. `packages/server`: Node + TS (`tsx`), Socket.IO; `Room` (código de 4–5 letras, até 4 jogadores, prontos, dono da sala, NPCs opcionais para completar).
2. Loop autoritativo 30 Hz: `GameSimulation` + bots; enviar `snapshotFor(cada jogador)` a 20 Hz e eventos imediatos (filtrar `denied` por jogador).
3. Protocolo (shared/protocol.ts): `room:create/join/ready/start/leave`, `input`, `snapshot`, `events`, `ping/pong`.
4. `client/net/socketConnection.ts` implementando `GameConnection`: estimativa de offset do relógio (ping), `now()` = tempo do servidor estimado, `symbol.at` = tempo estimado (servidor limita recuo a `maxRewindMs` + RTT/2), interpolação de posições (buffer ~100 ms).
5. Menu: criar sala / entrar com código / lobby com prontos (personagens únicos por sala).
6. Desconexão: pausa curta/NPC assume; reconexão por token da sala.
7. Testes: simulação de sala no servidor (sem rede) + teste manual em 2 navegadores e em 2 computadores na rede.

## Próximo
1. Usuário joga e dá retorno (força dos golpes finais, frequência de eventos, cenário).
2. **Sons** (direção em `ART_DIRECTION.md` §9): ganchos prontos — eventos `exchange/finisher`, `burn`, `crate`, `shield`, `waiterBump`, `barEvent` (classes CSS `.barfx.kind-*.stage-*`), paredão (`Paredao.update(t, energy)`).
3. Etapa 3: testes entre computadores diferentes (hospedar no Render — ver CHANGELOG), latência real, balanceamento bot×bot (script em 09-testes) e humanos.
4. Fila de arte antiga ainda aberta: detalhes dos personagens de perto (franja do Fera, pálpebras do Sonolento, "terno" do Príncipe), freezer/isopor mais caprichados.

## Problemas conhecidos / dívidas
- Sem sons ainda (ganchos listados acima).
- Desempenho: ~1.200 desenhos por quadro na partida (a maior parte é a torcida animada, ~45 figurantes). Se travar em máquina fraca: tirar sombra/contorno de figurante longe ou reduzir a turma (`ambient3d.ts`). FPS real ainda não medido em hardware do usuário.
- Cachorros atravessam decoração às vezes (andam numa elipse sem desviar).
- Bar do Zé fica perto da borda de cima na câmera da partida (aparece inteiro no menu).
- Rede: `Infinity` vira `null` no JSON (cerveja/freezer "em uso") — o cliente trata `null` como "não disponível" nos dois.
- Online: sem predição do movimento local (atraso ~100 ms + RTT/2 ao andar); snapshots JSON completos (sem compressão).
- Online: personagem de quem caiu fica parado na arena até voltar (pode ser eliminado).
- Menu: personagens andam em linha reta dentro do ringue (podem atravessar obstáculos); mesa de fora pode ficar perto da borda da barra lateral em telas estreitas.
- Pose de beber é procedural (braço girado) — conferir alinhamento do gargalo com a boca em close.
- HUD ocupa bastante espaço em telas pequenas.
- Pop-ups podem se acumular em brigas simultâneas.
- Sem áudio ainda (direção em `docs/ART_DIRECTION.md` §9).
- Celular: layout básico; controles de toque não implementados.
