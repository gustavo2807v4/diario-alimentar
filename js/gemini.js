/**
 * Camada de IA (Google Gemini).
 *
 * Regra central: o modelo NUNCA soma e NUNCA devolve valores da porcao.
 * Ele so faz o que modelo faz bem - reconhecer o alimento na foto/texto,
 * estimar a quantidade e apontar a linha correspondente na TACO. Todo o
 * resto e aritmetica no dispositivo.
 */
import * as taco from './taco.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const ESQUEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['refeicao', 'exercicio', 'agua'], format: 'enum' },
    titulo: { type: 'string' },
    refeicao: {
      type: 'string',
      enum: ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia'],
      format: 'enum',
    },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          quantidade_descrita: { type: 'string' },
          gramas: { type: 'number' },
          taco_id: { type: 'integer' },
          confianca_taco: { type: 'string', enum: ['alta', 'media', 'nenhuma'], format: 'enum' },
          kcal_100g: { type: 'number' },
          prot_100g: { type: 'number' },
          carb_100g: { type: 'number' },
          gord_100g: { type: 'number' },
          fibra_100g: { type: 'number' },
        },
        required: ['nome', 'quantidade_descrita', 'gramas', 'confianca_taco'],
        propertyOrdering: ['nome', 'quantidade_descrita', 'gramas', 'taco_id', 'confianca_taco',
          'kcal_100g', 'prot_100g', 'carb_100g', 'gord_100g', 'fibra_100g'],
      },
    },
    exercicio_kcal: { type: 'number' },
    agua_ml: { type: 'number' },
    observacao: { type: 'string' },
  },
  required: ['tipo', 'titulo', 'itens'],
  propertyOrdering: ['tipo', 'titulo', 'refeicao', 'itens', 'exercicio_kcal', 'agua_ml', 'observacao'],
};

function instrucoes(indice, contexto) {
  return `Voce e um analisador nutricional de um diario alimentar brasileiro.
Recebe uma descricao em texto e/ou uma foto de refeicao, exercicio ou consumo de agua.

TAREFA
1. Classifique em "tipo": refeicao, exercicio ou agua.
2. Para refeicao: quebre o prato nos ingredientes/alimentos que o compoem, um por item.
   Separe o que e separavel (arroz, feijao, bife, salada = 4 itens), mas nao invente
   temperos ou acompanhamentos que nao foram citados nem aparecem na foto.
3. Para cada item estime a quantidade em GRAMAS ("gramas") e descreva a porcao em
   linguagem natural em "quantidade_descrita" (ex.: "1 concha media", "2 fatias",
   "1 file de 120 g"). Use referencias visuais da foto (prato, talher, mao) para calibrar.
4. Ligue o item a TABELA TACO abaixo devolvendo "taco_id":
   - use "alta" em confianca_taco quando for o mesmo alimento E o mesmo preparo;
   - use "media" quando for um equivalente proximo;
   - use "nenhuma" quando nao houver nada parecido na tabela.
   ATENCAO ao preparo: "cru", "cozido", "grelhado", "frito" sao linhas diferentes.
   Se a pessoa disse "arroz" sem detalhar, assuma o preparo mais comum no Brasil (cozido).
5. So quando confianca_taco for "nenhuma", preencha kcal_100g, prot_100g, carb_100g,
   gord_100g e fibra_100g com sua melhor estimativa.

REGRAS ABSOLUTAS
- Todos os valores nutricionais sao SEMPRE por 100 g do alimento, nunca da porcao.
- NUNCA calcule totais, somas ou subtotais. O aplicativo faz toda a aritmetica.
- Nao devolva texto fora do JSON.
- Para exercicio: preencha "exercicio_kcal" com a estimativa de gasto e deixe "itens" vazio.
- Para agua: preencha "agua_ml" e deixe "itens" vazio.
- "titulo" e um resumo curto em portugues (ate 6 palavras) do que foi registrado.
- Se a descricao ou a foto nao permitirem identificar nada comestivel, devolva
  "itens" vazio e explique em "observacao".

CONTEXTO DA PESSOA
${contexto}

TABELA TACO (formato id|nome, valores por 100 g)
${indice}`;
}

function contextoPerfil(perfil, agora = new Date()) {
  const linhas = [`Horario local do registro: ${agora.toLocaleString('pt-BR')}.`];
  if (perfil?.peso) linhas.push(`Peso: ${perfil.peso} kg. Altura: ${perfil.altura} cm.`);
  if (perfil?.objetivo) {
    const o = { perder: 'perder peso', manter: 'manter o peso', ganhar: 'ganhar massa' }[perfil.objetivo];
    if (o) linhas.push(`Objetivo: ${o}.`);
  }
  linhas.push('Cozinha de referencia: brasileira.');
  return linhas.join('\n');
}

async function chamar(url, corpo) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { /* resposta nao-JSON */ }
  if (!r.ok) {
    const msg = json?.error?.message || txt.slice(0, 300) || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return json;
}

/**
 * Envia texto e/ou imagem e devolve o objeto cru do modelo.
 * `imagem` = { base64, mime } sem o prefixo data:.
 */
export async function analisar({ texto, imagem, perfil, config }) {
  const chave = config?.apiKey;
  if (!chave) throw new Error('Configure sua chave da API do Gemini em Ajustes.');

  const modelo = config.modelo || 'gemini-2.5-flash';
  const indice = await taco.indiceParaPrompt();

  const partes = [];
  if (imagem) partes.push({ inline_data: { mime_type: imagem.mime, data: imagem.base64 } });
  partes.push({ text: texto?.trim() ? texto.trim() : 'Analise a foto e registre esta refeicao.' });

  const corpo = {
    systemInstruction: { parts: [{ text: instrucoes(indice, contextoPerfil(perfil)) }] },
    contents: [{ role: 'user', parts: partes }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA,
    },
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  };

  // Modo rapido: desliga o raciocinio interno dos modelos 2.5, que aqui so
  // adiciona latencia. Se o modelo escolhido nao aceitar o campo, refaz sem ele.
  if (config.rapido !== false) corpo.generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const url = `${BASE}/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(chave)}`;

  let resp;
  try {
    resp = await chamar(url, corpo);
  } catch (e) {
    if (e.status === 400 && /thinking/i.test(e.message)) {
      delete corpo.generationConfig.thinkingConfig;
      resp = await chamar(url, corpo);
    } else if (e.status === 400 && /API key|API_KEY/i.test(e.message)) {
      throw new Error('Chave da API invalida. Confira em Ajustes.');
    } else if (e.status === 429) {
      throw new Error('Limite da API atingido. Espere um instante e tente de novo.');
    } else {
      throw e;
    }
  }

  const cand = resp?.candidates?.[0];
  if (!cand) {
    const bloqueio = resp?.promptFeedback?.blockReason;
    throw new Error(bloqueio ? `Pedido bloqueado pelo modelo (${bloqueio}).` : 'O modelo nao respondeu.');
  }
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('Resposta muito longa. Tente descrever menos itens de uma vez.');

  const bruto = (cand.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!bruto) throw new Error('O modelo devolveu uma resposta vazia.');

  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    const m = bruto.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Nao entendi a resposta do modelo.');
    dados = JSON.parse(m[0]);
  }

  dados.itens = Array.isArray(dados.itens) ? dados.itens : [];
  return dados;
}

/* ========================================================================== */
/* Montagem de treino                                                          */
/* ========================================================================== */

const ESQUEMA_TREINO = {
  type: 'object',
  properties: {
    treinos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          foco: { type: 'string' },
          exercicios: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                series: { type: 'integer' },
                reps: { type: 'string' },
                carga: { type: 'string' },
                observacao: { type: 'string' },
              },
              required: ['nome', 'series', 'reps'],
              propertyOrdering: ['nome', 'series', 'reps', 'carga', 'observacao'],
            },
          },
        },
        required: ['nome', 'exercicios'],
        propertyOrdering: ['nome', 'foco', 'exercicios'],
      },
    },
    observacao: { type: 'string' },
  },
  required: ['treinos'],
  propertyOrdering: ['treinos', 'observacao'],
};

function instrucoesTreino(contexto) {
  return `Voce monta divisoes de treino de musculacao para um aplicativo pessoal.

TAREFA
Devolva a divisao completa: um objeto em "treinos" por sessao da semana, cada um com
nome curto ("Peito e triceps", "Costas e biceps", "Pernas") e a lista de exercicios.

REGRAS
- "series" e um inteiro. "reps" e texto e pode ser faixa ("8-12", "ate a falha", "30 s").
- "carga" e um ponto de partida em texto ("60 kg", "peso corporal", "halter 12 kg").
  Deixe vazio quando nao der para estimar com honestidade.
- Ordene os exercicios na ordem de execucao: composto pesado primeiro, isolado depois.
- Respeite o equipamento informado. Nao prescreva o que a pessoa disse nao ter.
- Respeite as limitacoes informadas. Se houver lesao ou restricao, evite o movimento
  e diga em "observacao" o que voce trocou e por que.
- Entre 4 e 8 exercicios por sessao.
- Nao devolva texto fora do JSON.
- "observacao" e um paragrafo curto: como progredir de carga e o que vigiar.

CONTEXTO DA PESSOA
${contexto}`;
}

/**
 * Monta a divisao de treino a partir do pedido da pessoa.
 *
 * Devolve o objeto cru do modelo - quem confirma e a tela de revisao, igual ao
 * fluxo de refeicao. Nada disso entra no banco sem passar pela vista do usuario.
 */
export async function montarTreino({ objetivo, dias, equipamento, observacoes, perfil, config }) {
  const chave = config?.apiKey;
  if (!chave) throw new Error('Configure sua chave da API do Gemini em Ajustes.');

  const modelo = config.modelo || 'gemini-2.5-flash';

  const pedido = [
    `Objetivo: ${objetivo || 'condicionamento geral e hipertrofia'}.`,
    `Dias de treino por semana: ${dias || 4}.`,
    `Equipamento disponivel: ${equipamento || 'academia completa'}.`,
    observacoes ? `Observacoes e limitacoes: ${observacoes}` : '',
  ].filter(Boolean).join('\n');

  const corpo = {
    systemInstruction: { parts: [{ text: instrucoesTreino(contextoPerfil(perfil)) }] },
    contents: [{ role: 'user', parts: [{ text: pedido }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_TREINO,
    },
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  };

  const url = `${BASE}/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(chave)}`;

  let resp;
  try {
    resp = await chamar(url, corpo);
  } catch (e) {
    if (e.status === 400 && /API key|API_KEY/i.test(e.message)) {
      throw new Error('Chave da API invalida. Confira em Ajustes.');
    }
    if (e.status === 429) throw new Error('Limite da API atingido. Espere um instante e tente de novo.');
    throw e;
  }

  const cand = resp?.candidates?.[0];
  if (!cand) throw new Error('O modelo nao respondeu.');
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('Resposta muito longa. Peca menos dias por semana.');

  const bruto = (cand.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!bruto) throw new Error('O modelo devolveu uma resposta vazia.');

  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    const m = bruto.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Nao entendi a resposta do modelo.');
    dados = JSON.parse(m[0]);
  }

  dados.treinos = Array.isArray(dados.treinos) ? dados.treinos : [];
  return dados;
}

/** Lista os modelos disponiveis para a chave, evitando chutar nomes. */
export async function listarModelos(chave) {
  const r = await fetch(`${BASE}/models?key=${encodeURIComponent(chave)}&pageSize=200`);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini'))
    .sort();
}

/**
 * Reduz a foto antes de enviar: 1024 px no maior lado ja e suficiente para o
 * reconhecimento e corta drasticamente o tempo de upload.
 */
export function comprimirImagem(arquivo, maxLado = 1024, qualidade = 0.82) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        if (!blob) return erro(new Error('Nao consegui processar a imagem.'));
        const fr = new FileReader();
        fr.onload = () => ok({
          blob,
          base64: String(fr.result).split(',')[1],
          mime: 'image/jpeg',
        });
        fr.readAsDataURL(blob);
      }, 'image/jpeg', qualidade);
    };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Arquivo de imagem invalido.')); };
    img.src = url;
  });
}
