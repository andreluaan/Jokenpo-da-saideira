# 05 — Personagens 3D (`three/character3d.ts`, `art/rig.ts`)

## Conceito
Base = **Kenney Mini Characters** (chibi animado, 32 clipes, ossos `root, torso, head, arm-left/right, leg-left/right`).
Cada personagem original = modelo base + **repintura da paleta** + **acessórios em blocos** + adereço na mão. Cosmético apenas.

## Personagens (`LOOKS`)
| id | Base | Repintura corpo (célula→cor) | Extras |
|---|---|---|---|
| `fera` Fera Verde | male-a | r2c3/r2c11 verde, r2c5 laranja, r3c13 faixa, r3c11 pele; cabeça r3c1/r3c7/r3c9 (cabelo e óculos do modelo) → pele | tigelinha brilhante (calota + nuca + franja reta), sobrancelhonas, olhos redondos, faixa vermelha na cintura, garrafa |
| `principe` Príncipe Marrento | male-d | r3c1 azul, r2c9/r3c9 (camisa/gravata) e r3c15 (luvas) brancos; cabeça r3c11→preto | chama de 9 espetos + calota, bico em V na testa, sobrancelhas em V (marrento), peitoral/costas brancos, faixa e ombreiras douradas, botas brancas |
| `panca` Seu Pança | male-b | r2c9 branco, r2c11 azul-claro, r3c15 pele **amarela**, r3c11 cinto/sapatos marrons; cabeça r3c15/r3c13 amarelas, r3c11 focinho bege | olhões redondos, 2 fiapos em arco, "M" de cabelo sobre as orelhas, barriga, caneca |
| `sonolento` Sonolento | male-f | r2c3 oliva, r3c3/r3c15 escuro, r3c11 pele clara | rabo "abacaxi" (8 cones), elástico vermelho, pálpebras pesadas + risquinho, brincos, gola alta e bolsos no colete, palito |

**v0.10 (passe "mais parecido com as referências"):** rostos de desenho valem mais que roupa — olhos `cartoonEye()` (discos chatos, sem contorno: com borda pareciam óculos), sobrancelhas em caixas finas. `dome()` = calota low-poly para cabelos "capacete". O cabelo original do modelo pode cobrir a testa: repinte a célula para pele e desenhe o cabelo novo por cima.

**Paleta Kenney** (`colormap.png` 512²): células 32×128 → `r{linha}c{coluna}` (linha 0–3 de cima, coluna 0–15). Linha 2: bege, verde, amarelo, laranja, vermelho, azul, azul-claro, roxo (2 colunas cada). Linha 3: escuro, cinza, ardósia, cinza-azulado, branco, pele salmão, marrom, pele clara.
Corpo e cabeça recebem **texturas separadas** (assim o terno vira azul sem apagar os olhos). Para descobrir células de outro modelo: `node tools/glbuv.mjs <arquivo.glb>`.

## Acessórios — como posicionar
- `userData.noOutline = true` num mesh = sem contorno (olhos, pálpebras, brilho do cabelo).
- `c.boneAnchor('leg-left')` (só dentro de `build`) devolve `{ g, box }` no espaço do modelo, preso depois ao osso (ex.: botas).
1. `modelBox()` mede a caixa da cabeça **no espaço do modelo** usando `getVertexPosition` (posição já com esqueleto).
2. `headAnchor` mapeia a caixa canônica `CANON_HEAD` (x ±0,227, y 0–0,328, z ±0,171; rosto em +Z) para a caixa real.
3. Os builders desenham em coordenadas canônicas; depois `head.attach(headAnchor)` (preserva o mundo). Tronco: `torsoAnchor` + `torsoBox`. Mão: `handPoint()` → `armR.attach(handR)`.
- **Armadilhas já vividas:** coordenadas no espaço do osso deram cabelo flutuando (osso tem rotação interna); placas por cima da cabeça viram "tampo" visto de cima — preferir franja/espetos.

## Mãos do Jo-Ken-Pô — o QTE (v0.15) — `three/jkpHands.ts`
- `JkpHands` (no espaço do modelo): palma aberta (`PALM_AT`, mão esquerda), punho/gestos (`FIST_AT(lift)`, mão direita: punho fechado pulando, e pedra/papel/tesoura depois de botar) e dois **braços de desenho** (cápsulas na cor `Look.sleeve`) do ombro (`torsoBox`) até as mãos. Mãos no tamanho de mão de boneco (`HAND_SCALE` 1,1 — 1,75 ficou "grande e estranho" para o usuário) em blocos arredondados (`rbox`), com contorno.
- No duelo, os braços originais da Kenney encolhem para um ponto (`armL/armR.scale` 0,001) e voltam ao normal fora dele (ou ao morrer). Tentativas descartadas: girar/esticar o braço original (a mão-bloco da Kenney crescia junto e tapava tudo; braço curto não alcança a frente do queixo, e a cabeça grande tapava as mãos vistas de cima).
- `Game3D.jkpFor(p)`: `lift` (sobe na preparação; bate a cada `BEAT_MS` com o PÔ! em T), `squash` na batida, `tint` (`normal`/`green`/`red`, mesma regra do `gradePick`; congela na nota ao botar), `glow` pulsando, `gesture`. Para você usa o instante local em que apertou (`localLock`) para responder na hora.
- Cores: `Look.skin` (mão: atadura do Fera, luva do Príncipe, amarelo do Pança, pele do Sonolento) e `Look.sleeve` (braço).

## Hierarquia e animação
`root` (posição) → `tilt` (balanço/tombo no mundo) → `facing` (yaw suave) → `model`.
Gatilhos curtos (`trigger`): golpe/chute, `jump` (queimadura), `interact-right` (abrir freezer), `emote-yes` (escudo pronto). Beber usa a duração real do gole (`drinkStart` no Game3D).
Estado: morto→`die` · `oneShot` (golpe/chute) · sentado→`sit` · bebendo→`holding-right` (+braço à boca procedural) · andando→`walk`/`sprint` (timeScale pela velocidade) · senão `idle`.
Ossos ajustados **depois** do mixer, partindo da rotação de repouso (`rest`) para não acumular: cabeça/braços seguem o rig; `pump` levanta os dois braços.

## Legibilidade: tamanho e contorno
- `CHAR_SCALE = 1.45` (testamos 1,6 e o usuário achou feio; voltou ao original). Vale para jogadores e figurantes (`Extra3D`), todo mundo do mesmo tamanho.
- **Contorno escuro** (`addOutline`, cor `#2b1d22`): cada mesh opaco ganha um filho "casco invertido" (só faces de trás, `MeshBasicMaterial` compartilhado) inchado no shader **depois da projeção** (direção da normal na tela). Espessura fixa em pixels CSS (`OUTLINE_PX = 1.4` × pixel ratio), igual em qualquer monitor/resolução; `onBeforeRender` de cada contorno passa o tamanho do buffer do renderer atual (menu, partida e retratos são renderers diferentes).
- **Armadilha vivida:** espessura em unidades do mundo (∝ distância) ficava grossa demais em telas grandes.
- Usa normais **suavizadas** (atributo `olNormal`, média por posição, guardado na geometria compartilhada) para não abrir buracos nas quinas low-poly. Em `SkinnedMesh` o contorno é outro `SkinnedMesh` ligado ao mesmo esqueleto e a normal é deformada com `skinMatrix`.
- Materiais transparentes (alça da caneca) ficam sem contorno. Para mudar espessura: `OUTLINE_PX`.

## Ragdoll de molas (`art/rig.ts` — `WobbleRig`)
Molas pouco amortecidas: `tilt` (balanço de bêbado + inclinação pela velocidade), cabeça, mãos, `squash`. `hit()` arremessa, `sweep()` tomba ~1,5 rad por 650 ms, `drunk()` aumenta o balanço (após beber), `knockOut()`.
No 3D o tombo é **limitado a ±1,45 rad** (senão atravessa o chão) e a direção vem de `tiltDir` (impacto), voltando ao balanço lateral.

## Como adicionar um personagem
1. `CharacterId` + `CHARACTER_IDS` (shared/types) e `CHARACTER_INFO` (shared/characters). 2. Escolher base em `public/models/chars`, mapear células com `glbuv`. 3. Novo `LOOKS[id]`. 4. `HAND_COLOR` em `Game3D.ts`. 5. Conferir retrato (09-testes).
