import { CHARACTER_IDS, type BotDifficulty, type CharacterId } from '@ppt/shared';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/caveat-brush/400.css';
import './style.css';
import { LocalConnection } from './net/localConnection';
import type { GameConnection } from './net/connection';
import { CharacterSelect } from './ui/characterSelect';
import { preloadAll } from './three/assets';
import { Game3D } from './three/Game3D';
import { MenuStage3D } from './three/MenuStage3D';
import { renderPortraits } from './three/portraits';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const loading = $('#loading');
const menu = $('#menu');
const matchScreen = $('#match');
const endOverlay = $('#end-overlay');
const nickname = $<HTMLInputElement>('#nickname');
const botCount = $<HTMLSelectElement>('#bot-count');
const difficulty = $<HTMLSelectElement>('#difficulty');

nickname.value = load('ppt.nick') ?? '';
const savedChar = load('ppt.char') as CharacterId | null;
const charSelect = new CharacterSelect($('#char-cards'), savedChar && CHARACTER_IDS.includes(savedChar) ? savedChar : 'fera', (c) => save('ppt.char', c));
const menuStage = new MenuStage3D(
  $('#menu-bg'),
  $('#menu-side'),
  () => ({ character: charSelect.value, bots: Number(botCount.value), name: nickname.value.trim().slice(0, 16) }),
  (c) => charSelect.select(c),
);

interface Settings {
  name: string;
  bots: number;
  difficulty: BotDifficulty;
  character: CharacterId;
}

let game: Game3D | null = null;
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

boot();

/** Carrega fontes e modelos 3D, gera os retratos e mostra o menu. */
async function boot(): Promise<void> {
  const bar = $('#loading-bar');
  await fontsReady();
  try {
    await preloadAll((k) => (bar.style.height = `${Math.round(k * 100)}%`));
  } catch (err) {
    $('#loading-msg').textContent = 'Não consegui carregar os modelos 3D. Recarregue a página.';
    console.error(err);
    return;
  }
  for (const [c, url] of renderPortraits()) charSelect.setPortrait(c, url);
  loading.classList.add('hidden');
  menu.classList.remove('hidden');
  menuStage.show();
  if (import.meta.env.DEV) Object.assign(window, { __menu: menuStage });
}

function startMatch(settings: Settings): void {
  lastSettings = settings;
  teardown();
  menuStage.hide();
  menu.classList.add('hidden');
  matchScreen.classList.remove('hidden');
  endOverlay.classList.add('hidden');

  conn = new LocalConnection({
    playerName: settings.name,
    botCount: settings.bots,
    difficulty: settings.difficulty,
    character: settings.character,
  });
  game = new Game3D($('#game-wrap'), conn, (winnerId) => showEnd(winnerId));
  conn.start();
  // Só em desenvolvimento: acesso à partida pelo console, para testes manuais.
  if (import.meta.env.DEV) Object.assign(window, { __ppt: conn, __ppt3d: game });
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
  menuStage.show();
}

function teardown(): void {
  conn?.destroy();
  conn = null;
  game?.destroy();
  game = null;
}

function fontsReady(): Promise<unknown> {
  return Promise.all(['400 20px Fredoka', '700 20px Fredoka', '400 20px "Caveat Brush"'].map((f) => document.fonts.load(f))).catch(() => undefined);
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
