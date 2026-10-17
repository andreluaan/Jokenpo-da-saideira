# Jokenpô da Saideira — Documento de Design Técnico

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

## 5. Regras de combate (objetivas) — v0.11 "malandragem"

Valores entre colchetes são os padrões de `config.ts`. Inspiração: no par ou ímpar, o malandro bota o número com um pouquinho de atraso para ver o do outro. Aqui isso é regra: **quem bota por último vê a mão do outro — mas se demorar demais é pego roubando.**

### 5.1 Conceitos
- **Duelo**: sempre **1 contra 1**. Quem está num duelo não pode ser desafiado por mais ninguém até acabar.
- **PÔ! (T)**: instante central do duelo, igual para os dois. Conhecido por todos.
- **Foco**: [0–100, começa em 60, regenera quando fora de duelo]. Hoje só paga a investida.

### 5.2 Desafiar (Espaço)
- Requisitos: estar livre (sem atordoamento, recuperação, investida, bebida ou freezer), alvo vivo, fora de outro duelo, fora da graça e a ≤ [190 px].
- O alvo **entra no duelo na hora** (se estava bebendo, derrama; se abria o freezer, larga). T = agora + [1500 ms].
- No duelo os dois andam a [75%] da velocidade e se encaram. Quem quiser fugir usa a **investida** antes de botar o símbolo: se no PÔ! estiverem a mais de [215 px] (ou com obstáculo no meio), **os dois erram**.

### 5.3 Botar o símbolo (1/2/3) — a barra
Cada um bota **uma vez** (não troca). O símbolo **aparece na hora para todos** (crachá e risquinho na barra do adversário).

| Quando apertou | Nota | O que significa |
|---|---|---|
| antes de T − [130 ms] | **CEDO** | vale, mas o outro já viu e pode virar |
| T ± [130 ms] (verde) | **PERFEITO** | vale e, se ganhar, sai o golpe final |
| até T + [130 + 300 ms] (vermelho) | **ROUBOU!** | pego roubando: perde e apanha |
| não apertou | **NADA** | apanha de quem botou |

- O verde tem [260 ms]: dá para ler quem botou **cedo**; ler quem botou no começo do verde exige reflexo de malandro (e quem passa do ponto cai no vermelho).
- O carimbo de tempo enviado pelo cliente só pode voltar [120 ms] (compensa a rede sem virar brecha para roubar).
- Se os dois já botaram, resolve no PÔ!; senão, no fim do vermelho.

### 5.4 Resolução
0. Longe demais [215 px] ou bloqueado → **os dois erram** (recuperação [900 ms]).
1. Os dois roubaram → o Zé **anula**: os dois cambaleiam, sem dano.
2. Um roubou → ele **perde e leva 1 de dano** (golpe simples, atordoado mais tempo), não importa o símbolo.
3. Um não botou nada → leva 1 de dano de quem botou (golpe final se o outro botou no verde). Ninguém botou → nada.
4. Os dois botaram: **o símbolo decide**. Vencedor no verde = **golpe final** (5.8) + [15 foco]; vencedor que botou cedo = golpe simples. Perdedor que botou no verde amortece o empurrão.
5. Mesmo símbolo: mesma nota = **choque** (empurra, sem dano); senão quem botou cedo **cambaleia**.

**A execução nunca transforma um símbolo perdedor em vitória.** A malandragem só serve para escolher o símbolo certo — e tem o preço do vermelho.

### 5.8 Golpes finais (v0.5)
- **Golpes finais** (vencer botando no verde). Invulnerabilidade igual para os três: [2000 ms].
  | Símbolo | Efeito | Animação |
  |---|---|---|
  | Pedra | atordoa [1700 ms], empurra pouco [40] | mão gigante de pedra cai em cima |
  | Tesoura | empurra [200], atordoa [700], depois fica lento ×[0,55] por [2500 ms] | tesoura gigante corta passando pelo meio |
  | Papel | empurra mais longe [300], atordoa [900], sem lentidão | embrulha e arremessa como bola de neve |

### 5.5 Efeitos
- Dano: −1 vida, atordoamento, **graça** (ninguém te desafia nem te machuca), empurrão.
- Depois do duelo os dois ficam [550 ms] recuperando (podem andar, não desafiam).
- Investida (Shift): curta, [65 px] em [170 ms], [50 foco], recarga [1,4 s]; no duelo só antes de botar o símbolo.

### 5.6 Vários jogadores
- Duelos são independentes (1 contra 1). Processados em ordem de T (desempate por id). Determinístico.
- Removidos na v0.11: troca de símbolo, cancelar, "Última Palavra"/confirmar e ataques simultâneos no mesmo alvo.

### 5.7 Fim da partida
- Último vivo vence. Tempo limite [240 s]: vence quem tiver mais vida; empate se houver igualdade.

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
- **Ser chamado para um duelo enquanto bebe derrama a cerveja** (sem cura).
- Só uma cerveja por vez: quem pega reserva. Depois de bebida ou derramada, o garçom traz outra em **[25 s]**.
- Visível para todos: quem está bebendo (`drinkingUntil`) e quando a cerveja volta (`beers[].readyAt`).

## 8. Jo-Ken-Pô (apresentação do QTE)

- Os punhos dos dois duelistas batem a cada [400 ms] e descem exatamente em T − 800 (**JO**), T − 400 (**KEN**) e T (**PÔ!**). Apertar o símbolo no **PÔ!** (verde) = Perfeito.
- Barra curva ao lado do seu personagem: trilho = cedo, fatia **verde** = perfeito, fatia **vermelha** = roubou. Um risquinho na cor do adversário marca quando ele botou, com o símbolo dele.
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
| **Saideira dupla!** | [14 s] | Golpe final tira **2 ❤** |
| **Queda de luz** | [10 s] | Arena escura: só anéis e luzinhas; sem crachás/setas dos outros (blefe puro) |
| **Zé grita: "Rodada por conta da casa!"** | [12 s] | O garçom larga [3] cervejas no chão pelo caminho |

### 9.4 Ajustes v0.6
- Investida: [65 px], [50 foco] (no máximo 2 por barra cheia), recarga [1,4 s].
- **Finta removida.**
