import Phaser from 'phaser';
import type { BotDifficulty } from '@ppt/shared';
import './style.css';
import { LocalConnection } from './net/localConnection';
import type { GameConnection } from './net/connection';
import { GameScene, type GameSceneData } from './scenes/GameScene';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const menu = $('#menu');
const matchScreen = $('#match');
const endOverlay = $('#end-overlay');
const nickname = $<HTMLInputElement>('#nickname');
const botCount = $<HTMLSelectElement>('#bot-count');
const difficulty = $<HTMLSelectElement>('#difficulty');

nickname.value = load('ppt.nick') ?? '';

interface Settings {
  name: string;
  bots: number;
  difficulty: BotDifficulty;
}

let game: Phaser.Game | null = null;
let conn: GameConnection | null = null;
let lastSettings: Settings | null = null;

$('#start-training').addEventListener('click', () => {
  const name = nickname.value.trim().slice(0, 16) || 'Jogador';
  save('ppt.nick', name);
  startMatch({ name, bots: Number(botCount.value), difficulty: difficulty.value as BotDifficulty });
});
$('#play-again').addEventListener('click', () => lastSettings && startMatch(lastSettings));
$('#to-menu').addEventListener('click', () => backToMenu());
$('#leave').addEventListener('click', () => backToMenu());

function startMatch(settings: Settings): void {
  lastSettings = settings;
  teardown();
  menu.classList.add('hidden');
  matchScreen.classList.remove('hidden');
  endOverlay.classList.add('hidden');

  conn = new LocalConnection({ playerName: settings.name, botCount: settings.bots, difficulty: settings.difficulty });
  const { width, height } = conn.config.arena;
  const data: GameSceneData = { conn, onEnd: (winnerId) => showEnd(winnerId) };

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-wrap',
    width,
    height,
    backgroundColor: '#0d0f17',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    banner: false,
  });
  game.scene.add('game', GameScene, true, data);
  conn.start();
}

function showEnd(winnerId: string | null): void {
  if (!conn) return;
  const me = conn.localPlayerId;
  const winner = conn.latest()?.players.find((p) => p.id === winnerId);
  $('#end-title').textContent = winnerId === me ? 'Vitória! 🍻' : winnerId ? 'Derrota' : 'Empate';
  $('#end-sub').textContent =
    winnerId === me ? 'Você foi o último de pé. A saideira é por sua conta.' : winner ? `${winner.name} venceu a partida.` : 'Ninguém levou a melhor.';
  endOverlay.classList.remove('hidden');
}

function backToMenu(): void {
  teardown();
  matchScreen.classList.add('hidden');
  menu.classList.remove('hidden');
}

function teardown(): void {
  conn?.destroy();
  conn = null;
  game?.destroy(true);
  game = null;
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
