# 11 — Multiplayer (Etapa 2)

## Conceito
Servidor **autoritativo**: a mesma `GameSimulation` da Etapa 1 roda no servidor (Node + Socket.IO). Cada cliente envia só
`PlayerInput`; o servidor manda **snapshots** (v0.11: o símbolo é público assim que botado) e **eventos**.
O cliente usa `SocketConnection`, que implementa a mesma `GameConnection` da partida local → `Game3D` não muda.

## Arquivos
| Arquivo | Papel |
|---|---|
| `shared/src/protocol.ts` | Tipos das mensagens (`ClientToServer`, `ServerToClient`), `LobbyState`, `MatchStart`, limites (`MAX_PLAYERS`, `SERVER_TICK_HZ=30`, `SNAPSHOT_HZ=20`), `sanitizeName` |
| `server/src/room.ts` | `Room`: lobby + partida (independente do Socket.IO; recebe `Peer` com `emit`) |
| `server/src/server.ts` | `createGameServer()`: HTTP (entrega `client/dist` se existir) + Socket.IO, registro de salas, códigos |
| `server/src/index.ts` | Sobe na porta `PORT` (3001), mostra IPs da rede |
| `client/src/net/online.ts` | `OnlineClient`: socket, criar/entrar/sair, prontos, personagem, configurações, reconexão por token (`sessionStorage`) |
| `client/src/net/socketConnection.ts` | `GameConnection` online: relógio, interpolação, envio de entradas |
| `client/src/main.ts` | Abas Treino/Online, render do lobby, início/fim da partida online |

## Mensagens
Cliente → servidor: `room:create {name, character}` · `room:join {code,…}` · `room:rejoin {code, token}` (todas com ack `JoinResult`) ·
`room:leave` · `room:ready bool` · `room:character c` (ack) · `room:settings {bots, difficulty}` (só dono) · `room:start` (ack, só dono) · `input PlayerInput` · `ping` (ack → tempo da simulação ou −1).
Servidor → cliente: `room:state LobbyState` · `match:start {config, playerId, snapshot}` · `snap Snapshot` (20 Hz) · `ev GameEvent[]` · `match:end winnerId`.

## Regras da sala
- Código de 4 letras (sem I/O). Até 4 humanos. Personagens **únicos** (ao entrar, se o pedido estiver ocupado, recebe o primeiro livre).
- Dono = primeiro a entrar; se sair/cair, passa para o próximo conectado.
- Começar: só o dono; todos os outros conectados prontos; humanos + NPCs ≥ 2. Quem caiu antes de começar fica de fora.
- NPCs: `bots` (0–3, limitado ao espaço), personagens livres na ordem de `CHARACTER_IDS`, ids `bot0..`.
- Partida: loop `setInterval` com acumulador (passo fixo 1/30 s, máx. 250 ms por vez), bots pensam a cada passo; eventos `denied` só para o dono da recusa.
- Fim: `match:end` → após `endPauseMs` (5 s) volta ao lobby, prontos zerados, quem caiu é removido.
- Queda: no lobby, removido após `lobbyDropMs` (20 s); na partida, o personagem fica parado e o lugar é guardado (rejoin reenvia `match:start`). Sala sem ninguém conectado fecha após 60 s.
- Proteção: entradas validadas superficialmente (objeto com `type`), limite de 60 entradas/s por jogador; a simulação valida o resto; apelido saneado.

## Relógio e QTE (justiça com latência)
- `ping` a cada 1 s; amostra `offset = simNow + RTT/2 − performance.now()`; usa a amostra de **menor RTT** das últimas 8 e suaviza (30%).
- `now()` do cliente = tempo estimado do servidor → anel do QTE e "PÔ!" batem com o servidor.
- `symbol` vai com `at = now()`; o servidor aceita recuo de até `qte.maxRewindMs` (120 ms), nunca antes do início do duelo. Pequeno de propósito: com o símbolo público, um recuo grande deixaria um cliente trapaceiro ver a mão do outro e voltar no tempo para fugir do vermelho.
- Posições: desenhadas `INTERP_MS = 100 ms` no passado, interpolando entre dois snapshots; o resto (vida, mão, timers) vem do snapshot mais recente.

## Rodar e testar
```bash
npm run dev        # servidor (3001) + Vite (5173) juntos
```
- Mesmo computador: duas abas/janelas em http://localhost:5173 (cada aba é um jogador; a sessão fica na aba).
- Rede de casa: os outros abrem `http://<IP-do-seu-PC>:5173` (o servidor imprime o IP). O Windows pode pedir para liberar o Node no firewall.
- Produção local: `npm start` (compila o cliente e o servidor entrega tudo em http://<IP>:3001).
- Testes: `packages/server/test/server.test.ts` sobe o servidor numa porta livre e usa `socket.io-client` real (lobby, regras de início, símbolo aparece só depois de botado, movimento, ping, reconexão, fim de partida).

## Armadilhas
- Entradas antes do primeiro passo da partida (contagem) são recusadas (`phase`) — nos testes, espere `sim.phase === 'playing'`.
- O mesmo objeto `Socket` do cliente sobrevive a reconexões: `SocketConnection` continua ouvindo; `match:start` repetido para o mesmo jogador é ignorado.
- Abas em segundo plano estrangulam timers → ping alto/visual lento no painel do app; não é latência real.

## Próximos passos possíveis
Predição do movimento local (reduzir a sensação de atraso), compressão/delta de snapshots, salas públicas/matchmaking, hospedagem na internet (Etapa 4).
