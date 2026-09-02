/**
 * Converte os CSVs de referencia da TACO (NEPA/UNICAMP) em um unico JSON
 * compacto que o app carrega no navegador.
 *
 * Fonte dos CSVs: https://github.com/raulfdm/taco-api (references/csv)
 * Uso: node tools/build-taco.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pastaDados = join(raiz, 'data');

/** Parser de CSV que respeita campos entre aspas com virgulas dentro. */
function parseCSV(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else { dentroDeAspas = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ',') {
      linha.push(campo); campo = '';
    } else if (c === '\n') {
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }

  const cabecalho = linhas.shift();
  return linhas
    .filter((l) => l.length === cabecalho.length)
    .map((l) => Object.fromEntries(cabecalho.map((k, i) => [k, l[i]])));
}

const num = (v) => {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Remove acentos e pontuacao para gerar a chave de busca local. */
const normalizar = (s) =>
  s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const lerCSV = (nome) => parseCSV(readFileSync(join(pastaDados, `${nome}.csv`), 'utf8'));

const categorias = lerCSV('categories');
const alimentosCSV = lerCSV('food');
const nutrientesCSV = lerCSV('nutrients');

const porFoodId = new Map(nutrientesCSV.map((n) => [n.foodId, n]));

const alimentos = alimentosCSV.map((a) => {
  const n = porFoodId.get(a.id) || {};
  return {
    id: Number(a.id),
    cat: Number(a.categoryId),
    nome: a.name,
    busca: normalizar(a.name),
    kcal: num(n.kcal),
    prot: num(n.protein),
    carb: num(n.carbohydrates),
    gord: num(n.lipids),
    fibra: num(n.dietaryFiber),
    micro: {
      sodio: num(n.sodium),
      potassio: num(n.potassium),
      calcio: num(n.calcium),
      magnesio: num(n.magnesium),
      ferro: num(n.iron),
      zinco: num(n.zinc),
      fosforo: num(n.phosphorus),
      cobre: num(n.copper),
      manganes: num(n.manganese),
      colesterol: num(n.cholesterol),
      vitC: num(n.vitaminC),
      tiamina: num(n.thiamin),
      riboflavina: num(n.riboflavin),
      piridoxina: num(n.pyridoxine),
      niacina: num(n.niacin),
    },
  };
});

const saida = {
  versao: 'TACO 4a edicao - NEPA/UNICAMP (valores por 100 g)',
  categorias: categorias.map((c) => c.name),
  alimentos,
};

writeFileSync(join(pastaDados, 'taco.json'), JSON.stringify(saida), 'utf8');

/**
 * Indice enxuto enviado ao modelo: so id + nome, e apenas dos alimentos que
 * tem energia definida (os demais nao servem como fonte nutricional).
 */
const indice = alimentos
  .filter((a) => a.kcal !== null)
  .map((a) => `${a.id}|${a.nome}`)
  .join('\n');

writeFileSync(join(pastaDados, 'taco-indice.txt'), indice, 'utf8');

const bytes = (p) => (readFileSync(join(pastaDados, p)).length / 1024).toFixed(1);
console.log(`taco.json         ${alimentos.length} alimentos  (${bytes('taco.json')} KB)`);
console.log(`taco-indice.txt   ${indice.split('\n').length} entradas   (${bytes('taco-indice.txt')} KB)`);
