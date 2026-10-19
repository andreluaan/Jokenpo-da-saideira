# Jokenpô da Saideira — guia rápido para o assistente

(Nome antigo: "PPT da Saideira"; pastas, pacotes `@ppt/*` e código continuam com `ppt`.)

Jogo de arena 3D no navegador baseado em Pedra, Papel e Tesoura (2–4 jogadores). Tema: quintal do **Bar do Zé**;
só tem uma gelada no freezer e **quem fica de pé por último leva a cerveja**.

**Leia primeiro o arquivo da área que vai mexer em [`docs/tech/`](docs/tech/README.md)** — não releia o código todo.

## Estado atual (atualize a cada etapa) — out/2026, v0.16
- **Etapas 1 (protótipo + NPCs) e 2 (multiplayer online) feitas.** Fim de um longo **passe de arte/gameplay** (v0.5 → v0.15).
  **Histórico e o que o usuário aprovou/recusou: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)** — leia antes de propor ideias.
- **Como o jogo está hoje (resumo):**
  - **Duelo com malandragem** (DESIGN §5): Espaço desafia (1×1); J/K/L bota o símbolo, que aparece na hora para todos.
    Antes do verde = cedo (o outro lê); verde no PÔ! = perfeito (golpe final se ganhar); vermelho = pego roubando (apanha).
  - **Jo-Ken-Pô (QTE) = só o texto JO · KEN · PÔ! curvado abaixo da cerca da frente** (`ui/qteArc.ts`, v0.16), mudando de cor
    (creme → verde → vermelho). O boneco só bate os punhos. (Recusados: barra curva, punho ao lado, mãos 3D, painel lateral.)
  - **Tela da partida limpa:** sem pop-ups de texto, sem aba de confrontos, nomes discretos, botão "✕ Sair" no canto.
  - **Menu:** lousa à esquerda + card do personagem logo embaixo; "Como jogar" em 8 cards com fotos; transição = câmera
    do quintal voando até o enquadramento da partida (`three/matchCamera.ts`).
  - **Cenário:** objetos da arena no estilo "brinquedo" (`three/props3d.ts`), **camarote dos jogadores** reto ao lado da porteira
    (`three/playersCorner3d.ts`: toalha xadrez, cerveja na mesa, engradados de banquinho, varal de lâmpadas; nome só no hover no menu),
    estradinha desviada, muitas árvores, quintal com bar/torcida/cachorros/picape. Luz com profundidade (bordas escuras, poças de luz).
  - **Desempenho:** ~770 desenhos por quadro na partida (`merge.ts` junta por acabamento, com cor nos vértices; ver 06).
  - **Personagens:** 4 (Fera Verde, Príncipe Marrento, Seu Pança, Sonolento), visual mais fiel às referências do usuário (v0.10).
- **Online:** código no GitHub (`andreluaan/Jokenpo-da-saideira`, branch `main`); hospedagem na **Render** (Web Service Node:
  build `npm install && npm run build`, start `npm run start -w @ppt/server`, sem variáveis obrigatórias — opcional `NODE_VERSION=22`;
  **não** pôr `NODE_ENV=production`). Só enviar ao GitHub quando o usuário pedir.
- **Banco de ideias** (guardadas, nada decidido): [`docs/IDEIAS.md`](docs/IDEIAS.md) — sons, novos personagens com skill + mesa maior,
  HUD do duelo mais limpo, mini game da cerveja (fora da partida), disputa pela gelada na mesa do meio, pódio/animação de fim de partida.
- **Próximo:** o usuário avalia a v0.16 (texto do Jo-Ken-Pô, camarote, luz) e testa com a turma na Render (largura do verde com atraso de rede).
  Depois: sons, Etapa 3 (testes/balanceamento) — ver `docs/tech/10-roadmap.md`.
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
- **Enviar ao GitHub (push) só quando o usuário pedir** — ele costuma revisar antes ("ainda não envie").
- **Mudança visual: mostrar e deixar o usuário julgar.** Ele decide pelo que vê (já recusou várias versões); conferir no navegador antes de dizer que ficou bom.
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
