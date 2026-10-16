// Servidor de depuração: recebe POST /shot?name=x com um data URL e salva como imagem nesta pasta.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// As capturas vão para tools/shots/ (fora do Git).
const dir = join(dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(dir, { recursive: true });
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://x');
  const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const m = /^data:image\/(png|jpeg);base64,(.+)$/s.exec(body);
    if (!m) {
      res.statusCode = 400;
      return res.end('bad');
    }
    const file = join(dir, `${name}.${m[1] === 'png' ? 'png' : 'jpg'}`);
    writeFileSync(file, Buffer.from(m[2], 'base64'));
    res.end(file);
  });
}).listen(5199, '127.0.0.1', () => console.log('shot server on 5199'));
