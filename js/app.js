/** Ponto de entrada: carrega dados, monta cabecalho/navegacao e roteia telas. */
import * as taco from './taco.js';
import { estado, carregarEstado, temPerfil, atualizarDiaSistema } from './estado.js';
import { esc, icone, hoje, somarDias, deISO, diaCurto, rotuloData } from './ui.js';
import { renderHoje } from './views/hoje.js';
import { renderSemana } from './views/semana.js';
import { renderTreino } from './views/treino.js';
import { renderAjustes, abrirPerfil } from './views/ajustes.js';
import { abrirRegistro } from './views/registrar.js';
import { avisarMissaoPendente, conferirSubidaDeNivel } from './views/sistema.js';

const cabecalho = document.getElementById('cabecalho');
const tela = document.getElementById('tela');
const navegacao = document.getElementById('navegacao');

let rota = 'hoje';
let faixaFim = hoje();

// A ordem importa: renderNav monta ABAS[0], ABAS[1], o botao +, ABAS[2], ABAS[3].
const ABAS = [
  { id: 'hoje', rotulo: 'Dia', icone: 'hoje' },
  { id: 'treino', rotulo: 'Treino', icone: 'treino' },
  { id: 'semana', rotulo: 'Relatorio', icone: 'semana' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: 'ajustes' },
];

const TITULOS = { treino: 'Treino', semana: 'Relatorio', ajustes: 'Ajustes' };

/* --- Cabecalho ------------------------------------------------------------ */
function renderCabecalho() {
  if (rota !== 'hoje') {
    cabecalho.innerHTML = `<div class="cab-linha"><div class="cab-titulo">${esc(TITULOS[rota])}</div></div>`;
    return;
  }

  const dias = Array.from({ length: 7 }, (_, i) => somarDias(faixaFim, i - 6));
  cabecalho.innerHTML = `
    <div class="cab-linha">
      <button class="btn btn-fantasma btn-min" data-semana="-1" aria-label="Semana anterior">&#8592;</button>
      <div style="text-align:center;line-height:1.2">
        <div class="cab-titulo">${esc(rotuloData(estado.dia))}</div>
        <div class="cab-sub">${esc(deISO(estado.dia).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }))}</div>
      </div>
      <button class="btn btn-fantasma btn-min" data-semana="1" aria-label="Proxima semana"
        ${faixaFim >= hoje() ? 'disabled' : ''}>&#8594;</button>
    </div>
    <div class="dias">
      ${dias.map((d) => `
        <button class="dia${d === hoje() ? ' hoje' : ''}" data-dia="${d}"
                aria-pressed="${d === estado.dia}" ${d > hoje() ? 'disabled' : ''}>
          <small>${diaCurto(d)}</small>
          <b>${deISO(d).getDate()}</b>
        </button>`).join('')}
    </div>`;

  cabecalho.querySelectorAll('[data-dia]').forEach((b) => {
    b.onclick = () => { estado.dia = b.dataset.dia; render(); };
  });
  cabecalho.querySelectorAll('[data-semana]').forEach((b) => {
    b.onclick = () => {
      const novo = somarDias(faixaFim, 7 * Number(b.dataset.semana));
      faixaFim = novo > hoje() ? hoje() : novo;
      if (estado.dia > faixaFim || estado.dia < somarDias(faixaFim, -6)) estado.dia = faixaFim;
      render();
    };
  });
}

/* --- Navegacao ------------------------------------------------------------ */
function renderNav() {
  const botao = (a) => `
    <button class="nav-btn" data-rota="${a.id}" ${rota === a.id ? 'aria-current="page"' : ''}>
      ${icone(a.icone)}<span>${esc(a.rotulo)}</span>
    </button>`;

  navegacao.innerHTML = `
    ${botao(ABAS[0])}${botao(ABAS[1])}
    <div class="nav-add">
      <button data-registrar aria-label="Registrar refeicao">${icone('mais', 24)}</button>
    </div>
    ${botao(ABAS[2])}${botao(ABAS[3])}`;

  navegacao.querySelectorAll('[data-rota]').forEach((b) => {
    b.onclick = () => { rota = b.dataset.rota; render(); };
  });
  navegacao.querySelector('[data-registrar]').onclick = () => {
    abrirRegistro({ dia: estado.dia, aoSalvar: render });
  };
}

/* --- Roteamento ----------------------------------------------------------- */
async function render() {
  renderCabecalho();
  renderNav();
  tela.innerHTML = '<div class="carregando"><span class="giro"></span>Carregando...</div>';
  try {
    // o dia em foco e o unico que a interface consegue alterar; refazer so ele
    // mantem o historico do Sistema em dia sem reler o banco inteiro
    await atualizarDiaSistema(estado.dia);

    if (rota === 'hoje') await renderHoje(tela, render);
    else if (rota === 'treino') await renderTreino(tela, render);
    else if (rota === 'semana') await renderSemana(tela, render);
    else if (rota === 'ajustes') await renderAjustes(tela, render);
  } catch (e) {
    console.error(e);
    tela.innerHTML = `<p class="vazio">Algo deu errado ao montar a tela.<br><small>${esc(e.message)}</small></p>`;
    return;
  }
  await conferirSubidaDeNivel();
}

/* --- Inicializacao -------------------------------------------------------- */
async function iniciar() {
  // pede armazenamento persistente: sem isso o navegador pode despejar o
  // diario inteiro quando o aparelho ficar sem espaco
  navigator.storage?.persist?.().catch(() => { /* segue sem garantia */ });

  try {
    await taco.carregar();
  } catch (e) {
    tela.innerHTML = `<p class="vazio">Nao consegui carregar a tabela nutricional.<br><small>${esc(e.message)}</small></p>`;
    return;
  }

  await carregarEstado();

  if (!temPerfil()) {
    renderNav();
    abrirPerfil({ primeiraVez: true, aoConcluir: render });
    return;
  }
  await render();
  await avisarMissaoPendente();
}

// vira o dia sozinho se o app ficar aberto durante a madrugada
setInterval(() => {
  if (rota === 'hoje' && estado.dia !== hoje() && faixaFim < hoje()) {
    faixaFim = hoje();
    estado.dia = hoje();
    render();
  }
}, 60_000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* funciona sem offline */ });
  });
}

iniciar();
