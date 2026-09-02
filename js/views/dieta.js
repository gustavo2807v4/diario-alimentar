/**
 * Dieta: o cardapio planejado de cada refeicao.
 *
 * Sem IA e sem aritmetica nova. Os itens sao os mesmos da TACO que o resto do
 * app usa e as somas saem de somarItens(), entao o cardapio herda de graca a
 * garantia de que o numero na tela e o numero da tabela.
 *
 * Duas coisas saem daqui: ver se o dia planejado fecha as suas metas antes de
 * comer, e registrar a refeicao inteira em um toque quando comer.
 */
import * as db from '../db.js';
import * as taco from '../taco.js';
import { estado, atualizarDiaSistema } from '../estado.js';
import { resolverItem, reescalarItem, somarItens, REFEICOES } from '../nutri.js';
import { esc, n0, n1, hoje, icone, aviso, abrirFolha, confirmar } from '../ui.js';

const ORDEM = ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia'];

export async function renderDieta(host, recarregar) {
  const cardapio = await db.todoCardapio();
  const porRefeicao = new Map(cardapio.map((c) => [c.id, c]));
  const planejadas = ORDEM.map((k) => porRefeicao.get(k)).filter(Boolean);
  const total = somarItens(planejadas.flatMap((c) => c.itens || []));
  const m = estado.metas;

  host.innerHTML = `
    ${planejadas.length ? `
      <section class="sis">
        <div class="sis-int">
          <div class="sis-marca"><span>Dia planejado</span>
            <span>${planejadas.length} de 6 refeicoes</span></div>
          ${linhaMeta('Calorias', total.kcal, m.kcal, 'kcal')}
          ${linhaMeta('Proteina', total.prot, m.prot, 'g')}
          ${linhaMeta('Carboidrato', total.carb, m.carb, 'g')}
          ${linhaMeta('Gordura', total.gord, m.gord, 'g')}
          <p class="sis-nota">Isso e o que o cardapio soma, nao o que voce comeu.
          O diario do dia continua sendo o que vale.</p>
        </div>
      </section>` : `
      <p class="vazio">Nenhuma refeicao planejada.<br>
      Monte o cardapio e registre cada refeicao em um toque.</p>`}

    ${ORDEM.map((chave) => cartaoRefeicao(chave, porRefeicao.get(chave))).join('')}
  `;

  host.querySelectorAll('[data-editar-ref]').forEach((b) => {
    b.onclick = () => abrirEditor(b.dataset.editarRef, porRefeicao.get(b.dataset.editarRef), recarregar);
  });

  host.querySelectorAll('[data-registrar-ref]').forEach((b) => {
    b.onclick = async () => {
      const c = porRefeicao.get(b.dataset.registrarRef);
      if (!c?.itens?.length) return;
      const dia = hoje();
      await db.salvarEntrada({
        id: db.uid(), data: dia, ts: Date.now(), tipo: 'refeicao',
        refeicao: c.id, titulo: c.nome || REFEICOES[c.id], foto: null,
        itens: c.itens, total: somarItens(c.itens), origemCardapio: c.id,
      });
      await atualizarDiaSistema(dia);
      aviso(`${c.nome || REFEICOES[c.id]} registrado`);
      recarregar();
    };
  });
}

function linhaMeta(nome, valor, meta, unidade) {
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  return `
    <div class="sis-legenda" style="margin:0 0 4px">
      <span>${esc(nome)}</span>
      <span><b>${n0(valor)}</b> / ${n0(meta)} ${esc(unidade)}</span>
    </div>
    <div class="sis-barra" style="margin-bottom:10px"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

function cartaoRefeicao(chave, c) {
  const itens = c?.itens || [];
  const total = itens.length ? somarItens(itens) : null;

  return `
    <section class="cartao">
      <div class="cartao-tit">
        <h2>${esc(REFEICOES[chave])}</h2>
        <span class="item-sub">${total ? `${n0(total.kcal)} kcal` : 'sem plano'}</span>
      </div>

      ${itens.length ? `
        <div class="nutri-grade" style="grid-template-columns:1fr;gap:5px;margin-bottom:12px">
          ${itens.map((it) => `
            <div class="nutri-item">
              <span>${esc(it.nome)}</span>
              <b>${n0(it.gramas)} g &middot; ${n0(it.kcal)} kcal</b>
            </div>`).join('')}
        </div>
        <div class="rev-macros" style="margin:0 0 12px">
          <span>P ${n1(total.prot)} g</span><span>C ${n1(total.carb)} g</span>
          <span>G ${n1(total.gord)} g</span><span>Fibra ${n1(total.fibra)} g</span>
        </div>` : ''}

      <div class="linha-botoes">
        <button class="btn" data-editar-ref="${esc(chave)}">${itens.length ? 'Editar' : 'Montar'}</button>
        ${itens.length ? `<button class="btn btn-forte" data-registrar-ref="${esc(chave)}">
          ${icone('mais', 15)} Registrar</button>` : ''}
      </div>
    </section>`;
}

/* --- Editor do cardapio --------------------------------------------------- */

function abrirEditor(chave, cardapioAtual, recarregar) {
  const c = {
    id: chave,
    refeicao: chave,
    nome: cardapioAtual?.nome || REFEICOES[chave],
    itens: (cardapioAtual?.itens || []).map((it) => ({ ...it })),
  };

  const { corpo, fechar } = abrirFolha(REFEICOES[chave], '<div data-conteudo></div>');
  const alvo = corpo.querySelector('[data-conteudo]');

  function render() {
    const total = somarItens(c.itens);
    alvo.innerHTML = `
      <div class="campo">
        <label for="nome-ref">Nome</label>
        <input type="text" id="nome-ref" value="${esc(c.nome)}" maxlength="40">
      </div>

      <div class="grupo-tit"><h3>Alimentos</h3><span>${c.itens.length}</span></div>
      ${c.itens.length ? c.itens.map(linhaItem).join('') : '<p class="vazio">Nenhum alimento ainda.</p>'}

      <button class="btn btn-largo" data-add style="margin:4px 0 16px">+ Adicionar da TACO</button>

      <div class="cartao" style="margin-bottom:14px">
        <div class="cartao-tit"><h2>Total planejado</h2>
          <b style="font-family:var(--mono);font-size:1.1rem">${n0(total.kcal)} kcal</b></div>
        <div class="rev-macros" style="margin:0">
          <span>P ${n1(total.prot)} g</span><span>C ${n1(total.carb)} g</span>
          <span>G ${n1(total.gord)} g</span><span>Fibra ${n1(total.fibra)} g</span>
        </div>
      </div>

      <div class="linha-botoes">
        ${cardapioAtual ? '<button class="btn btn-perigo" data-excluir>Remover do plano</button>'
                        : '<button class="btn" data-cancelar>Cancelar</button>'}
        <button class="btn btn-forte" data-salvar>Salvar</button>
      </div>`;
    ligar();
  }

  function ligar() {
    // ligado ao objeto porque render() reconstroi tudo a cada item adicionado
    alvo.querySelector('#nome-ref').oninput = (ev) => { c.nome = ev.target.value; };

    alvo.querySelectorAll('[data-gramas]').forEach((inp) => {
      inp.onchange = () => {
        const i = Number(inp.dataset.gramas);
        c.itens[i] = reescalarItem(c.itens[i], inp.value);
        render();
      };
    });

    alvo.querySelectorAll('[data-remover]').forEach((b) => {
      b.onclick = () => { c.itens.splice(Number(b.dataset.remover), 1); render(); };
    });

    alvo.querySelector('[data-add]').onclick = () => {
      abrirBuscaTaco((alimento, gramas) => {
        c.itens.push(resolverItem({
          nome: alimento.nome, quantidade_descrita: `${gramas} g`,
          gramas, taco_id: alimento.id, confianca_taco: 'alta',
        }));
        render();
      });
    };

    alvo.querySelector('[data-cancelar]')?.addEventListener('click', () => fechar());

    alvo.querySelector('[data-excluir]')?.addEventListener('click', async () => {
      if (await confirmar('Remover do plano', `${REFEICOES[chave]} sai do cardapio. Os registros ja feitos continuam no diario.`, 'Remover')) {
        await db.apagarCardapio(chave);
        fechar();
        aviso('Removido do plano');
        recarregar();
      }
    });

    alvo.querySelector('[data-salvar]').onclick = async () => {
      c.nome = alvo.querySelector('#nome-ref').value.trim() || REFEICOES[chave];
      if (!c.itens.length) return aviso('Adicione pelo menos um alimento.', 'erro');
      await db.salvarCardapio({ ...c, total: somarItens(c.itens) });
      fechar();
      aviso('Cardapio salvo');
      recarregar();
    };
  }

  render();
}

function linhaItem(it, i) {
  return `
    <div class="rev-item">
      <div class="rev-topo">
        <div style="min-width:0">
          <div class="rev-nome">${esc(it.nome)}</div>
          <div class="rev-fonte">
            <span class="tag ${it.fonte === 'taco' ? 'tag-taco' : 'tag-ia'}">${it.fonte === 'taco' ? 'TACO' : 'estimado'}</span>
          </div>
        </div>
        <button class="btn btn-fantasma btn-min" data-remover="${i}"
                aria-label="Remover ${esc(it.nome)}">${icone('lixo', 15)}</button>
      </div>
      <div class="rev-ctrl">
        <input type="number" min="0" step="5" value="${Math.round(it.gramas)}" data-gramas="${i}"
               aria-label="Gramas de ${esc(it.nome)}">
        <span class="un">g</span>
        <span class="kcal">${n0(it.kcal)} kcal</span>
      </div>
    </div>`;
}

/* --- Busca na TACO --------------------------------------------------------
   Uma copia enxuta do seletor do registrar.js. Duplicar umas 30 linhas custa
   menos do que mexer no fluxo de registro, que esta estavel.             */

function abrirBuscaTaco(aoEscolher) {
  const { corpo, fechar } = abrirFolha('Buscar na tabela TACO', `
    <div class="campo">
      <input type="text" id="q-dieta" placeholder="arroz, feijao, frango..." autocomplete="off">
    </div>
    <div class="campo"><label for="g-dieta">Quantidade (g)</label>
      <input type="number" id="g-dieta" min="0" step="10" value="100"></div>
    <div id="res-dieta"></div>
  `);

  const q = corpo.querySelector('#q-dieta');
  const res = corpo.querySelector('#res-dieta');

  const listar = () => {
    if (!q.value.trim()) { res.innerHTML = '<p class="vazio">Digite para buscar.</p>'; return; }
    const achados = taco.buscar(q.value, 25);
    if (!achados.length) { res.innerHTML = '<p class="vazio">Nada encontrado.</p>'; return; }
    res.innerHTML = achados.map((a) => `
      <button class="item" data-id="${a.id}">
        <span class="item-txt">
          <span class="item-nome">${esc(a.nome)}</span>
          <span class="item-sub">P ${n1(a.prot)} C ${n1(a.carb)} G ${n1(a.gord)} por 100 g</span>
        </span>
        <span class="item-kcal">${n0(a.kcal)}<small> kcal</small></span>
      </button>`).join('');

    res.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = () => {
        const alimento = taco.porId(b.dataset.id);
        const gramas = Math.max(0, Number(corpo.querySelector('#g-dieta').value) || 100);
        fechar();
        aoEscolher(alimento, gramas);
      };
    });
  };

  q.oninput = listar;
  listar();
  q.focus();
}
