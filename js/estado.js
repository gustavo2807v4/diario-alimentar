/** Estado global do app: perfil, metas, preferencias e o dia em foco. */
import * as db from './db.js';
import { metasAutomaticas, totaisDoDia } from './nutri.js';
import { hoje, somarDias } from './ui.js';

export const estado = {
  perfil: null,
  metas: null,
  config: { apiKey: '', modelo: 'gemini-2.5-flash', rapido: true },
  dia: hoje(),
};

export async function carregarEstado() {
  const [perfil, metas, config] = await Promise.all([
    db.getConfig('perfil'), db.getConfig('metas'), db.getConfig('config'),
  ]);
  estado.perfil = perfil || null;
  estado.metas = metas || null;
  if (config) estado.config = { ...estado.config, ...config };
  return estado;
}

export async function salvarPerfil(perfil) {
  estado.perfil = perfil;
  await db.setConfig('perfil', perfil);
  if (!estado.metas || estado.metas.origem !== 'manual') await recalcularMetas();
}

export async function recalcularMetas() {
  estado.metas = metasAutomaticas(estado.perfil);
  await db.setConfig('metas', estado.metas);
  return estado.metas;
}

export async function salvarMetas(metas) {
  estado.metas = metas;
  await db.setConfig('metas', metas);
}

export async function salvarConfig(parcial) {
  estado.config = { ...estado.config, ...parcial };
  await db.setConfig('config', estado.config);
}

export const temPerfil = () => Boolean(estado.perfil?.peso && estado.perfil?.altura && estado.perfil?.nascimento);

/* --- Historico para o Sistema ---------------------------------------------
   O Sistema recalcula XP, nivel e atributos do zero a cada leitura, entao o
   historico inteiro precisa estar a mao. A passada completa roda uma vez por
   sessao; depois so o dia em foco e refeito, que e o unico que a interface
   consegue alterar (para apagar um registro de junho voce precisa navegar ate
   junho, e ai junho e o dia em foco).

   As fotos voltam do IndexedDB como handles preguicosos de Blob - os bytes so
   sao lidos quando alguem le o Blob -, entao a passada percorre so os campos
   leves e nao arrasta as imagens para a memoria.                            */

let _mapa = null;
let _carga = null;

const fatosDoDia = (data, entradas, treino) => ({
  data,
  totais: totaisDoDia(entradas),
  treino: Boolean(treino?.concluido),
  refeicoes: entradas.filter((e) => e.tipo === 'refeicao').length,
});

const diaVazio = (data) => fatosDoDia(data, [], null);

function mapaSistema() {
  if (_mapa) return Promise.resolve(_mapa);
  if (!_carga) {
    _carga = (async () => {
      const [entradas, treinos] = await Promise.all([db.todasEntradas(), db.todosTreinos()]);
      const porDia = new Map();
      for (const e of entradas) {
        if (!porDia.has(e.data)) porDia.set(e.data, []);
        porDia.get(e.data).push(e);
      }
      const porTreino = new Map(treinos.map((t) => [t.data, t]));
      const mapa = new Map();
      for (const data of new Set([...porDia.keys(), ...porTreino.keys()])) {
        mapa.set(data, fatosDoDia(data, porDia.get(data) || [], porTreino.get(data)));
      }
      _mapa = mapa;
      _carga = null;
      return mapa;
    })();
  }
  return _carga;
}

/** Historico denso do primeiro registro ate hoje - os buracos entram vazios. */
export async function historicoSistema() {
  const mapa = await mapaSistema();
  const fim = hoje();
  const chaves = [...mapa.keys()].sort();
  let inicio = chaves[0] || fim;
  if (inicio > fim) inicio = fim;

  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(mapa.get(d) || diaVazio(d));
  return dias;
}

/** Refaz um unico dia no cache. Sem cache montado, nao ha nada a fazer. */
export async function atualizarDiaSistema(data) {
  if (!_mapa) return;
  const [entradas, treino] = await Promise.all([db.entradasDoDia(data), db.pegarTreino(data)]);
  if (!entradas.length && !treino) _mapa.delete(data);
  else _mapa.set(data, fatosDoDia(data, entradas, treino));
}

export async function salvarTreinoDoDia(data, parcial) {
  const atual = (await db.pegarTreino(data)) || db.treinoVazio(data);
  const novo = { ...atual, ...parcial, data };
  await db.salvarTreino(novo);
  await atualizarDiaSistema(data);
  return novo;
}
