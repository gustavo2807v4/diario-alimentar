/**
 * Persistencia local em IndexedDB. Nada sai do dispositivo alem das chamadas
 * ao modelo, que levam apenas o texto/foto do momento.
 *
 * Stores:
 *   config   chave/valor avulso (perfil, metas, apiKey, ...)
 *   entradas registros de refeicao / exercicio / agua, indexados por dia
 *   pesos    uma pesagem por dia (keyPath = data)
 *   favoritos refeicoes salvas para registro em um toque
 *   treino   um check-in por dia (keyPath = data)
 *   sistema  marcadores de interface do Sistema - NAO e fonte de verdade:
 *            XP, nivel, rank e atributos sao sempre recalculados do historico
 *            (ver sistema.js). Aqui so mora o que ja foi mostrado na tela.
 *   planos   os treinos que voce monta (Peito e triceps, Costas, ...)
 *   cardapio o que voce planeja comer em cada refeicao
 */
const NOME = 'diario-alimentar';
const VERSAO = 3;

let _db = null;

function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((ok, erro) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      if (!db.objectStoreNames.contains('entradas')) {
        const s = db.createObjectStore('entradas', { keyPath: 'id' });
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('pesos')) db.createObjectStore('pesos', { keyPath: 'data' });
      if (!db.objectStoreNames.contains('favoritos')) db.createObjectStore('favoritos', { keyPath: 'id' });
      // v2 e v3 - aditivos: os stores acima nao sao tocados na subida de versao
      if (!db.objectStoreNames.contains('treino')) db.createObjectStore('treino', { keyPath: 'data' });
      if (!db.objectStoreNames.contains('sistema')) db.createObjectStore('sistema');
      if (!db.objectStoreNames.contains('planos')) db.createObjectStore('planos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cardapio')) db.createObjectStore('cardapio', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; ok(_db); };
    req.onerror = () => erro(req.error);
  });
}

function tx(store, modo, fn) {
  return abrir().then((db) => new Promise((ok, erro) => {
    const t = db.transaction(store, modo);
    const req = fn(t.objectStore(store));
    t.onerror = () => erro(t.error);
    t.oncomplete = () => ok(req ? req.result : undefined);
    if (req) req.onerror = () => erro(req.error);
  }));
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/* --- config --------------------------------------------------------------- */
export const getConfig = (chave) => tx('config', 'readonly', (s) => s.get(chave));
export const setConfig = (chave, valor) => tx('config', 'readwrite', (s) => s.put(valor, chave));

/* --- entradas ------------------------------------------------------------- */
export const salvarEntrada = (e) => tx('entradas', 'readwrite', (s) => s.put(e));
export const apagarEntrada = (id) => tx('entradas', 'readwrite', (s) => s.delete(id));
export const pegarEntrada = (id) => tx('entradas', 'readonly', (s) => s.get(id));

export const entradasDoDia = (data) =>
  tx('entradas', 'readonly', (s) => s.index('data').getAll(IDBKeyRange.only(data)))
    .then((r) => (r || []).sort((a, b) => a.ts - b.ts));

export const entradasNoIntervalo = (de, ate) =>
  tx('entradas', 'readonly', (s) => s.index('data').getAll(IDBKeyRange.bound(de, ate)))
    .then((r) => (r || []).sort((a, b) => a.ts - b.ts));

export const todasEntradas = () => tx('entradas', 'readonly', (s) => s.getAll()).then((r) => r || []);

/* --- pesos ---------------------------------------------------------------- */
export const salvarPeso = (data, kg) => tx('pesos', 'readwrite', (s) => s.put({ data, kg }));
export const apagarPeso = (data) => tx('pesos', 'readwrite', (s) => s.delete(data));
export const todosPesos = () =>
  tx('pesos', 'readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.data.localeCompare(b.data)));

/* --- favoritos ------------------------------------------------------------ */
export const salvarFavorito = (f) => tx('favoritos', 'readwrite', (s) => s.put(f));
export const apagarFavorito = (id) => tx('favoritos', 'readwrite', (s) => s.delete(id));
export const todosFavoritos = () =>
  tx('favoritos', 'readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => b.usos - a.usos));

/* --- treino ---------------------------------------------------------------
   Um registro por dia. `exercicios` nasce vazio: o campo existe desde agora
   para que registrar serie/repeticao/carga um dia nao exija migracao nova.  */
export const salvarTreino = (t) => tx('treino', 'readwrite', (s) => s.put(t));
export const pegarTreino = (data) => tx('treino', 'readonly', (s) => s.get(data));
export const apagarTreino = (data) => tx('treino', 'readwrite', (s) => s.delete(data));
export const todosTreinos = () =>
  tx('treino', 'readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.data.localeCompare(b.data)));

export const treinoVazio = (data) => ({ data, concluido: false, tipo: '', exercicios: [], obs: '' });

/* --- planos de treino ------------------------------------------------------
   Exercicio: { id, nome, series, reps, carga, sugerido, obs }.
   `reps` e `carga` sao texto ("8-12", "60 kg", "peso corporal") - sao
   prescricao, nao conta. `sugerido` marca o que veio da IA.              */
export const salvarPlano = (p) => tx('planos', 'readwrite', (s) => s.put(p));
export const pegarPlano = (id) => tx('planos', 'readonly', (s) => s.get(id));
export const apagarPlano = (id) => tx('planos', 'readwrite', (s) => s.delete(id));
export const todosPlanos = () =>
  tx('planos', 'readonly', (s) => s.getAll()).then((r) => (r || []).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));

export const planoVazio = (nome = '') => ({
  id: uid(), nome, exercicios: [], ordem: Date.now(), criadoEm: new Date().toISOString(),
});

export const exercicioVazio = () => ({
  id: uid(), nome: '', series: 3, reps: '8-12', carga: '', sugerido: false, obs: '',
});

/* --- cardapio --------------------------------------------------------------
   Um registro por refeicao planejada. `itens` usa exatamente o mesmo formato
   dos itens de uma entrada, entao registrar reaproveita somarItens() e nao
   introduz aritmetica nova em lugar nenhum.                              */
export const salvarCardapio = (c) => tx('cardapio', 'readwrite', (s) => s.put(c));
export const apagarCardapio = (id) => tx('cardapio', 'readwrite', (s) => s.delete(id));
export const todoCardapio = () => tx('cardapio', 'readonly', (s) => s.getAll()).then((r) => r || []);

/* --- sistema (marcadores de interface) ------------------------------------ */
export const getSistema = (chave) => tx('sistema', 'readonly', (s) => s.get(chave));
export const setSistema = (chave, valor) => tx('sistema', 'readwrite', (s) => s.put(valor, chave));

/** Store chave/valor: le com cursor porque getAll() perderia as chaves. */
export function todoSistema() {
  return abrir().then((db) => new Promise((ok, erro) => {
    const t = db.transaction('sistema', 'readonly');
    const dados = {};
    t.objectStore('sistema').openCursor().onsuccess = (ev) => {
      const c = ev.target.result;
      if (!c) return;
      dados[c.key] = c.value;
      c.continue();
    };
    t.oncomplete = () => ok(dados);
    t.onerror = () => erro(t.error);
  }));
}

/* --- backup --------------------------------------------------------------- */

/** Converte Blob -> data URL para caber no JSON de exportacao. */
function blobParaTexto(blob) {
  return new Promise((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.readAsDataURL(blob);
  });
}

function textoParaBlob(dataUrl) {
  const [cab, b64] = dataUrl.split(',');
  const mime = cab.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

export async function exportarTudo() {
  const [entradas, pesos, favoritos, treino, sistema, planos, cardapio, perfil, metas] = await Promise.all([
    todasEntradas(), todosPesos(), todosFavoritos(), todosTreinos(), todoSistema(),
    todosPlanos(), todoCardapio(), getConfig('perfil'), getConfig('metas'),
  ]);
  for (const e of entradas) {
    if (e.foto instanceof Blob) e.foto = await blobParaTexto(e.foto);
  }
  return {
    formato: 'diario-alimentar/1', exportadoEm: new Date().toISOString(),
    perfil, metas, entradas, pesos, favoritos, treino, sistema, planos, cardapio,
  };
}

export async function importarTudo(dados) {
  if (!dados || dados.formato !== 'diario-alimentar/1') throw new Error('Arquivo de backup nao reconhecido.');
  if (dados.perfil) await setConfig('perfil', dados.perfil);
  if (dados.metas) await setConfig('metas', dados.metas);
  for (const e of dados.entradas || []) {
    if (typeof e.foto === 'string' && e.foto.startsWith('data:')) e.foto = textoParaBlob(e.foto);
    await salvarEntrada(e);
  }
  for (const p of dados.pesos || []) await salvarPeso(p.data, p.kg);
  for (const f of dados.favoritos || []) await salvarFavorito(f);
  // backups mais antigos nao trazem estes campos - o `|| []` cobre isso
  for (const t of dados.treino || []) await salvarTreino(t);
  for (const [chave, valor] of Object.entries(dados.sistema || {})) await setSistema(chave, valor);
  for (const p of dados.planos || []) await salvarPlano(p);
  for (const c of dados.cardapio || []) await salvarCardapio(c);
}

export async function limparTudo() {
  const db = await abrir();
  const stores = ['entradas', 'pesos', 'favoritos', 'treino', 'sistema', 'planos', 'cardapio', 'config'];
  await Promise.all(stores.map((nome) => new Promise((ok, erro) => {
    const t = db.transaction(nome, 'readwrite');
    t.objectStore(nome).clear();
    t.oncomplete = ok;
    t.onerror = () => erro(t.error);
  })));
}
