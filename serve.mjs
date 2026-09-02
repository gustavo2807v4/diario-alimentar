/**
 * Servidor estatico minimo para rodar o app localmente.
 * Uso: node serve.mjs [porta]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.argv[2]) || 5173;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';

    const alvo = join(RAIZ, normalize(caminho).replace(/^(\.\.[/\\])+/, ''));
    if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end('Proibido'); return; }

    const info = await stat(alvo);
    const arquivo = info.isDirectory() ? join(alvo, 'index.html') : alvo;
    const dados = await readFile(arquivo);

    res.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(dados);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nao encontrado');
  }
}).listen(PORTA, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

  console.log(`\n  Diario Alimentar rodando:\n`);
  console.log(`    neste computador   http://localhost:${PORTA}`);
  for (const ip of ips) console.log(`    na rede local      http://${ip}:${PORTA}`);
  console.log(`\n  Ctrl+C para parar.\n`);
});
