# Analix — App de datos → dashboard + chat

## Qué es

Web donde el usuario sube CSV/Excel, escribe un comentario en lenguaje natural
("estos son los números de la empresa, mostrame lo más importante") y recibe un
dashboard con gráficos, un resumen escrito y un chat para consultar sus datos, con
opción de descargar el dashboard.

## Regla de oro (no negociable)

El LLM **planifica y traduce a SQL**. El motor (**DuckDB-WASM**) **calcula**. NUNCA se
le mandan filas de datos al modelo: solo viajan el esquema (nombres de columna + tipos),
las estadísticas resumidas y el comentario del usuario. El número siempre sale de la
base, nunca de la imaginación del modelo.

Esto resuelve las dos objeciones frente a "pegarle el Excel a un chat":

- **Exactitud:** SQL determinístico contra alucinación.
- **Privacidad:** los datos crudos se quedan en el navegador (DuckDB-WASM). Al servidor
  y al modelo solo suben metadatos.

## Stack

- **Framework:** Next.js (App Router) + TypeScript.
- **UI:** Tailwind v4 (CSS-first, tokens en `app/globals.css`) + shadcn/ui.
- **Gráficos:** Recharts.
- **Parseo:** SheetJS (xlsx) + PapaParse (csv), en el navegador.
- **Motor de consulta:** DuckDB-WASM (client-side). Corazón del proyecto.
- **Validación:** Zod. Toda respuesta del LLM se valida antes de usarse.
- **Estado:** Zustand (o Context) para dataset, perfil, plan y chat.
- **IA:** Claude API — Sonnet 5 para SQL/plan, Sonnet para narrativa. Siempre vía route
  handlers en `app/api/*`.
- **Export:** html-to-image / jsPDF (o print CSS).

### Modelos

- Plan/SQL: `claude-sonnet-5` (elección del usuario; $3/$15 por 1M, $2/$10 intro hasta
  2026-08-31). `thinking: {type: "disabled"}` explícito — Sonnet 5 corre adaptive thinking
  por defecto y eso consumiría el `max_tokens` del plan.
- Resumen narrado: un Sonnet actual (a confirmar).
- **Antes de cablear IA (Fases 2–3):** confirmar IDs de modelo, precios y forma de la
  request actual con la skill `claude-api` / `https://docs.claude.com`. No hardcodear
  strings de modelo sin verificar.

## Seguridad

La API key vive **solo en el server**. Prohibido exponerla al cliente o en variables
`NEXT_PUBLIC_`. Todas las llamadas a Claude pasan por route handlers (`app/api/*`).
Rate limiting en los handlers. Como solo viajan metadatos, cada corrida cuesta centavos.

## Contratos de tipos

Fuente de verdad: `lib/schemas/` (TS + Zod paralelos). No dupliques estos tipos; importalos.

- `lib/schemas/profile.ts` — `SemanticType`, `RawType`, `ColumnStats`, `ColumnProfile`,
  `TableProfile`. Es el perfil determinístico de los datos (lo produce `lib/profile/`, no
  la IA).
- `lib/schemas/plan.ts` — `ChartType`, `ValueFormat`, `WidgetEncoding`, `Widget`,
  `DashboardPlan`. Es lo que devuelve el LLM (JSON de widgets con SQL). Se valida con
  `dashboardPlanSchema` ANTES de tocar DuckDB; si no valida, se reintenta una vez pidiendo
  JSON válido.

## Tipado semántico (heurísticas, en `lib/profile/`)

- Número con `distinctCount` bajo (< ~15) y entero → `categorical_low` (rating, año).
- Número con `distinctCount ≈ rowCount` → `id`.
- Número continuo con rango amplio / decimales → `measure_continuous`.
- String con pocas categorías → `categorical_low`; con muchas → `categorical_high`.
- Parsea como fecha, o el nombre matchea `fecha|date|año|periodo` → `temporal`.
- El nombre matchea `precio|monto|total|importe|cantidad` → refuerza `measure_*`.
- **Siempre** dejá que el usuario corrija el tipo (dropdown por columna). El tipado falla
  a veces (código postal como número); convertir el error en algo editable es el patrón
  profesional.

## Loop de corrección de SQL

Al ejecutar el SQL de un widget en DuckDB: si falla, reintentar pasándole el error y el
esquema para que lo corrija. **Máximo 2 reintentos.** Si sigue fallando, marcar ese widget
como no disponible — nunca romper el dashboard entero.

## Sistema de diseño (derivado del mockup)

### Tokens de color (definidos en `app/globals.css`)

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#F6F5FC` | lavanda casi blanco (fondo de página) |
| `--bg-glow` | `#A78BFA` | glow radial suave arriba-derecha |
| `--card` | `#FFFFFF` | superficies / cards |
| `--muted` | `#FBFBFE` | superficie tenue |
| `--border` | `#ECEBF5` | hairline |
| `--primary` / `--brand` | `#6366F1` | índigo — botones, nav activo, línea del chart |
| `--brand-strong` | `#4F46E5` | hover/activo índigo |
| `--teal` | `#14B8A6` | segmentos de gráficos |
| `--positive` | `#10B981` | variaciones positivas |
| `--negative` / `--destructive` | `#EF4444` | negativas / error |
| `--foreground` | `#1E1B2E` | casi negro violáceo (texto) |
| `--muted-foreground` | `#6B7280` | texto secundario |

Los slots semánticos de shadcn ya apuntan a esta paleta. Los tokens de marca
(`brand`, `teal`, `positive`, etc.) están expuestos como utilidades (`bg-teal`,
`text-positive`…). Paleta de charts: `--chart-1..5`.

### Tipografía (3 roles)

- **UI / body:** Inter (400/500/600) — `--font-sans`.
- **Display (hero):** Inter 700 con `letter-spacing` negativo (tracking tight).
- **Datos / mono:** JetBrains Mono — `--font-mono`. Para números crudos, preview de tablas
  y el SQL del chat. Usá `tabular-nums` en TODAS las cifras de KPI.

### Radios y sombra

- Cards: `--radius-card` (20px). Inner: `--radius-inner` (12px). Chips y botón de upload: full.
- Sombra de card: `--shadow-card`
  (`0 12px 32px -8px rgb(79 70 229 / .12), 0 1px 2px rgb(30 27 46 / .04)`).

### Elemento signature

El momento en que la app **lee** el archivo: mientras carga, cada columna aparece con una
etiqueta de color según su tipo inferido (`temporal`, `medida`, `categoría`, `id`…), como
un reveal breve, y es editable ahí mismo. Es lo único que un dashboard genérico no tiene.
Gastá la audacia visual acá y mantené el resto disciplinado.

Piso de calidad sin anunciarlo: responsive hasta mobile, foco de teclado visible,
`prefers-reduced-motion` respetado. Copy en voz activa y en el idioma del usuario
("Subí tus archivos", no "Cargar archivos del sistema").

## Estructura del repo

```
app/
  page.tsx              # landing (hero + upload)
  dashboard/page.tsx    # app principal (sidebar + canvas)
  api/plan|summary|chat # route handlers (server-side, Claude)
lib/
  duckdb/ parse/ profile/ charts/ ai/   # motor, parseo, perfilado, charts, IA
  schemas/              # contratos Zod compartidos (fuente de verdad)
components/
  landing/ dashboard/ data/ chat/       # UI por dominio
public/hero-bg.png      # imagen de fondo del hero
```

## Convenciones

- TypeScript estricto. Componentes funcionales. Nada de `any`.
- Toda respuesta del LLM se valida con Zod antes de usarse.
- Todo SQL que falla entra al loop de corrección (máx 2 intentos) y degrada sin romper.
- Copy en el idioma del usuario, voz activa, sentence case.
- Comentarios y nombres de código en inglés; copy de UI en español.

## Cómo trabajar (fases)

Una fase por sesión, en plan mode primero, commit al cerrar. No pasar a la siguiente hasta
cumplir el criterio de aceptación.

0. Setup (este). 1. Landing + ingesta + perfilado (sin IA). 2. Dashboard dirigido por
comentario. 3. Resumen narrado. 4. Chat text-to-SQL. 5. Export. 6. Multi-archivo con joins
(frágil, con confirmación). 7. Pulido.

El MVP demo-ready es **un solo archivo de punta a punta**. El multi-archivo es la versión
completa, no por dónde empezar. Frená el scope si algo se adelanta de fase.
