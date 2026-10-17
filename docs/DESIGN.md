# PPT da Saideira — Documento de Design Técnico

> Versão 0.2 — Etapa 1 (protótipo de combate com NPCs) + passe de direção de arte ([ART_DIRECTION.md](ART_DIRECTION.md))
>
> Arena: elipse de 1520×940 no quintal do Bar do Zé, com mesa central, 4 pilhas de engradados e 4 barris (todos bloqueiam movimento e linha de visão).

## 1. Riscos identificados

### Design
| Risco | Mitigação |
|---|---|
| RPS em tempo real vira "quem aperta primeiro" | O símbolo é escolhido **antes** do QTE; o QTE só avalia *precisão* em torno de um instante conhecido, nunca velocidade de reação. Vantagem de símbolo sempre vence (QTE perfeito não reverte). |
| Blefe sem informação = puro chute | Sinais públicos e ambíguos: **troca (↻)**, **trava (🔒)** e **cancelamento (✖)**. (A finta foi removida na v0.5: não servia para muita coisa.) |
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
┌──────────────── Cliente (Three.js + Vite) ────────────────┐
│  Menus (DOM)   Game3D (render 3D, input, QTE, feedback)    │
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
   ├─ client/              # Three.js (3D) + Vite
   │  ├─ index.html
   │  └─ src/
   │     ├─ main.ts        # menus e ciclo de partidas
   │     ├─ net/           # GameConnection, LocalConnection
   │     ├─ three/         # Game3D, MenuStage3D, arena, personagens
   │     └─ ui/            # HUD, log, textos
   └─ server/              # (Etapa 2) Socket.IO + salas
```

## 4. Fluxo de comunicação (Etapa 2, já respeitado na Etapa 1)

1. Cliente → servidor: `input` (`move`, `symbol`, `commit`, `cancel`, `dash`). Só intenções.
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
- Requisitos: estar livre (sem mão, sem atordoamento, sem recuperação, sem investida), alvo vivo a ≤ [250 px].
- T = agora + [1500 ms]. Todos veem uma linha de preparação até o alvo, sem o símbolo.
- **Resposta / Duelo**: se o alvo escolhido já está atacando você e ainda faltam ≥ [300 ms] para o impacto dele, forma-se um **duelo**: T compartilhado = máx(T dele, agora + [500 ms]). Um duelo resolve os dois ataques numa única troca.
- Segurar mão reduz a velocidade a [75%].

### 5.3 Janela de blefe e Última Palavra (Etapas B e C)
Enquanto a mão **não estiver travada**:
- **Trocar** símbolo: [20 foco], ↻ público.
- Trocas ≤ [2] por ação. (Finta removida na v0.5.)
- **Cancelar**: [15 foco], ✖ público, [500 ms] de hesitação (não pode atacar), em duelo o adversário continua atacando você — você fica indefeso.

**Confirmar (Espaço) = a sua Última Palavra.** Trava a mão (🔒 público). A nota de QTE para cada impacto T em que você participa é:
| Momento da trava | Nota |
|---|---|
| \|trava − T\| ≤ [100 ms] | **Perfeito** |
| qualquer outro momento até T + [220 ms] | **Bom** |
| não travou até T + [220 ms] | **Falha** |

- **Confirmar cedo** (antes de T − [650 ms]): Bom garantido e, se for ataque simples (não duelo), o impacto é acelerado (restante × [0,7], mín. [400 ms]). Custa: você não reage mais a sinais.
- **Esperar**: mantém trocas disponíveis e chance de Perfeito; risco de Falha.
- Janela visual de QTE: de T − 650 a T + 220 = **870 ms** (ajustável; ritmo desacelerado na v0.3).
- A resolução acontece em T + [220 ms].
- Movimento com inércia "de bêbado" (aceleração 800 px/s², desaceleração 650 px/s², velocidade 200 px/s).

### 5.4 Resolução de uma troca (Etapa D)
Lado A = atacante (sempre tem símbolo). Lado B = alvo (com a mão atual dele, ou sem mão).

0. Alvo morto, fora de alcance [175 px] ou linha de visão bloqueada por obstáculo → **Errou** (recuperação longa [650 ms]).
1. B sem mão: A Falha → **Errou**; senão A vence (**Indefeso**) com **golpe final**.
2. Ambos Falha → nada acontece (ambos erraram).
3. Há vencedor por símbolo (v0.5: **o símbolo decide, o QTE só decide o tamanho do golpe**):
   - Perdedor sempre leva **1 de dano**.
   - Vencedor acertou o QTE (Bom/Perfeito) → **golpe final** do símbolo dele (ver 5.8). Perfeito ainda dá [15 foco].
   - Vencedor com Falha → golpe simples (rasteira): empurrão normal; perdedor Perfeito amortece, perdedor Falha fica mais atordoado.
4. Símbolos iguais:
   - Um lado Falha, ou um Perfeito contra um não-Perfeito → o lado pior fica **cambaleando** [450 ms] (sem dano, perde a mão).
   - Senão → **choque**: ambos são empurrados, sem dano.

**QTE nunca transforma uma derrota de símbolo em vitória — nem uma vitória em empate.**

### 5.8 Golpes finais (v0.5)
- **Golpes finais** (vencer + acertar o QTE). Invulnerabilidade igual para os três: [2000 ms].
  | Símbolo | Efeito | Animação |
  |---|---|---|
  | Pedra | atordoa [1700 ms], empurra pouco [40] | mão gigante de pedra cai em cima |
  | Tesoura | empurra [200], atordoa [700], depois fica lento ×[0,55] por [2500 ms] | tesoura gigante corta passando pelo meio |
  | Papel | empurra mais longe [300], atordoa [900], sem lentidão | embrulha e arremessa como bola de neve |

### 5.5 Efeitos
- Dano: −1 vida, atordoamento [450 ms], **graça** [900 ms] (sem dano), empurrão [120 px | 190 forte | 70 amortecido], perde a mão.
- Atacante após resolver: recuperação [350 ms] (pode se mover, não pode atacar).
- Alvo que **vence defendendo** (não duelo) mantém a própria ação.
- Investida (Shift): curta, [65 px] em [170 ms], [50 foco] (no máximo 2 por barra cheia), recarga [1,4 s], só sem mão.

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

## 7. Cerveja na mesa (v0.4)

- A **mesa amarela** do centro (`prop: 'beerTable'`) tem uma cerveja. Perto dela (borda + raio + [36 px]), sem símbolo em mãos, sem atordoamento e com vida abaixo do máximo, o jogador aperta **E**.
- Fica **parado bebendo [2,2 s]**, sem poder atacar nem investir. Ao terminar: **+[1] ❤** (até o máximo).
- **Levar dano enquanto bebe derrama a cerveja** (sem cura). Durante a graça não derrama.
- Só uma cerveja por vez: quem pega reserva. Depois de bebida ou derramada, o garçom traz outra em **[25 s]**.
- Visível para todos: quem está bebendo (`drinkingUntil`) e quando a cerveja volta (`beers[].readyAt`).

## 8. Jo-Ken-Pô (apresentação do QTE)

- Os punhos de quem segura símbolo batem a cada [400 ms] e descem exatamente em T − 800 (**JO**), T − 400 (**KEN**) e T (**PÔ!**). Apertar Espaço no **PÔ!** = Perfeito.
- A pose é idêntica para os três símbolos. Só na resolução os dois viram de frente e mostram o sinal com a mão. O perdedor toma uma **rasteira** (visual; o dano/empurrão continuam vindo da simulação).

## 9. Boteco vivo (v0.6)

### 9.1 Cerveja do chão
Só no evento do Zé: o garçom larga cervejas pelo caminho. Pegar = passar por cima, machucado e de mãos livres → gole rápido [1,3 s] parado e vulnerável: +1 ❤.
(Cachaça da casa e amendoim existiram na v0.6 e foram **removidos** na v0.7 a pedido do usuário.)

### 9.2 Arena interativa
- **Churrasqueira quente:** quem é **arremessado** nela (empurrão forte) queima: atordoa [0,5 s] e é jogado para longe.
- **Engradado que quebra:** aguenta [2] trombadas fortes; quebra, para de bloquear (movimento e linha de visão) e deixa uma **poça de cerveja** grande.
- **Cerveja derramada:** levar golpe bebendo deixa poça. Poça = escorrega por [18 s].
- **Freezer aberto:** E perto do freezer → [1,5 s] parado abrindo → **escudo de gelo** que segura 1 golpe inteiro. Golpe enquanto abre interrompe. Recarga [20 s] por freezer.
- E perto da mesa com cerveja e machucado = beber; senão, perto do freezer = abrir.

### 9.3 Eventos do bar (1 por rodada, sorteado)
Começa entre [22 s] e [40 s] de luta, com aviso [3 s] antes. O **garçom** atravessa a arena junto com o evento: quem esbarra nele tropeça (atordoa [0,4 s] e é empurrado).
| Evento | Duração | Efeito |
|---|---|---|
| **Saideira dupla!** | [10 s] | Golpe final tira **2 ❤** |
| **Queda de luz** | [7 s] | Arena escura: só anéis e luzinhas; sem crachás/setas dos outros (blefe puro) |
| **Zé grita: "Rodada por conta da casa!"** | [9 s] | O garçom larga [3] cervejas no chão pelo caminho |

### 9.4 Ajustes v0.6
- Investida: [65 px], [50 foco] (no máximo 2 por barra cheia), recarga [1,4 s].
- **Finta removida.**
