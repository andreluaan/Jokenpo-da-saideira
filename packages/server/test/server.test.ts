import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { makeConfig, type ClientToServer, type JoinOk, type LobbyState, type MatchStart, type ServerToClient, type Snapshot } from '@ppt/shared';
import { createGameServer, type GameServer } from '../src/server';

type Client = Socket<ServerToClient, ClientToServer>;

let server: GameServer;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = createGameServer({ room: { config: makeConfig({ match: { countdownMs: 0 } }), endPauseMs: 200, lobbyDropMs: 300 } });
  const port = await server.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

function client(): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return new Promise((ok) => c.on('connect', () => ok(c)));
}

const once = <E extends keyof ServerToClient>(c: Client, ev: E) =>
  new Promise<Parameters<ServerToClient[E]>[0]>((ok) => c.once(ev, ((x: never) => ok(x)) as never));

const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 20));
  }
};

async function roomWithTwo() {
  const a = await client();
  const b = await client();
  const ra = (await a.emitWithAck('room:create', { name: 'Ana', character: 'fera' })) as JoinOk;
  const rb = (await b.emitWithAck('room:join', { code: ra.code.toLowerCase(), name: 'Beto', character: 'fera' })) as JoinOk;
  return { a, b, ra, rb };
}

describe('lobby', () => {
  it('cria sala com código e outro jogador entra; personagens nunca se repetem', async () => {
    const { ra, rb } = await roomWithTwo();
    expect(ra.ok && rb.ok).toBe(true);
    expect(ra.code).toMatch(/^[A-Z]{4}$/);
    expect(rb.lobby.players).toHaveLength(2);
    expect(rb.lobby.players[0].character).toBe('fera');
    expect(rb.lobby.players[1].character).not.toBe('fera');
    expect(rb.lobby.hostId).toBe(ra.playerId);
  });

  it('rádio: só o dono troca a música e todos recebem o mesmo ponto', async () => {
    const { a, b } = await roomWithTwo();
    let last: LobbyState | null = null;
    b.on('room:state', (s) => (last = s));
    b.emit('room:radio', { id: 'xxxxxxxxxxx', title: 'Intrusa', pos: 0 });
    a.emit('room:radio', { id: '8Xe8gApDRgU', title: 'Garçom', pos: 30 });
    await until(() => last !== null && (last as LobbyState).radio !== null);
    const s = last as unknown as LobbyState;
    expect(s.radio!.id).toBe('8Xe8gApDRgU');
    // Começou "30 s atrás" no relógio do servidor.
    expect(s.serverTime - s.radio!.startedAt).toBeGreaterThanOrEqual(29_000);
    a.emit('room:radio', { id: 'id inválido', title: 'x', pos: 0 });
    a.emit('room:radio', null);
    await until(() => (last as unknown as LobbyState).radio === null);
  });

  it('código errado e sala cheia são recusados', async () => {
    const x = await client();
    expect(await x.emitWithAck('room:join', { code: 'ZZZZ', name: 'X', character: 'fera' })).toMatchObject({ ok: false });
    const { ra } = await roomWithTwo();
    for (const name of ['C', 'D']) {
      const c = await client();
      expect(await c.emitWithAck('room:join', { code: ra.code, name, character: 'panca' })).toMatchObject({ ok: true });
    }
    const e = await client();
    expect(await e.emitWithAck('room:join', { code: ra.code, name: 'E', character: 'panca' })).toMatchObject({ ok: false });
  });

  it('trocar para personagem já escolhido é negado', async () => {
    const { b } = await roomWithTwo();
    expect(await b.emitWithAck('room:character', 'fera')).toMatchObject({ ok: false });
    expect(await b.emitWithAck('room:character', 'sonolento')).toMatchObject({ ok: true });
  });

  it('só o dono começa, e só quando os outros estão prontos', async () => {
    const { a, b } = await roomWithTwo();
    expect(await b.emitWithAck('room:start')).toMatchObject({ ok: false });
    expect(await a.emitWithAck('room:start')).toMatchObject({ ok: false });
    b.emit('room:ready', true);
    await until(() => true, 50);
    const started = once(a, 'match:start');
    expect(await a.emitWithAck('room:start')).toMatchObject({ ok: true });
    const m = (await started) as MatchStart;
    expect(m.snapshot.players).toHaveLength(2);
  });

  it('dono sozinho joga contra NPCs', async () => {
    const a = await client();
    await a.emitWithAck('room:create', { name: 'Solo', character: 'principe' });
    a.emit('room:settings', { bots: 2, difficulty: 'easy' });
    const st = await once(a, 'room:state');
    expect((st as LobbyState).bots).toBe(2);
    const started = once(a, 'match:start');
    expect(await a.emitWithAck('room:start')).toMatchObject({ ok: true });
    const m = (await started) as MatchStart;
    expect(m.snapshot.players.filter((p) => p.isBot)).toHaveLength(2);
  });
});

describe('partida pela rede', () => {
  async function started() {
    const r = await roomWithTwo();
    r.b.emit('room:ready', true);
    await until(() => true, 50);
    const sa = once(r.a, 'match:start');
    const sb = once(r.b, 'match:start');
    await r.a.emitWithAck('room:start');
    await Promise.all([sa, sb]);
    // Espera a contagem acabar (entradas antes disso são recusadas, como no jogo).
    const room = server.rooms.get(r.ra.code)!;
    await until(() => room.sim?.phase === 'playing');
    return r;
  }

  it('o desafio não revela nada; o símbolo aparece para o outro assim que é botado', async () => {
    const { a, b, ra, rb } = await started();
    const snaps: Snapshot[] = [];
    b.on('snap', (s) => snaps.push(s));
    // Coloca os dois perto e A desafia B.
    const room = server.rooms.get(ra.code)!;
    room.sim!.debugPlace(ra.playerId, 800, 600);
    room.sim!.debugPlace(rb.playerId, 900, 600);
    a.emit('input', { type: 'challenge', targetId: rb.playerId });
    await until(() => snaps.some((s) => s.players.find((p) => p.id === ra.playerId)?.holding));
    const seen = snaps.find((s) => s.players.find((p) => p.id === ra.playerId)?.holding)!;
    expect(seen.players.find((p) => p.id === ra.playerId)!.symbol).toBeNull();
    a.emit('input', { type: 'symbol', symbol: 'scissors' });
    await until(() => snaps.some((s) => s.players.find((p) => p.id === ra.playerId)?.symbol === 'scissors'));
  });

  it('movimento enviado pelo cliente muda a posição no servidor', async () => {
    const { a, ra } = await started();
    const room = server.rooms.get(ra.code)!;
    const x0 = room.sim!.debugPlayer(ra.playerId).x;
    a.emit('input', { type: 'move', x: 1, y: 0 });
    await until(() => room.sim!.debugPlayer(ra.playerId).x > x0 + 20);
  });

  it('ping devolve o tempo da simulação (para sincronizar o relógio do QTE)', async () => {
    const { a } = await started();
    await until(() => true, 120);
    const t = await a.emitWithAck('ping');
    expect(t).toBeGreaterThan(0);
  });

  it('quem cai no meio da partida volta com o mesmo lugar (token)', async () => {
    const { b, ra, rb } = await started();
    b.close();
    const room = server.rooms.get(ra.code)!;
    await until(() => !room.lobby().players.find((p) => p.id === rb.playerId)!.connected);
    const b2 = await client();
    const back = once(b2, 'match:start');
    const r = (await b2.emitWithAck('room:rejoin', { code: ra.code, token: rb.token })) as JoinOk;
    expect(r.playerId).toBe(rb.playerId);
    expect(((await back) as MatchStart).playerId).toBe(rb.playerId);
  });

  it('fim da partida avisa todos e a sala volta ao lobby', async () => {
    const { a, ra, rb } = await started();
    const room = server.rooms.get(ra.code)!;
    room.sim!.debugSet(rb.playerId, { hp: 1 });
    room.sim!.debugPlace(ra.playerId, 800, 600);
    room.sim!.debugPlace(rb.playerId, 900, 600);
    const end = once(a, 'match:end');
    a.emit('input', { type: 'challenge', targetId: rb.playerId });
    a.emit('input', { type: 'symbol', symbol: 'rock' });
    expect(await end).toBe(ra.playerId);
    await until(() => room.phase === 'lobby');
  });
});
