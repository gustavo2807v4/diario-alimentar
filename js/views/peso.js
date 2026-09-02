/** Acompanhamento de peso: pesagem do dia, evolucao e ritmo real. */
import * as db from '../db.js';
import { estado, salvarPerfil } from '../estado.js';
import {
  esc, n1, hoje, iso, deISO, graficoPeso, aviso, confirmar, abrirFolha,
} from '../ui.js';

export async function renderPeso(host, recarregar) {
  const pesos = await db.todosPesos();
  const perfil = estado.perfil;
  const metaKg = Number(perfil.pesoMeta) || null;
  const atual = pesos.at(-1);

  // ritmo real: comparacao entre a primeira e a ultima pesagem dos ultimos 28 dias
  const recentes = pesos.filter((p) => p.data >= (() => { const d = new Date(); d.setDate(d.getDate() - 28); return iso(d); })());
  let ritmo = null;
  if (recentes.length >= 2) {
    const dias = (deISO(recentes.at(-1).data) - deISO(recentes[0].data)) / 86400000;
    if (dias >= 5) ritmo = ((recentes.at(-1).kg - recentes[0].kg) / dias) * 7;
  }

  host.innerHTML = `
    <section class="cartao">
      <div class="cartao-tit"><h2>Peso</h2>
        ${atual ? `<span class="item-sub">ultima pesagem ${esc(deISO(atual.data).toLocaleDateString('pt-BR'))}</span>` : ''}</div>
      <div class="resumo" style="margin-bottom:16px">
        <div class="resumo-linha"><span>Atual</span><b style="font-size:1.3rem">${atual ? `${n1(atual.kg)} kg` : '&mdash;'}</b></div>
        ${metaKg ? `<div class="resumo-linha"><span>Meta</span><b>${n1(metaKg)} kg</b></div>` : ''}
        ${atual && metaKg ? `<div class="resumo-linha"><span>Faltam</span><b>${n1(Math.abs(atual.kg - metaKg))} kg</b></div>` : ''}
        ${ritmo !== null ? `<div class="resumo-linha" style="border-top:1px solid var(--grid);padding-top:8px">
          <span>Ritmo real (28 dias)</span><b>${ritmo > 0 ? '+' : ''}${n1(ritmo)} kg/semana</b></div>` : ''}
      </div>
      <button class="btn btn-forte btn-largo" data-pesar>Registrar pesagem de hoje</button>
    </section>

    <section class="cartao">
      <div class="cartao-tit"><h2>Evolucao</h2>
        <span class="item-sub">${pesos.length} ${pesos.length === 1 ? 'pesagem' : 'pesagens'}</span></div>
      <div id="graf-peso"></div>
      ${pesos.length >= 2 && metaKg ? `<div class="legenda">
        <span><i class="ponto" style="background:var(--s1)"></i>Peso registrado</span>
        <span><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3"
          stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/></svg>Meta</span>
      </div>` : ''}
    </section>

    ${pesos.length ? `
    <section class="cartao">
      <details class="expand">
        <summary>Historico completo</summary>
        <table class="tabela" style="margin-top:8px">
          <thead><tr><th>Data</th><th>Peso</th><th></th></tr></thead>
          <tbody>
            ${[...pesos].reverse().map((p) => `
              <tr><td>${esc(deISO(p.data).toLocaleDateString('pt-BR'))}</td><td>${n1(p.kg)} kg</td>
                  <td><button class="btn btn-fantasma btn-min" data-apagar="${esc(p.data)}">remover</button></td></tr>`).join('')}
          </tbody>
        </table>
      </details>
    </section>` : ''}
  `;

  graficoPeso(host.querySelector('#graf-peso'), pesos, metaKg);

  host.querySelector('[data-pesar]').onclick = () => {
    const { corpo, fechar } = abrirFolha('Registrar pesagem', `
      <div class="campo"><label for="d">Data</label>
        <input type="date" id="d" value="${hoje()}" max="${hoje()}"></div>
      <div class="campo"><label for="kg">Peso (kg)</label>
        <input type="number" id="kg" step="0.1" min="20" max="400" value="${atual ? n1(atual.kg).replace(',', '.') : perfil.peso}"></div>
      <label style="display:flex;gap:9px;align-items:center;font-size:.86rem;color:var(--ink-2);margin-bottom:16px">
        <input type="checkbox" id="atualizar" style="width:auto" checked>
        Atualizar o peso do perfil e recalcular as metas
      </label>
      <button class="btn btn-forte btn-largo" data-ok>Salvar</button>
    `);

    corpo.querySelector('[data-ok]').onclick = async () => {
      const data = corpo.querySelector('#d').value;
      const kg = Number(corpo.querySelector('#kg').value);
      if (!data || !kg || kg < 20 || kg > 400) return aviso('Informe um peso valido.', 'erro');
      await db.salvarPeso(data, kg);
      if (corpo.querySelector('#atualizar').checked && data === hoje()) {
        await salvarPerfil({ ...perfil, peso: kg });
      }
      fechar();
      aviso('Pesagem registrada');
      recarregar();
    };
  };

  host.querySelectorAll('[data-apagar]').forEach((b) => {
    b.onclick = async () => {
      if (await confirmar('Remover pesagem', `Remover o registro de ${deISO(b.dataset.apagar).toLocaleDateString('pt-BR')}?`, 'Remover')) {
        await db.apagarPeso(b.dataset.apagar);
        recarregar();
      }
    };
  });
}
