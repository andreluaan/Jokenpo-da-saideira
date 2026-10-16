# PPT da Saideira

Jogo de arena para navegador baseado em Pedra, Papel e Tesoura: leitura, blefe e execução (QTE).

**Status: Etapa 1 — protótipo de combate contra NPCs (local, ainda não é multiplayer).**

Design, riscos e regras objetivas: [docs/DESIGN.md](docs/DESIGN.md).

## Requisitos
- Node.js 20.19+ (testado com 24)
- npm 10+

## Instalar e rodar
```bash
npm install
npm run dev
```
Abra http://localhost:5173.

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
| 1 2 3 (ou J K L) | ✊ Pedra · ✋ Papel · ✌️ Tesoura — inicia ataque, responde a quem ataca você, ou troca o símbolo |
| Espaço | **Última Palavra**: trava o símbolo (Perfeito se o anel fechar na hora) |
| F | Finta (parece uma troca) |
| X / botão direito | Cancelar |
| Shift | Investida |

## Estrutura
- `packages/shared` — configuração, regras, simulação autoritativa, NPCs (sem dependências).
- `packages/client` — **Three.js (3D)** + Vite. `LocalConnection` hospeda a partida no navegador.
  - `src/three/` — renderizador 3D (arena, personagens com ragdoll de molas, efeitos, menu).
  - `public/models/` — modelos 3D CC0 da Kenney (ver `CREDITS.md`).
- `packages/server` — Etapa 2 (Socket.IO).

Todos os números de balanceamento estão em `packages/shared/src/config.ts`.
