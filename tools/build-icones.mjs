/**
 * Gera os icones PNG do app sem dependencias: desenha um anel de progresso
 * (o mesmo simbolo da tela inicial) e codifica o PNG na mao com zlib.
 * Uso: node tools/build-icones.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'assets');
mkdirSync(pasta, { recursive: true });

/* --- PNG ------------------------------------------------------------------ */
const tabelaCRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = tabelaCRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, dados) {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

function png(largura, altura, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;   // 8 bits por canal
  ihdr[9] = 6;   // RGBA
  const linhas = Buffer.alloc((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    const off = y * (largura * 4 + 1);
    linhas[off] = 0; // filtro "none"
    rgba.copy(linhas, off + 1, y * largura * 4, (y + 1) * largura * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(linhas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- Desenho -------------------------------------------------------------- */
const FUNDO = [20, 20, 19];
const TINTA = [252, 252, 251];
const AMOSTRAS = 3; // supersampling para suavizar as bordas

/** Retangulo arredondado: 1 dentro, 0 fora. */
function dentroRRect(x, y, tam, raio) {
  const cx = Math.min(Math.max(x, raio), tam - raio);
  const cy = Math.min(Math.max(y, raio), tam - raio);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= raio * raio;
}

/** Arco de espessura constante, comecando no topo e girando no sentido horario. */
function dentroArco(x, y, tam, rExt, rInt, fracao) {
  const cx = tam / 2, cy = tam / 2;
  const dx = x - cx, dy = y - cy;
  const dist = Math.hypot(dx, dy);
  const meio = (rExt + rInt) / 2;
  const esp = (rExt - rInt) / 2;

  // pontas arredondadas
  const cap = (ang) => {
    const px = cx + Math.sin(ang) * meio;
    const py = cy - Math.cos(ang) * meio;
    return Math.hypot(x - px, y - py) <= esp;
  };
  if (cap(0) || cap(fracao * 2 * Math.PI)) return true;

  if (dist > rExt || dist < rInt) return false;
  let ang = Math.atan2(dx, -dy);
  if (ang < 0) ang += 2 * Math.PI;
  return ang <= fracao * 2 * Math.PI;
}

function desenhar(tam, { mascaravel = false } = {}) {
  const buf = Buffer.alloc(tam * tam * 4);
  const raio = mascaravel ? 0 : tam * 0.225;
  const rExt = tam * (mascaravel ? 0.285 : 0.345);
  const rInt = tam * (mascaravel ? 0.205 : 0.252);

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let fundo = 0, anel = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const px = x + (sx + 0.5) / AMOSTRAS;
          const py = y + (sy + 0.5) / AMOSTRAS;
          if (raio === 0 || dentroRRect(px, py, tam, raio)) fundo++;
          if (dentroArco(px, py, tam, rExt, rInt, 0.78)) anel++;
        }
      }
      const total = AMOSTRAS * AMOSTRAS;
      const aFundo = fundo / total;
      const aAnel = (anel / total) * aFundo; // o anel nunca vaza do fundo

      const i = (y * tam + x) * 4;
      for (let c = 0; c < 3; c++) {
        buf[i + c] = Math.round(FUNDO[c] * (1 - aAnel) + TINTA[c] * aAnel);
      }
      buf[i + 3] = Math.round(aFundo * 255);
    }
  }
  return png(tam, tam, buf);
}

writeFileSync(join(pasta, 'icon-192.png'), desenhar(192));
writeFileSync(join(pasta, 'icon-512.png'), desenhar(512));
writeFileSync(join(pasta, 'icon-maskable.png'), desenhar(512, { mascaravel: true }));
console.log('icones gerados em assets/');
