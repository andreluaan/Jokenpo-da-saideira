# 06 — Arena e cenário 3D (`three/arena3d.ts`)

## Objetos da arena (v0.14) — `three/props3d.ts`
Estilo "brinquedo" da referência do usuário: `rbox` (RoundedBoxGeometry), `rcyl` (cilindro com borda arredondada via Lathe), material `soft` sem facetas. `buildCooler` (isopor azul com tampa branca aberta, gelo transbordando e latinhas), `buildFreezer` (branco, faixa vermelha GELADA, tampa de vidro com moldura vazada em `userData.lid`), `buildCrates` (dois engradados de plástico com alça vazada e gargalos), `buildGrill` (tambor arredondado com aros, pernas, brasa, grelha e espetinhos), `buildBeerTable` (mesa quadrada de plástico amarela com 4 cadeiras). Em `buildObstacle`, cada cópia ganha **variação de tamanho (±6%) e de giro** — só visual, a colisão é a da simulação.

## Conceito
`buildArena3D(scene, cfg)` monta o quintal do Bar do Zé e devolve `ArenaHandles` { `beerSpot`, `gate {outside, inside}`, `seats[]`, `update(dt, now)` }.
Usado pela partida **e** pelo menu (mesma cena). Obstáculos visuais seguem **exatamente** `cfg.obstacles` (colisão é da simulação).

## Camadas
- **Contraste de valores:** chão de fora terracota mais escuro/menos saturado (`GROUND = 0xbf7a60`, também `SKY`) e arena em **terra batida clara** (`0xc89f83`) → o ringue é a área mais clara da tela e os personagens (com contorno escuro) saltam sobre ela. Luz: hemisfério `0xfff0dd/0x7a5a52` 1,15 + sol `0xffe2bc` 2,6 (menos alaranjados que antes, pele não se mistura com o chão).
- Chão terracota (textura de manchas suave), campo seco (forma no fundo à direita), terra revirada, terra da arena, **borda branca** (elipse com furo).
- **Cerca**: painéis `fence_simple` a cada 1,25 un. ao longo da elipse rx+0,42 / ry+0,42; plaquinhas amarelas; varal de luzes com postes no fundo.
- **Porteira**: painel mais próximo de `GATE_ANGLE = -2.75` (ângulo paramétrico, lado do bar) vira `fence_gate` com a folha `gate` aberta (rot.y −1,35) + 2 postes. `gate.outside/inside` = meio ± normal.
- **Obstáculos** (`buildObstacle` por `prop`): `beerTable` (mesa redonda Kenney repintada amarela + logo "GELADA" + 4 cadeiras + petiscos; `beerSpot` = onde a long neck aparece), `crates` (engradados procedurais), `cooler` (isopor + latas), `freezer` (caixa + faixa + vidro + latas + "GELADA"), `grill` (barril escurecido + brasa emissiva + espetinhos + fumaça + point light).
- **Entorno**: boteco (`buildShack`, telhado com nervuras, placa "BAR DO ZÉ", TV, rádio, banquetas, caixa de som), **mesa comprida dos jogadores com 8 banquinhos** (`buildPlayersTable(pa)` → `seats`, v0.13), árvores de outono, milharal, horta, mesas vermelhas com guarda-sol (`buildPatio`), lousa "SAIDEIRA", grama/flores/pedras espalhadas (PRNG fixo), lenha, toco, lixeira.
- **Luz** e névoa (ver 04).

## Bar do Zé e área dos jogadores (v0.9)
- **`buildBar(scene, BAR.x, BAR.z)`** (BAR = (-7,6, -8,0), ~4 m da cerca): casinha 5×2,2 com janela de garrafas + **varanda coberta** de 2,3 m. O telhado da varanda **sobe para a frente** (2,3 → 2,75) para a câmera (de cima e de frente, ~46°) enxergar dentro. Na varanda: balcão baixo (tampo a 0,61, na altura dos bonecos), banquetas, mesinha com 3 cadeiras, geladeira, caixa de som, lampiões, cordão de lâmpadas. Devolve `bartender` (o Zé/garçom) e `barSeats` (fregueses). Banqueta: y=0,30; cadeira da varanda: y=0,18.
- **Área dos jogadores (v0.13)** — `PlayersArea` calculada a partir da porteira: retângulo alinhado com a cerca (`t` ao longo da cerca, `n` para fora), logo depois da porteira e descido `shift` para longe da varanda do bar. `buildPlayersArea`: corda em retângulo com uma **entradinha** (dois mourões + placa grande "SÓ QUEM JOGA" inclinada para a câmera) na posição `doorU`, alinhada com a porteira. `buildPlayersTable`: mesa comprida com **8 banquinhos** (4 de cada lado; os 4 primeiros `seats` são os virados para a arena). Cada `Seat.path` leva do banco até a entradinha sem atravessar a mesa (quem senta do lado de fora dá a volta pela ponta); o `MenuStage3D` usa esse caminho na ida e na volta. `inPlayersArea()` reserva o espaço (vegetação e árvores não entram); `ArenaHandles.playersArea` (centro + raio que cobre o retângulo) segura a torcida longe.
- **Armadilha vivida:** o laço da torcida na cerca passava de π e caía do outro lado (dentro da área dos jogadores) — agora para em π e ainda checa `nearPlayers`.

## Quintal verde e estradinha (v0.8)
- **Chão**: `grassTexture()` (textures.ts) — grama verde quentinha (`GROUND = 0x8fa452`) com manchas, tufos riscados e florzinhas, repetível sem emenda (`wrapped`). Névoa/fundo `SKY = 0xa9b97a`; hemisfério com rebote verde. CSS `#menu/#match` na mesma cor.
- **Estradinha** (`ROAD`, `buildRoad`): faixa seguindo uma Catmull-Rom com `roadTexture()` (trilhas de pneu, pedrinhas, mato nas beiradas), da borda esquerda até o **terreiro** de terra em frente ao bar; moitas acompanham as margens. Lousa da saideira na entrada da estrada (v0.13: maior, virada para a câmera e inclinada para trás).
- **Bar do Zé**: varandinha de tábua, toldo listrado, lampião aceso, vasos, arbustos e engradados empilhados (`buildShack`).
- Árvores verdes + de outono + um coqueiro; vegetação espalhada respeitando `free()` (arena+torcida, estrada, bar, mesas, rodinhas, picape).
- `PATIOS` (9 mesas vermelhas) e `HANGOUTS` (rodinhas em pé) definidos no topo do arquivo.

## Entorno (v0.7)
Horta removida. Mesas vermelhas em `PATIOS` (hoje 9; `buildPatio` devolve as cadeiras → `fanSeats`), picape com paredão em `truck` (5.4,-7.6). A mesa dos jogadores com 8 banquinhos (`seats`, dentro do cercadinho "SÓ QUEM JOGA") fica **livre** para os jogadores no menu. (Lousa e bar mudaram de lugar na v0.8/v0.9 — ver seções acima.)
Layout dos obstáculos da arena: ver `shared/config.ts` (comentado) e 02-simulação.

## Desempenho: decoração juntada (`merge.ts`)
No fim de `buildArena3D`, `mergeStatic()` junta toda malha parada com o mesmo material (cor/textura/acabamento/sombra) numa malha só: geometria copiada já na posição final (`toNonIndexed` + `applyMatrix4` + `mergeGeometries`). Ficam de fora: lâmpadas do varal (`glows`, animadas), fumaça (sprites), luzes, materiais transparentes (logo GELADA, vidros), malhas espelhadas e o que estiver em `skip`. Cada obstáculo é juntado **por dentro do próprio grupo** (o engradado continua podendo sumir; a tampa do freezer fica em `skip`).
Resultado: partida 1.881 → ~840 desenhos por quadro; menu 1.672 → ~780. O que resta é gente animada (torcida/jogadores).
**Armadilha:** decoração nova que precise se mexer depois de montada tem de ir para `skip` (ou ser criada depois do merge), senão vira parte de uma malha juntada.

## Interativo (v0.6)
`ArenaHandles.props[i]` = grupo 3D do obstáculo i (null na mesa). Freezer tem `userData.lid` (tampa de vidro com pivô na borda de trás). `setDim(k)` = queda de luz.

## Armadilhas
- **Formas 2D deitadas** (`ShapeGeometry` + `rotation.x = -π/2`): y da forma vira **−z** do mundo (o campo já saiu na frente por isso).
- Móveis da Kenney têm origem no canto → sempre usar `fit()/place()` (centraliza e põe a base em y=0).
- `recolor(obj, {'*': cor})` clona materiais (não afeta outras cópias).
- Decoração não pode ficar dentro da elipse (o espalhamento testa `k < 1`); evite árvores grandes na frente (z > 4,5), tapam a arena.

## Como mudar
- Novo tipo de obstáculo: `PropKind` em `shared/config.ts` + entrada em `obstacles` + caso em `buildObstacle` (+ teste se mexer em posição).
- Mover a porteira: `GATE_ANGLE`; a área dos jogadores acompanha a porteira sozinha (ajuste `halfL`/`halfD`/`shift` em `buildArena3D`). Árvores: lista fixa (pula as que caem perto da estrada) + **preenchimento das áreas vazias** do mapa todo numa grade com sorteio (v0.13: respeita `free()`, distância mínima entre árvores, poucas e de outono no campo seco, menos na frente da câmera, milharal livre). A **estradinha** (`ROAD`) passa por fora da área dos jogadores (folga ~0,4 m) e chega no terreiro por cima dela; lousa da SAIDEIRA em `SAIDEIRA_BOARD` (à vista da câmera).
