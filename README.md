# Mapa do Mapa

Plataforma que conecta profissionais autônomos a clientes em São Paulo.
**Etapa 1:** landing page de pré-lançamento (abertura prevista: 25/11/2026).

## Stack
React + TypeScript + Vite · Tailwind CSS v4 · PWA (vite-plugin-pwa) · Netlify

## Comandos
```bash
npm install
npm run dev        # desenvolvimento
npm run build      # typecheck + build de produção (gera o service worker)
npm run preview    # serve o build local
npm run brand      # regenera logo (reverso) e ícones PWA a partir de brand/logo-atual.webp
```

## Onde editar
- `src/config/site.ts` — data de abertura, textos globais
- `src/data/categories.ts` — as 9 profissões aprovadas (usadas também no futuro quiz e banco de dados)
- `src/data/steps.ts` — passos e benefícios
- `src/index.css` — tokens de cor e tipografia da marca

## Deploy (Netlify)
Build `npm run build`, publish `dist` (já em `netlify.toml`, com redirecionamento SPA).
