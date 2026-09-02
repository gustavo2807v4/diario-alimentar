/**
 * Toda a aritmetica nutricional vive aqui, em codigo puro e deterministico.
 * O modelo nunca soma nada: ele so identifica alimentos e estima gramas.
 * (Era exatamente ai que o app original errava - remover um ingrediente de
 * 0 kcal mudava o total da refeicao.)
 */
import * as taco from './taco.js';

export const CAMPOS_MACRO = ['prot', 'carb', 'gord', 'fibra'];

export const MACRO_INFO = {
  prot: { nome: 'Proteina', cor: 'var(--s1)', kcalPorG: 4 },
  carb: { nome: 'Carboidrato', cor: 'var(--s2)', kcalPorG: 4 },
  gord: { nome: 'Gordura', cor: 'var(--s3)', kcalPorG: 9 },
};

export const REFEICOES = {
  cafe: 'Cafe da manha',
  lanche_manha: 'Lanche da manha',
  almoco: 'Almoco',
  lanche_tarde: 'Lanche da tarde',
  jantar: 'Jantar',
  ceia: 'Ceia',
};

export const ATIVIDADES = {
  1.2: 'Sedentario (pouco ou nenhum exercicio)',
  1.375: 'Leve (1 a 3 dias por semana)',
  1.55: 'Moderado (3 a 5 dias por semana)',
  1.725: 'Intenso (6 a 7 dias por semana)',
  1.9: 'Muito intenso (trabalho fisico + treino)',
};

/* --- Metas ---------------------------------------------------------------- */

export function idadeEm(nascimento, quando = new Date()) {
  const n = new Date(nascimento);
  let i = quando.getFullYear() - n.getFullYear();
  const m = quando.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && quando.getDate() < n.getDate())) i--;
  return i;
}

/** Mifflin-St Jeor. */
export function tmb(perfil) {
  const { sexo, peso, altura } = perfil;
  const idade = idadeEm(perfil.nascimento);
  const base = 10 * peso + 6.25 * altura - 5 * idade;
  return Math.round(base + (sexo === 'M' ? 5 : -161));
}

export function tdee(perfil) {
  return Math.round(tmb(perfil) * Number(perfil.atividade));
}

/**
 * Metas diarias. 1 kg de gordura ~ 7700 kcal, entao o ritmo semanal vira um
 * ajuste diario. Piso de seguranca: nunca abaixo da TMB nem de 1200/1500 kcal.
 */
export function metasAutomaticas(perfil) {
  const gasto = tdee(perfil);
  const ritmo = Number(perfil.ritmo || 0.5);
  const ajuste = Math.round((ritmo * 7700) / 7);

  let kcal = gasto;
  if (perfil.objetivo === 'perder') kcal = gasto - ajuste;
  if (perfil.objetivo === 'ganhar') kcal = gasto + ajuste;

  const piso = Math.max(tmb(perfil), perfil.sexo === 'M' ? 1500 : 1200);
  kcal = Math.max(kcal, piso);

  const gPorKgProt = perfil.objetivo === 'perder' ? 2.0 : 1.8;
  const prot = Math.round(perfil.peso * gPorKgProt);
  const gord = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4));

  return {
    kcal: Math.round(kcal),
    prot, carb, gord,
    fibra: kcal >= 2000 ? 30 : 25,
    agua: Math.round((perfil.peso * 35) / 50) * 50,
    gasto,
    tmb: tmb(perfil),
    origem: 'auto',
  };
}

/* --- Resolucao dos itens vindos do modelo --------------------------------- */

const zeroMicro = () => Object.fromEntries(Object.keys(taco.NOMES_MICRO).map((k) => [k, null]));

/**
 * Converte um item cru do modelo em item final com valores absolutos.
 * Preferencia: TACO indicada pelo modelo > TACO por busca local > estimativa
 * do proprio modelo. A origem fica registrada em `fonte` para o usuario ver.
 */
export function resolverItem(cru) {
  const gramas = Math.max(0, Number(cru.gramas) || 0);
  let fonte = 'ia';
  let alimento = null;

  if (cru.taco_id && cru.confianca_taco !== 'nenhuma') {
    alimento = taco.porId(cru.taco_id);
  }
  if (!alimento && cru.confianca_taco !== 'nenhuma') {
    alimento = taco.melhorCorrespondencia(cru.nome);
  }

  let valores;
  if (alimento) {
    fonte = 'taco';
    valores = taco.escalar(alimento, gramas);
  } else {
    const f = gramas / 100;
    valores = {
      kcal: (Number(cru.kcal_100g) || 0) * f,
      prot: (Number(cru.prot_100g) || 0) * f,
      carb: (Number(cru.carb_100g) || 0) * f,
      gord: (Number(cru.gord_100g) || 0) * f,
      fibra: (Number(cru.fibra_100g) || 0) * f,
      micro: zeroMicro(),
    };
  }

  return {
    nome: cru.nome || 'Item',
    descricao: cru.quantidade_descrita || '',
    gramas,
    fonte,
    tacoId: alimento ? alimento.id : null,
    tacoNome: alimento ? alimento.nome : null,
    base100: alimento
      ? { kcal: alimento.kcal, prot: alimento.prot, carb: alimento.carb, gord: alimento.gord, fibra: alimento.fibra }
      : {
          kcal: Number(cru.kcal_100g) || 0, prot: Number(cru.prot_100g) || 0,
          carb: Number(cru.carb_100g) || 0, gord: Number(cru.gord_100g) || 0,
          fibra: Number(cru.fibra_100g) || 0,
        },
    ...valores,
  };
}

/** Recalcula um item ja resolvido apos o usuario mudar as gramas. */
export function reescalarItem(item, gramas) {
  const g = Math.max(0, Number(gramas) || 0);
  if (item.tacoId) {
    const alimento = taco.porId(item.tacoId);
    if (alimento) return { ...item, gramas: g, ...taco.escalar(alimento, g) };
  }
  const f = g / 100;
  return {
    ...item,
    gramas: g,
    kcal: item.base100.kcal * f,
    prot: item.base100.prot * f,
    carb: item.base100.carb * f,
    gord: item.base100.gord * f,
    fibra: item.base100.fibra * f,
    micro: zeroMicro(),
  };
}

/** Troca a fonte de um item para um alimento especifico da TACO. */
export function trocarPorTaco(item, alimento) {
  return {
    ...item,
    fonte: 'taco',
    tacoId: alimento.id,
    tacoNome: alimento.nome,
    base100: { kcal: alimento.kcal, prot: alimento.prot, carb: alimento.carb, gord: alimento.gord, fibra: alimento.fibra },
    ...taco.escalar(alimento, item.gramas),
  };
}

/* --- Somas ---------------------------------------------------------------- */

export function somarItens(itens) {
  const total = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0, micro: zeroMicro() };
  for (const it of itens) {
    total.kcal += it.kcal || 0;
    total.prot += it.prot || 0;
    total.carb += it.carb || 0;
    total.gord += it.gord || 0;
    total.fibra += it.fibra || 0;
    for (const k of Object.keys(total.micro)) {
      const v = it.micro?.[k];
      if (v !== null && v !== undefined) total.micro[k] = (total.micro[k] || 0) + v;
    }
  }
  return total;
}

/** Agrega um dia inteiro: comida, exercicio, agua e micronutrientes. */
export function totaisDoDia(entradas) {
  const t = {
    kcalComida: 0, kcalExercicio: 0,
    prot: 0, carb: 0, gord: 0, fibra: 0,
    agua: 0, micro: zeroMicro(),
  };
  for (const e of entradas) {
    if (e.tipo === 'refeicao') {
      t.kcalComida += e.total?.kcal || 0;
      t.prot += e.total?.prot || 0;
      t.carb += e.total?.carb || 0;
      t.gord += e.total?.gord || 0;
      t.fibra += e.total?.fibra || 0;
      for (const k of Object.keys(t.micro)) {
        const v = e.total?.micro?.[k];
        if (v !== null && v !== undefined) t.micro[k] = (t.micro[k] || 0) + v;
      }
    } else if (e.tipo === 'exercicio') {
      t.kcalExercicio += e.kcal || 0;
    } else if (e.tipo === 'agua') {
      t.agua += e.ml || 0;
    }
  }
  return t;
}
