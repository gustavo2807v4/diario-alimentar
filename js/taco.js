/**
 * Tabela TACO (NEPA/UNICAMP) - 597 alimentos, valores por 100 g.
 * E a fonte de verdade dos numeros: o modelo so identifica o alimento e a
 * quantidade; quem fornece kcal/macros/micros e esta tabela sempre que houver
 * correspondencia. Isso torna o mesmo prato reproduzivel entre registros.
 */
let _dados = null;
let _indice = null;

export const NOMES_MICRO = {
  sodio: ['Sodio', 'mg'],
  potassio: ['Potassio', 'mg'],
  calcio: ['Calcio', 'mg'],
  magnesio: ['Magnesio', 'mg'],
  ferro: ['Ferro', 'mg'],
  zinco: ['Zinco', 'mg'],
  fosforo: ['Fosforo', 'mg'],
  cobre: ['Cobre', 'mg'],
  manganes: ['Manganes', 'mg'],
  colesterol: ['Colesterol', 'mg'],
  vitC: ['Vitamina C', 'mg'],
  tiamina: ['Tiamina (B1)', 'mg'],
  riboflavina: ['Riboflavina (B2)', 'mg'],
  piridoxina: ['Piridoxina (B6)', 'mg'],
  niacina: ['Niacina (B3)', 'mg'],
};

export const normalizar = (s) =>
  (s || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export async function carregar() {
  if (_dados) return _dados;
  const r = await fetch('data/taco.json');
  if (!r.ok) throw new Error('Nao foi possivel carregar a tabela TACO.');
  _dados = await r.json();
  _indice = new Map(_dados.alimentos.map((a) => [a.id, a]));
  return _dados;
}

/** Texto "id|nome" de todos os alimentos com energia definida, para o prompt. */
export async function indiceParaPrompt() {
  const d = await carregar();
  return d.alimentos.filter((a) => a.kcal !== null).map((a) => `${a.id}|${a.nome}`).join('\n');
}

export function porId(id) {
  return _indice ? _indice.get(Number(id)) || null : null;
}

export function categoria(alimento) {
  return _dados?.categorias[alimento.cat - 1] || '';
}

export function versao() {
  return _dados?.versao || '';
}

/**
 * Busca local por sobreposicao de palavras. Serve para (a) a busca manual do
 * usuario e (b) a rede de seguranca quando o modelo nao devolve um taco_id.
 * Pontua tokens do termo encontrados no nome, com bonus para prefixo exato
 * e penalidade leve para nomes longos (evita casar "Arroz, integral, cru"
 * quando se pediu so "arroz").
 */
export function buscar(termo, limite = 12) {
  if (!_dados) return [];
  const toks = normalizar(termo).split(' ').filter((t) => t.length > 2);
  if (!toks.length) return [];

  const res = [];
  for (const a of _dados.alimentos) {
    if (a.kcal === null) continue;
    const palavras = a.busca.split(' ');
    let pontos = 0;
    for (const t of toks) {
      const exata = palavras.includes(t);
      const parcial = !exata && a.busca.includes(t);
      if (exata) pontos += palavras[0] === t ? 3.2 : 2.4;
      else if (parcial) pontos += 1.1;
    }
    if (!pontos) continue;
    pontos -= palavras.length * 0.09;               // prefere nomes mais diretos
    pontos += (toks.length / palavras.length) * 0.6; // premia cobertura do nome
    res.push({ alimento: a, pontos });
  }
  return res.sort((x, y) => y.pontos - x.pontos).slice(0, limite).map((r) => r.alimento);
}

/** Melhor correspondencia com confianca minima, usada como fallback. */
export function melhorCorrespondencia(termo) {
  const toks = normalizar(termo).split(' ').filter((t) => t.length > 2);
  if (toks.length === 0) return null;
  const [top] = buscar(termo, 1);
  if (!top) return null;
  // exige que ao menos uma palavra significativa bata exatamente
  const palavras = top.busca.split(' ');
  return toks.some((t) => palavras.includes(t)) ? top : null;
}

/** Escala os valores por 100 g para a quantidade em gramas informada. */
export function escalar(alimento, gramas) {
  const f = gramas / 100;
  const micro = {};
  for (const k of Object.keys(NOMES_MICRO)) {
    micro[k] = alimento.micro[k] === null || alimento.micro[k] === undefined ? null : alimento.micro[k] * f;
  }
  return {
    kcal: (alimento.kcal || 0) * f,
    prot: (alimento.prot || 0) * f,
    carb: (alimento.carb || 0) * f,
    gord: (alimento.gord || 0) * f,
    fibra: (alimento.fibra || 0) * f,
    micro,
  };
}
