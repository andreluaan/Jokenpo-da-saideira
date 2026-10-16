# Documentação técnica — índice

Feita para consulta rápida (por quem desenvolve e pelo assistente). Cada arquivo tem: **conceito → arquivos → como funciona → decisões → armadilhas → como mudar**.
Regra: ao mexer num setor, atualize o arquivo dele no mesmo commit (curto e objetivo).

| # | Área | Quando ler |
|---|---|---|
| 01 | [Arquitetura](01-arquitetura.md) | Antes de qualquer mudança estrutural; Etapa 2 |
| 02 | [Simulação](02-simulacao.md) | Regras, tempos, combate, cerveja, config |
| 03 | [NPCs](03-npcs.md) | Comportamento dos bots |
| 04 | [Render 3D](04-render-3d.md) | Câmera, partida 3D, efeitos, QTE, entrada |
| 05 | [Personagens](05-personagens.md) | Visual/animação/ragdoll dos personagens |
| 06 | [Arena](06-arena.md) | Cenário, obstáculos (visual), porteira, mesa |
| 07 | [UI/HUD](07-ui-hud.md) | Menu, HUD, textos, CSS |
| 08 | [Assets](08-assets.md) | Modelos 3D, licenças, adicionar modelos |
| 09 | [Testes e depuração](09-testes-e-depuracao.md) | Testar, inspecionar, tirar capturas |
| 10 | [Roadmap](10-roadmap.md) | Etapas, pendências, próximos passos |
| 11 | [Multiplayer](11-multiplayer.md) | Servidor, salas, protocolo, relógio, reconexão |

Stack: TypeScript 5.9 · Vite 7 · Three.js 0.186 · Socket.IO 4.8 · tsx · Vitest 5 · Node 24 · npm workspaces.
