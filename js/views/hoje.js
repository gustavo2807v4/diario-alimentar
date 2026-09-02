/** Tela do dia: anel de calorias, macros, agua e a lista de registros. */
import * as db from '../db.js';
import { NOMES_MICRO } from '../taco.js';
import { estado } from '../estado.js';
import { totaisDoDia, MACRO_INFO, REFEICOES } from '../nutri.js';
import {
  esc, n0, n1, anelCalorias, barraMacro, icone, horaDe, aviso,
} from '../ui.js';
import { abrirRevisao } from './registrar.js';
import { estadoAtual, cartaoSistema, ligarCartaoSistema } from './sistema.js';

const ORDEM = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia'];

export async function renderHoje(host, recarregar) {
  const [entradas, treino, sistema] = await Promise.all([
    db.entradasDoDia(estado.dia), db.pegarTreino(estado.dia), estadoAtual(estado.dia),
  ]);
  const t = totaisDoDia(entradas);
  const m = estado.metas;
  const liquidas = t.kcalComida - t.kcalExercicio;

  const refeicoes = entradas.filter((e) => e.tipo === 'refeicao');
  const exercicios = entradas.filter((e) => e.tipo === 'exercicio');
  const aguas = entradas.filter((e) => e.tipo === 'agua');

  host.innerHTML = `
    <section class="cartao">
      <div class="anel-bloco">
        ${anelCalorias(liquidas, m.kcal)}
        <div class="resumo">
          <div class="resumo-linha"><span>Meta</span><b>${n0(m.kcal)}</b></div>
          <div class="resumo-linha"><span>Comida</span><b>${n0(t.kcalComida)}</b></div>
          <div class="resumo-linha"><span>Exercicio</span><b>${t.kcalExercicio ? `-${n0(t.kcalExercicio)}` : '0'}</b></div>
          <div class="resumo-linha" style="border-top:1px solid var(--grid);padding-top:8px">
            <span>Consumidas</span><b>${n0(liquidas)}</b></div>
        </div>
      </div>
    </section>

    ${cartaoSistema(sistema, treino)}

    <section class="cartao">
      <div class="cartao-tit"><h2>Macronutrientes</h2><span class="item-sub">${n1(t.fibra)} g de fibra</span></div>
      <div class="macros">
        ${barraMacro(MACRO_INFO.prot.nome, MACRO_INFO.prot.cor, t.prot, m.prot)}
        ${barraMacro(MACRO_INFO.carb.nome, MACRO_INFO.carb.cor, t.carb, m.carb)}
        ${barraMacro(MACRO_INFO.gord.nome, MACRO_INFO.gord.cor, t.gord, m.gord)}
      </div>
      ${temMicros(t) ? `
      <details class="expand" style="margin-top:14px">
        <summary>Micronutrientes do dia</summary>
        <div class="nutri-grade" style="margin-top:8px">
          ${Object.entries(NOMES_MICRO).map(([k, [nome, un]]) => {
            const v = t.micro[k];
            if (v === null || v === undefined || v === 0) return '';
            return `<div class="nutri-item"><span>${esc(nome)}</span><b>${n1(v)} ${un}</b></div>`;
          }).join('')}
        </div>
        <p class="dica" style="margin-top:10px">Somados apenas sobre os itens vindos da tabela TACO.</p>
      </details>` : ''}
    </section>

    <section class="cartao">
      <div class="cartao-tit"><h2>Agua</h2>
        <span class="item-sub">${n0(t.agua)} / ${n0(m.agua)} ml</span></div>
      <div class="trilho" role="img" aria-label="Agua: ${n0(t.agua)} de ${n0(m.agua)} mililitros">
        <div class="preenche" style="width:${Math.min(100, m.agua ? (t.agua / m.agua) * 100 : 0).toFixed(1)}%;background:var(--ink-2)"></div>
      </div>
      <div class="chips" style="margin-top:12px">
        <button class="chip" data-agua="250">+250 ml</button>
        <button class="chip" data-agua="500">+500 ml</button>
        ${aguas.length ? '<button class="chip" data-limpar-agua>Zerar</button>' : ''}
      </div>
    </section>

    ${refeicoes.length || exercicios.length ? '' : `
      <p class="vazio">Nada registrado ainda.<br>Toque no <b>+</b> para descrever ou fotografar uma refeicao.</p>`}

    ${ORDEM.map((chave) => {
      const grupo = refeicoes.filter((e) => e.refeicao === chave);
      if (!grupo.length) return '';
      const kcal = grupo.reduce((s, e) => s + (e.total?.kcal || 0), 0);
      return `
        <div class="grupo-tit"><h3>${esc(REFEICOES[chave])}</h3><span>${n0(kcal)} kcal</span></div>
        ${grupo.map(cartaoEntrada).join('')}`;
    }).join('')}

    ${exercicios.length ? `
      <div class="grupo-tit"><h3>Exercicio</h3>
        <span>${n0(t.kcalExercicio)} kcal</span></div>
      ${exercicios.map(cartaoEntrada).join('')}` : ''}
  `;

  ligarCartaoSistema(host, { dia: estado.dia, recarregar });

  host.querySelectorAll('[data-agua]').forEach((b) => {
    b.onclick = async () => {
      await db.salvarEntrada({
        id: db.uid(), data: estado.dia, ts: Date.now(), tipo: 'agua',
        titulo: 'Agua', ml: Number(b.dataset.agua),
      });
      recarregar();
    };
  });

  host.querySelector('[data-limpar-agua]')?.addEventListener('click', async () => {
    for (const a of aguas) await db.apagarEntrada(a.id);
    aviso('Agua zerada');
    recarregar();
  });

  host.querySelectorAll('[data-entrada]').forEach((b) => {
    b.onclick = async () => {
      const entrada = await db.pegarEntrada(b.dataset.entrada);
      if (entrada) abrirRevisao({ dia: estado.dia, entrada, editando: true, aoSalvar: recarregar });
    };
  });

  // libera as URLs de objeto das miniaturas quando a tela for trocada
  host.querySelectorAll('img[data-obj]').forEach((img) => {
    img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
  });
}

const temMicros = (t) => Object.values(t.micro).some((v) => v);

function cartaoEntrada(e) {
  const foto = e.foto instanceof Blob ? URL.createObjectURL(e.foto) : null;
  const kcal = e.tipo === 'exercicio' ? -(e.kcal || 0) : (e.total?.kcal || 0);
  const sub = e.tipo === 'exercicio'
    ? horaDe(e.ts)
    : `${horaDe(e.ts)} &middot; ${(e.itens || []).length} ${(e.itens || []).length === 1 ? 'item' : 'itens'}`
      + (e.total ? ` &middot; P ${n1(e.total.prot)} C ${n1(e.total.carb)} G ${n1(e.total.gord)}` : '');

  return `
    <button class="item" data-entrada="${esc(e.id)}">
      ${foto
        ? `<img class="item-foto" data-obj src="${foto}" alt="">`
        : `<span class="item-emoji" aria-hidden="true">${e.tipo === 'exercicio' ? icone('raio', 20) : icone('hoje', 20)}</span>`}
      <span class="item-txt">
        <span class="item-nome">${esc(e.titulo)}</span>
        <span class="item-sub">${sub}</span>
      </span>
      <span class="item-kcal">${n0(kcal)}<small> kcal</small></span>
    </button>`;
}
