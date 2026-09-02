/**
 * Aba Treino: o check-in de hoje, os planos que voce monta e o atalho para a
 * dieta.
 *
 * Planos e registro sao coisas separadas de proposito. Ao concluir o treino o
 * app COPIA os exercicios do plano para o registro do dia - copia, nao aponta.
 * Assim voce ajusta a carga que realmente fez, e mexer no plano semanas depois
 * nao reescreve o que ja aconteceu.
 */
import * as db from '../db.js';
import * as gemini from '../gemini.js';
import { estado, salvarTreinoDoDia } from '../estado.js';
import {
  esc, hoje, deISO, icone, aviso, abrirFolha, confirmar,
} from '../ui.js';
import { renderDieta } from './dieta.js';

export async function renderTreino(host, recarregar) {
  const dia = hoje();
  const [planos, treino] = await Promise.all([db.todosPlanos(), db.pegarTreino(dia)]);

  host.innerHTML = `
    ${painelDoDia(dia, planos, treino)}

    <div class="grupo-tit"><h3>Meus treinos</h3><span>${planos.length}</span></div>
    ${planos.length ? planos.map(cartaoPlano).join('') : `
      <p class="vazio">Nenhum treino montado ainda.<br>
      Crie um do zero ou peca para a IA montar a divisao inteira.</p>`}

    <div class="linha-botoes" style="margin:10px 0 4px">
      <button class="btn" data-novo>${icone('mais', 15)} Novo</button>
      <button class="btn" data-ia>${icone('raio', 15)} Montar com a IA</button>
    </div>

    <div class="grupo-tit"><h3>Dieta</h3></div>
    <div data-bloco-dieta></div>
  `;

  await renderDieta(host.querySelector('[data-bloco-dieta]'), recarregar);
  ligar(host, { dia, planos, treino, recarregar });
}

/* --- Check-in do dia ------------------------------------------------------ */

function painelDoDia(dia, planos, treino) {
  const feito = Boolean(treino?.concluido);
  const exercicios = treino?.exercicios || [];

  return `
    <section class="sis">
      <div class="sis-int">
        <div class="sis-marca"><span>Treino de hoje</span>
          <span>${esc(deISO(dia).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))}</span></div>

        ${planos.length ? `
          <div class="campo" style="margin-bottom:12px">
            <select data-escolher-plano aria-label="Treino do dia">
              <option value="">Escolher treino...</option>
              ${planos.map((p) => `<option value="${esc(p.id)}"${p.id === treino?.planoId ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}
            </select>
          </div>` : `
          <p class="sis-nota" style="margin:0 0 12px">Monte um treino abaixo para poder registrar por aqui.</p>`}

        <button class="sis-btn largo${feito ? ' forte' : ''}" data-concluir>
          ${feito ? '&#10003; Treino concluido' : 'Marcar como concluido'}
        </button>

        ${feito && exercicios.length ? `
          <div class="sis-sec">O que voce fez</div>
          ${exercicios.map(linhaFeita).join('')}
          <p class="sis-nota">Ajuste a carga para o que saiu de verdade. Isso fica no
          registro de hoje e nao altera o plano.</p>` : ''}
      </div>
    </section>`;
}

function linhaFeita(ex, i) {
  return `
    <div class="ex-feito">
      <span class="ex-feito-nome">${esc(ex.nome)}
        <small>${esc(ex.series)} x ${esc(ex.reps)}</small></span>
      <input type="text" data-carga-feita="${i}" value="${esc(ex.carga || '')}"
             placeholder="carga" aria-label="Carga de ${esc(ex.nome)}">
    </div>`;
}

/* --- Lista de planos ------------------------------------------------------ */

function cartaoPlano(p) {
  const n = (p.exercicios || []).length;
  const resumo = (p.exercicios || []).slice(0, 3).map((e) => e.nome).filter(Boolean).join(', ');
  return `
    <button class="item" data-plano="${esc(p.id)}">
      <span class="item-emoji" aria-hidden="true">${icone('treino', 20)}</span>
      <span class="item-txt">
        <span class="item-nome">${esc(p.nome || 'Sem nome')}</span>
        <span class="item-sub">${n} ${n === 1 ? 'exercicio' : 'exercicios'}${resumo ? ` &middot; ${esc(resumo)}` : ''}</span>
      </span>
      <span class="item-kcal" aria-hidden="true">${icone('seta', 16)}</span>
    </button>`;
}

/* --- Ligacoes ------------------------------------------------------------- */

function ligar(host, { dia, planos, treino, recarregar }) {
  const seletor = host.querySelector('[data-escolher-plano]');

  host.querySelector('[data-concluir]').onclick = async () => {
    const jaFeito = Boolean(treino?.concluido);
    if (jaFeito) {
      await salvarTreinoDoDia(dia, { concluido: false });
      aviso('Treino desmarcado');
      return recarregar();
    }
    const plano = planos.find((p) => p.id === seletor?.value);
    await salvarTreinoDoDia(dia, {
      concluido: true,
      planoId: plano?.id || null,
      tipo: plano?.nome || treino?.tipo || '',
      // copia, nao referencia: o registro do dia e imutavel em relacao ao plano
      exercicios: (plano?.exercicios || []).map((e) => ({ ...e })),
    });
    aviso('Treino concluido');
    recarregar();
  };

  seletor?.addEventListener('change', async () => {
    const plano = planos.find((p) => p.id === seletor.value);
    if (treino?.concluido) {
      await salvarTreinoDoDia(dia, {
        planoId: plano?.id || null,
        tipo: plano?.nome || '',
        exercicios: (plano?.exercicios || []).map((e) => ({ ...e })),
      });
      recarregar();
    }
  });

  host.querySelectorAll('[data-carga-feita]').forEach((inp) => {
    inp.onchange = async () => {
      const exercicios = (treino?.exercicios || []).map((e) => ({ ...e }));
      const i = Number(inp.dataset.cargaFeita);
      if (!exercicios[i]) return;
      exercicios[i].carga = inp.value.trim();
      await salvarTreinoDoDia(dia, { exercicios });
    };
  });

  host.querySelectorAll('[data-plano]').forEach((b) => {
    b.onclick = () => {
      const plano = planos.find((p) => p.id === b.dataset.plano);
      if (plano) abrirEditor(plano, recarregar);
    };
  });

  host.querySelector('[data-novo]').onclick = () => abrirEditor(db.planoVazio(), recarregar, true);
  host.querySelector('[data-ia]').onclick = () => abrirMontagemIA(recarregar);
}

/* --- Editor de plano ------------------------------------------------------ */

export function abrirEditor(planoOriginal, recarregar, novo = false) {
  const p = { ...planoOriginal, exercicios: (planoOriginal.exercicios || []).map((e) => ({ ...e })) };

  const { corpo, fechar } = abrirFolha(novo ? 'Novo treino' : 'Editar treino', '<div data-conteudo></div>');
  const alvo = corpo.querySelector('[data-conteudo]');

  function render() {
    alvo.innerHTML = `
      <div class="campo">
        <label for="nome-plano">Nome do treino</label>
        <input type="text" id="nome-plano" value="${esc(p.nome)}" placeholder="Peito e triceps" maxlength="40">
      </div>

      <div class="grupo-tit"><h3>Exercicios</h3><span>${p.exercicios.length}</span></div>
      ${p.exercicios.length ? p.exercicios.map(linhaExercicio).join('')
        : '<p class="vazio">Nenhum exercicio ainda.</p>'}

      <button class="btn btn-largo" data-add-ex style="margin:4px 0 16px">+ Adicionar exercicio</button>

      <div class="linha-botoes">
        ${novo ? '<button class="btn" data-cancelar>Cancelar</button>'
               : '<button class="btn btn-perigo" data-excluir>Excluir</button>'}
        <button class="btn btn-forte" data-salvar>Salvar</button>
      </div>`;
    ligarEditor();
  }

  function ligarEditor() {
    // o nome precisa estar ligado ao objeto: render() reconstroi o editor
    // inteiro a cada exercicio adicionado e engoliria o que voce digitou
    alvo.querySelector('#nome-plano').oninput = (ev) => { p.nome = ev.target.value; };

    alvo.querySelectorAll('[data-campo]').forEach((inp) => {
      inp.oninput = () => {
        const { campo, i } = inp.dataset;
        p.exercicios[Number(i)][campo] = inp.value;
        if (campo === 'carga') p.exercicios[Number(i)].sugerido = false;
      };
    });

    alvo.querySelectorAll('[data-remover-ex]').forEach((b) => {
      b.onclick = () => { p.exercicios.splice(Number(b.dataset.removerEx), 1); render(); };
    });

    alvo.querySelectorAll('[data-mover]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.i);
        const j = i + Number(b.dataset.mover);
        if (j < 0 || j >= p.exercicios.length) return;
        [p.exercicios[i], p.exercicios[j]] = [p.exercicios[j], p.exercicios[i]];
        render();
      };
    });

    alvo.querySelector('[data-add-ex]').onclick = () => {
      p.exercicios.push(db.exercicioVazio());
      render();
      alvo.querySelector(`[data-campo="nome"][data-i="${p.exercicios.length - 1}"]`)?.focus();
    };

    alvo.querySelector('[data-cancelar]')?.addEventListener('click', () => fechar());

    alvo.querySelector('[data-excluir]')?.addEventListener('click', async () => {
      if (await confirmar('Excluir treino', `"${p.nome || 'Sem nome'}" sai da lista. Os registros de dias em que voce ja fez esse treino continuam intactos.`, 'Excluir')) {
        await db.apagarPlano(p.id);
        fechar();
        aviso('Treino excluido');
        recarregar();
      }
    });

    alvo.querySelector('[data-salvar]').onclick = async () => {
      p.nome = alvo.querySelector('#nome-plano').value.trim();
      if (!p.nome) return aviso('De um nome ao treino.', 'erro');
      if (!p.exercicios.some((e) => e.nome.trim())) return aviso('Adicione pelo menos um exercicio.', 'erro');
      p.exercicios = p.exercicios.filter((e) => e.nome.trim());
      await db.salvarPlano(p);
      fechar();
      aviso('Treino salvo');
      recarregar();
    };
  }

  render();
}

function linhaExercicio(ex, i) {
  return `
    <div class="ex-linha">
      <div class="ex-topo">
        <input type="text" data-campo="nome" data-i="${i}" value="${esc(ex.nome)}"
               placeholder="Supino reto" aria-label="Nome do exercicio ${i + 1}">
        <button class="btn btn-fantasma btn-min" data-remover-ex="${i}"
                aria-label="Remover ${esc(ex.nome || 'exercicio')}">${icone('lixo', 15)}</button>
      </div>
      <div class="ex-ctrl">
        <label>Series<input type="number" min="1" max="20" data-campo="series" data-i="${i}" value="${esc(ex.series)}"></label>
        <label>Reps<input type="text" data-campo="reps" data-i="${i}" value="${esc(ex.reps)}" placeholder="8-12"></label>
        <label>Carga<input type="text" data-campo="carga" data-i="${i}" value="${esc(ex.carga || '')}" placeholder="60 kg"></label>
      </div>
      <div class="ex-pe">
        ${ex.sugerido ? '<span class="tag tag-sugerido">sugerido</span>' : ''}
        <button class="btn btn-fantasma btn-min" data-mover="-1" data-i="${i}" aria-label="Subir">&#8593;</button>
        <button class="btn btn-fantasma btn-min" data-mover="1" data-i="${i}" aria-label="Descer">&#8595;</button>
      </div>
    </div>`;
}

/* --- Montagem pela IA -----------------------------------------------------
   Mesma filosofia da revisao de refeicao: o modelo propoe, voce confirma.
   Nada entra no banco sem passar pela sua vista.                          */

function abrirMontagemIA(recarregar) {
  const { corpo, fechar } = abrirFolha('Montar treino com a IA', `
    <div class="campo">
      <label for="ia-objetivo">Objetivo</label>
      <input type="text" id="ia-objetivo" placeholder="hipertrofia, foco em peito e costas" maxlength="120">
    </div>
    <div class="campo">
      <label for="ia-dias">Dias por semana</label>
      <input type="number" id="ia-dias" min="1" max="7" value="4">
    </div>
    <div class="campo">
      <label for="ia-equip">Equipamento disponivel</label>
      <input type="text" id="ia-equip" value="academia completa" maxlength="120">
    </div>
    <div class="campo">
      <label for="ia-obs">Observacoes</label>
      <textarea id="ia-obs" rows="2" placeholder="lesao no ombro, sem agachamento livre, 1h por sessao"></textarea>
    </div>
    <button class="btn btn-forte btn-largo" data-montar>${icone('raio', 16)} Montar</button>
    <p class="dica">A carga que ela sugerir vem marcada como <b>sugerido</b>. E chute
    educado, nao prescricao &mdash; confira na primeira serie e ajuste.</p>
  `);

  corpo.querySelector('[data-montar]').onclick = async () => {
    if (!estado.config.apiKey) return aviso('Configure sua chave da API em Ajustes.', 'erro');

    const botao = corpo.querySelector('[data-montar]');
    botao.disabled = true;
    botao.innerHTML = '<span class="giro"></span> Montando...';

    try {
      const bruto = await gemini.montarTreino({
        objetivo: corpo.querySelector('#ia-objetivo').value.trim(),
        dias: Number(corpo.querySelector('#ia-dias').value) || 4,
        equipamento: corpo.querySelector('#ia-equip').value.trim(),
        observacoes: corpo.querySelector('#ia-obs').value.trim(),
        perfil: estado.perfil,
        config: estado.config,
      });
      fechar();
      abrirRevisaoIA(bruto, recarregar);
    } catch (e) {
      botao.disabled = false;
      botao.innerHTML = `${icone('raio', 16)} Montar`;
      aviso(e.message, 'erro');
    }
  };
}

function abrirRevisaoIA(bruto, recarregar) {
  const propostos = (bruto.treinos || []).map((t, ordem) => ({
    ...db.planoVazio(t.nome || `Treino ${ordem + 1}`),
    ordem: Date.now() + ordem,
    exercicios: (t.exercicios || []).map((e) => ({
      ...db.exercicioVazio(),
      nome: e.nome || '',
      series: Number(e.series) || 3,
      reps: String(e.reps || '8-12'),
      carga: String(e.carga || ''),
      obs: e.observacao || '',
      sugerido: true,
    })),
  }));

  const escolhidos = new Set(propostos.map((p) => p.id));

  const { corpo, fechar } = abrirFolha('Conferir o treino proposto', `
    ${bruto.observacao ? `<div class="aviso-caixa">${esc(bruto.observacao)}</div>` : ''}
    ${!propostos.length ? '<p class="vazio">A IA nao devolveu nenhum treino.</p>' : ''}

    ${propostos.map((p) => `
      <div class="cartao" style="margin-bottom:10px">
        <label style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
          <input type="checkbox" data-usar="${esc(p.id)}" style="width:auto" checked>
          <b>${esc(p.nome)}</b>
        </label>
        <table class="tabela">
          <thead><tr><th>Exercicio</th><th>Series</th><th>Reps</th><th>Carga</th></tr></thead>
          <tbody>
            ${p.exercicios.map((e) => `
              <tr><td>${esc(e.nome)}</td><td>${esc(e.series)}</td>
                  <td>${esc(e.reps)}</td><td>${esc(e.carga || '&mdash;')}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`).join('')}

    ${propostos.length ? `
      <div class="linha-botoes">
        <button class="btn" data-descartar>Descartar</button>
        <button class="btn btn-forte" data-salvar-ia>Salvar selecionados</button>
      </div>
      <p class="dica">Depois de salvar, cada treino continua editavel &mdash; troque
      exercicio, serie e carga a vontade.</p>` : ''}
  `);

  corpo.querySelectorAll('[data-usar]').forEach((c) => {
    c.onchange = () => (c.checked ? escolhidos.add(c.dataset.usar) : escolhidos.delete(c.dataset.usar));
  });

  corpo.querySelector('[data-descartar]')?.addEventListener('click', () => fechar());

  corpo.querySelector('[data-salvar-ia]')?.addEventListener('click', async () => {
    const salvar = propostos.filter((p) => escolhidos.has(p.id));
    if (!salvar.length) return aviso('Escolha pelo menos um treino.', 'erro');
    for (const p of salvar) await db.salvarPlano(p);
    fechar();
    aviso(`${salvar.length} ${salvar.length === 1 ? 'treino salvo' : 'treinos salvos'}`);
    recarregar();
  });
}
