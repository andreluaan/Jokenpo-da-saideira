# 05 — Personagens 3D (`three/character3d.ts`, `art/rig.ts`)

## Conceito
Base = **Kenney Mini Characters** (chibi animado, 32 clipes, ossos `root, torso, head, arm-left/right, leg-left/right`).
Cada personagem original = modelo base + **repintura da paleta** + **acessórios em blocos** + adereço na mão. Cosmético apenas.

## Personagens (`LOOKS`)
| id | Base | Repintura corpo (célula→cor) | Extras |
|---|---|---|---|
| `fera` Fera Verde | male-a | r2c3/r2c11 verde, r2c5 laranja, r3c13 faixa, r3c11 pele | franja reta, sobrancelhonas, óculos `aid-sunglasses`, garrafa |
| `principe` Príncipe Marrento | male-d | r3c1 azul, r2c9 dourado, r3c15 luvas brancas; cabeça r3c11→preto | 6 espetos (cones), entradas em V, ombreiras |
| `panca` Seu Pança | male-b | r2c9 branco, r2c11 azul-claro | fiapos na careca, barriga, caneca |
| `sonolento` Sonolento | male-f | r2c3 oliva, r3c3/r3c15 escuro | rabo de cavalo (cones), faixa vermelha, pálpebras, palito |

**Paleta Kenney** (`colormap.png` 512²): células 32×128 → `r{linha}c{coluna}` (linha 0–3 de cima, coluna 0–15). Linha 2: bege, verde, amarelo, laranja, vermelho, azul, azul-claro, roxo (2 colunas cada). Linha 3: escuro, cinza, ardósia, cinza-azulado, branco, pele salmão, marrom, pele clara.
Corpo e cabeça recebem **texturas separadas** (assim o terno vira azul sem apagar os olhos). Para descobrir células de outro modelo: `node tools/glbuv.mjs <arquivo.glb>`.

## Acessórios — como posicionar
1. `modelBox()` mede a caixa da cabeça **no espaço do modelo** usando `getVertexPosition` (posição já com esqueleto).
2. `headAnchor` mapeia a caixa canônica `CANON_HEAD` (x ±0,227, y 0–0,328, z ±0,171; rosto em +Z) para a caixa real.
3. Os builders desenham em coordenadas canônicas; depois `head.attach(headAnchor)` (preserva o mundo). Tronco: `torsoAnchor` + `torsoBox`. Mão: `handPoint()` → `armR.attach(handR)`.
- **Armadilhas já vividas:** coordenadas no espaço do osso deram cabelo flutuando (osso tem rotação interna); placas por cima da cabeça viram "tampo" visto de cima — preferir franja/espetos.

## Hierarquia e animação
`root` (posição) → `tilt` (balanço/tombo no mundo) → `facing` (yaw suave) → `model`.
Estado: morto→`die` · `oneShot` (golpe/chute) · sentado→`sit` · bebendo→`holding-right` (+braço à boca procedural) · andando→`walk`/`sprint` (timeScale pela velocidade) · senão `idle`.
Ossos ajustados **depois** do mixer, partindo da rotação de repouso (`rest`) para não acumular: cabeça/braços seguem o rig; `pump` levanta os dois braços.

## Ragdoll de molas (`art/rig.ts` — `WobbleRig`)
Molas pouco amortecidas: `tilt` (balanço de bêbado + inclinação pela velocidade), cabeça, mãos, `squash`. `hit()` arremessa, `sweep()` tomba ~1,5 rad por 650 ms, `drunk()` aumenta o balanço (após beber), `knockOut()`.
No 3D o tombo é **limitado a ±1,45 rad** (senão atravessa o chão) e a direção vem de `tiltDir` (impacto), voltando ao balanço lateral.

## Como adicionar um personagem
1. `CharacterId` + `CHARACTER_IDS` (shared/types) e `CHARACTER_INFO` (shared/characters). 2. Escolher base em `public/models/chars`, mapear células com `glbuv`. 3. Novo `LOOKS[id]`. 4. `HAND_COLOR` em `Game3D.ts`. 5. Conferir retrato (09-testes).
