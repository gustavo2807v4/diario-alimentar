/**
 * As janelas do Sistema: cartao na tela do dia, painel de status, aviso de
 * missao pendente e a subida de nivel.
 *
 * Nada aqui calcula: os numeros vem prontos de sistema.js, que por sua vez os
 * deriva do historico. Esta camada so desenha.
 */
import * as db from '../db.js';
import { estado, historicoSistema, salvarTreinoDoDia } from '../estado.js';
import {
  calcular, avaliarDia, OBJETIVOS, ATRIBUTOS, RANKS, multiplicadorDe, minimoProteina,
} from '../sistema.js';
import { esc, n0, hoje, abrirFolha, aviso } from '../ui.js';

/* --- Leitura --------------------------------------------------------------- */

/** Uma chamada, tudo que as telas precisam. O cache mora em estado.js. */
export async function estadoAtual(data = hoje()) {
  const dias = await historicoSistema();
  const metas = estado.metas;
  const s = calcular(dias, metas);
  const foco = dias.find((d) => d.data === data) || null;
  return { s, dias, metas, foco, av: avaliarDia(foco, metas) };
}

/* --- Pedacos reaproveitados ------------------------------------------------ */

const pct = (a, b) => (b > 0 ? Math.min(100, Math.max(0, (a / b) * 100)) : 0);

/** Cabecalho comum: nivel, rank, barra de XP e a legenda embaixo. */
function blocoNivel(s) {
  return `
    <div class="sis-topo">
      <div class="sis-nivel">Nivel<b>${s.nivel.nivel}</b></div>
      <div class="sis-rank" role="img" aria-label="Rank ${s.rank}">${s.rank}</div>
    </div>
    <div class="sis-barra" role="img"
         aria-label="${n0(s.nivel.xpNoNivel)} de ${n0(s.nivel.xpParaProximo)} XP para o proximo nivel">
      <i style="width:${pct(s.nivel.xpNoNivel, s.nivel.xpParaProximo).toFixed(1)}%"></i>
    </div>
    <div class="sis-legenda">
      <span>XP <b>${n0(s.nivel.xpNoNivel)}</b> / ${n0(s.nivel.xpParaProximo)}</span>
      <span>Seq <b>${s.sequencia}</b> ${s.sequencia === 1 ? 'dia' : 'dias'} &middot; <b>${s.multiplicadorPotencial.toFixed(1)}x</b></span>
    </div>`;
}

/** Texto de apoio de cada objetivo, com o numero de verdade do dia. */
function detalhe(chave, foco, metas, av) {
  const t = foco?.totais || {};
  if (chave === 'treino') return av.objetivos.treino ? 'concluido' : 'nada marcado ainda';
  if (chave === 'proteina') {
    return `${n0(t.prot || 0)} de ${n0(metas.prot)} g &middot; fecha com ${n0(minimoProteina(metas.prot))}`;
  }
  if (chave === 'agua') return `${n0(t.agua || 0)} de ${n0(metas.agua)} ml`;
  return `${n0(av.liquidas)} kcal &middot; faixa ${n0(av.faixa.min)} a ${n0(av.faixa.max)}`;
}

function listaObjetivos(av, foco, metas) {
  return Object.entries(OBJETIVOS).map(([chave, o]) => `
    <div class="sis-obj${av.objetivos[chave] ? ' feito' : ''}">
      <span class="sis-caixa" aria-hidden="true">${av.objetivos[chave] ? '&#10003;' : ''}</span>
      <span class="sis-obj-nome">${esc(o.nome)}
        <small>${detalhe(chave, foco, metas, av)}</small></span>
      <span class="sis-obj-xp">${av.objetivos[chave] ? '+' : ''}${o.xp} XP</span>
    </div>`).join('');
}

const feitos = (av) => Object.values(av.objetivos).filter(Boolean).length;

/* --- Cartao na tela do dia -------------------------------------------------
   O nivel e o rank sao globais; o treino e a contagem da missao falam do dia
   em foco, igual ao resto da tela.                                          */

export function cartaoSistema({ s, av }, treino) {
  return `
    <section class="sis">
      <div class="sis-int">
        <div class="sis-marca"><span>Sistema</span>
          <span>Missao ${feitos(av)} / 4</span></div>
        ${blocoNivel(s)}
        <div class="sis-treino">
          <input type="text" data-tipo-treino maxlength="40" placeholder="Tipo de treino"
                 value="${esc(treino?.tipo || '')}" aria-label="Tipo de treino do dia">
          <button class="sis-btn${treino?.concluido ? ' forte' : ''}" data-treino
                  aria-pressed="${Boolean(treino?.concluido)}">
            ${treino?.concluido ? '&#10003; Feito' : 'Concluir'}
          </button>
        </div>
        <button class="sis-btn largo" data-status style="margin-top:12px">Abrir status</button>
      </div>
    </section>`;
}

/** Liga o cartao. `recarregar` e o render() do app. */
export function ligarCartaoSistema(host, { dia, recarregar }) {
  const campo = host.querySelector('[data-tipo-treino]');
  const botao = host.querySelector('[data-treino]');
  if (!campo || !botao) return;

  // salva o tipo sem recarregar a tela, para nao roubar o foco enquanto digita
  campo.onchange = () => salvarTreinoDoDia(dia, { tipo: campo.value.trim() });

  botao.onclick = async () => {
    const atual = await db.pegarTreino(dia);
    const concluido = !atual?.concluido;
    await salvarTreinoDoDia(dia, { concluido, tipo: campo.value.trim() });
    aviso(concluido ? 'Treino concluido' : 'Treino desmarcado');
    recarregar();
  };

  host.querySelector('[data-status]').onclick = () => abrirStatus(dia);
}

/* --- Painel de status ------------------------------------------------------ */

export async function abrirStatus(data = hoje()) {
  const { s, metas, foco, av } = await estadoAtual(data);
  const prox = RANKS.find((r) => r.rank === s.proximo);

  abrirFolha('Status', `
    <div class="sis">
      <div class="sis-int">
        <div class="sis-marca"><span>Sistema</span><span>Status</span></div>
        ${blocoNivel(s)}

        <div class="sis-sec">Missao diaria</div>
        ${listaObjetivos(av, foco, metas)}
        <div class="sis-legenda" style="margin-top:10px">
          <span>Bonus dos quatro <b>+200 XP</b></span>
          <span>Hoje <b>${n0(s.hoje?.xp || 0)} XP</b></span>
        </div>

        <div class="sis-sec">Atributos</div>
        <div class="sis-atrs">
          ${Object.entries(ATRIBUTOS).map(([chave, a]) => `
            <div class="sis-atr">
              <span>${esc(a.nome)}</span>
              <b>${s.atributos[chave].pontos}</b><small>${s.atributos[chave].n} ${esc(a.fonte.split(' ')[0])}</small>
            </div>`).join('')}
        </div>

        <div class="sis-sec">Progresso</div>
        <div class="sis-ganho"><span>XP acumulado</span><b>${n0(s.xp)}</b></div>
        <div class="sis-ganho"><span>Dias com missao completa</span><b>${s.diasCompletos}</b></div>
        <div class="sis-ganho"><span>Maior sequencia</span><b>${s.maiorSequencia} ${s.maiorSequencia === 1 ? 'dia' : 'dias'}</b></div>
        ${prox ? `
          <div class="sis-ganho"><span>Rank ${esc(s.proximo)} exige</span>
            <b>nivel ${prox.nivel} &middot; ${prox.dias} dias</b></div>
          <div class="sis-ganho"><span>Falta</span>
            <b>${s.faltam.niveis ? `${s.faltam.niveis} ${s.faltam.niveis === 1 ? 'nivel' : 'niveis'}` : 'nivel ok'}
               &middot; ${s.faltam.dias ? `${s.faltam.dias} ${s.faltam.dias === 1 ? 'dia' : 'dias'}` : 'dias ok'}</b></div>`
          : '<div class="sis-ganho"><span>Rank maximo</span><b>S</b></div>'}

        <p class="sis-nota">Nada disso fica guardado: XP, nivel, rank e atributos
        sao recalculados a partir dos seus registros toda vez que esta tela abre.
        Corrigir uma refeicao antiga corrige tudo junto.</p>
      </div>
    </div>`);
}

/* --- Aviso de missao pendente ---------------------------------------------
   Uma vez por dia, na abertura do app. O marcador e gravado na hora de abrir,
   nao no fechar, para o caso de o app ser morto no meio.                    */

export async function avisarMissaoPendente() {
  const dia = hoje();
  if ((await db.getSistema('ultimoAvisoMissao')) === dia) return;

  const { s, metas, foco, av } = await estadoAtual(dia);
  if (av.completa) return;

  await db.setSistema('ultimoAvisoMissao', dia);

  const restam = 4 - feitos(av);
  abrirFolha('Missao diaria', `
    <div class="sis">
      <div class="sis-int">
        <div class="sis-marca"><span>Sistema</span><span>Missao pendente</span></div>
        <p class="sis-nota" style="margin:0 0 12px">
          ${restam === 4 ? 'Nenhum objetivo cumprido hoje.' : `Faltam ${restam} de 4 objetivos.`}
          Fechando os quatro voce ganha o bonus de 200 XP
          ${s.multiplicadorPotencial > 1 ? ` com multiplicador de ${s.multiplicadorPotencial.toFixed(1)}x` : ''}.
        </p>
        ${listaObjetivos(av, foco, metas)}
      </div>
    </div>`);
}

/* --- Subida de nivel -------------------------------------------------------
   O momento que da a sensacao do anime. Comparado contra o ultimo estado que
   ja foi mostrado ao usuario - marcador de interface, nunca fonte de verdade. */

export async function conferirSubidaDeNivel() {
  if (!estado.metas) return;
  const { s } = await estadoAtual();

  const vistoNivel = await db.getSistema('ultimoNivelVisto');
  const vistoAtrs = (await db.getSistema('ultimosAtributos')) || {};
  const atrsAgora = Object.fromEntries(
    Object.keys(ATRIBUTOS).map((k) => [k, s.atributos[k].pontos]),
  );

  // grava so quando algo mudou - render() passa por aqui o tempo todo
  if (vistoNivel !== s.nivel.nivel) await db.setSistema('ultimoNivelVisto', s.nivel.nivel);
  if (JSON.stringify(vistoAtrs) !== JSON.stringify(atrsAgora)) {
    await db.setSistema('ultimosAtributos', atrsAgora);
  }

  // primeira execucao: so registra o ponto de partida, sem painel
  if (vistoNivel === undefined || vistoNivel === null) return;
  if (s.nivel.nivel <= vistoNivel) return;

  const ganhos = Object.keys(ATRIBUTOS)
    .map((k) => ({ chave: k, de: vistoAtrs[k] ?? atrsAgora[k], para: atrsAgora[k] }))
    .filter((g) => g.para > g.de);

  abrirFolha('Subida de nivel', `
    <div class="sis">
      <div class="sis-int">
        <div class="sis-marca"><span>Sistema</span><span>Nivel elevado</span></div>
        <div class="sis-subiu">
          <div class="sis-subiu-rotulo">Nivel</div>
          <b>${s.nivel.nivel}</b>
          <div class="sis-subiu-de">de ${vistoNivel} para ${s.nivel.nivel} &middot; rank ${esc(s.rank)}</div>
        </div>

        <div class="sis-sec">${ganhos.length ? 'Atributos elevados' : 'Atributos'}</div>
        ${(ganhos.length
          ? ganhos.map((g) => `
            <div class="sis-ganho"><span>${esc(ATRIBUTOS[g.chave].nome)}</span>
              <b>${g.de} &rarr; ${g.para}</b></div>`)
          : Object.keys(ATRIBUTOS).map((k) => `
            <div class="sis-ganho"><span>${esc(ATRIBUTOS[k].nome)}</span>
              <b>${atrsAgora[k]}</b></div>`)).join('')}

        <p class="sis-nota">${s.sequencia >= 3
          ? `Sequencia de ${s.sequencia} dias ativa: o XP de hoje vale ${multiplicadorDe(s.sequencia).toFixed(1)}x.`
          : 'Tres dias seguidos com a missao completa ligam o multiplicador de XP.'}</p>
      </div>
    </div>`);
}
