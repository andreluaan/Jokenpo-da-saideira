# PPT da Saideira — Documento de Design Técnico

> Versão 0.1 — Etapa 1 (protótipo de combate com NPCs)

## 1. Riscos identificados

### Design
| Risco | Mitigação |
|---|---|
| RPS em tempo real vira "quem aperta primeiro" | O símbolo é escolhido **antes** do QTE; o QTE só avalia *precisão* em torno de um instante conhecido, nunca velocidade de reação. Vantagem de símbolo sempre vence (QTE perfeito não reverte). |
| Blefe sem informação = puro chute | Sinais públicos e ambíguos: **troca (↻)**, **trava (🔒)** e **cancelamento (✖)**. A finta emite o mesmo sinal da troca e custa o mesmo foco — impossível distinguir pelo HUD. |
| Fugir sempre é melhor que lutar | Segurar símbolo reduz a velocidade só de quem segura; investida (dash) custa foco e tem recarga; arena fechada com obstáculos. Tudo configurável. |
| 2–3 jogadores "ganking" um alvo | Teto de 1 de dano por janela de proteção (graça de 900 ms após levar dano) + **uma mão só**: o símbolo do defensor vale contra todos que o atacam. |
| Falha de QTE = eliminação | Falha apenas rebaixa um degrau (vitória → empate); dano é sempre 1. |
| Regras incompreensíveis com 4 jogadores | Cada confronto revela os dois símbolos, as notas de QTE e o motivo do resultado (pop-up + log de combate). |

### Técnicos
| Risco | Mitigação |
|---|---|
| Reescrever tudo ao ir para online | A simulação (`packages/shared`) é **pura e determinística**, independente de rede e de renderização. Na Etapa 1 ela roda no navegador; na Etapa 2 a mesma classe roda no servidor. |
| Vazamento de informação oculta | `snapshotFor(viewerId)` só inclui o símbolo do próprio jogador. Bots também recebem a visão filtrada (jogam "limpo"). |
| Latência e QTE | O comando de confirmação carrega um carimbo de tempo (`at`). O servidor aceita apenas um recuo limitado (≤ 150 ms) e calibrado pelo RTT medido (Etapa 2). |
| Cliente trapaceando | O cliente envia **intenções** (mover, escolher símbolo, confirmar…). Vida, dano, tempos e resultados são calculados exclusivamente pela simulação. |
| Socket.IO ≠ baixa latência | Estado enviado a 20 Hz, entradas enviadas só quando mudam, interpolação no cliente (Etapa 2). Hospedagem próxima dos jogadores. |

## 2. Arquitetura

```
┌──────────────── Cliente (Phaser 3 + Vite) ────────────────┐
│  Menus (DOM)   GameScene (render, input, QTE, feedback)    │
│                     │  GameConnection (interface)          │
│        ┌────────────┴─────────────┐                        │
│  LocalConnection (Etapa 1)   SocketConnection (Etapa 2)    │
│   └ GameSimulation + Bots        └ Socket.IO client        │
└───────────────────────────────────────────┬────────────────┘
                                            │ (Etapa 2)
┌──────────── Servidor (Node + TS) ─────────┴────────────────┐
│  Socket.IO  →  Room (lobby, prontos, código)                │
│                 └ GameSimulation (autoritativa, 30 Hz)      │
│                 └ Bots opcionais                            │
└─────────────────────────────────────────────────────────────┘
        ▲ ambos importam ▲
   packages/shared: config, tipos, regras RPS, simulação, bots, protocolo
```

## 3. Estrutura de pastas

```
PPT Da saideira/
├─ package.json            # npm workspaces
├─ tsconfig.base.json
├─ docs/DESIGN.md
└─ packages/
   ├─ shared/              # lógica pura, testada com Vitest
   │  ├─ src/config.ts     # todos os números ajustáveis
   │  ├─ src/types.ts      # tipos, entradas, eventos, snapshots
   │  ├─ src/rules.ts      # RPS, notas de QTE, resolução de confronto
   │  ├─ src/geometry.ts   # colisão, linha de visão
   │  ├─ src/simulation.ts # GameSimulation (autoritativa)
   │  ├─ src/bot.ts        # NPCs
   │  └─ test/*.test.ts
   ├─ client/              # Phaser 3 + Vite
   │  ├─ index.html
   │  └─ src/
   │     ├─ main.ts        # menus e ciclo de partidas
   │     ├─ net/           # GameConnection, LocalConnection
   │     ├─ scenes/        # GameScene
   │     └─ ui/            # HUD, log, textos
   └─ server/              # (Etapa 2) Socket.IO + salas
```

## 4. Fluxo de comunicação (Etapa 2, já respeitado na Etapa 1)

1. Cliente → servidor: `input` (`move`, `symbol`, `commit`, `cancel`, `feint`, `dash`). Só intenções.
2. Servidor aplica as entradas na simulação, roda `step()` em 30 Hz.
3. Servidor → cada cliente: `snapshot` filtrado (`snapshotFor`) a 20 Hz + `events` (sinais, confrontos, dano, eliminação, fim).
4. Cliente renderiza a partir do snapshot (interpolado) e usa os eventos para feedback.

Na Etapa 1, `LocalConnection` faz o papel do servidor dentro do navegador, com a **mesma** API. **Aviso:** a Etapa 1 não é multiplayer; os adversários são NPCs locais.

## 5. Regras de combate (objetivas)

Valores entre colchetes são os padrões de `config.ts`.

### 5.1 Conceitos
- **Mão**: cada jogador segura no máximo **um** símbolo por vez. Ter mão = ter uma ação de ataque ativa contra um alvo.
- **Foco**: recurso [0–100, começa em 60, regenera 12/s quando sem mão].
- **Impacto (T)**: instante em que um ataque se resolve. Conhecido por todos (o anel de tempo é público); o símbolo não.

### 5.2 Iniciar ataque (Etapa A)
- Requisitos: estar livre (sem mão, sem atordoamento, sem recuperação, sem investida), alvo vivo a ≤ [230 px].
- T = agora + [1000 ms]. Todos veem uma linha de preparação até o alvo, sem o símbolo.
- **Resposta / Duelo**: se o alvo escolhido já está atacando você e ainda faltam ≥ [200 ms] para o impacto dele, forma-se um **duelo**: T compartilhado = máx(T dele, agora + [500 ms]). Um duelo resolve os dois ataques numa única troca.
- Segurar mão reduz a velocidade a [75%].

### 5.3 Janela de blefe e Última Palavra (Etapas B e C)
Enquanto a mão **não estiver travada**:
- **Trocar** símbolo: [20 foco], ↻ público.
- **Finta**: [20 foco], ↻ público idêntico ao da troca, símbolo não muda.
- Trocas + fintas ≤ [2] por ação.
- **Cancelar**: [15 foco], ✖ público, [500 ms] de hesitação (não pode atacar), em duelo o adversário continua atacando você — você fica indefeso.

**Confirmar (Espaço) = a sua Última Palavra.** Trava a mão (🔒 público). A nota de QTE para cada impacto T em que você participa é:
| Momento da trava | Nota |
|---|---|
| \|trava − T\| ≤ [70 ms] | **Perfeito** |
| qualquer outro momento até T + [150 ms] | **Bom** |
| não travou até T + [150 ms] | **Falha** |

- **Confirmar cedo** (antes de T − [450 ms]): Bom garantido e, se for ataque simples (não duelo), o impacto é acelerado (restante × [0,7], mín. [250 ms]). Custa: você não reage mais a sinais.
- **Esperar**: mantém trocas/fintas disponíveis e chance de Perfeito; risco de Falha.
- Janela visual de QTE: de T − 450 a T + 150 = **600 ms** (ajustável).
- A resolução acontece em T + [150 ms].

### 5.4 Resolução de uma troca (Etapa D)
Lado A = atacante (sempre tem símbolo). Lado B = alvo (com a mão atual dele, ou sem mão).

0. Alvo morto, fora de alcance [160 px] ou linha de visão bloqueada por obstáculo → **Errou** (recuperação longa [650 ms]).
1. B sem mão: A Falha → **Errou**; senão A vence (**Indefeso**).
2. Ambos Falha → nada acontece (ambos erraram).
3. Há vencedor por símbolo:
   - Vencedor com Falha → **Empate** ("vantagem desperdiçada").
   - Senão, perdedor leva **1 de dano**. Vencedor Perfeito → empurrão forte + [15 foco]. Perdedor Perfeito → empurrão e atordoamento amortecidos. Perdedor Falha → atordoamento maior.
4. Símbolos iguais:
   - Um lado Falha, ou um Perfeito contra um não-Perfeito → o lado pior fica **cambaleando** [450 ms] (sem dano, perde a mão).
   - Senão → **choque**: ambos são empurrados, sem dano.

**QTE nunca transforma uma derrota de símbolo em vitória.**

### 5.5 Efeitos
- Dano: −1 vida, atordoamento [450 ms], **graça** [900 ms] (sem dano), empurrão [120 px | 190 forte | 70 amortecido], perde a mão.
- Atacante após resolver: recuperação [350 ms] (pode se mover, não pode atacar).
- Alvo que **vence defendendo** (não duelo) mantém a própria ação.
- Investida (Shift): [150 px] em [150 ms], [20 foco], recarga [1,6 s], só sem mão.

### 5.6 Vários jogadores
- Impactos são processados em ordem de T (desempate por id). Determinístico.
- A mão do defensor vale contra todos os atacantes (uma mão só).
- Graça após dano ⇒ no máximo **1 de dano** por janela, mesmo com 3 atacantes simultâneos. Golpes vencedores durante a graça mostram **Protegido** e empurram pouco.
- Quem leva dano perde a própria ação (interrupção).

### 5.7 Fim da partida
- Último vivo vence. Tempo limite [180 s]: vence quem tiver mais vida; empate se houver igualdade.

## 6. Plano de etapas

| Etapa | Entrega testável |
|---|---|
| **1. Protótipo de combate + NPC** | Simulação compartilhada, regras testadas, arena, movimento, ataque, blefe, QTE, resolução, vida, vitória, 1–3 NPCs. |
| **2. Multiplayer real** | Servidor Node + Socket.IO, salas por código, lobby com pronto, 2–4 jogadores reais, sincronização, interpolação, desconexão/reconexão, bots opcionais. |
| **3. Testes e balanceamento** | Simulações em massa bot × bot, métricas (estratégia × execução), ajustes de config, testes de latência entre computadores. |
| **4. Acabamento e publicação** | Arte, áudio, menus, acessibilidade, build de produção, hospedagem. |
