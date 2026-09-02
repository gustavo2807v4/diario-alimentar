/** Helpers de renderizacao compartilhados pelas telas. */

/* --- Texto e numeros ------------------------------------------------------ */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('pt-BR');
export const n1 = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/* --- Datas ---------------------------------------------------------------- */
export const iso = (d = new Date()) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
export const hoje = () => iso();
export const deISO = (s) => new Date(`${s}T12:00:00`);
export const somarDias = (s, n) => { const d = deISO(s); d.setDate(d.getDate() + n); return iso(d); };

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
export const diaCurto = (s) => DIAS_CURTOS[deISO(s).getDay()];

export function rotuloData(s) {
  if (s === hoje()) return 'Hoje';
  if (s === somarDias(hoje(), -1)) return 'Ontem';
  if (s === somarDias(hoje(), 1)) return 'Amanha';
  return deISO(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export const horaDe = (ts) =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/* --- Avisos --------------------------------------------------------------- */
export function aviso(msg, tipo = '') {
  const cx = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = msg;
  cx.append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 5200 : 2600);
}

/* --- Folha (bottom sheet) --------------------------------------------------
   As folhas sao empilhadas: a busca da TACO abre por cima da revisao sem
   destrui-la, e fechar a de cima devolve o foco para a de baixo intacta.  */
const pilha = [];

export function abrirFolha(titulo, conteudo, { aoFechar } = {}) {
  const raiz = document.getElementById('folha');

  const camada = document.createElement('div');
  camada.className = 'folha-camada';
  camada.innerHTML = `
    <div class="folha-caixa" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="folha-alca"></div>
      <div class="folha-tit">
        <h2>${esc(titulo)}</h2>
        <button class="btn btn-fantasma btn-min" data-fechar>Fechar</button>
      </div>
      <div data-corpo></div>
    </div>`;

  const corpo = camada.querySelector('[data-corpo]');
  if (typeof conteudo === 'string') corpo.innerHTML = conteudo;
  else corpo.append(conteudo);

  raiz.append(camada);
  raiz.hidden = false;
  document.body.style.overflow = 'hidden';

  let fechada = false;
  const fechar = () => {
    if (fechada) return;
    fechada = true;
    camada.remove();
    const i = pilha.indexOf(fechar);
    if (i >= 0) pilha.splice(i, 1);
    if (!pilha.length) {
      raiz.hidden = true;
      document.body.style.overflow = '';
    }
    aoFechar?.();
  };

  camada.querySelector('[data-fechar]').onclick = fechar;
  camada.onclick = (e) => { if (e.target === camada) fechar(); };
  pilha.push(fechar);

  corpo.querySelector('input, textarea, select, button')?.focus({ preventScroll: true });
  return { corpo, fechar };
}

/** Fecha a folha do topo da pilha. */
export const fecharFolha = () => pilha.at(-1)?.();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pilha.length) { e.preventDefault(); fecharFolha(); }
});

export function confirmar(titulo, texto, rotuloOk = 'Confirmar') {
  return new Promise((resolver) => {
    let resposta = false;
    const { corpo, fechar } = abrirFolha(titulo, `
      <p style="margin:0 0 18px;color:var(--ink-2);font-size:.92rem">${esc(texto)}</p>
      <div class="linha-botoes">
        <button class="btn" data-nao>Cancelar</button>
        <button class="btn btn-forte btn-perigo" data-sim>${esc(rotuloOk)}</button>
      </div>`, { aoFechar: () => resolver(resposta) });
    corpo.querySelector('[data-nao]').onclick = () => fechar();
    corpo.querySelector('[data-sim]').onclick = () => { resposta = true; fechar(); };
  });
}

/* --- Anel de calorias ------------------------------------------------------
   Neutro de proposito: na tela, cor = macro. O excedente aparece como um
   segundo arco em cor de estado, sempre acompanhado do rotulo "acima".      */
export function anelCalorias(consumido, meta) {
  const R = 56, C = 2 * Math.PI * R;
  const frac = meta > 0 ? Math.min(1, consumido / meta) : 0;
  const excesso = meta > 0 ? Math.min(1, Math.max(0, (consumido - meta) / meta)) : 0;
  const restante = Math.round(meta - consumido);

  return `
    <div class="anel">
      <svg viewBox="0 0 132 132" role="img"
           aria-label="${n0(consumido)} de ${n0(meta)} calorias consumidas">
        <circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--grid)" stroke-width="11"/>
        ${frac > 0.002 ? `<circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--traco)" stroke-width="11"
                stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}"
                transform="rotate(-90 66 66)"/>` : ''}
        ${excesso > 0 ? `<circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--serio)" stroke-width="11"
                stroke-linecap="round" stroke-dasharray="${(C * excesso).toFixed(1)} ${C.toFixed(1)}"
                transform="rotate(-90 66 66)"/>` : ''}
      </svg>
      <div class="anel-centro">
        <div class="n">${n0(Math.abs(restante))}</div>
        <div class="r">${restante >= 0 ? 'restantes' : 'acima'}</div>
      </div>
    </div>`;
}

/* --- Barra de macro -------------------------------------------------------- */
export function barraMacro(nome, cor, valor, meta, unidade = 'g') {
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  const excedeu = meta > 0 && valor > meta * 1.05;
  return `
    <div>
      <div class="macro-topo">
        <span class="macro-nome"><i class="ponto" style="background:${cor}"></i>${esc(nome)}</span>
        <span class="macro-val"><b>${n0(valor)}</b> / ${n0(meta)} ${esc(unidade)}</span>
      </div>
      <div class="trilho" role="img" aria-label="${esc(nome)}: ${n0(valor)} de ${n0(meta)} ${unidade}">
        <div class="preenche${excedeu ? ' excedeu' : ''}" style="width:${pct.toFixed(1)}%;background:${cor}"></div>
      </div>
    </div>`;
}

/* --- Graficos --------------------------------------------------------------
   SVG puro com viewBox: escala sozinho no container e nao precisa de lib.   */

const M = { e: 36, d: 8, t: 12, b: 24 };
const W = 320, H = 170;
const pw = W - M.e - M.d;
const ph = H - M.t - M.b;

function dicaGrafico(host) {
  const dica = document.createElement('div');
  Object.assign(dica.style, {
    position: 'absolute', pointerEvents: 'none', opacity: '0', transition: 'opacity .12s',
    background: 'var(--ink)', color: 'var(--plano)', padding: '6px 9px', borderRadius: '8px',
    fontSize: '.74rem', fontWeight: '550', whiteSpace: 'nowrap', transform: 'translate(-50%,-115%)',
    zIndex: '5', boxShadow: '0 3px 12px rgba(0,0,0,.25)',
  });
  host.style.position = 'relative';
  host.append(dica);
  return dica;
}

/** Liga os retangulos-alvo do SVG ao balao de dica (hover e toque). */
function ligarDicas(host, svg) {
  const dica = dicaGrafico(host);
  const mostrar = (alvo) => {
    const cx = Number(alvo.dataset.cx), cy = Number(alvo.dataset.cy);
    const cxPx = (cx / W) * svg.clientWidth;
    const cyPx = (cy / H) * svg.clientHeight;
    dica.innerHTML = alvo.dataset.dica;
    dica.style.left = `${cxPx}px`;
    dica.style.top = `${cyPx}px`;
    dica.style.opacity = '1';
  };
  const esconder = () => { dica.style.opacity = '0'; };
  svg.querySelectorAll('.alvo').forEach((a) => {
    a.addEventListener('pointerenter', () => mostrar(a));
    a.addEventListener('pointerdown', () => mostrar(a));
  });
  svg.addEventListener('pointerleave', esconder);
  host.addEventListener('pointercancel', esconder);
}

/**
 * Barras verticais de calorias por dia, com linha tracejada da meta.
 * dados = [{ data, kcal }]
 */
export function graficoSemana(host, dados, meta) {
  const max = Math.max(meta * 1.15, ...dados.map((d) => d.kcal), 1);
  const y = (v) => M.t + ph - (v / max) * ph;
  const passo = pw / dados.length;
  const larg = Math.min(30, passo * 0.6);

  // barra ancorada na linha de base, com apenas o topo arredondado
  const caminhoBarra = (x, larguraBarra, alt) => {
    const base = M.t + ph;
    const topo = base - alt;
    const r = Math.min(4, larguraBarra / 2, alt);
    return `M${x.toFixed(1)} ${base} V${(topo + r).toFixed(1)} Q${x.toFixed(1)} ${topo.toFixed(1)} ${(x + r).toFixed(1)} ${topo.toFixed(1)}`
      + ` H${(x + larguraBarra - r).toFixed(1)} Q${(x + larguraBarra).toFixed(1)} ${topo.toFixed(1)} ${(x + larguraBarra).toFixed(1)} ${(topo + r).toFixed(1)}`
      + ` V${base} Z`;
  };

  const barras = dados.map((d, i) => {
    const cx = M.e + passo * (i + 0.5);
    const alt = Math.max(d.kcal > 0 ? 2 : 0, (d.kcal / max) * ph);
    const acima = meta > 0 && d.kcal > meta;
    return `
      ${alt > 0 ? `<path class="barra${acima ? ' acima' : ''}" d="${caminhoBarra(cx - larg / 2, larg, alt)}"/>` : ''}
      <text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${diaCurto(d.data)}</text>
      <rect class="alvo" x="${(cx - passo / 2).toFixed(1)}" y="${M.t}" width="${passo.toFixed(1)}" height="${ph}"
            data-cx="${cx.toFixed(1)}" data-cy="${(M.t + ph - alt).toFixed(1)}"
            data-dica="${esc(rotuloData(d.data))} &middot; <b>${n0(d.kcal)}</b> kcal"/>`;
  }).join('');

  const ticks = [0, max / 2, max].map((v) => `
    <line class="malha" x1="${M.e}" y1="${y(v).toFixed(1)}" x2="${W - M.d}" y2="${y(v).toFixed(1)}"/>
    <text x="${M.e - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${n0(v)}</text>`).join('');

  host.innerHTML = `
    <svg class="gr" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="Calorias por dia nos ultimos ${dados.length} dias">
      ${ticks}
      ${meta > 0 ? `<line class="meta" x1="${M.e}" y1="${y(meta).toFixed(1)}" x2="${W - M.d}" y2="${y(meta).toFixed(1)}"/>` : ''}
      ${barras}
      <line class="base" x1="${M.e}" y1="${M.t + ph}" x2="${W - M.d}" y2="${M.t + ph}"/>
    </svg>`;
  ligarDicas(host, host.querySelector('svg'));
}

/**
 * Linha de peso ao longo do tempo, com meta tracejada.
 * pontos = [{ data, kg }]
 */
export function graficoPeso(host, pontos, metaKg) {
  if (pontos.length < 2) {
    host.innerHTML = '<p class="vazio">Registre pelo menos duas pesagens para ver a evolucao.</p>';
    return;
  }
  const vals = pontos.map((p) => p.kg).concat(metaKg ? [metaKg] : []);
  let min = Math.min(...vals), max = Math.max(...vals);
  const folga = Math.max(0.8, (max - min) * 0.18);
  min -= folga; max += folga;

  const t0 = deISO(pontos[0].data).getTime();
  const t1 = deISO(pontos.at(-1).data).getTime();
  const x = (d) => M.e + (t1 === t0 ? pw / 2 : ((deISO(d).getTime() - t0) / (t1 - t0)) * pw);
  const y = (v) => M.t + ph - ((v - min) / (max - min)) * ph;

  const d = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.data).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');

  // rotula so o primeiro e o ultimo ponto - nunca um numero em cada ponto
  const marcas = pontos.map((p, i) => {
    const cx = x(p.data), cy = y(p.kg);
    const ultimo = i === pontos.length - 1;
    return `
      ${ultimo || i === 0 ? `<circle class="ponto-serie" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5"/>` : ''}
      <rect class="alvo" x="${(cx - 9).toFixed(1)}" y="${M.t}" width="18" height="${ph}"
            data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"
            data-dica="${esc(deISO(p.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))} &middot; <b>${n1(p.kg)}</b> kg"/>`;
  }).join('');

  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1].map((v) => `
    <line class="malha" x1="${M.e}" y1="${y(v).toFixed(1)}" x2="${W - M.d}" y2="${y(v).toFixed(1)}"/>
    <text x="${M.e - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${n1(v)}</text>`).join('');

  host.innerHTML = `
    <svg class="gr" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="Evolucao do peso, de ${n1(pontos[0].kg)} a ${n1(pontos.at(-1).kg)} quilos">
      ${ticks}
      ${metaKg ? `<line class="meta" x1="${M.e}" y1="${y(metaKg).toFixed(1)}" x2="${W - M.d}" y2="${y(metaKg).toFixed(1)}"/>` : ''}
      <path class="linha-serie" d="${d}"/>
      ${marcas}
      <text x="${M.e}" y="${H - 8}" text-anchor="start">${esc(deISO(pontos[0].data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))}</text>
      <text x="${W - M.d}" y="${H - 8}" text-anchor="end">${esc(deISO(pontos.at(-1).data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))}</text>
    </svg>`;
  ligarDicas(host, host.querySelector('svg'));
}

/* --- Icones --------------------------------------------------------------- */
export const ICONES = {
  hoje: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  semana: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  peso: '<circle cx="12" cy="12" r="9"/><path d="M12 12l3.5-4.5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  agua: '<path d="M12 2.7S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.7 12 2.7z"/>',
  raio: '<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
  treino: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
  dieta: '<path d="M5 3v8a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.5 1.5-2 3.5-2 5.5 0 1.5.7 2.5 2 2.5v10"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
};
export const icone = (nome, tamanho = 22) =>
  `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
