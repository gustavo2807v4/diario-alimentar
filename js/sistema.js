/**
 * O Sistema: XP, sequencia, atributos, nivel e rank.
 *
 * Nenhum numero aqui e inventado e nenhum e guardado. Tudo e funcao pura do
 * historico de dias que chega por parametro - por isso corrigir uma refeicao
 * de junho recalcula o nivel corretamente, e por isso o backup nao precisa
 * carregar XP nenhum: ele carrega os fatos, e os fatos bastam.
 *
 * Sem DOM e sem banco de proposito: da para testar no console passando dados
 * falsos. Um "dia" tem esta forma:
 *
 *   { data: '2026-09-01', totais: <saida de totaisDoDia()>, treino: bool, refeicoes: n }
 */

/* --- Constantes ajustaveis ------------------------------------------------ */

export const XP = { treino: 120, proteina: 80, calorias: 80, agua: 40, bonus: 200 };

/** Calorias contam como "na faixa" dentro de 10% da meta, nunca menos de 150 kcal. */
export const TOLERANCIA_KCAL = 0.10;
export const FAIXA_MINIMA_KCAL = 150;

/**
 * Proteina fecha com 5% de folga. Sem isso era o objetivo mais dificil dos
 * quatro: 158 g de uma meta de 160 e a mesma refeicao na pratica, e a meta em
 * si ja e um arredondamento de g/kg.
 */
export const TOLERANCIA_PROT = 0.05;
export const minimoProteina = (metaProt) => (metaProt || 0) * (1 - TOLERANCIA_PROT);

/** Dia com registro alimentar completo: pelo menos 2 refeicoes e 60% da meta. */
export const MIN_REFEICOES = 2;
export const FRACAO_MINIMA_KCAL = 0.6;

export const OBJETIVOS = {
  treino: { nome: 'Treino concluido', xp: XP.treino },
  proteina: { nome: 'Proteina na meta', xp: XP.proteina },
  calorias: { nome: 'Calorias na faixa', xp: XP.calorias },
  agua: { nome: 'Agua na meta', xp: XP.agua },
};

const FAIXAS_MULT = [
  { minimo: 30, mult: 2.0 },
  { minimo: 14, mult: 1.6 },
  { minimo: 7, mult: 1.4 },
  { minimo: 3, mult: 1.2 },
  { minimo: 0, mult: 1.0 },
];

/** Rank exige nivel E consistencia: uma semana intensa nao compra rank alto. */
export const RANKS = [
  { rank: 'E', nivel: 1, dias: 0 },
  { rank: 'D', nivel: 5, dias: 7 },
  { rank: 'C', nivel: 10, dias: 21 },
  { rank: 'B', nivel: 18, dias: 45 },
  { rank: 'A', nivel: 28, dias: 90 },
  { rank: 'S', nivel: 40, dias: 180 },
];

export const ATRIBUTOS = {
  forca: { nome: 'FORCA', fonte: 'treinos concluidos' },
  vigor: { nome: 'VIGOR', fonte: 'dias com proteina na meta' },
  constituicao: { nome: 'CONSTITUICAO', fonte: 'dias com calorias na faixa' },
  percepcao: { nome: 'PERCEPCAO', fonte: 'dias com registro completo' },
};

/* --- Missao diaria -------------------------------------------------------- */

/** Data ISO do dia anterior, sem depender de nada externo. */
function diaAnterior(s) {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() - 1);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function faixaCalorias(metaKcal) {
  const meta = metaKcal || 0;
  const margem = Math.max(FAIXA_MINIMA_KCAL, meta * TOLERANCIA_KCAL);
  return { min: meta - margem, max: meta + margem, margem };
}

/**
 * Avalia um dia contra as metas. As calorias julgadas sao as liquidas - o
 * mesmo numero que o anel mostra na tela do dia.
 */
export function avaliarDia(dia, metas) {
  const t = dia?.totais || {};
  const m = metas || {};
  const liquidas = (t.kcalComida || 0) - (t.kcalExercicio || 0);
  const faixa = faixaCalorias(m.kcal);

  const objetivos = {
    treino: Boolean(dia?.treino),
    proteina: (m.prot || 0) > 0 && (t.prot || 0) >= minimoProteina(m.prot),
    calorias: (m.kcal || 0) > 0 && liquidas >= faixa.min && liquidas <= faixa.max,
    agua: (m.agua || 0) > 0 && (t.agua || 0) >= m.agua,
  };

  const feitos = Object.keys(objetivos).filter((k) => objetivos[k]);
  const completa = feitos.length === 4;
  const xpBase = feitos.reduce((s, k) => s + XP[k], 0) + (completa ? XP.bonus : 0);

  return {
    data: dia?.data,
    objetivos,
    completa,
    xpBase,
    liquidas,
    faixa,
    // registro completo alimenta a PERCEPCAO e nao vale XP por si so
    registroCompleto: (dia?.refeicoes || 0) >= MIN_REFEICOES
      && (m.kcal || 0) > 0 && (t.kcalComida || 0) >= m.kcal * FRACAO_MINIMA_KCAL,
  };
}

export const multiplicadorDe = (sequencia) =>
  FAIXAS_MULT.find((f) => sequencia >= f.minimo).mult;

/* --- XP acumulado --------------------------------------------------------- */

/**
 * Percorre o historico em ordem e soma o XP dia a dia.
 * `dias` deve vir em ordem crescente de data; buracos no meio quebram a
 * sequencia sozinhos, entao um array esparso tambem funciona.
 *
 * Falhar um dia custa o bonus daquele dia e zera o multiplicador. Nunca tira
 * XP ja ganho e nunca derruba o nivel.
 */
export function xpDoHistorico(dias, metas) {
  let xp = 0;
  let seq = 0;
  let maiorSequencia = 0;
  let diasCompletos = 0;
  let ultimoCompleto = null;
  const porDia = [];

  for (const dia of dias) {
    const av = avaliarDia(dia, metas);

    if (av.completa) {
      seq = ultimoCompleto === diaAnterior(dia.data) ? seq + 1 : 1;
      ultimoCompleto = dia.data;
      diasCompletos++;
      if (seq > maiorSequencia) maiorSequencia = seq;
    } else {
      seq = 0;
    }

    const mult = multiplicadorDe(seq);
    const ganho = Math.round(av.xpBase * mult);
    xp += ganho;
    porDia.push({ ...av, sequencia: seq, mult, xp: ganho });
  }

  // A sequencia exibida termina em hoje se hoje ja fechou, ou em ontem se hoje
  // ainda esta em aberto - senao o painel diria "0" toda manha, o que e falso.
  const ultimo = dias.length ? dias[dias.length - 1].data : null;
  let sequencia = 0;
  if (ultimo && ultimoCompleto
      && (ultimoCompleto === ultimo || ultimoCompleto === diaAnterior(ultimo))) {
    sequencia = porDia.find((d) => d.data === ultimoCompleto)?.sequencia || 0;
  }

  return { xp, sequencia, maiorSequencia, diasCompletos, porDia };
}

/* --- Atributos ------------------------------------------------------------
   Retorno decrescente: dobrar o atributo custa quatro vezes mais dias. Do 10
   ao 20 sao 3 dias; do 90 ao 100 sao 19.                                    */

export const pontosDe = (n) => Math.floor(10 * Math.sqrt(Math.max(0, n)));

export function atributos(dias, metas) {
  const c = { forca: 0, vigor: 0, constituicao: 0, percepcao: 0 };
  for (const dia of dias) {
    const av = avaliarDia(dia, metas);
    if (av.objetivos.treino) c.forca++;
    if (av.objetivos.proteina) c.vigor++;
    if (av.objetivos.calorias) c.constituicao++;
    if (av.registroCompleto) c.percepcao++;
  }
  return Object.fromEntries(
    Object.keys(c).map((k) => [k, { n: c[k], pontos: pontosDe(c[k]) }]),
  );
}

/* --- Nivel e rank --------------------------------------------------------- */

/** Custo do nivel N para o N+1. Cresce reto: 200, 300, 400, ... */
export const custoDoNivel = (nivel) => 200 + 100 * (nivel - 1);

export function nivelDe(xp) {
  let nivel = 1;
  let restante = Math.max(0, xp);
  while (restante >= custoDoNivel(nivel)) {
    restante -= custoDoNivel(nivel);
    nivel++;
  }
  return { nivel, xp, xpNoNivel: restante, xpParaProximo: custoDoNivel(nivel) };
}

export function rankDe(nivel, diasCompletos) {
  let atual = RANKS[0];
  for (const f of RANKS) {
    if (nivel >= f.nivel && diasCompletos >= f.dias) atual = f;
  }
  const proximo = RANKS[RANKS.indexOf(atual) + 1] || null;
  return {
    rank: atual.rank,
    proximo: proximo ? proximo.rank : null,
    faltam: proximo
      ? { niveis: Math.max(0, proximo.nivel - nivel), dias: Math.max(0, proximo.dias - diasCompletos) }
      : null,
  };
}

/* --- Tudo de uma vez ------------------------------------------------------ */

/** Conveniencia para as telas: uma passada, todos os derivados. */
export function calcular(dias, metas) {
  const hist = xpDoHistorico(dias, metas);
  const nivel = nivelDe(hist.xp);
  const hoje = hist.porDia[hist.porDia.length - 1] || null;
  return {
    ...hist,
    atributos: atributos(dias, metas),
    nivel,
    ...rankDe(nivel.nivel, hist.diasCompletos),
    hoje,
    // multiplicador que o XP de hoje recebe se a missao fechar
    multiplicadorPotencial: multiplicadorDe(hoje?.completa ? hist.sequencia : hist.sequencia + 1),
  };
}
