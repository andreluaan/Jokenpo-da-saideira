import Phaser from 'phaser';
import { CHARACTER_IDS, type BotDifficulty, type CharacterId } from '@ppt/shared';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { LocalConnection } from './net/localConnection';
import type { GameConnection } from './net/connection';
import { GameScene, type GameSceneData } from './scenes/GameScene';
import { CharacterSelect, MenuBackground } from './ui/characterSelect';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const menu = $('#menu');
const matchScreen = $('#match');
const endOverlay = $('#end-overlay');
const nickname = $<HTMLInputElement>('#nickname');
const botCount = $<HTMLSelectElement>('#bot-count');
const difficulty = $<HTMLSelectElement>('#difficulty');

nickname.value = load('ppt.nick') ?? '';
const savedChar = load('ppt.char') as CharacterId | null;
const charSelect = new CharacterSelect($('#char-cards'), savedChar && CHARACTER_IDS.includes(savedChar) ? savedChar : 'fera', (c) =>
  save('ppt.char', c),
);
// Fundo do menu: o quintal com cada personagem no seu ponto de largada.
const menuBg = new MenuBackground(
  $('#menu-bg'),
  $('#menu-side'),
  () => ({ character: charSelect.value, bots: Number(botCount.value), name: nickname.value.trim().slice(0, 16) }),
  (c) => charSelect.select(c),
);
fontsReady().then(() => menuBg.show());

interface Settings {
  name: string;
  bots: number;
  difficulty: BotDifficulty;
  character: CharacterId;
}

let game: Phaser.Game | null = null;
let conn: GameConnection | null = null;
let lastSettings: Settings | null = null;

$('#start-training').addEventListener('click', () => {
  const name = nickname.value.trim().slice(0, 16) || 'Jogador';
  save('ppt.nick', name);
  startMatch({ name, bots: Number(botCount.value), difficulty: difficulty.value as BotDifficulty, character: charSelect.value });
});
$('#play-again').addEventListener('click', () => lastSettings && startMatch(lastSettings));
$('#to-menu').addEventListener('click', () => backToMenu());
$('#leave').addEventListener('click', () => backToMenu());

async function startMatch(settings: Settings): Promise<void> {
  lastSettings = settings;
  await fontsReady();
  teardown();
  menuBg.hide();
  menu.classList.add('hidden');
  matchScreen.classList.remove('hidden');
  endOverlay.classList.add('hidden');

  conn = new LocalConnection({
    playerName: settings.name,
    botCount: settings.bots,
    difficulty: settings.difficulty,
    character: settings.character,
  });
  const { width, height } = conn.config.arena;
  const data: GameSceneData = { conn, onEnd: (winnerId) => showEnd(winnerId) };

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-wrap',
    width,
    height,
    backgroundColor: '#d4876a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    banner: false,
  });
  game.scene.add('game', GameScene, true, data);
  conn.start();
  // Só em desenvolvimento: acesso à partida pelo console, para testes manuais.
  if (import.meta.env.DEV) Object.assign(window, { __ppt: conn, __pptGame: game });
}

function showEnd(winnerId: string | null): void {
  if (!conn) return;
  const me = conn.localPlayerId;
  const winner = conn.latest()?.players.find((p) => p.id === winnerId);
  $('#end-title').textContent = winnerId === me ? 'Vitória! 🍻' : winnerId ? 'Derrota — a saideira é sua' : 'Empate';
  $('#end-sub').textContent =
    winnerId === me ? 'Você foi o último de pé no quintal do Bar do Zé.' : winner ? `${winner.name} venceu. Quem perde paga a saideira!` : 'Ninguém levou a melhor. Rodada dividida.';
  endOverlay.classList.remove('hidden');
}

function backToMenu(): void {
  teardown();
  matchScreen.classList.add('hidden');
  menu.classList.remove('hidden');
  menuBg.show();
}

function teardown(): void {
  conn?.destroy();
  conn = null;
  game?.destroy(true);
  game = null;
}

/** O Phaser desenha textos em canvas: a fonte precisa estar carregada antes. */
function fontsReady(): Promise<unknown> {
  return Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 20px Fredoka`))).catch(() => undefined);
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: tudo bem */
  }
}
