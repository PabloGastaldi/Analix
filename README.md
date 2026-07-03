# Analix

Subís un CSV/Excel, escribís un comentario en lenguaje natural y obtenés un dashboard
con gráficos, un resumen escrito y un chat sobre tus datos. Con números exactos.

**Regla de oro:** el LLM planifica y traduce a SQL; DuckDB-WASM calcula en tu navegador.
Nunca se le mandan filas al modelo — solo el esquema, las estadísticas y tu comentario.
Los datos crudos no salen del navegador.

## Stack

Next.js (App Router) + TypeScript · Tailwind v4 + shadcn/ui · DuckDB-WASM · Recharts ·
Zod · Zustand · Claude API (Sonnet 5 para plan/SQL). Ver [`CLAUDE.md`](CLAUDE.md) para el
contexto completo.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abrí el `localhost` que muestre la consola.

### Variables de entorno

Las llamadas a Claude corren **solo en el servidor** (route handlers en `app/api/*`).
Necesitás una API key de Anthropic:

1. Creá un archivo `.env.local` en la raíz.
2. Agregá tu key:

   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```

**Nunca** la prefijes con `NEXT_PUBLIC_` ni la expongas al cliente. `.env.local` ya está
en `.gitignore`, así que la key no se commitea.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run test` | Tests unitarios (Vitest) |
| `npm run lint` | ESLint |
