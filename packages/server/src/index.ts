import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './server';

const PORT = Number(process.env.PORT ?? 3001);
const here = dirname(fileURLToPath(import.meta.url));
const server = createGameServer({ staticDir: process.env.STATIC_DIR ?? join(here, '../../client/dist') });

const port = await server.listen(PORT, process.env.HOST ?? '0.0.0.0');
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n!.address);
console.log(`🍺 Servidor do Jokenpô da Saideira na porta ${port}`);
for (const ip of ips) console.log(`   Na rede: http://${ip}:${port} (jogo compilado) — ou o Vite em http://${ip}:5173`);

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
