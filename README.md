# Jokenpô da Saideira

Jogo de arena para navegador baseado em Pedra, Papel e Tesoura: leitura, blefe e execução (QTE).

**Status: Etapas 1 e 2 concluídas (treino contra NPCs + multiplayer online por código); passe de arte/gameplay v0.15 — ver [docs/CHANGELOG.md](docs/CHANGELOG.md).**

Design, riscos e regras objetivas: [docs/DESIGN.md](docs/DESIGN.md).

## Requisitos
- Node.js 20.19+ (testado com 24)
- npm 10+

## Instalar e rodar
```bash
npm install
npm run dev
```
Abra http://localhost:5173 (o comando sobe o servidor do jogo na porta 3001 e o cliente na 5173).

**Jogar com a turma na mesma rede (Wi-Fi):** quem hospeda roda `npm run dev`; os outros abrem `http://<IP-de-quem-hospeda>:5173`
(o IP aparece no terminal). Na aba **🍻 Online**, um abre a mesa e passa o código de 4 letras; os outros entram com ele.

**Hospedar na internet:** sites estáticos (Netlify) não rodam o servidor do online. Use um host Node (ex.: Render):
build `npm install && npm run build`, start `npm run start -w @ppt/server` — o mesmo endereço serve o jogo e o multiplayer.

## Testes e verificações
```bash
npm test           # regras e simulação (Vitest)
npm run typecheck  # TypeScript dos pacotes
npm run build      # build de produção do cliente
```

## Controles
| Tecla | Ação |
|---|---|
| WASD / setas | Mover |
| Clique / Tab | Escolher alvo |
| Espaço | **Desafiar** o alvo para um Jo-Ken-Pô (1 contra 1) |
| J K L (ou 1 2 3) | Pedra · Papel · Tesoura — **bota o símbolo** no duelo (uma vez). No PÔ! (verde) = perfeito; cedo, o outro vê; tarde (vermelho) = pego roubando |
| Shift | Investida curta (gasta foco; no duelo serve para fugir antes de botar) |
| E | Beber a gelada da mesa (machucado) · abrir o freezer (escudo de gelo) |

## Estrutura
- `packages/shared` — configuração, regras, simulação autoritativa, NPCs (sem dependências).
- `packages/client` — **Three.js (3D)** + Vite. `LocalConnection` hospeda a partida no navegador.
  - `src/three/` — renderizador 3D (arena, personagens com ragdoll de molas, efeitos, menu).
  - `public/models/` — modelos 3D CC0 da Kenney (ver `CREDITS.md`).
- `packages/server` — servidor autoritativo (Node + Socket.IO): salas, lobby, partida, reconexão.

Todos os números de balanceamento estão em `packages/shared/src/config.ts`.
