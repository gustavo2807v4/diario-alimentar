/**
 * Relatorio por periodo: calorias por dia, medias, adesao a meta e a evolucao
 * do peso. O peso vive aqui desde que a aba virou Treino - e o lugar onde os
 * graficos ja moravam.
 */
import * as db from '../db.js';
import { estado } from '../estado.js';
import { totaisDoDia, MACRO_INFO } from '../nutri.js';
import {
  esc, n0, n1, hoje, somarDias, deISO, graficoSemana, rotuloData,
} from '../ui.js';
import { renderPeso } from './peso.js';

let periodo = 7;

export async function renderSemana(host, recarregar) {
  const fim = hoje();
  const ini = somarDias(fim, -(periodo - 1));
  const entradas = await db.entradasNoIntervalo(ini, fim);
  const m = estado.metas;

  const dias = [];
  for (let i = 0; i < periodo; i++) {
    const data = somarDias(ini, i);
    const t = totaisDoDia(entradas.filter((e) => e.data === data));
    dias.push({ data, ...t, kcal: t.kcalComida - t.kcalExercicio });
  }

  const comRegistro = dias.filter((d) => d.kcalComida > 0);
  const media = (campo) => (comRegistro.length
    ? comRegistro.reduce((s, d) => s + d[campo], 0) / comRegistro.length : 0);

  const dentro = comRegistro.filter((d) => Math.abs(d.kcal - m.kcal) <= m.kcal * 0.1).length;

  host.innerHTML = `
    <div class="segmentos" style="margin-bottom:14px">
      ${[7, 14, 30].map((p) => `<button data-p="${p}" aria-pressed="${p === periodo}">${p} dias</button>`).join('')}
    </div>

    <section class="cartao">
      <div class="cartao-tit"><h2>Calorias por dia</h2><span class="item-sub">meta ${n0(m.kcal)}</span></div>
      <div id="graf"></div>
      <div class="legenda">
        <span><i class="ponto" style="background:var(--ink-2)"></i>Dentro da meta</span>
        <span><i class="ponto" style="background:var(--serio)"></i>Acima da meta</span>
        <span><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3"
          stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/></svg>Meta diaria</span>
      </div>
    </section>

    ${comRegistro.length ? `
    <section class="cartao">
      <div class="cartao-tit"><h2>Medias dos dias registrados</h2><span class="item-sub">${comRegistro.length} de ${periodo}</span></div>
      <div class="resumo">
        <div class="resumo-linha"><span>Calorias</span><b>${n0(media('kcal'))} / ${n0(m.kcal)}</b></div>
        <div class="resumo-linha"><span><i class="ponto" style="background:${MACRO_INFO.prot.cor};display:inline-block;margin-right:7px"></i>Proteina</span><b>${n1(media('prot'))} g / ${n0(m.prot)}</b></div>
        <div class="resumo-linha"><span><i class="ponto" style="background:${MACRO_INFO.carb.cor};display:inline-block;margin-right:7px"></i>Carboidrato</span><b>${n1(media('carb'))} g / ${n0(m.carb)}</b></div>
        <div class="resumo-linha"><span><i class="ponto" style="background:${MACRO_INFO.gord.cor};display:inline-block;margin-right:7px"></i>Gordura</span><b>${n1(media('gord'))} g / ${n0(m.gord)}</b></div>
        <div class="resumo-linha"><span>Fibra</span><b>${n1(media('fibra'))} g / ${n0(m.fibra)}</b></div>
        <div class="resumo-linha"><span>Agua</span><b>${n0(media('agua'))} ml / ${n0(m.agua)}</b></div>
        <div class="resumo-linha" style="border-top:1px solid var(--grid);padding-top:8px">
          <span>Dias dentro da meta (&plusmn;10%)</span><b>${dentro} de ${comRegistro.length}</b></div>
      </div>
    </section>

    <section class="cartao">
      <details class="expand">
        <summary>Ver como tabela</summary>
        <table class="tabela" style="margin-top:8px">
          <thead><tr><th>Dia</th><th>kcal</th><th>P</th><th>C</th><th>G</th></tr></thead>
          <tbody>
            ${dias.filter((d) => d.kcalComida > 0).map((d) => `
              <tr><td>${esc(deISO(d.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))}</td>
                  <td>${n0(d.kcal)}</td><td>${n0(d.prot)}</td><td>${n0(d.carb)}</td><td>${n0(d.gord)}</td></tr>`).join('')}
          </tbody>
        </table>
      </details>
    </section>

    <button class="btn btn-largo" data-copiar>Copiar resumo do periodo</button>
    ` : '<p class="vazio">Sem registros neste periodo.</p>'}

    <div data-bloco-peso></div>
  `;

  graficoSemana(host.querySelector('#graf'), dias, m.kcal);
  await renderPeso(host.querySelector('[data-bloco-peso]'), recarregar);

  host.querySelectorAll('[data-p]').forEach((b) => {
    b.onclick = () => { periodo = Number(b.dataset.p); renderSemana(host, recarregar); };
  });

  host.querySelector('[data-copiar]')?.addEventListener('click', async () => {
    const txt = [
      `Resumo dos ultimos ${periodo} dias (${comRegistro.length} com registro)`,
      `Calorias: media ${n0(media('kcal'))} / meta ${n0(m.kcal)}`,
      `Proteina: ${n1(media('prot'))} g  |  Carboidrato: ${n1(media('carb'))} g  |  Gordura: ${n1(media('gord'))} g`,
      `Fibra: ${n1(media('fibra'))} g  |  Agua: ${n0(media('agua'))} ml`,
      `Dias dentro da meta: ${dentro}/${comRegistro.length}`,
      '',
      ...dias.filter((d) => d.kcalComida > 0).map((d) =>
        `${rotuloData(d.data)}: ${n0(d.kcal)} kcal (P ${n0(d.prot)} C ${n0(d.carb)} G ${n0(d.gord)})`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      const { aviso } = await import('../ui.js');
      aviso('Resumo copiado');
    } catch {
      const { aviso } = await import('../ui.js');
      aviso('Nao consegui copiar.', 'erro');
    }
  });
}
