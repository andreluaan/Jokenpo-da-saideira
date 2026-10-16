// Para cada malha de um .glb: quais células da paleta (colormap 512x512, células 32x128) cada osso usa.
import { readFileSync } from 'node:fs';

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function read(gltf, bin, idx) {
  const acc = gltf.accessors[idx];
  const bv = gltf.bufferViews[acc.bufferView];
  const n = COUNT[acc.type];
  const cs = SIZE[acc.componentType];
  const stride = bv.byteStride ?? n * cs;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const v = [];
    for (let k = 0; k < n; k++) {
      const o = base + i * stride + k * cs;
      const t = acc.componentType;
      v.push(t === 5126 ? bin.readFloatLE(o) : t === 5121 ? bin.readUInt8(o) : t === 5123 ? bin.readUInt16LE(o) : bin.readUInt32LE(o));
    }
    out.push(v);
  }
  return out;
}

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart);
  const skin = gltf.skins?.[0];
  const result = {};
  for (const mesh of gltf.meshes) {
    for (const prim of mesh.primitives) {
      const uv = read(gltf, bin, prim.attributes.TEXCOORD_0);
      const joints = prim.attributes.JOINTS_0 !== undefined ? read(gltf, bin, prim.attributes.JOINTS_0) : null;
      uv.forEach(([u, v], i) => {
        const j = joints ? joints[i][0] : -1;
        const bone = j >= 0 && skin ? gltf.nodes[skin.joints[j]].name : 'none';
        const col = Math.min(15, Math.floor(u * 16));
        const row = Math.min(3, Math.floor(v * 4));
        const key = `${mesh.name}/${bone}`;
        (result[key] ??= {})[`r${row}c${col}`] = ((result[key] ?? {})[`r${row}c${col}`] ?? 0) + 1;
      });
    }
  }
  console.log(file.split(/[\\/]/).pop(), JSON.stringify(result));
}
