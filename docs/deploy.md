# Publicar na Vercel

Notas de operação do projeto. Nada aqui é necessário para rodar ou ler o código —
para isso, o `README.md` basta.

## Deploy

```bash
npx vercel deploy --prod --scope equipe-gust
```

O `--scope` é obrigatório: sem ele o CLI cai no escopo pessoal e o deploy falha com
`Not authorized`, porque o projeto vive num time.

O vínculo com o projeto da Vercel fica em `.vercel/`, que **não está no repositório**
(entra no `.gitignore` junto com o token que a CLI guarda ali). Num clone novo:

```bash
npx vercel link --scope equipe-gust
```

## Cabeçalhos

`vercel.json` cuida deles. O mais importante impede que o `sw.js` fique preso em cache —
sem isso o app travaria numa versão antiga, porque o service worker é cache-first.

## O que não vai para produção

`.vercelignore` mantém fora os CSVs de origem, os scripts de `tools/`, o `serve.mjs` e a
pasta `docs/`. Tudo isso serve para desenvolvimento e só pesaria no app instalado.

## Service worker

Depois de publicar, a primeira abertura no celular ainda roda o código antigo: o service
worker anterior responde primeiro e só então o novo assume. A segunda abertura já traz a
versão nova. Não é bug.
