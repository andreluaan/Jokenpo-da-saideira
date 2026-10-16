# 01 — Arquitetura

## Conceito
Separação rígida entre **simulação** (regras, autoritativa, sem DOM/rede) e **apresentação** (3D, HUD, input).
O cliente só envia **intenções** (`PlayerInput`) e lê **snapshots filtrados** + **eventos**. Isso permite trocar o
"anfitrião" da partida (navegador agora, servidor na Etapa 2) sem reescrever regras nem visual.

## Pacotes (npm workspaces)
| Pacote | Conteúdo | Depende de |
|---|---|---|
| `packages/shared` (`@ppt/shared`) | `config.ts`, `types.ts`, `rules.ts`, `geometry.ts`, `simulation.ts`, `bot.ts`, `characters.ts` | nada |
| `packages/client` (`@ppt/client`) | Vite + Three.js; `net/`, `three/`, `ui/`, `art/rig.ts` | shared, three, @fontsource |
| `packages/server` | **Etapa 2** (ainda não existe) | shared, socket.io |

`@ppt/shared` exporta TS direto (`"exports": "./src/index.ts"`): Vite e (futuramente) `tsx` compilam na hora.

## Fluxo de dados
```
input (teclado/mouse/botões) → GameConnection.send(PlayerInput)
anfitrião: sim.applyInput() … sim.step(dt) → GameEvent[] ; sim.snapshotFor(viewer) → Snapshot
cliente: conn.latest() (snapshot) + conn.onEvents(cb) → Game3D renderiza / HUD atualiza
```
- `net/connection.ts` — interface `GameConnection` (`localPlayerId`, `config`, `now()`, `latest()`, `send()`, `onEvents()`, `start()`, `destroy()`).
- `net/localConnection.ts` — Etapa 1: roda `GameSimulation` + `BotBrain`s no navegador, passo fixo 60 Hz via `setInterval`,
  `now()` interpola o tempo da simulação; `send(commit)` carimba `at = now()` (precisão do QTE).
- Etapa 2: `SocketConnection` com a mesma interface (ver 10-roadmap).

## Coordenadas
- **Simulação:** pixels, mundo 1920×1200, arena elipse centro (960,600) rx 760 ry 470; y para baixo.
- **3D:** 1 unidade = 100 px (`S = 0.01` em `three/assets.ts`); `toWorld(cfg, x, y)` → `(x-cx)*S, 0, (y-cy)*S`. Chão no plano XZ, câmera em +Z olhando para −Z (fundo da tela = −Z).
- Personagem da simulação = círculo r 26 px; visual 3D é maior (escala `CHAR_SCALE`).

## Informação oculta (invariante)
`snapshotFor(viewer)` só inclui `symbol`/`swapsLeft` do próprio jogador. Visual **nunca** pode depender do símbolo
alheio antes do evento `exchange` (pose de punho fechado é igual para os três).

## Onde mexer
- Regra de jogo → `shared` (+ teste). Visual → `client/src/three`. Texto/HUD → `client/src/ui` + `style.css`.
