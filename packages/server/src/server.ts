import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { Server } from 'socket.io';
import { ROOM_CODE_LENGTH, type ClientToServer, type ServerToClient } from '@ppt/shared';
import { Room, type Peer, type RoomOptions } from './room';

interface SocketData {
  room?: Room;
  playerId?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

// Sem I, O, 0, 1 para não confundir ao ditar o código.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface GameServerOptions {
  /** Pasta com o cliente compilado (npm run build). Se existir, o servidor também entrega o jogo. */
  staticDir?: string;
  room?: RoomOptions;
}

export interface GameServer {
  http: HttpServer;
  io: Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
  rooms: Map<string, Room>;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(opts: GameServerOptions = {}): GameServer {
  const rooms = new Map<string, Room>();
  const staticDir = opts.staticDir && existsSync(opts.staticDir) ? resolve(opts.staticDir) : null;

  const http = createServer((req, res) => {
    if (!staticDir) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Servidor do Jokenpô da Saideira no ar. Em desenvolvimento, abra o cliente pelo Vite (npm run dev).');
      return;
    }
    // Arquivos estáticos do cliente compilado (protegido contra "../").
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = normalize(join(staticDir, url));
    if (!file.startsWith(staticDir)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });

  const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(http, {
    cors: { origin: true },
    pingInterval: 5000,
    pingTimeout: 8000,
  });

  const newCode = (): string => {
    for (;;) {
      let c = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  };

  io.on('connection', (socket) => {
    const peer: Peer = { emit: (event, ...args) => socket.emit(event, ...args) };
    const leaveCurrent = () => {
      const { room, playerId } = socket.data;
      if (room && playerId) room.leave(playerId);
      socket.data = {};
    };

    socket.on('room:create', (p, ack) => {
      if (typeof ack !== 'function') return;
      leaveCurrent();
      const room = new Room(newCode(), (r) => rooms.delete(r.code), opts.room);
      rooms.set(room.code, room);
      const r = room.add(p?.name, p?.character, peer);
      if (r.ok) socket.data = { room, playerId: r.playerId };
      ack(r);
    });

    socket.on('room:join', (p, ack) => {
      if (typeof ack !== 'function') return;
      const room = rooms.get(String(p?.code ?? '').trim().toUpperCase());
      if (!room) return ack({ ok: false, error: 'Sala não encontrada. Confira o código.' });
      leaveCurrent();
      const r = room.add(p?.name, p?.character, peer);
      if (r.ok) socket.data = { room, playerId: r.playerId };
      ack(r);
    });

    socket.on('room:rejoin', (p, ack) => {
      if (typeof ack !== 'function') return;
      const room = rooms.get(String(p?.code ?? '').toUpperCase());
      if (!room) return ack({ ok: false, error: 'A sala não existe mais.' });
      const r = room.rejoin(String(p?.token ?? ''), peer);
      if (r.ok) socket.data = { room, playerId: r.playerId };
      ack(r);
    });

    socket.on('room:leave', () => leaveCurrent());
    socket.on('room:ready', (ready) => socket.data.room?.setReady(socket.data.playerId!, !!ready));
    socket.on('room:character', (c, ack) => {
      const r = socket.data.room?.setCharacter(socket.data.playerId!, c) ?? { ok: false as const, error: 'Você não está numa sala.' };
      if (typeof ack === 'function') ack(r);
    });
    socket.on('room:settings', (s) => socket.data.room?.settings(socket.data.playerId!, s ?? {}));
    socket.on('room:start', (ack) => {
      const r = socket.data.room?.start(socket.data.playerId!) ?? { ok: false as const, error: 'Você não está numa sala.' };
      if (typeof ack === 'function') ack(r);
    });
    socket.on('room:radio', (r) => socket.data.room?.setRadio(socket.data.playerId!, r ?? null));
    socket.on('input', (input) => socket.data.room?.input(socket.data.playerId!, input));
    socket.on('ping', (ack) => {
      if (typeof ack === 'function') ack(socket.data.room?.simNow() ?? -1);
    });
    socket.on('disconnect', () => {
      const { room, playerId } = socket.data;
      if (room && playerId) room.disconnect(playerId);
    });
  });

  return {
    http,
    io,
    rooms,
    listen: (port, host = '0.0.0.0') =>
      new Promise((ok) => {
        http.listen(port, host, () => {
          const a = http.address();
          ok(typeof a === 'object' && a ? a.port : port);
        });
      }),
    close: () =>
      new Promise((ok) => {
        for (const r of rooms.values()) r.close();
        io.close(() => ok());
      }),
  };
}
