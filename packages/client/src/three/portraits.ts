import * as THREE from 'three';
import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId, type PlayerView } from '@ppt/shared';
import { Character3D } from './character3d';

/** Renderiza um retrato 3D de cada personagem (para os cartões do menu). */
export function renderPortraits(size = 192): Map<CharacterId, string> {
  const out = new Map<CharacterId, string>();
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  cam.position.set(0.45, 0.95, 2.7);
  cam.lookAt(0, 0.68, 0);
  for (const id of CHARACTER_IDS) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x7a5a50, 1.6));
    const sun = new THREE.DirectionalLight(0xffd9a6, 2.2);
    sun.position.set(2, 3, 3);
    scene.add(sun);
    const c = new Character3D(id);
    scene.add(c.root);
    c.update(0.016, { view: fakeView(id), now: 0, faceX: 0.25, faceZ: 1, speed: 0, pump: 0, drink: -1 }, 0, 0);
    r.render(scene, cam);
    out.set(id, r.domElement.toDataURL('image/png'));
    c.dispose();
  }
  r.dispose();
  return out;
}

function fakeView(id: CharacterId): PlayerView {
  return {
    id,
    name: CHARACTER_INFO[id].name,
    color: 0xffffff,
    character: id,
    isBot: false,
    x: 0,
    y: 0,
    faceX: 0,
    faceY: 1,
    hp: 3,
    maxHp: 3,
    focus: 100,
    alive: true,
    holding: false,
    locked: false,
    symbol: null,
    targetId: null,
    impactAt: null,
    clashWith: null,
    stunned: false,
    busy: false,
    graceUntil: 0,
    dashReadyAt: 0,
    swapsLeft: null,
    drinkingUntil: 0,
  };
}
