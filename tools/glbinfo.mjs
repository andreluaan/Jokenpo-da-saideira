// Lê o chunk JSON de arquivos .glb e resume animações, nós, malhas, materiais e imagens.
import { readFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const out = {
    file: file.split(/[\\/]/).pop(),
    animations: (gltf.animations ?? []).map((a) => a.name),
    nodes: (gltf.nodes ?? []).map((n) => n.name).slice(0, 40),
    meshes: (gltf.meshes ?? []).map((m) => m.name),
    materials: (gltf.materials ?? []).map((m) => m.name),
    images: (gltf.images ?? []).map((i) => i.uri ?? `embedded:${i.mimeType}`),
    skins: (gltf.skins ?? []).length,
  };
  console.log(JSON.stringify(out));
}
