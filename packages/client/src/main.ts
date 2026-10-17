import { CHARACTER_IDS, type BotDifficulty, type CharacterId, type LobbyState, type MatchStart } from '@ppt/shared';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/caveat-brush/400.css';
import './style.css';
import { LocalConnection } from './net/localConnection';
import { OnlineClient } from './net/online';
import { SocketConnection } from './net/socketConnection';
import type { GameConnection } from './net/connection';
import { CharacterSelect } from './ui/characterSelect';
import { escapeHtml } from './ui/hud';
import { HowTo } from './ui/howto';
import { preloadAll } from './three/assets';
import { Game3D } from './three/Game3D';
import { MenuStage3D, type MenuState } from './three/MenuStage3D';
import { renderPortraits } from './three/portraits';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const loading = $('#loading');
const menu = $('#menu');
const matchScreen = $('#match');
const endOverlay = $('#end-overlay');
const nickname = $<HTMLInputElement>('#nickname');
const botCount = $<HTMLSelectElement>('#bot-count');
const difficulty = $<HTMLSelectElement>('#difficulty');
const status = $('#online-status');

type Mode = 'training' | 'online';
let mode: Mode = 'training';
let online: OnlineClient | null = null;
let game: Game3D | null = null;
let conn: GameConnection | null = null;
let onlineMatch = false;
let lastSettings: Settings | null = null;
let netBanner: HTMLDivElement | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

interface Settings {
  name: string;
  bots: number;
  difficulty: BotDifficulty;
  character: CharacterId;
}

nickname.value = load('ppt.nick') ?? '';
const savedChar = load('ppt.char') as CharacterId | null;
const charSelect = new CharacterSelect($('#char-spot'), savedChar && CHARACTER_IDS.includes(savedChar) ? savedChar : 'fera', (c) => {
  save('ppt.char', c);
  if (mode === 'online' && online?.lobbyState) {
    const before = myLobbyChar() ?? c;
    online.character(c).then((r) => {
      if (!r.ok) {
        setStatus(r.error, true);
        charSelect.force(before);
      }
    });
  }
});
new HowTo($('#howto'), $('#howto-open'));
const menuStage = new MenuStage3D($('#menu-bg'), $('#menu-side'), menuState, (c) => charSelect.select(c));

const myName = () => nickname.value.trim().slice(0, 16) || 'Jogador';

/** Quem aparece no quintal do menu: no treino você + NPCs; online, a mesa da sala + NPCs. */
function menuState(): MenuState {
  const me = charSelect.value;
  const lobby = mode === 'online' ? online?.lobbyState : null;
  if (lobby) {
    const humans = lobby.players.map((p) => p.character);
    const free = CHARACTER_IDS.filter((c) => !humans.includes(c));
    const names: MenuState['names'] = {};
    for (const p of lobby.players) names[p.character] = p.name;
    return { lineup: [...humans, ...free.slice(0, lobby.bots)], me: myLobbyChar() ?? me, names };
  }
  const bots = mode === 'training' ? Number(botCount.value) : 0;
  return { lineup: [me, ...CHARACTER_IDS.filter((c) => c !== me).slice(0, bots)], me, names: { [me]: myName() } };
}

// ------------------------------------------------------------------ modos

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode as Mode)));

function setMode(m: Mode): void {
  mode = m;
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
  $('#mode-training').classList.toggle('hidden', m !== 'training');
  $('#mode-online').classList.toggle('hidden', m !== 'online');
  if (m === 'online') ensureOnline();
  else charSelect.setTaken([]);
  renderLobby(online?.lobbyState ?? null);
}

function ensureOnline(): OnlineClient {
  if (online) return online;
  setStatus('Conectando ao servidor…');
  online = new OnlineClient({
    lobby: (s) => renderLobby(s),
    // Reconectou na mesma partida: segue sem transição; partida nova: copo enche e esvazia.
    // Reconectou na mesma partida: segue direto; partida nova: a câmera do menu voa até o enquadramento da partida.
    matchStart: (m) => (onlineMatch && conn?.localPlayerId === m.playerId && game ? startOnlineMatch(m) : flyToMatch(() => startOnlineMatch(m))),
    matchEnd: () => undefined,
    connection: (st) => {
      if (st === 'online') setStatus(online?.lobbyState ? '' : 'Conectado. Abra uma mesa ou entre com o código de um amigo.');
      else setStatus(st === 'reconnecting' ? 'Conexão caiu… tentando voltar.' : 'Sem conexão com o servidor.', true);
      showNetBanner(onlineMatch && st !== 'online');
    },
  });
  return online;
}

// ------------------------------------------------------------------ lobby

$('#room-create').addEventListener('click', async () => {
  save('ppt.nick', myName());
  const r = await ensureOnline().create(myName(), charSelect.value);
  if (!r.ok) setStatus(r.error, true);
});
$('#room-join').addEventListener('click', joinRoom);
$<HTMLInputElement>('#room-code').addEventListener('keydown', (e) => e.key === 'Enter' && joinRoom());
async function joinRoom(): Promise<void> {
  const code = $<HTMLInputElement>('#room-code').value.trim().toUpperCase();
  if (code.length < 4) return setStatus('Digite o código de 4 letras da mesa.', true);
  save('ppt.nick', myName());
  const r = await ensureOnline().join(code, myName(), charSelect.value);
  if (!r.ok) setStatus(r.error, true);
}
$('#room-copy').addEventListener('click', () => {
  const code = online?.lobbyState?.code;
  if (code) navigator.clipboard?.writeText(code).then(() => setStatus(`Código ${code} copiado. Mande para a turma!`));
});
$('#room-ready').addEventListener('click', () => {
  const me = online?.lobbyState?.players.find((p) => p.id === online?.playerId);
  if (me) online!.ready(!me.ready);
});
$('#room-start').addEventListener('click', async () => {
  const r = await online!.start();
  if (!r.ok) setStatus(r.error, true);
});
$('#room-leave').addEventListener('click', () => online?.leave());
$<HTMLSelectElement>('#room-bots').addEventListener('change', (e) => online?.settings({ bots: Number((e.target as HTMLSelectElement).value) }));
$<HTMLSelectElement>('#room-difficulty').addEventListener('change', (e) =>
  online?.settings({ difficulty: (e.target as HTMLSelectElement).value as BotDifficulty }),
);

function myLobbyChar(): CharacterId | undefined {
  return online?.lobbyState?.players.find((p) => p.id === online?.playerId)?.character;
}

function renderLobby(s: LobbyState | null): void {
  const inRoom = mode === 'online' && !!s;
  $('#online-out').classList.toggle('hidden', inRoom);
  $('#online-in').classList.toggle('hidden', !inRoom);
  if (!s || mode !== 'online') {
    charSelect.setTaken([]);
    return;
  }
  const meId = online!.playerId;
  const me = s.players.find((p) => p.id === meId);
  const host = s.hostId === meId;
  $('#room-code-label').textContent = s.code;
  charSelect.setTaken(s.players.filter((p) => p.id !== meId).map((p) => p.character));
  if (me && me.character !== charSelect.value) charSelect.force(me.character);

  $('#room-players').innerHTML = s.players
    .map((p) => {
      const st = p.id === s.hostId ? '<span class="st ok">👑 dono</span>' : p.ready ? '<span class="st ok">✔ pronto</span>' : '<span class="st wait">⏳ esperando</span>';
      return `<li class="${p.id === meId ? 'me' : ''} ${p.connected ? '' : 'off'}">
        <span class="face" style="background-image:${charSelect.portraitOf(p.character)}"></span>
        <span class="who"><b>${escapeHtml(p.name)}${p.id === meId ? ' (você)' : ''}</b><span>${p.connected ? '' : 'caiu… esperando voltar'}</span></span>${st}</li>`;
    })
    .join('') + (s.bots ? `<li><span class="who"><b>+ ${s.bots} NPC${s.bots > 1 ? 's' : ''}</b><span>completam a mesa</span></span></li>` : '');

  const bots = $<HTMLSelectElement>('#room-bots');
  const diff = $<HTMLSelectElement>('#room-difficulty');
  bots.value = String(s.bots);
  diff.value = s.difficulty;
  bots.disabled = diff.disabled = !host;
  for (const o of Array.from(bots.options)) o.disabled = Number(o.value) > 4 - s.players.length;

  const others = s.players.filter((p) => p.id !== s.hostId && p.connected);
  const canStart = others.every((p) => p.ready) && s.players.filter((p) => p.connected).length + s.bots >= 2;
  $('#room-start').classList.toggle('hidden', !host);
  ($('#room-start') as HTMLButtonElement).disabled = !canStart;
  $('#room-ready').classList.toggle('hidden', host);
  $('#room-ready').classList.toggle('on', !!me?.ready);
  $('#room-ready').textContent = me?.ready ? '✔ Pronto! (clique para cancelar)' : 'Estou pronto';
  if (host) setStatus(canStart ? 'Tudo certo: pode começar.' : s.players.length + s.bots < 2 ? 'Chame alguém (mande o código) ou adicione NPCs.' : 'Esperando a turma ficar pronta…');
  else setStatus(me?.ready ? 'Esperando o dono da mesa começar…' : 'Marque "Estou pronto" quando quiser jogar.');
}

function setStatus(text: string, err = false): void {
  status.textContent = text;
  status.classList.toggle('err', err);
}

// ------------------------------------------------------------------ partidas

$('#start-training').addEventListener('click', () => {
  save('ppt.nick', myName());
  const settings = { name: myName(), bots: Number(botCount.value), difficulty: difficulty.value as BotDifficulty, character: charSelect.value };
  flyToMatch(() => startMatch(settings));
});
$('#play-again').addEventListener('click', () => {
  if (onlineMatch) backToMenu();
  else if (lastSettings) startMatch(lastSettings);
});
$('#to-menu').addEventListener('click', () => {
  if (onlineMatch) online?.leave();
  backToMenu();
});
$('#leave').addEventListener('click', () => {
  if (onlineMatch) online?.leave();
  backToMenu();
});

/**
 * Do menu para a partida sem corte: a coluna do menu sai pela esquerda e a câmera do quintal voa
 * até o enquadramento do começo da partida; só então a partida assume, com a câmera no mesmo lugar.
 */
let flying = false;
function flyToMatch(run: () => void): void {
  if (flying || menu.classList.contains('hidden')) return run();
  flying = true;
  menu.classList.add('leaving');
  menuStage.flyToMatch().then(() => {
    flying = false;
    menu.classList.remove('leaving');
    run();
  });
}

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
  // Estava numa sala antes de recarregar? Volta direto para ela.
  if (hasSession()) setMode('online');
  if (import.meta.env.DEV) Object.assign(window, { __menu: menuStage });
}

function enterMatchScreen(): void {
  teardown();
  menuStage.hide();
  menu.classList.add('hidden');
  matchScreen.classList.remove('hidden');
  endOverlay.classList.add('hidden');
}

function startMatch(settings: Settings): void {
  lastSettings = settings;
  onlineMatch = false;
  enterMatchScreen();
  setEndButtons(false);
  conn = new LocalConnection({ playerName: settings.name, botCount: settings.bots, difficulty: settings.difficulty, character: settings.character });
  game = new Game3D($('#game-wrap'), conn, (winnerId) => showEnd(winnerId));
  conn.start();
  if (import.meta.env.DEV) Object.assign(window, { __ppt: conn, __ppt3d: game });
}

function startOnlineMatch(m: MatchStart): void {
  // Reconectou no meio da mesma partida: os ouvintes do socket continuam valendo.
  if (onlineMatch && conn?.localPlayerId === m.playerId && game) {
    showNetBanner(false);
    return;
  }
  enterMatchScreen();
  onlineMatch = true;
  setEndButtons(true);
  const sc = new SocketConnection(online!.socket, m);
  conn = sc;
  game = new Game3D($('#game-wrap'), sc, (winnerId) => showEnd(winnerId));
  sc.start();
  const ping = document.createElement('div');
  ping.className = 'ping3d';
  matchScreen.appendChild(ping);
  pingTimer = setInterval(() => (ping.textContent = `online · ${Math.round(sc.rtt)} ms`), 1000);
  if (import.meta.env.DEV) Object.assign(window, { __ppt: sc, __ppt3d: game });
}

function setEndButtons(isOnline: boolean): void {
  $('#play-again').textContent = isOnline ? 'Voltar para a mesa' : 'Jogar novamente';
  $('#to-menu').textContent = isOnline ? 'Sair da sala' : 'Menu';
}

function showEnd(winnerId: string | null): void {
  if (!conn) return;
  const me = conn.localPlayerId;
  const winner = conn.latest()?.players.find((p) => p.id === winnerId);
  $('#end-title').textContent = winnerId === me ? 'A gelada é sua! 🍺' : winnerId ? 'Ficou pra próxima' : 'Empate';
  $('#end-sub').textContent =
    winnerId === me
      ? 'Você foi o último de pé no quintal do Bar do Zé e levou a cerveja.'
      : winner
        ? `${winner.name} ficou de pé por último e levou a cerveja.`
        : 'Ninguém ficou de pé sozinho. A cerveja volta pro freezer.';
  endOverlay.classList.remove('hidden');
}

function backToMenu(): void {
  teardown();
  matchScreen.classList.add('hidden');
  menu.classList.remove('hidden');
  // Volta voando: a câmera sai do enquadramento da partida e vai para o quintal do menu.
  menuStage.show({ fromMatch: true });
  renderLobby(online?.lobbyState ?? null);
}

function teardown(): void {
  conn?.destroy();
  conn = null;
  game?.destroy();
  game = null;
  onlineMatch = false;
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  matchScreen.querySelector('.ping3d')?.remove();
  showNetBanner(false);
}

function showNetBanner(on: boolean): void {
  if (on && !netBanner) {
    netBanner = document.createElement('div');
    netBanner.className = 'net-banner';
    netBanner.textContent = 'Conexão caiu… tentando voltar para a partida';
    matchScreen.appendChild(netBanner);
  } else if (!on && netBanner) {
    netBanner.remove();
    netBanner = null;
  }
}

function fontsReady(): Promise<unknown> {
  return Promise.all(['400 20px Fredoka', '700 20px Fredoka', '400 20px "Caveat Brush"'].map((f) => document.fonts.load(f))).catch(() => undefined);
}

function hasSession(): boolean {
  try {
    return !!sessionStorage.getItem('ppt.session');
  } catch {
    return false;
  }
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
