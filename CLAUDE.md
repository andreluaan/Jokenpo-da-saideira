# PPT da Saideira — guia rápido para o assistente

Jogo de arena 3D no navegador baseado em Pedra, Papel e Tesoura (2–4 jogadores). Tema: quintal do **Bar do Zé**;
só tem uma gelada no freezer e **quem fica de pé por último leva a cerveja**.

**Leia primeiro o arquivo da área que vai mexer em [`docs/tech/`](docs/tech/README.md)** — não releia o código todo.

## Estado atual (atualize a cada etapa)
- **Etapa 1 (protótipo + NPCs): feita**, mais passes de arte: visual 3D (Three.js + modelos CC0 Kenney), personagens,
  Jo-Ken-Pô/rasteira, cerveja que cura, menu em lousa com quintal 3D (turma sentada → porteira → ringue).
- **Etapa 2 (multiplayer real): feita** — servidor Node + Socket.IO autoritativo, salas por código, lobby, reconexão (ver `docs/tech/11-multiplayer.md`).
- **Em andamento: passe de arte.** Feito: luz/cor (arena clara × entorno escuro) e legibilidade (contorno, câmera, escala).
  Fila combinada: detalhes dos personagens de perto → freezer/isopor → entorno vazio → log do HUD.
- **Boteco vivo (v0.6, out/2026): feito** — itens (cachaça, amendoim), churrasqueira quente, engradado que quebra, poças,
  freezer (escudo), 1 evento por rodada (Saideira dupla / Queda de luz / Zé grita) com garçom, torcida, cachorro, animações.
  Investida curta/cara; finta removida. Ver `docs/DESIGN.md` §9 e `docs/tech/04`. Próximo: usuário testar; sons depois.
- **Gameplay (out/2026):** vitória de símbolo sempre vale; acertar o QTE = **golpe final** do símbolo (Pedra/Tesoura/Papel,
  ver `docs/DESIGN.md` §5.8). Duelo menos poluído (Jo-Ken-Pô na barra do QTE). "Mão cansada" e histórico público foram
  testados e **rejeitados** pelo usuário. Usuário vai avaliar jogando antes do próximo passo.
- **Depois:** Etapa 3 (testes/balanceamento). Pendências em `docs/tech/10-roadmap.md`.
- Etapas: 1 protótipo · 2 multiplayer · 3 testes/balanceamento · 4 acabamento/publicação.

## Comandos
```bash
npm install
npm run dev        # servidor (3001) + cliente Vite (http://localhost:5173)
npm start          # build + servidor entregando o jogo em http://<IP>:3001
npm test           # Vitest (regras + simulação + NPCs)
npm run typecheck
npm run build
```

## Regras de trabalho (pedidas pelo usuário)
- Responder em **português do Brasil**; usuário não é técnico em arte — explicar escolhas em linguagem simples.
- **Sempre avisar quando passar de etapa** (ex.: "🚩 ETAPA 1 CONCLUÍDA → INICIANDO ETAPA 2") e, ao fim de cada etapa:
  o que foi feito, arquivos, como rodar, como testar, problemas conhecidos, próxima etapa.
- Explicar alternativas **antes** de mudar a arquitetura/tecnologia.
- Não deixar botões sem comportamento; não simular multiplayer sem avisar.
- **Propriedade intelectual:** personagens são originais *inspirados* em arquétipos (sem copiar Naruto/DBZ/Simpsons);
  marcas reais (Skol, Heineken…) **não** — usar a marca fictícia **"GELADA"**.
- **Commits menores**, um por pedaço funcionando (pedido do usuário).
- **Commits sem coautoria do Claude:** nunca adicionar `Co-Authored-By: Claude…` nem "Generated with Claude Code" em commits ou PRs (o usuário não quer isso no GitHub).
- Downloads de assets: só CC0/licença clara, pedindo permissão com nome, origem e tamanho.
- **Documentação viva:** ao mexer num setor do código, atualize o arquivo correspondente em `docs/tech/`
  (conceito, arquivos, decisões, armadilhas) de forma enxuta. Mudou algo do estado do projeto → atualize este arquivo.

## Mapa da documentação técnica
| Área | Arquivo |
|---|---|
| Arquitetura, pacotes, fluxo de dados, coordenadas | `docs/tech/01-arquitetura.md` |
| Simulação autoritativa, regras, config, eventos | `docs/tech/02-simulacao.md` |
| NPCs (BotBrain) | `docs/tech/03-npcs.md` |
| Renderização 3D (Game3D, câmera, efeitos, QTE) | `docs/tech/04-render-3d.md` |
| Personagens 3D, repintura, acessórios, ragdoll | `docs/tech/05-personagens.md` |
| Arena/cenário 3D, obstáculos, porteira, mesa | `docs/tech/06-arena.md` |
| UI/HUD/menu (DOM + CSS) | `docs/tech/07-ui-hud.md` |
| Assets 3D (Kenney), como adicionar modelos | `docs/tech/08-assets.md` |
| Testes, depuração, capturas de tela | `docs/tech/09-testes-e-depuracao.md` |
| Roadmap e problemas conhecidos | `docs/tech/10-roadmap.md` |
| Multiplayer: servidor, salas, protocolo, relógio | `docs/tech/11-multiplayer.md` |

Documentos de design (para humanos): `docs/DESIGN.md` (regras de jogo) e `docs/ART_DIRECTION.md` (direção de arte).
