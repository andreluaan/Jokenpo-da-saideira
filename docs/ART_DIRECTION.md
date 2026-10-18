# Jokenpô da Saideira — Direção de Arte

> v0.5 (3D) · Referência: *Oddballers* (cartoon low-poly, paleta quente de outono, arena redonda cercada, anéis coloridos sob os personagens, seta de mira branca no chão).

## 0. Tecnologia visual (v0.5)

- Renderização **3D com Three.js** (WebGL): luz quente de fim de tarde, sombras suaves reais, câmera inclinada à la Oddballers, névoa leve.
- Modelos **CC0 da Kenney** (Mini Characters, Furniture, Food, Nature) — ver `packages/client/public/models/CREDITS.md`.
- Personagens = modelo animado da Kenney (idle, andar, correr, soco, chute, cair) + repintura da paleta por personagem + cabelos/acessórios em blocos montados no espaço do modelo e presos aos ossos.
- "Bêbado": molas (`art/rig.ts`) inclinam o corpo inteiro e somam rotação nos ossos (cabeça e braços) depois da animação; rasteira = tombo limitado a ~83° + chute do vencedor.
- HUD e textos são HTML por cima do 3D (crachás, painel do Jo-Ken-Pô). Sem pop-ups de texto (v0.11.1).

## 1. Pilares

| Pilar | Por quê |
|---|---|
| **Legibilidade antes de tudo** | Quatro jogadores lutando ao mesmo tempo: cada personagem, mira e sinal precisa ser lido em menos de meio segundo, mesmo em tela pequena. |
| **Aconchego de boteco** | O tom é rivalidade entre amigos no fim da noite, nunca violência. Cores quentes, formas redondas e humor. |
| **Nada vaza o segredo** | Pose, animação, som e cor **nunca** indicam o símbolo escolhido antes da revelação. A arte serve ao blefe. |
| **Revelação é o clímax** | O momento em que os dois símbolos aparecem é o mais caprichado: grande, claro, com o motivo do resultado escrito. |
| **Simples de produzir** | Tudo funciona com formas vetoriais (Phaser Graphics) e pode evoluir para sprites ilustrados sem mudar o layout. |

## 2. Temática e tom

**O mundo:** o Bar do Zé, um boteco de beira de estrada no interior, numa sexta-feira à hora dourada que vira anoitecer. No quintal fica a "arena": um cercadinho de terra batida onde os frequentadores resolvem a eterna disputa de **quem paga a saideira**. Sem socos: tudo se decide no Pedra, Papel e Tesoura, levado muito a sério.

**Lore curta:** o Zé proibiu briga no bar há anos. Depois disso, toda discussão vira "PPT no quintal". A regra virou tradição, com lousa de giz, placar e torcida nas mesas de plástico. Quem perde paga a última rodada (que pode ser de guaraná, ninguém julga).

**Tom:** comédia leve, regional sem caricatura ofensiva, celebração de amizade. Evitar glamourizar bebida: garrafas e engradados são cenário, nunca mecânica.

## 3. Personagens (cosméticos, jogabilidade idêntica)

Quatro frequentadores **originais**, inspirados em arquétipos de anime e cartoon escolhidos pelo cliente. As referências foram usadas só como vibe: nenhum design, nome ou marca registrada é copiado, para o jogo poder ser publicado (Etapa 4).

| Personagem | Silhueta / acessório | Pose parada | Personalidade |
|---|---|---|---|
| **Fera Verde** | Cabelo tigelinha preto brilhante, sobrancelhonas, olhos redondos arregalados (v0.10: sem óculos, para as sobrancelhas aparecerem), macacão verde, cinto vermelho, antebraços enfaixados, polainas laranja | Garrafa verde **sem rótulo** na mão | Energia de academia, "fogo da juventude" |
| **Príncipe Marrento** | Cabelo alto espetado em chama com entradas em V, sobrancelhas franzidas, macacão azul, peitoral branco, ombreiras e faixa douradas, luvas e botas brancas | **Braços cruzados** | Arrogante, nunca paga a rodada |
| **Seu Pança** | Careca com fiapos, barba por fazer, olhos grandes, barrigão de camisa branca, calça azul-clara, cinto/sapatos marrons. **Pele amarela de desenho** (decisão do usuário, out/2026 — ⚠ antes da publicação, rever: amarelo + careca + fiapos + camisa branca/calça azul fica muito perto de um personagem registrado) | Caneca de chope com espuma | Paizão bonachão |
| **Sonolento** | Rabo de cavalo espetado, olhos meio fechados, colete tático verde com bolsos, faixa na coxa | Mão no bolso, "z" flutuando, **palito de dente** (sem cigarro) | Preguiçoso, mas estrategista |

**Regras:**
- A cor do jogador fica no **anel do chão**. A roupa é fixa de cada personagem.
- **Pose ao segurar símbolo:** punhos juntos e fechados na frente do corpo, igual para os três símbolos. Os adereços (garrafa, caneca) somem enquanto o personagem segura um símbolo.
- Escala visual um pouco maior que o raio de colisão (legibilidade vem antes). A cabeça ocupa cerca de 40% da altura.
- **Contorno escuro** em volta de todo personagem: separa o boneco do chão e dos outros em qualquer luz.
- **Hierarquia de valores:** a arena é a área mais clara da tela; o entorno é mais escuro e menos saturado.

### 3.1 Movimento "bêbado" (inspirado em Gang Beasts)
- **Simulação (vale para todos, autoritativa):** movimento com inércia. Acelera em 800 px/s², desacelera em 650 px/s² (escorrega ao parar) e perde o embalo ao bater na cerca.
- **Visual (cliente, `art/rig.ts`):** ragdoll ativo simplificado com molas pouco amortecidas:
  - o corpo inteiro inclina em torno dos pés: balanço contínuo de bêbado + inclinação na direção do movimento, passando do ponto ao parar;
  - a cabeça atrasa e bamboleia; os braços são molas soltas que a aceleração arremessa;
  - ao levar golpe, o corpo é arremessado, amassa (squash) e chacoalha; no choque, os dois chacoalham; no golpe no vazio, o atacante tropeça para a frente;
  - atordoado: balanço 2,6× mais forte e braços se debatendo;
  - eliminado: desaba de lado como ragdoll, com olhos em X.
- Nada disso depende do símbolo escolhido.

## 4. Símbolos ✊ ✋ ✌️

- Formas bem diferentes independentemente de cor: **Pedra** = bloco compacto e redondo; **Papel** = palma aberta e larga; **Tesoura** = dois dedos em "V", silhueta pontuda.
- Cores de apoio (nunca as únicas pistas): Pedra `#b36a55` (madeira), Papel `#fff4e6` (creme), Tesoura `#ff5a5f` (vermelho).
- Antes da revelação, os outros só veem **❔** (e 🔒 quando travado). Você vê o seu próprio símbolo sobre a cabeça.
- **Revelação:** os dois ícones aparecem grandes entre os jogadores (`✊ × ✌️`), seguidos da frase do resultado ("Pedra vence Tesoura", "Choque!", "Vantagem desperdiçada!") e das notas do QTE sob cada um.

## 5. Arena e cenário

Mundo de 1920×1200. A arena é uma **elipse** (rx 760, ry 470) de terra pisada com borda branca e cerca de madeira com plaquinhas amarelas em losango.

| Elemento | Onde | Sólido? | Requisito de leitura |
|---|---|---|---|
| **Mesa de plástico amarela** com cadeiras, marca fictícia **"GELADA"** | Centro | Sim (círculo r 70) | Mesa da cerveja (cura): long neck brilhando quando há cerveja |
| Engradados de garrafa (amarelo + verde) | Colados na mesa, em diagonal | Sim | Cobertura de quem disputa a cerveja; quebram e viram poça |
| Churrasqueira de tambor com espetinhos | Meios-campos, em diagonal | Sim (círculo r 34) | Brasa e faíscas; quem é arremessado nela queima |
| Freezer horizontal "GELADA" | Encostados na cerca (cantos opostos) | Sim | Abrir (E) dá escudo de gelo; tampa de vidro abre |
| Isopor com gelo e latinhas | Pontas esquerda/direita, em pé, na cerca | Sim | Esconderijo |
| Cerca + varal de luzes | Borda | Limite da arena | — |
| Entorno (v0.9) | Fora | Decoração | Grama verde, estradinha até o Bar do Zé (com varanda e gente), mesas vermelhas com torcida, rodinhas, cachorros, picape com paredão, cercadinho "SÓ QUEM JOGA" |

> Marcas reais (Skol, Heineken etc.) **não** são usadas: a mesa amarela clássica de boteco leva a marca fictícia "GELADA".

**Profundidade:** objetos de cenário e jogadores são ordenados pelo `y` da base. Os obstáculos são desenhados com extrusão vertical: tampo ou topo mais claro, face da frente mais escura. A sombra fica sempre deslocada para baixo e para a direita.

**Regra de jogo:** todo obstáculo dentro da arena bloqueia o movimento **e** a linha de visão do golpe.

## 6. Paleta

| Uso | Cor |
|---|---|
| Chão externo (grama, v0.8) · névoa | `#8fa452` · `#a9b97a` (verde quentinho; a arena clara continua sendo o destaque) |
| Estrada de terra | `#b8916a` com trilhas `#78583c` |
| Campo seco | `#e9b949` / `#d9a43a` |
| Terra da arena (clara) · manchas | `#c89f83` · `#bb9073` / `#d4b097` |
| Contorno dos personagens | `#2b1d22` (fino, ~1,5 px de tela) |
| Borda da arena | `#f3ece8` |
| Madeira escura · clara | `#8a4f45` · `#b36a55` |
| Folhagem | `#d9553f` / `#e8823c` |
| Telhado | `#d8443c` |
| Sombra (25–35%) | `#3a2433` |
| **Jogadores** | Azul `#3b9be8` · Roxo `#a35ce0` · Laranja `#f2a93b` · Verde `#3dbf7a` |
| UI | Fundo `#2b1d22` · Painel `#3a2830` · Texto `#fff4e6` · Destaque `#ffc145` · Perigo `#ff5a5f` · Sucesso `#5ad19a` |

**Daltonismo:** azul, laranja e roxo se distinguem bem. O verde pode se confundir com o laranja (protanopia). Por isso a identidade **nunca** depende só da cor: há acessório de cabeça, nome sob o personagem e anel branco duplo no jogador local. Modo daltônico planejado: padrões no anel (liso, tracejado, pontilhado, duplo).

**Fonte:** Fredoka (400/600/700), embutida via `@fontsource/fredoka`.

## 7. Interface (HUD)

- **Tom:** boteco aconchegante, com madeira escura, creme e âmbar e cantos bem arredondados. Inspirações futuras: lousa de giz no placar e porta-copos nos cartões de jogador.
- **Cartões de jogador (topo):** cor, nome, ❤ vida e barra de foco. Discretos, fora da arena.
- **Barra de ações (base):** símbolos e ações clicáveis com atalho visível. Fica desabilitada quando a ação não é possível.
- **Painel do Jo-Ken-Pô (v0.15):** lousa fixa na lateral direita, só no seu duelo: JO·KEN·PÔ!, mão desenhada batendo o punho na palma (normal → verde → vermelho), faixa de tempo, o que o adversário mostrou.
- **Durante o combate:** nada sobre a arena além de nomes (pequenos), vida, foco e a seta do desafio. Sem pop-ups, sem log.

## 8. Efeitos e feedback

| Evento | Feedback |
|---|---|
| Preparação de ataque | Lâmina branca no chão apontando o alvo + arco de tempo na cor do atacante (âmbar se for duelo) |
| Acerto | Ícones revelados + frase + "−1 ❤", piscar de invulnerabilidade, tremor de câmera leve |
| Choque / cambaleio | Empurrão para trás, estrelinhas girando no atordoado |
| Perfeito / Bom / Falha | Selo colorido sob o personagem |
| Protegido | Texto azul-claro, empurrão curto |
| Eliminado | Personagem deitado com olhos em X, texto grande |

**Proibido animar:** formato da mão ao preparar, cor do símbolo antes da revelação, som diferente por símbolo antes do impacto, qualquer diferença visual entre troca e finta.

### 8.1 Jo-Ken-Pô e rasteira
- Na preparação, os punhos fechados batem no ritmo e **JO… KEN… PÔ!** aparece pequeno ao lado da barra do QTE (nada grande sobre o duelo). O PÔ! é o instante perfeito do QTE.
- Na revelação, os dois viram de frente e estendem o braço com o sinal desenhado (punho, palma ou "V"), na cor da mão de cada personagem (faixa do Fera, luva do Príncipe).
- O vencedor varre a perna; o perdedor tomba (molas do ragdoll), levanta cambaleando, solta poeira (sem texto extra). No empate, os dois se esbarram.

### 8.1.1 Golpes finais (vencer + acertar o QTE)
- **Pedra:** um punho gigante de pedra desce do céu em cima do perdedor (poeira + tremor) e volta a subir; ele fica estatelado.
- **Tesoura:** uma tesoura gigante passa cortando pelo meio dele (rastro branco); ele é arremessado e o anel pisca em azul-gelo enquanto está lento.
- **Papel:** ele é embrulhado numa bola de papel de caderno, arremessado como bola de neve e o papel estoura quando cai.
- Errou o QTE mas ganhou no símbolo: rasteira simples (sem golpe final).
- Manchetes curtas: **ESMAGOU! · CORTOU! · EMBRULHOU!**

### 8.2 Bebendo
- O braço leva a long neck (ou a caneca do Seu Pança) à boca, a cabeça vai para trás e sobem bolhas. No fim aparecem **+1 ❤** e **"hic!"**, e o personagem fica 2,2× mais cambaleante por 6 s.
- Se apanhar bebendo: **"Derramou!"**.

## 9. Áudio (direção)

- **Música:** forró / samba-rock lo-fi, leve e em loop. Na fase final (2 jogadores), a música ganha percussão.
- **Efeitos:** tampinha estourando (trava), "tum" de mesa (acerto), tilintar de copos (choque), apito de garçom (contagem), grilos ao fundo, torcida abafada do bar na vitória.
- Mesmo som para troca e finta. O som do símbolo só toca na revelação.

## 10. Lista de assets para a Etapa 4

| Asset | Formato | Tamanho | Prioridade |
|---|---|---|---|
| 4 personagens (idle, andar, segurando, golpe, dano, vitória, eliminado) | Spritesheet PNG | 128×128 por quadro | Alta |
| Ícones ✊ ✋ ✌️ ❔ 🔒 ↻ ✖ próprios | SVG | 64×64 | Alta |
| Obstáculos (mesa, barril, engradados) | PNG com transparência | 256 px | Alta |
| Cenário do quintal (fundo) | PNG em camadas | 1920×1200 | Média |
| Cerca modular (poste + ripa) | PNG | 64 px | Média |
| Moldura do HUD (madeira, lousa, porta-copos) | SVG / 9-slice | — | Média |
| Logo "Jokenpô da Saideira" | SVG | — | Média |
| Trilha + 12 efeitos sonoros | OGG/MP3 | — | Média |

**Prompts para ferramenta de geração de imagem (conceito):**
1. `Top-down isometric view of a round dirt arena in the backyard of a rustic Brazilian countryside bar at golden hour, wooden fence with small yellow diamond signs, string lights, autumn trees with red and orange foliage, dry yellow field, red tin-roof shack with a sign "BAR DO ZÉ", plastic red tables and chairs, stylized low-poly cartoon, warm palette, soft purple shadows, game art, clean readable shapes`
2. `Character turnaround sheet, chunky stylized low-poly cartoon bar regular wearing a baseball cap and oversized t-shirt, big head, small body, friendly comedic expression, warm autumn palette, game character concept, white background`
3. `Character concept, cheerful middle-aged woman with a wide straw hat with red ribbon, stylized low-poly cartoon, big head proportions, warm palette, front and top-down views, game asset sheet`
4. `Prop sheet for a cartoon game: stack of yellow and green beer crates with bottle caps visible, wooden draft beer barrel with dark metal hoops, round wooden bar table with glasses, low-poly stylized, top-down three-quarter view, warm lighting, transparent background`
5. `Game UI mockup, cozy Brazilian bar theme, dark wood panels, cream text, amber highlights, chalkboard scoreboard, rounded chunky font, rock paper scissors hand icons, clean minimal HUD around a top-down arena`

## 11. Fora de escopo / não fazer

- Personagens com poderes, classes ou atributos diferentes.
- Violência gráfica, sangue ou bebida como mecânica.
- Estereótipos ofensivos regionais ou de gênero.
- Efeitos que escondam jogadores (partículas grandes, fumaça) durante o combate.
- Mapas grandes com rolagem de câmera: a arena inteira deve caber na tela.
