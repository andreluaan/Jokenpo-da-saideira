# 08 — Assets 3D

## Origem e licença
Kenney (https://kenney.nl), **CC0** — uso comercial livre, atribuição opcional (fica em `packages/client/public/models/CREDITS.md`).
Pacotes originais completos em `assets-src/` (**fora do Git**, ~24 MB): Mini Characters, Furniture Kit, Food Kit, Nature Kit, Survival Kit.
Antes de baixar qualquer pacote novo: pedir permissão ao usuário (nome, origem, tamanho); só licença clara (CC0 de preferência).

## No jogo
`packages/client/public/models/{chars,food,furniture,nature}/*.glb` (+ `Textures/colormap.png` em `chars` e `food`).
Lista carregada em `three/assets.ts → MODELS` (pré-carregamento na tela de loading). **Modelo novo = copiar o .glb + adicionar em `MODELS`.**

```bash
# copiar um modelo do pacote original (GLB) para o jogo
cp "assets-src/kenney_nature-kit/Models/GLTF format/rock_largeA.glb" packages/client/public/models/nature/
```
(Mini Characters e Food usam a pasta `Models/GLB format` com `Textures/`.)

## Inspecionar modelos (sem abrir Blender)
```bash
node tools/glbinfo.mjs   <arquivo.glb>   # animações, nós, malhas, materiais, imagens
node tools/glbbounds.mjs <arquivo.glb>   # limites (tamanho/origem), transformações, cores de material
node tools/glbuv.mjs     <arquivo.glb>   # células da paleta usadas por osso (para repintar personagens)
```

## Extras (v0.6, já estavam em `assets-src`, CC0)
`chars/character-male-c|male-e|female-a|female-c` (garçom = male-e repintado; torcida), `food/plate-broken`.

## Fatos úteis
- Personagem Kenney: ~0,67 de altura, cabeça 0,45 de largura; animações incluem idle, walk, sprint, jump, fall, sit, die, attack-melee/kick-right/left, holding-right/left/both, interact, emote-yes/no.
- Móveis: materiais de cor lisa (`wood`, `carpet`…) e origem no canto. Comida: textura de paleta própria. Natureza: árvores `*_fall` (outono), `fence_simple`, `fence_gate` (folha separada `gate`).
- Peso atual dos modelos no jogo: ~1,9 MB.
