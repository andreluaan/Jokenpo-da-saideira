# Jokenpô da Saideira — histórico de versões

Resumo do que mudou em cada passo, **o que o usuário pediu, aprovou ou rejeitou** (para não repetir ideias recusadas).
Detalhes técnicos de cada área ficam em `docs/tech/`; regras em `docs/DESIGN.md`; visual em `docs/ART_DIRECTION.md`.

## Preferências do usuário (valem para tudo)
- Responder em português do Brasil, linguagem simples (não é técnico em arte). Explicar antes de mudar arquitetura.
- Commits pequenos, um por pedaço funcionando, **sem** `Co-Authored-By: Claude` nem "Generated with Claude Code".
- Seu Pança é **amarelo de propósito** (inspirado em pai de desenho amarelo). Antes de publicar, rever o risco de propriedade intelectual (anotado na direção de arte).
- Personagens na escala **1,45** (testamos 1,6 → "fica feio"). Figurantes do mesmo tamanho dos jogadores.
- Gosta de cenário vivo e com cara de **evento da cidade**, mas sem aperto (gente espalhada, não colada na cerca).
- Hospedagem: o Netlify só serve site estático; para o online usar Render/Railway com `npm install && npm run build` e `npm run start -w @ppt/server`.
- Tela da partida **sem poluição**: nada de pop-ups de texto, nada de log/aba de confrontos; nomes pequenos.
- Push para o GitHub **só quando ele pedir**. Mudanças visuais: ele quer ver e julgar (recusa sem medo).

## Ideias recusadas / removidas (não trazer de volta sem o usuário pedir)
- **Mão cansada** (não repetir símbolo 2x) e **histórico público de símbolos** no crachá — implementadas e removidas.
- **Finta (F)** — removida (não servia para muita coisa).
- **Cachaça da casa** e **amendoim** (itens no chão) — implementados e removidos ("itens voando ficaram ruins").
- Itens flutuando/girando no chão — a cerveja do evento do Zé fica em pé, parada.
- **Pop-ups de texto** na arena (RASTEIRA, CORTOU, CEDO, PERFEITO…) e **aba Confrontos** — removidos a pedido.
- **Copo de cerveja enchendo a tela** como transição — trocado pelo voo de câmera.
- **QTE**: barra curva ao lado do personagem, punho num círculo ao lado do personagem e **mãos 3D no próprio boneco** (grandes = estranho, pequenas = não gostou) e o **painel fixo na lateral** (longe do campo de visão) — hoje é o texto curvo abaixo da arena (v0.16).
- Óculos escuros do Fera Verde (escondiam as sobrancelhas).

## v0.18 — Rádio do Zé (aguardando o usuário avaliar)
- Rádio do YouTube com a lista do usuário (18 músicas, sugestões ⭐), tocando já no menu e na partida, numa "TV do Zé" no canto de baixo à direita (regra do YouTube: player visível ≥ 200×200).
- Painel 🔊: barrinha **Música**, Ligar/Desligar, próxima, escolher da lista, colar link do YouTube.
- Online: o **dono da sala** escolhe e todos ouvem a mesma música no mesmo ponto (~0,5 s de diferença nos testes); convidado só desliga para si.

## v0.17.2 — Sons escolhidos pelo usuário + escudo de 10 s
- 8 sons do MyInstants escolhidos pelo usuário (tesoura, pedra, cerveja, escudo, burburinho em loop, golpe normal, ganhou, perdeu) — **sem licença**, trocar antes de publicar (avisado; usuário aceitou o risco).
- Escudo de gelo do freezer agora **derrete após 10 s** (`hazards.freezer.shieldMs`).
- Rádio do YouTube: vídeos da lista achados; implementação pausada a pedido do usuário.

## v0.17.1 — Sons de verdade
- Usuário: sintetizado "muito robotizado, ficou péssimo" → efeitos trocados por **gravações reais CC0** (Kenney Impact/RPG/Casino + aplauso de qubodup, baixados com permissão). Burburinho e torcida falando **tirados** até ter gravação de vozes.
- Volume em 0 agora fica mudo de verdade.

## v0.17 — Som, 1ª entrega (aguardando o usuário ouvir e julgar)
- Decisões do usuário em `ART_DIRECTION.md` §9 (rádio do YouTube, nada de Spotify; ambiente muito baixo, sem TV/bichos).
- Efeitos sintetizados: batidas JO·KEN·PÔ! (só no seu duelo), clique do símbolo, apito de pego roubando, golpe normal, golpe especial próprio de pedra/tesoura/papel, cerveja, brasa, engradado, freezer, garçom, eventos do Zé, fim de partida (ganhou/perdeu).
- Burburinho do bar e torcida reagindo, bem baixinhos. Botão 🔊 com Efeitos/Ambiente e mudo (tecla M).
- Teclas dos símbolos na tela: J/K/L. Fotos novas do Como jogar.

## v0.16 — Jo-Ken-Pô perto do duelo, camarote dos jogadores e luz (aguardando o usuário avaliar)
- **Desempenho:** decoração juntada também por cor (cor nos vértices); picape, cachorros e torcida juntados: partida 1.439 → ~770 desenhos por quadro, sem diferença visual.
- **Jo-Ken-Pô:** pedido "fica distante do campo de visão" → painel lateral trocado por **só o texto JO · KEN · PÔ!** curvado abaixo da cerca da frente, mudando de cor (creme/verde/vermelho).
- **Camarote dos jogadores:** pedido "mesa torta, sem temática de bar" → mesa reta com toalha xadrez, balde de gelo e long necks GELADA, copos americanos, porções, engradados de banquinho, varal de lâmpadas e placa "SÓ QUEM JOGA" pendurada; cercadinho de corda removido; árvores afastadas.
- **Nomes no menu:** quem está sentado só mostra o nome com o mouse em cima.
- **Placas:** pedido "muito secas" → BAR DO ZÉ e SÓ QUEM JOGA viraram letreiro de madeira pintada (tinta gasta, moldura, estrelas, pregos, letra com contorno e brilho); SAIDEIRA virou lousa de giz de verdade (giz granulado, sublinhado, caneco desenhado, aparador com gizes) e o texto parou de sair cortado.
- **Câmera do menu** um pouco mais à direita do mapa (a pedido).
- **Iluminação (ideia 7):** bordas do quintal mais escuras, poças de luz quente (varal, varanda, camarote, brasas), sol mais baixo e forte — sem desenho extra relevante.

## v0.15 — Jo-Ken-Pô num painel fora do personagem (pilar do jogo)
- Tentativa 1: QTE na **mão do próprio boneco** (palma + punho 3D mudando de cor). Usuário achou estranho grande e não gostou pequeno → **descartado**.
- Final: **painel fixo na lateral direita** (lousa) com JO · KEN · PÔ! acendendo, mão desenhada batendo o punho na palma (normal → verde → vermelho), faixa de tempo com ponteiro e o que o adversário mostrou. Não atrapalha o duelo. O boneco volta a só bater os punhos.

## v0.14 — objetos da arena e QTE com as mãos
- **Objetos da arena no estilo da referência** (cantos arredondados, sombreado suave): isopor azul aberto com gelo e latinhas, freezer com vidro, engradados de plástico, churrasqueira de tambor e mesa GELADA quadrada. Cada cópia sai um pouco diferente (tamanho e giro).
- **QTE com as mãos** no lugar da barra: punho batendo na mesinha no JO… KEN… PÔ!; aro e mesinha amarelo (cedo), verde (PÔ!) e vermelho (roubou); o símbolo do adversário aparece ao lado. Fica do lado oposto ao adversário.

## v0.13 — quintal arrumado
- **Área dos jogadores** colada na porteira da arena e alinhada com a cerca: cercadinho retangular com **entradinha** (placa "SÓ QUEM JOGA" grande em cima) e **mesa comprida de 8 banquinhos** (já pensando em mais personagens). Os personagens saem da mesa contornando-a, passam pela entradinha e entram pela porteira.
- **Placas mais visíveis**: lousa da SAIDEIRA maior e virada para a câmera; plaquinhas da cerca maiores.
- **Mais árvores** espalhadas pelas áreas vazias do mapa todo (grama e campo seco, este com árvores de outono).
- **Estradinha desviada**: passa por fora da área dos jogadores (a mesa ficava em cima dela) e chega no terreiro do bar por cima.
- **Nomes na partida mais discretos**: sem caixinha, só o texto com contorno e um risquinho na cor do jogador.
- **Aba "Confrontos" removida** da partida (a pedido); sair virou um botãozinho "✕ Sair" no canto.
- Banco de ideias: QTE com as mãos de Jo-Ken-Pô no lugar da barra.

## v0.12.1 — transição de câmera
- Pedido: não o copo de cerveja, e sim **a câmera do menu indo suavemente até o enquadramento do começo da partida**. Feito (ida e volta). Copo de cerveja removido.
- Card do personagem logo embaixo da lousa e crescendo com a tela.
- Bug: uma rodinha de figurantes ficava em cima da cerca de trás (metade dentro da arena). Mudou de lugar e agora nenhum figurante de rodinha nasce dentro da cerca (`insideFence` em `ambient3d.ts`).

## v0.12 — ícones de verdade e transição
- Símbolos viraram **desenhos cartunescos** (uma pedra, uma folha de papel, uma tesoura) no lugar dos emojis de mão: barra de ações, crachá, marca do adversário na barra e Como jogar.
- Menu: câmera um pouco mais afastada; **card do personagem embaixo da lousa** (deitado, mesma largura).
- Ao começar/sair da partida, um **copo de cerveja enche a tela** ("Bora pro quintal!") e esvazia revelando a cena.

## v0.11.1 — menos texto na tela
- **Sem pop-ups de texto** na partida (golpes, CEDO/PERFEITO, ROUBOU!, Protegido, +1 ❤, Au! Au!…): o resultado fica na cor do enchimento da barra (verde/amarelo/vermelho). A barra só fala JO… KEN… PÔ! e "VAI DAR ROUBO!".
- Card do personagem do menu foi para **baixo, à esquerda**, colado na lousa.

## v0.11 — malandragem no Jo-Ken-Pô
- Pedido: faltava a "gaiatice" brasileira (no par ou ímpar, o malandro bota com atraso para ver o do outro).
- Agora: **Espaço desafia** (1 contra 1) e o QTE é **apertar o símbolo**. Botou cedo, todo mundo vê. **Verde** no PÔ! = golpe final. **Vermelho** logo depois = **pego roubando** e apanha. Não botou nada = apanha. Os dois roubaram = o Zé anula.
- Decisões do usuário: o símbolo aparece **na hora em que é botado**; roubar = **perde e toma 1 de dano**; duelo **1 contra 1**.
- Saíram: troca de símbolo, cancelar (X), "Última Palavra"/confirmar e vários atacando o mesmo alvo.
- Balanceamento: desafio só a ≤190 px e o PÔ! pega até 215 px (antes dava para desafiar de longe e o outro escapava sem fazer nada). NPCs malandros na medida.
- "Como jogar" com 8 cards (novos: desafiar, botar no verde, malandragem tem limite).

## v0.10 — menu enxuto e personagens mais parecidos com as referências
- Pedido: menu "muito poluído e estático". Agora: lousa só com o essencial; **personagem num card no canto** (setas ou clique na mesa); placa balançando, botão "respirando", entradas animadas.
- **Como jogar em cards com fotos do jogo** (7 passos: objetivo, movimentação, alvo/ataque, Jo-Ken-Pô, golpe, gelada, boteco), com Voltar/Próximo.
- Personagens mais fiéis ao que o usuário mandou: Fera com tigelinha + sobrancelhonas + olhos redondos (**tirou os óculos escuros**), Príncipe com chama alta, cara de bravo e armadura branca/dourada, Seu Pança com olhões e fiapos em arco, Sonolento com rabo "abacaxi", olhos de sono, gola e bolsos no colete.

## v0.9 — Bar do Zé de verdade e área dos jogadores
- Bar do Zé **maior**, recuado ~4 m da cerca, com **varanda coberta** (telhado sobe para a frente para a câmera ver dentro): balcão baixo com o Zé atrás, banquetas e mesinha com fregueses tomando cerveja, geladeira, lampiões, cordão de lâmpadas.
- **Cercadinho "SÓ QUEM JOGA"** em volta da mesa onde os personagens jogáveis esperam (menu): figurante nenhum chega perto, só os cachorros.
- Personagens de volta à escala 1,45; bandeja do garçom acompanhou.

## v0.8 — quintal verde e aconchegante
- Grama (textura com tufos, manchas e florzinhas), névoa verde-clara, árvores verdes + de outono + coqueiros, muito capim/flor/moita (Nature Kit, CC0).
- **Estradinha de terra** com trilhas de pneu chegando no terreiro do bar; lousa da saideira como placa de beira de estrada.
- Torcida espalhada: poucos na cerca; a maioria em 9 mesas vermelhas e em rodinhas, todos com long neck dando gole.

## v0.7 — evento da cidade
- Nome novo: **Jokenpô da Saideira**. Eventos mais longos (Saideira dupla 14 s, Queda de luz 10 s, Zé grita 12 s).
- **Layout estratégico** da arena (simétrico por rotação): mesa da cerveja no centro, engradados colados nela, churrasqueiras nos meios-campos, freezers na cerca, isopores nas pontas.
- Torcida variada, 3 cachorros fazendo ronda, garçom no balcão, **picape vermelha com paredão** (procedural, sem marca) nos fundos — tudo também no menu.
- **Desempenho**: decoração parada juntada em poucas malhas (`merge.ts`): 1.881 → ~840 desenhos por quadro (hoje ~1.200 com a turma maior).

## v0.6 — boteco vivo
- Churrasqueira quente (quem é arremessado nela queima), engradado que quebra (vira poça), cerveja derramada vira poça (escorrega), **freezer dá escudo de gelo** de 1 golpe.
- **1 evento por rodada**, sorteado (Saideira dupla / Queda de luz / Zé grita), com aviso de 3 s, clima na tela (bordas + faixa) e o **garçom** atravessando a arena (quem esbarra tropeça; no Zé ele larga cervejas).
- Investida curta e cara (65 px, metade do foco); finta removida.

## v0.5 — golpe final por símbolo
- Ganhar no símbolo **sempre** vale (QTE não vira empate). Acertar o QTE (Bom/Perfeito) = **golpe final** com efeito e animação: Pedra (mão gigante, atordoa 1,7 s), Tesoura (tesoura gigante, lento 2,5 s), Papel (bola de papel, arremessa longe). Invulnerabilidade igual: 2 s.
- Duelo menos poluído: Jo-Ken-Pô pequeno na barra do QTE; sem texto "RASTEIRA!".

## Passe de arte inicial (v0.4)
- Arena clara × entorno escuro, contorno escuro fino (~1,4 px de tela) nos personagens, câmera mais perto/deitada.
