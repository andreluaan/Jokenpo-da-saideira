# 06 — Arena e cenário 3D (`three/arena3d.ts`)

## Conceito
`buildArena3D(scene, cfg)` monta o quintal do Bar do Zé e devolve `ArenaHandles` { `beerSpot`, `gate {outside, inside}`, `seats[]`, `update(dt, now)` }.
Usado pela partida **e** pelo menu (mesma cena). Obstáculos visuais seguem **exatamente** `cfg.obstacles` (colisão é da simulação).

## Camadas
- **Contraste de valores:** chão de fora terracota mais escuro/menos saturado (`GROUND = 0xbf7a60`, também `SKY`) e arena em **terra batida clara** (`0xc89f83`) → o ringue é a área mais clara da tela e os personagens (com contorno escuro) saltam sobre ela. Luz: hemisfério `0xfff0dd/0x7a5a52` 1,15 + sol `0xffe2bc` 2,6 (menos alaranjados que antes, pele não se mistura com o chão).
- Chão terracota (textura de manchas suave), campo seco (forma no fundo à direita), terra revirada, terra da arena, **borda branca** (elipse com furo).
- **Cerca**: painéis `fence_simple` a cada 1,25 un. ao longo da elipse rx+0,42 / ry+0,42; plaquinhas amarelas; varal de luzes com postes no fundo.
- **Porteira**: painel mais próximo de `GATE_ANGLE = -2.75` (ângulo paramétrico, lado do bar) vira `fence_gate` com a folha `gate` aberta (rot.y −1,35) + 2 postes. `gate.outside/inside` = meio ± normal.
- **Obstáculos** (`buildObstacle` por `prop`): `beerTable` (mesa redonda Kenney repintada amarela + logo "GELADA" + 4 cadeiras + petiscos; `beerSpot` = onde a long neck aparece), `crates` (engradados procedurais), `cooler` (isopor + latas), `freezer` (caixa + faixa + vidro + latas + "GELADA"), `grill` (barril escurecido + brasa emissiva + espetinhos + fumaça + point light).
- **Entorno**: boteco (`buildShack`, telhado com nervuras, placa "BAR DO ZÉ", TV, rádio, banquetas, caixa de som), **mesa de fora com 4 banquinhos** (`buildOutdoorTable(-9.25,-1.3)` → `seats`), árvores de outono, milharal, horta, mesas vermelhas com guarda-sol (`buildPatio`), lousa "SAIDEIRA", grama/flores/pedras espalhadas (PRNG fixo), lenha, toco, lixeira.
- **Luz** e névoa (ver 04).

## Interativo (v0.6)
`ArenaHandles.props[i]` = grupo 3D do obstáculo i (null na mesa). Freezer tem `userData.lid` (tampa de vidro com pivô na borda de trás). `setDim(k)` = queda de luz.

## Armadilhas
- **Formas 2D deitadas** (`ShapeGeometry` + `rotation.x = -π/2`): y da forma vira **−z** do mundo (o campo já saiu na frente por isso).
- Móveis da Kenney têm origem no canto → sempre usar `fit()/place()` (centraliza e põe a base em y=0).
- `recolor(obj, {'*': cor})` clona materiais (não afeta outras cópias).
- Decoração não pode ficar dentro da elipse (o espalhamento testa `k < 1`); evite árvores grandes na frente (z > 4,5), tapam a arena.

## Como mudar
- Novo tipo de obstáculo: `PropKind` em `shared/config.ts` + entrada em `obstacles` + caso em `buildObstacle` (+ teste se mexer em posição).
- Mover a porteira: `GATE_ANGLE`; mover a mesa de fora: `buildOutdoorTable(x,z)` (cuidado com árvores e com o enquadramento do menu).
