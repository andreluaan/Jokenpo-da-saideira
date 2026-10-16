// Limites (min/max) de POSITION por malha e escala/translação dos nós, para calibrar a escala no jogo.
import { readFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const meshes = g.meshes.map((m) => {
    const mins = [];
    const maxs = [];
    for (const p of m.primitives) {
      const a = g.accessors[p.attributes.POSITION];
      mins.push(a.min);
      maxs.push(a.max);
    }
    const min = [0, 1, 2].map((k) => Math.min(...mins.map((v) => v[k])).toFixed(3));
    const max = [0, 1, 2].map((k) => Math.max(...maxs.map((v) => v[k])).toFixed(3));
    return `${m.name}: min ${min} max ${max}`;
  });
  const nodes = g.nodes
    .filter((n) => n.translation || n.scale || n.rotation)
    .slice(0, 12)
    .map((n) => `${n.name} t=${(n.translation ?? []).map((v) => v.toFixed(3))} s=${(n.scale ?? []).map((v) => v.toFixed(2))}`);
  const mats = (g.materials ?? []).map((m) => `${m.name}:${(m.pbrMetallicRoughness?.baseColorFactor ?? []).map((v) => v.toFixed(2))}`);
  console.log(`\n# ${file.split(/[\\/]/).pop()}\n  ${meshes.join('\n  ')}\n  nodes: ${nodes.join(' | ')}\n  mats: ${mats.join(' ')}`);
}
