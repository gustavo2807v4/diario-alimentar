/**
 * Fluxo de registro: descrever/fotografar -> revisar -> salvar.
 *
 * A tela de revisao e o coracao do app. O modelo entrega um palpite; quem
 * confirma e a pessoa. Editar as gramas recalcula tudo localmente, sem nova
 * chamada de API.
 */
import * as db from '../db.js';
import * as taco from '../taco.js';
import * as gemini from '../gemini.js';
import { estado } from '../estado.js';
import {
  resolverItem, reescalarItem, trocarPorTaco, somarItens, REFEICOES,
} from '../nutri.js';
import { esc, n0, n1, aviso, abrirFolha, confirmar, icone } from '../ui.js';

/** Sugere a refeicao a partir do horario, quando o modelo nao opina. */
function refeicaoPorHora(d = new Date()) {
  const h = d.getHours();
  if (h < 10) return 'cafe';
  if (h < 12) return 'lanche_manha';
  if (h < 15) return 'almoco';
  if (h < 18) return 'lanche_tarde';
  if (h < 22) return 'jantar';
  return 'ceia';
}

/* ========================================================================== */
/* Tela 1 - entrada                                                            */
/* ========================================================================== */

export async function abrirRegistro({ dia, aoSalvar }) {
  const favoritos = await db.todosFavoritos();

  const { corpo, fechar } = abrirFolha('Registrar', `
    <div class="campo">
      <textarea id="txt" rows="3" placeholder="Ex.: 2 ovos mexidos, 1 fatia de pao integral e um cafe com leite"></textarea>
      <div class="dica">Descreva com quantidades quando souber &mdash; melhora bastante a estimativa.</div>
    </div>

    <div id="previa" hidden style="margin-bottom:12px">
      <img alt="Previa da foto" style="width:100%;max-height:200px;object-fit:cover;border-radius:var(--r);display:block">
      <button class="btn btn-fantasma btn-min" data-tirar-foto style="margin-top:6px">Remover foto</button>
    </div>

    <div class="linha-botoes" style="margin-bottom:12px">
      <button class="btn" data-camera>${icone('camera', 17)} Camera</button>
      <button class="btn" data-galeria>Galeria</button>
    </div>

    <button class="btn btn-forte btn-largo" data-analisar>${icone('raio', 17)} Analisar e registrar</button>

    <div class="chips" style="margin-top:18px">
      <button class="chip" data-agua="250">+250 ml de agua</button>
      <button class="chip" data-agua="500">+500 ml</button>
      <button class="chip" data-buscar>Buscar na TACO</button>
    </div>

    ${favoritos.length ? `
      <div class="grupo-tit"><h3>Favoritos</h3></div>
      <div class="chips" id="favs">
        ${favoritos.slice(0, 12).map((f) => `
          <button class="chip" data-fav="${esc(f.id)}">${icone('estrela', 13)} ${esc(f.titulo)}
            <span style="color:var(--muted);margin-left:4px">${n0(f.total.kcal)}</span></button>`).join('')}
      </div>` : ''}

    <input type="file" accept="image/*" capture="environment" hidden id="in-camera">
    <input type="file" accept="image/*" hidden id="in-galeria">
  `);

  let foto = null; // { blob, base64, mime }

  const previa = corpo.querySelector('#previa');
  const mostrarPrevia = () => {
    if (!foto) { previa.hidden = true; return; }
    previa.hidden = false;
    previa.querySelector('img').src = URL.createObjectURL(foto.blob);
  };

  const receber = async (arquivo) => {
    if (!arquivo) return;
    try {
      foto = await gemini.comprimirImagem(arquivo);
      mostrarPrevia();
    } catch (e) { aviso(e.message, 'erro'); }
  };

  corpo.querySelector('#in-camera').onchange = (e) => receber(e.target.files[0]);
  corpo.querySelector('#in-galeria').onchange = (e) => receber(e.target.files[0]);
  corpo.querySelector('[data-camera]').onclick = () => corpo.querySelector('#in-camera').click();
  corpo.querySelector('[data-galeria]').onclick = () => corpo.querySelector('#in-galeria').click();
  previa.querySelector('[data-tirar-foto]').onclick = () => { foto = null; mostrarPrevia(); };

  // agua em um toque
  corpo.querySelectorAll('[data-agua]').forEach((b) => {
    b.onclick = async () => {
      await db.salvarEntrada({
        id: db.uid(), data: dia, ts: Date.now(), tipo: 'agua', titulo: 'Agua', ml: Number(b.dataset.agua),
      });
      fechar();
      aviso(`+${b.dataset.agua} ml de agua`);
      aoSalvar?.();
    };
  });

  corpo.querySelector('[data-buscar]').onclick = () => {
    fechar();
    abrirBuscaManual({ dia, aoSalvar });
  };

  corpo.querySelectorAll('[data-fav]').forEach((b) => {
    b.onclick = async () => {
      const fav = favoritos.find((f) => f.id === b.dataset.fav);
      if (!fav) return;
      await db.salvarEntrada({
        id: db.uid(), data: dia, ts: Date.now(), tipo: 'refeicao',
        refeicao: refeicaoPorHora(), titulo: fav.titulo, foto: null,
        itens: fav.itens, total: somarItens(fav.itens), origemFavorito: fav.id,
      });
      await db.salvarFavorito({ ...fav, usos: (fav.usos || 0) + 1 });
      fechar();
      aviso(`${fav.titulo} registrado`);
      aoSalvar?.();
    };
  });

  corpo.querySelector('[data-analisar]').onclick = async () => {
    const texto = corpo.querySelector('#txt').value.trim();
    if (!texto && !foto) return aviso('Escreva algo ou anexe uma foto.', 'erro');
    if (!estado.config.apiKey) return aviso('Configure sua chave da API em Ajustes.', 'erro');

    const botao = corpo.querySelector('[data-analisar]');
    botao.disabled = true;
    botao.innerHTML = '<span class="giro"></span> Analisando...';

    try {
      const bruto = await gemini.analisar({
        texto,
        imagem: foto ? { base64: foto.base64, mime: foto.mime } : null,
        perfil: estado.perfil,
        config: estado.config,
      });
      fechar();
      abrirRevisao({
        dia,
        aoSalvar,
        entrada: montarEntrada(bruto, dia, foto?.blob || null, texto),
        observacao: bruto.observacao,
      });
    } catch (e) {
      botao.disabled = false;
      botao.innerHTML = `${icone('raio', 17)} Analisar e registrar`;
      aviso(e.message, 'erro');
    }
  };
}

/** Converte a resposta crua do modelo em uma entrada do diario. */
function montarEntrada(bruto, dia, fotoBlob, textoOriginal) {
  const tipo = bruto.tipo || 'refeicao';
  const base = {
    id: db.uid(), data: dia, ts: Date.now(), tipo,
    titulo: bruto.titulo || 'Registro', foto: fotoBlob, texto: textoOriginal || '',
  };

  if (tipo === 'exercicio') return { ...base, kcal: Math.round(Number(bruto.exercicio_kcal) || 0), itens: [] };
  if (tipo === 'agua') return { ...base, ml: Math.round(Number(bruto.agua_ml) || 0), itens: [] };

  const itens = bruto.itens.map(resolverItem);
  return {
    ...base,
    refeicao: REFEICOES[bruto.refeicao] ? bruto.refeicao : refeicaoPorHora(),
    itens,
    total: somarItens(itens),
  };
}

/* ========================================================================== */
/* Tela 2 - revisao                                                            */
/* ========================================================================== */

export function abrirRevisao({ dia, entrada, aoSalvar, observacao, editando = false }) {
  const e = { ...entrada, itens: [...(entrada.itens || [])] };

  const { corpo, fechar } = abrirFolha(editando ? 'Editar registro' : 'Conferir e salvar', '<div data-conteudo></div>');
  const alvo = corpo.querySelector('[data-conteudo]');

  function render() {
    if (e.tipo === 'exercicio') {
      alvo.innerHTML = `
        <div class="campo"><label for="tit">Descricao</label>
          <input type="text" id="tit" value="${esc(e.titulo)}"></div>
        <div class="campo"><label for="gasto">Calorias gastas</label>
          <input type="number" id="gasto" min="0" step="10" value="${Math.round(e.kcal || 0)}"></div>
        ${rodape()}`;
    } else if (e.tipo === 'agua') {
      alvo.innerHTML = `
        <div class="campo"><label for="ml">Agua (ml)</label>
          <input type="number" id="ml" min="0" step="50" value="${Math.round(e.ml || 0)}"></div>
        ${rodape()}`;
    } else {
      const total = somarItens(e.itens);
      e.total = total;
      alvo.innerHTML = `
        ${observacao ? `<div class="aviso-caixa">${esc(observacao)}</div>` : ''}
        ${!e.itens.length ? '<div class="aviso-caixa"><b>Nenhum alimento identificado.</b> Adicione manualmente abaixo.</div>' : ''}

        <div class="campo"><label for="tit">Titulo</label>
          <input type="text" id="tit" value="${esc(e.titulo)}"></div>

        <div class="campo"><label for="ref">Refeicao</label>
          <select id="ref">${Object.entries(REFEICOES).map(([k, v]) =>
            `<option value="${k}"${k === e.refeicao ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>

        <div class="grupo-tit"><h3>Itens</h3><span>${e.itens.length}</span></div>
        <div data-itens>${e.itens.map(itemHTML).join('')}</div>

        <button class="btn btn-largo" data-add style="margin:4px 0 16px">+ Adicionar alimento da TACO</button>

        <div class="cartao" style="margin-bottom:14px">
          <div class="cartao-tit"><h2>Total da refeicao</h2>
            <b style="font-size:1.15rem;font-variant-numeric:tabular-nums">${n0(total.kcal)} kcal</b></div>
          <div class="rev-macros" style="margin:0;font-size:.8rem">
            <span>Proteina <b style="color:var(--ink)">${n1(total.prot)} g</b></span>
            <span>Carbo <b style="color:var(--ink)">${n1(total.carb)} g</b></span>
            <span>Gordura <b style="color:var(--ink)">${n1(total.gord)} g</b></span>
            <span>Fibra <b style="color:var(--ink)">${n1(total.fibra)} g</b></span>
          </div>
        </div>

        <label style="display:flex;gap:9px;align-items:center;font-size:.86rem;color:var(--ink-2);margin-bottom:14px">
          <input type="checkbox" id="fav" style="width:auto" ${e.origemFavorito ? 'checked' : ''}>
          Salvar como favorito para registrar em um toque
        </label>
        ${rodape()}`;
    }
    ligar();
  }

  const rodape = () => `
    <div class="linha-botoes">
      ${editando ? '<button class="btn btn-perigo" data-excluir>Excluir</button>' : '<button class="btn" data-cancelar>Cancelar</button>'}
      <button class="btn btn-forte" data-salvar>Salvar</button>
    </div>`;

  function itemHTML(it, i) {
    return `
      <div class="rev-item" data-i="${i}">
        <div class="rev-topo">
          <div style="min-width:0">
            <div class="rev-nome">${esc(it.nome)}</div>
            <div class="rev-fonte">
              <span class="tag ${it.fonte === 'taco' ? 'tag-taco' : 'tag-ia'}">${it.fonte === 'taco' ? 'TACO' : 'estimado'}</span>
              <small>${esc(it.fonte === 'taco' ? it.tacoNome : 'valores estimados pelo modelo')}</small>
            </div>
          </div>
          <button class="btn btn-fantasma btn-min" data-remover="${i}" aria-label="Remover ${esc(it.nome)}">${icone('lixo', 15)}</button>
        </div>
        <div class="rev-ctrl">
          <input type="number" min="0" step="5" value="${Math.round(it.gramas)}" data-gramas="${i}" aria-label="Gramas de ${esc(it.nome)}">
          <span class="un">g</span>
          <button class="btn btn-fantasma btn-min" data-trocar="${i}">trocar</button>
          <span class="kcal">${n0(it.kcal)} kcal</span>
        </div>
        <div class="rev-macros">
          <span>P ${n1(it.prot)} g</span><span>C ${n1(it.carb)} g</span>
          <span>G ${n1(it.gord)} g</span><span>Fibra ${n1(it.fibra)} g</span>
        </div>
      </div>`;
  }

  function ligar() {
    alvo.querySelectorAll('[data-gramas]').forEach((inp) => {
      inp.onchange = () => {
        const i = Number(inp.dataset.gramas);
        e.itens[i] = reescalarItem(e.itens[i], inp.value);
        render();
      };
    });
    alvo.querySelectorAll('[data-remover]').forEach((b) => {
      b.onclick = () => { e.itens.splice(Number(b.dataset.remover), 1); render(); };
    });
    alvo.querySelectorAll('[data-trocar]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.trocar);
        abrirSeletorTaco(e.itens[i].nome, (alimento) => {
          e.itens[i] = trocarPorTaco(e.itens[i], alimento);
          render();
        });
      };
    });
    alvo.querySelector('[data-add]')?.addEventListener('click', () => {
      abrirSeletorTaco('', (alimento, gramas) => {
        e.itens.push(resolverItem({
          nome: alimento.nome, quantidade_descrita: `${gramas} g`,
          gramas, taco_id: alimento.id, confianca_taco: 'alta',
        }));
        render();
      }, true);
    });

    alvo.querySelector('[data-cancelar]')?.addEventListener('click', () => fechar());

    alvo.querySelector('[data-excluir]')?.addEventListener('click', async () => {
      if (await confirmar('Excluir registro', 'Essa acao nao pode ser desfeita.', 'Excluir')) {
        await db.apagarEntrada(e.id);
        fechar();
        aviso('Registro excluido');
        aoSalvar?.();
      }
    });

    alvo.querySelector('[data-salvar]').onclick = async () => {
      e.titulo = alvo.querySelector('#tit')?.value.trim() || e.titulo;
      if (e.tipo === 'exercicio') e.kcal = Math.max(0, Number(alvo.querySelector('#gasto').value) || 0);
      else if (e.tipo === 'agua') e.ml = Math.max(0, Number(alvo.querySelector('#ml').value) || 0);
      else {
        e.refeicao = alvo.querySelector('#ref').value;
        e.total = somarItens(e.itens);
        if (alvo.querySelector('#fav')?.checked) {
          await db.salvarFavorito({
            id: e.origemFavorito || db.uid(), titulo: e.titulo,
            itens: e.itens, total: e.total, usos: 1,
          });
        }
      }
      await db.salvarEntrada(e);
      fechar();
      aviso(editando ? 'Registro atualizado' : 'Registrado');
      aoSalvar?.();
    };
  }

  render();
}

/* ========================================================================== */
/* Seletor da TACO                                                             */
/* ========================================================================== */

function abrirSeletorTaco(termoInicial, aoEscolher, pedirGramas = false) {
  const { corpo, fechar } = abrirFolha('Buscar na tabela TACO', `
    <div class="campo">
      <input type="text" id="q" placeholder="arroz, feijao, frango..." value="${esc(termoInicial)}" autocomplete="off">
    </div>
    ${pedirGramas ? `<div class="campo"><label for="g">Quantidade (g)</label>
      <input type="number" id="g" min="0" step="10" value="100"></div>` : ''}
    <div id="res"></div>
    <p class="dica" style="margin-top:12px">${esc(taco.versao())}</p>
  `);

  const q = corpo.querySelector('#q');
  const res = corpo.querySelector('#res');

  const listar = () => {
    const achados = taco.buscar(q.value, 25);
    if (!q.value.trim()) { res.innerHTML = '<p class="vazio">Digite para buscar entre 597 alimentos.</p>'; return; }
    if (!achados.length) { res.innerHTML = '<p class="vazio">Nada encontrado.</p>'; return; }
    res.innerHTML = achados.map((a) => `
      <button class="item" data-id="${a.id}">
        <div class="item-txt">
          <div class="item-nome">${esc(a.nome)}</div>
          <div class="item-sub">${esc(taco.categoria(a))} &middot; P ${n1(a.prot)} C ${n1(a.carb)} G ${n1(a.gord)} por 100 g</div>
        </div>
        <div class="item-kcal">${n0(a.kcal)}<small> kcal</small></div>
      </button>`).join('');

    res.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = () => {
        const alimento = taco.porId(b.dataset.id);
        const gramas = pedirGramas ? Math.max(0, Number(corpo.querySelector('#g').value) || 100) : 100;
        fechar();
        aoEscolher(alimento, gramas);
      };
    });
  };

  q.oninput = listar;
  listar();
  q.focus();
}

/** Busca manual pura, sem IA - util quando nao ha chave configurada. */
export function abrirBuscaManual({ dia, aoSalvar }) {
  abrirSeletorTaco('', (alimento, gramas) => {
    const item = resolverItem({
      nome: alimento.nome, quantidade_descrita: `${gramas} g`,
      gramas, taco_id: alimento.id, confianca_taco: 'alta',
    });
    abrirRevisao({
      dia, aoSalvar,
      entrada: {
        id: db.uid(), data: dia, ts: Date.now(), tipo: 'refeicao',
        refeicao: refeicaoPorHora(), titulo: alimento.nome.split(',')[0],
        foto: null, itens: [item], total: somarItens([item]),
      },
    });
  }, true);
}
