import * as THREE from 'three';
import { addOutline } from './character3d';
import { mergeStatic } from './merge';

/**
 * Picape vermelha com paredão de som na caçamba (modelo procedural, sem marca).
 * Frente em +X, caçamba (e o paredão) virada para −X. Base em y=0.
 * `update(t, energy)` faz os alto-falantes pulsarem no ritmo (energy 0–1 = volume).
 */
export interface Paredao {
  root: THREE.Group;
  update(t: number, energy: number): void;
}

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...extra });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  return b;
}

export function buildParedao(): Paredao {
  const root = new THREE.Group();
  const red = mat(0xd8443c, { roughness: 0.45 });
  const darkRed = mat(0xa8322c);
  const black = mat(0x26222a, { roughness: 0.8 });
  const glass = mat(0x2f3b45, { roughness: 0.15, metalness: 0.3 });
  const tire = mat(0x1d1a20, { roughness: 0.95 });
  const rim = mat(0xc9ccd2, { metalness: 0.6, roughness: 0.3 });
  const light = mat(0xfff4e6, { emissive: 0xfff0c0, emissiveIntensity: 0.4 });
  const tail = mat(0xff5a5f, { emissive: 0xff2a2a, emissiveIntensity: 0.5 });

  // ---- carroceria: cabine na frente (+X), caçamba atrás (−X)
  const L = 3.0;
  const W = 1.35;
  root.add(box(L, 0.42, W, red, 0, 0.55, 0)); // chassi/lataria baixa
  root.add(box(1.0, 0.18, W * 0.98, red, 1.0, 0.85, 0)); // capô
  root.add(box(1.05, 0.55, W * 0.96, red, 0.2, 1.03, 0)); // cabine
  root.add(box(0.06, 0.42, W * 0.86, glass, 0.73, 1.05, 0)); // para-brisa
  for (const z of [-1, 1]) root.add(box(0.7, 0.34, 0.02, glass, 0.2, 1.08, (z * W * 0.96) / 2 + z * 0.002)); // janelas
  root.add(box(0.04, 0.12, W * 0.9, black, 1.52, 0.55, 0)); // para-choque
  for (const z of [-0.45, 0.45]) {
    root.add(box(0.03, 0.1, 0.22, light, 1.52, 0.72, z)); // faróis
    root.add(box(0.03, 0.16, 0.12, tail, -1.52, 0.72, z * 1.2)); // lanternas
  }
  // Caçamba: laterais e tampa aberta (deitada para trás).
  for (const z of [-1, 1]) root.add(box(1.75, 0.3, 0.06, darkRed, -0.62, 0.9, (z * W) / 2 - z * 0.03));
  const gate = box(0.06, 0.3, W * 0.94, darkRed, 0, 0, 0);
  gate.position.set(-1.65, 0.78, 0);
  gate.rotation.z = Math.PI / 2;
  root.add(gate);
  root.add(box(1.7, 0.03, W * 0.9, black, -0.62, 0.77, 0)); // forro da caçamba
  // Rodas.
  for (const x of [0.95, -0.95]) {
    for (const z of [-1, 1]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), tire);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(x, 0.3, (z * W) / 2);
      wh.castShadow = true;
      root.add(wh);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.235, 10), rim);
      r.rotation.x = Math.PI / 2;
      r.position.copy(wh.position);
      root.add(r);
    }
  }

  // ---- paredão: 3 caixas empilhadas viradas para trás (−X), cada uma com falantes
  const cones: THREE.Object3D[] = [];
  const coneMat = mat(0x2f2a33);
  const coneCap = mat(0xd8443c); // tampinha: mesmo acabamento do cone para juntar (era 0,3; diferença invisível nesse tamanho)
  const tower = new THREE.Group();
  tower.position.set(-0.75, 0.79, 0);
  root.add(tower);
  const cab = (y: number, h: number, cols: number, rows: number, size: number) => {
    tower.add(box(0.7, h, W * 0.98, red, 0, y + h / 2, 0));
    // Faixa preta na quina de trás das laterais (como nos paredões de verdade), um pouco para fora para não piscar.
    for (const s of [1, -1]) tower.add(box(0.16, h * 0.96, 0.02, black, -0.27, y + h / 2, s * ((W * 0.98) / 2 + 0.012)));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const z = ((c + 0.5) / cols - 0.5) * W * 0.78;
        const yy = y + ((r + 0.5) / rows) * h;
        const spk = new THREE.Group();
        spk.position.set(-0.36, yy, z);
        spk.rotation.z = Math.PI / 2;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(size, size, 0.04, 16), black);
        const cone = new THREE.Group();
        const cm = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.82, size * 0.4, 0.06, 16), coneMat);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 10, 6), coneCap);
        cap.position.y = 0.035;
        cap.scale.y = 0.5;
        cone.add(cm, cap);
        mergeStatic(cone, [cm, cap]); // cone + tampinha = uma peça (mesmo acabamento, cores nos vértices)
        cone.position.y = 0.03;
        spk.add(ring, cone);
        tower.add(spk);
        cones.push(cone);
      }
    }
  };
  cab(0, 0.62, 2, 1, 0.26); // graves embaixo
  cab(0.62, 0.62, 3, 2, 0.13);
  cab(1.24, 0.5, 3, 2, 0.1);
  // Tweeters em cima.
  tower.add(box(0.5, 0.18, W * 0.7, black, 0.05, 1.83, 0));
  // Desempenho: tudo menos os cones (que pulsam) vira poucas malhas; o contorno vem depois, já nas malhas juntadas.
  mergeStatic(root, [...root.children], new Set(cones));
  addOutline(root);

  return {
    root,
    update(t, energy) {
      // Grave a ~120 bpm: todos "empurram" juntos, os pequenos tremem mais rápido.
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 4)), 6);
      cones.forEach((c, i) => {
        const fast = i < 2 ? beat : Math.pow(Math.max(0, Math.sin(t * Math.PI * 8 + i)), 4);
        c.position.y = 0.03 + fast * 0.05 * energy;
      });
      root.position.y = beat * 0.012 * energy; // a picape inteira treme no grave
    },
  };
}
