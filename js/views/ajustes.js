/** Perfil, metas, chave da API e backup. */
import * as db from '../db.js';
import * as gemini from '../gemini.js';
import { versao as versaoTaco } from '../taco.js';
import {
  estado, salvarPerfil, salvarConfig, salvarMetas, recalcularMetas,
} from '../estado.js';
import { ATIVIDADES, metasAutomaticas, tmb, tdee, idadeEm } from '../nutri.js';
import { esc, n0, n1, aviso, abrirFolha, confirmar, hoje } from '../ui.js';

const OBJETIVOS = { perder: 'Perder peso', manter: 'Manter o peso', ganhar: 'Ganhar massa' };

export async function renderAjustes(host, recarregar) {
  const p = estado.perfil;
  const m = estado.metas;
  const c = estado.config;

  host.innerHTML = `
    <section class="cartao">
      <div class="cartao-tit"><h2>Perfil</h2>
        <button class="btn btn-fantasma btn-min" data-editar-perfil>Editar</button></div>
      <div class="resumo">
        <div class="resumo-linha"><span>Idade</span><b>${idadeEm(p.nascimento)} anos</b></div>
        <div class="resumo-linha"><span>Altura</span><b>${n0(p.altura)} cm</b></div>
        <div class="resumo-linha"><span>Peso</span><b>${n1(p.peso)} kg</b></div>
        <div class="resumo-linha"><span>Objetivo</span><b>${esc(OBJETIVOS[p.objetivo])}</b></div>
        <div class="resumo-linha"><span>Atividade</span><b>${esc(String(ATIVIDADES[p.atividade]).split(' (')[0])}</b></div>
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-tit"><h2>Metas diarias</h2>
        <span class="item-sub">${m.origem === 'manual' ? 'ajustadas por voce' : 'calculadas'}</span></div>
      <div class="resumo" style="margin-bottom:14px">
        <div class="resumo-linha"><span>Metabolismo basal</span><b>${n0(tmb(p))} kcal</b></div>
        <div class="resumo-linha"><span>Gasto estimado</span><b>${n0(tdee(p))} kcal</b></div>
        <div class="resumo-linha" style="border-top:1px solid var(--grid);padding-top:8px">
          <span>Meta de calorias</span><b>${n0(m.kcal)} kcal</b></div>
        <div class="resumo-linha"><span>Proteina / Carbo / Gordura</span><b>${n0(m.prot)} / ${n0(m.carb)} / ${n0(m.gord)} g</b></div>
        <div class="resumo-linha"><span>Fibra / Agua</span><b>${n0(m.fibra)} g / ${n0(m.agua)} ml</b></div>
      </div>
      <div class="linha-botoes">
        <button class="btn" data-editar-metas>Ajustar manualmente</button>
        ${m.origem === 'manual' ? '<button class="btn" data-recalcular>Voltar ao calculo</button>' : ''}
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-tit"><h2>Inteligencia artificial</h2></div>
      <div class="campo">
        <label for="chave">Chave da API do Google Gemini</label>
        <input type="password" id="chave" value="${esc(c.apiKey)}" placeholder="AIza..." autocomplete="off" spellcheck="false">
        <div class="dica">Fica guardada so neste dispositivo. Pegue a sua gratuitamente em
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.</div>
      </div>
      <div class="campo">
        <label for="modelo">Modelo</label>
        <div style="display:flex;gap:8px">
          <select id="modelo" style="flex:1"><option value="${esc(c.modelo)}">${esc(c.modelo)}</option></select>
          <button class="btn btn-min" data-listar>Buscar</button>
        </div>
        <div class="dica">Toque em <b>Buscar</b> para listar os modelos que a sua chave aceita.</div>
      </div>
      <label style="display:flex;gap:9px;align-items:center;font-size:.86rem;color:var(--ink-2);margin-bottom:14px">
        <input type="checkbox" id="rapido" style="width:auto" ${c.rapido !== false ? 'checked' : ''}>
        Modo rapido (desliga o raciocinio interno do modelo)
      </label>
      <button class="btn btn-forte btn-largo" data-salvar-ia>Salvar</button>
    </section>

    <section class="cartao">
      <div class="cartao-tit"><h2>Seus dados</h2></div>
      <p class="dica" style="margin:0 0 12px">
        Tudo fica no navegador deste dispositivo. Limpar os dados do site apaga o diario &mdash;
        exporte de vez em quando.</p>
      <div class="linha-botoes" style="margin-bottom:10px">
        <button class="btn" data-exportar>Exportar backup</button>
        <button class="btn" data-importar>Importar</button>
      </div>
      <button class="btn btn-largo btn-perigo" data-limpar>Apagar tudo</button>
      <input type="file" accept="application/json" hidden id="in-backup">
    </section>

    <p class="dica" style="text-align:center;margin-top:18px">
      Dados nutricionais: ${esc(versaoTaco())}
    </p>
  `;

  /* --- perfil e metas --- */
  host.querySelector('[data-editar-perfil]').onclick = () => abrirPerfil({ aoConcluir: recarregar });

  host.querySelector('[data-editar-metas]').onclick = () => {
    const { corpo, fechar } = abrirFolha('Ajustar metas', `
      ${['kcal', 'prot', 'carb', 'gord', 'fibra', 'agua'].map((k) => {
        const rot = { kcal: 'Calorias (kcal)', prot: 'Proteina (g)', carb: 'Carboidrato (g)',
                      gord: 'Gordura (g)', fibra: 'Fibra (g)', agua: 'Agua (ml)' }[k];
        return `<div class="campo"><label for="mt-${k}">${rot}</label>
          <input type="number" id="mt-${k}" min="0" step="${k === 'agua' ? 50 : 1}" value="${Math.round(m[k])}"></div>`;
      }).join('')}
      <button class="btn btn-forte btn-largo" data-ok>Salvar metas</button>
    `);
    corpo.querySelector('[data-ok]').onclick = async () => {
      const novas = { ...m, origem: 'manual' };
      for (const k of ['kcal', 'prot', 'carb', 'gord', 'fibra', 'agua']) {
        novas[k] = Math.max(0, Number(corpo.querySelector(`#mt-${k}`).value) || 0);
      }
      await salvarMetas(novas);
      fechar();
      aviso('Metas atualizadas');
      recarregar();
    };
  };

  host.querySelector('[data-recalcular]')?.addEventListener('click', async () => {
    await recalcularMetas();
    aviso('Metas recalculadas');
    recarregar();
  });

  /* --- IA --- */
  host.querySelector('[data-listar]').onclick = async (ev) => {
    const chave = host.querySelector('#chave').value.trim();
    if (!chave) return aviso('Informe a chave primeiro.', 'erro');
    const botao = ev.currentTarget;
    botao.disabled = true;
    botao.textContent = '...';
    try {
      const modelos = await gemini.listarModelos(chave);
      const sel = host.querySelector('#modelo');
      sel.innerHTML = modelos.map((n) =>
        `<option value="${esc(n)}"${n === c.modelo ? ' selected' : ''}>${esc(n)}</option>`).join('');
      if (!modelos.includes(c.modelo)) {
        const preferido = modelos.find((n) => n.includes('2.5-flash') && !n.includes('lite')) || modelos[0];
        if (preferido) sel.value = preferido;
      }
      aviso(`${modelos.length} modelos disponiveis`);
    } catch (e) {
      aviso(e.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Buscar';
    }
  };

  host.querySelector('[data-salvar-ia]').onclick = async () => {
    await salvarConfig({
      apiKey: host.querySelector('#chave').value.trim(),
      modelo: host.querySelector('#modelo').value,
      rapido: host.querySelector('#rapido').checked,
    });
    aviso('Preferencias salvas');
  };

  /* --- backup --- */
  host.querySelector('[data-exportar]').onclick = async () => {
    const dados = await db.exportarTudo();
    const blob = new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diario-alimentar-${hoje()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso('Backup gerado');
  };

  const inBackup = host.querySelector('#in-backup');
  host.querySelector('[data-importar]').onclick = () => inBackup.click();
  inBackup.onchange = async () => {
    const arquivo = inBackup.files[0];
    if (!arquivo) return;
    try {
      await db.importarTudo(JSON.parse(await arquivo.text()));
      aviso('Backup importado');
      location.reload();
    } catch (e) {
      aviso(e.message, 'erro');
    }
  };

  host.querySelector('[data-limpar]').onclick = async () => {
    if (await confirmar('Apagar tudo', 'Todos os registros, pesagens e configuracoes deste dispositivo serao removidos.', 'Apagar tudo')) {
      await db.limparTudo();
      location.reload();
    }
  };
}

/* ========================================================================== */
/* Formulario de perfil (tambem usado no primeiro uso)                         */
/* ========================================================================== */

export function abrirPerfil({ primeiraVez = false, aoConcluir } = {}) {
  const p = estado.perfil || {
    sexo: 'M', nascimento: '1995-01-01', altura: 175, peso: 75,
    atividade: 1.375, objetivo: 'manter', ritmo: 0.5, pesoMeta: '',
  };

  const { corpo, fechar } = abrirFolha(primeiraVez ? 'Vamos comecar' : 'Editar perfil', `
    ${primeiraVez ? `<p class="dica" style="margin:-4px 0 16px">
      Esses dados ficam so no seu dispositivo e servem para calcular sua meta diaria.</p>` : ''}

    <div class="campo"><label>Sexo biologico</label>
      <div class="segmentos" id="sexo">
        <button data-v="M" aria-pressed="${p.sexo === 'M'}">Masculino</button>
        <button data-v="F" aria-pressed="${p.sexo === 'F'}">Feminino</button>
      </div>
      <div class="dica">Usado apenas na formula de metabolismo basal (Mifflin-St Jeor).</div>
    </div>

    <div class="campo"><label for="nasc">Data de nascimento</label>
      <input type="date" id="nasc" value="${esc(p.nascimento)}" max="${hoje()}"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="campo"><label for="alt">Altura (cm)</label>
        <input type="number" id="alt" min="100" max="250" value="${p.altura}"></div>
      <div class="campo"><label for="pes">Peso (kg)</label>
        <input type="number" id="pes" min="20" max="400" step="0.1" value="${p.peso}"></div>
    </div>

    <div class="campo"><label for="ativ">Nivel de atividade</label>
      <select id="ativ">${Object.entries(ATIVIDADES).map(([v, r]) =>
        `<option value="${v}"${Number(v) === Number(p.atividade) ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></div>

    <div class="campo"><label>Objetivo</label>
      <div class="segmentos" id="obj">
        ${Object.entries(OBJETIVOS).map(([v, r]) =>
          `<button data-v="${v}" aria-pressed="${p.objetivo === v}">${esc(r)}</button>`).join('')}
      </div>
    </div>

    <div id="bloco-ritmo" ${p.objetivo === 'manter' ? 'hidden' : ''}>
      <div class="campo"><label for="ritmo">Ritmo desejado</label>
        <select id="ritmo">
          ${[0.25, 0.5, 0.75, 1].map((v) =>
            `<option value="${v}"${Number(v) === Number(p.ritmo) ? ' selected' : ''}>${String(v).replace('.', ',')} kg por semana</option>`).join('')}
        </select></div>
      <div class="campo"><label for="meta-peso">Peso desejado (kg) &mdash; opcional</label>
        <input type="number" id="meta-peso" min="20" max="400" step="0.1" value="${p.pesoMeta || ''}"></div>
    </div>

    <div id="previsao" class="aviso-caixa" style="background:var(--sup-2);border-color:var(--borda)"></div>

    <button class="btn btn-forte btn-largo" data-ok>${primeiraVez ? 'Criar meu diario' : 'Salvar'}</button>
  `);

  const seg = (id, campo) => {
    corpo.querySelectorAll(`#${id} button`).forEach((b) => {
      b.onclick = () => {
        corpo.querySelectorAll(`#${id} button`).forEach((o) => o.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        p[campo] = id === 'ativ' ? Number(b.dataset.v) : b.dataset.v;
        if (campo === 'objetivo') corpo.querySelector('#bloco-ritmo').hidden = p.objetivo === 'manter';
        prever();
      };
    });
  };
  seg('sexo', 'sexo');
  seg('obj', 'objetivo');

  const ler = () => ({
    ...p,
    nascimento: corpo.querySelector('#nasc').value,
    altura: Number(corpo.querySelector('#alt').value),
    peso: Number(corpo.querySelector('#pes').value),
    atividade: Number(corpo.querySelector('#ativ').value),
    ritmo: Number(corpo.querySelector('#ritmo').value),
    pesoMeta: Number(corpo.querySelector('#meta-peso').value) || '',
  });

  function prever() {
    const atual = ler();
    if (!atual.nascimento || !atual.altura || !atual.peso) return;
    try {
      const m = metasAutomaticas(atual);
      corpo.querySelector('#previsao').innerHTML =
        `Gasto estimado <b>${n0(m.gasto)} kcal</b> &middot; meta diaria <b>${n0(m.kcal)} kcal</b><br>
         <span style="color:var(--muted)">Proteina ${n0(m.prot)} g &middot; carboidrato ${n0(m.carb)} g &middot; gordura ${n0(m.gord)} g</span>`;
    } catch { /* campos ainda incompletos */ }
  }

  corpo.querySelectorAll('input, select').forEach((i) => i.addEventListener('input', prever));
  prever();

  corpo.querySelector('[data-ok]').onclick = async () => {
    const novo = ler();
    if (!novo.nascimento || novo.altura < 100 || novo.peso < 20) return aviso('Confira altura, peso e data de nascimento.', 'erro');
    if (idadeEm(novo.nascimento) < 10 || idadeEm(novo.nascimento) > 110) return aviso('Data de nascimento improvavel.', 'erro');
    await salvarPerfil(novo);
    if (primeiraVez && novo.peso) await db.salvarPeso(hoje(), novo.peso);
    fechar();
    aviso(primeiraVez ? 'Tudo pronto!' : 'Perfil atualizado');
    aoConcluir?.();
  };
}
