# Daily Intel Dashboard — Architecture

A daily news intelligence dashboard that aggregates **AI/ML**, **Finance**, and
**World** news, generates Claude-written summaries per category, stores everything
for a rolling 7-day window, and refreshes automatically every 24 hours.

> **Stack note:** This repo runs **Next.js 16.2.9 (App Router) + React 19.2.4**
> with the **React Compiler** enabled (`next.config.ts → reactCompiler: true`).
> Several APIs differ from older Next.js — every decision below was checked
> against the bundled docs in `node_modules/next/dist/docs/`. See
> [Version-Specific Notes](#version-specific-notes).

---

## 1. System Overview

```
                         ┌───────────────────────────────────────────┐
                         │              Vercel (Next.js 16)            │
                         │                                             │
  Vercel Cron  ──daily──▶│  /api/refresh-news   (Route Handler, POST) │
  (24h schedule)         │     1. fetch headlines per category        │
                         │     2. upsert articles into Supabase        │
                         │     3. ask Claude for per-category summary  │
                         │     4. store summaries                       │
                         │     5. prune data older than 7 days         │
                         │     6. revalidateTag('articles')            │
                         │                                             │
   Browser  ────GET────▶ │  /  and  /archive    (Server Components)    │
                         │     read cached articles + summaries        │
                         └───────────────┬─────────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
        ┌───────────┐            ┌──────────────┐           ┌──────────────┐
        │  NewsAPI  │            │ Anthropic API │           │   Supabase    │
        │ (sources) │            │ (Claude sum.) │           │  (Postgres)   │
        └───────────┘            └──────────────┘           └──────────────┘
```

**Two independent flows:**

- **Ingestion (write path)** — a scheduled Route Handler triggered by Vercel
  Cron once per day. It is the *only* component that talks to NewsAPI and the
  Anthropic API and the *only* one that writes to Supabase.
- **Presentation (read path)** — Server Components that read pre-computed
  articles and summaries from Supabase. The browser never calls NewsAPI,
  Anthropic, or holds any secret. Reads are cached and served as a near-instant
  static shell, invalidated only when the cron job publishes fresh data.

This separation keeps the user-facing pages fast and cheap (no per-request LLM
or third-party calls) and confines all API cost/rate-limit exposure to one daily
job.

---

## 2. Technology Choices

| Concern              | Choice                                | Why |
| -------------------- | ------------------------------------- | --- |
| Framework            | Next.js 16 App Router                 | Required; Server Components keep secrets server-side and enable cached reads. |
| UI runtime           | React 19 + React Compiler             | Already configured; auto-memoization, no manual `useMemo`/`memo`. |
| Styling              | Tailwind CSS v4 (`@tailwindcss/postcss`) | Already configured in the scaffold. |
| News source          | **NewsAPI** (`NEWS_API_KEY`)          | Key already provisioned in `.env.local`; covers category + keyword queries for all three topics. |
| Summaries            | **Anthropic API** via `@anthropic-ai/sdk` | Required. Claude generates the per-category digest. |
| Persistence          | **Supabase** (Postgres)               | Required. Accessed server-side with the **service-role** key. |
| Scheduling           | **Vercel Cron**                       | Native 24h trigger for the refresh Route Handler. |
| Hosting              | **Vercel**                            | Verified Next.js adapter; supports Cron, `after()`, Node runtime. |
| Dates                | `date-fns`                            | Already a dependency; window math and display formatting. |

---

## 3. Data Sources & Categories

Three fixed categories, each mapped to a NewsAPI query:

| Category   | Internal key | NewsAPI strategy (indicative) |
| ---------- | ------------ | ----------------------------- |
| AI / ML    | `ai_ml`      | `everything` endpoint, keyword query (e.g. `"artificial intelligence" OR "machine learning" OR LLM`), English, sorted by recency. |
| Finance    | `finance`    | `top-headlines?category=business` (+ optional finance keyword refinement). |
| World      | `world`      | `top-headlines` general / world headlines. |

The exact NewsAPI endpoints, query strings, and page sizes are an
**implementation detail finalized in Milestone 2**; the category keys above are
the stable contract used across the DB, the ingestion code, and the UI.

Each fetched article is normalized to a common shape before storage so the rest
of the system never depends on NewsAPI's response format.

---

## 4. Data Model (Supabase / Postgres)

> Final column types and indexes are settled in Milestone 1. This is the
> intended shape.

### `articles`
One row per unique article.

| Column         | Type          | Notes |
| -------------- | ------------- | ----- |
| `id`           | `uuid` PK     | `gen_random_uuid()` |
| `category`     | `text`        | one of `ai_ml` \| `finance` \| `world` (CHECK constraint) |
| `title`        | `text`        | |
| `description`  | `text` null   | short blurb from source |
| `url`          | `text` UNIQUE | dedupe key (idempotent upserts) |
| `source`       | `text` null   | source/outlet name |
| `author`       | `text` null   | |
| `image_url`    | `text` null   | |
| `published_at` | `timestamptz` | source publish time; drives the 7-day window |
| `fetched_at`   | `timestamptz` | when ingestion saw it |
| `created_at`   | `timestamptz` | default `now()` |

Indexes: `(category, published_at desc)` for the feed query; UNIQUE `(url)` for
idempotent ingestion.

### `summaries`
One Claude-generated digest per category per day.

| Column         | Type          | Notes |
| -------------- | ------------- | ----- |
| `id`           | `uuid` PK     | |
| `category`     | `text`        | same enum as above |
| `summary_date` | `date`        | the day the digest covers |
| `content`      | `text`        | Claude output (markdown) |
| `model`        | `text`        | model id used (audit) |
| `article_count`| `int`         | how many articles fed the summary |
| `created_at`   | `timestamptz` | default `now()` |

Unique `(category, summary_date)` so a re-run of the same day overwrites
(upsert) rather than duplicates.

### Retention
The 7-day window is enforced inside the daily job (Milestone 4): delete
`articles` and `summaries` whose `published_at` / `summary_date` is older than
`now() - 7 days`. A Postgres scheduled function is a possible alternative but the
in-job delete keeps retention logic in one place.

### Security model
- All DB access is **server-side only**, using `SUPABASE_SERVICE_ROLE_KEY`
  (never exposed to the client; not prefixed `NEXT_PUBLIC_`).
- Row Level Security is enabled on both tables; because the app reads via the
  service role from Server Components, no public anon access is granted by
  default. (If a future client-side read is added, add an explicit read-only
  anon policy then.)

---

## 5. Application Structure

```
src/
├── app/
│   ├── layout.tsx              # root layout (fonts, shell) — update branding
│   ├── page.tsx                # Dashboard: today's articles + summaries
│   ├── archive/
│   │   └── page.tsx            # 7-day history view
│   └── api/
│       └── refresh-news/
│           └── route.ts        # POST handler, triggered by Vercel Cron
├── components/
│   ├── CategoryTabs.tsx        # switch between AI/ML, Finance, World
│   ├── SummaryCard.tsx         # renders a Claude summary
│   └── ArticleCard.tsx         # renders one article
├── lib/
│   ├── supabase.ts             # server-side Supabase client (service role)
│   ├── news.ts                 # NewsAPI fetch + normalization
│   ├── anthropic.ts            # Anthropic client + summarize()
│   └── prompts.ts              # summary prompt templates
└── types/
    └── news.ts                 # shared types: Category, Article, Summary
```

All of these files already exist as **empty placeholders** in the scaffold;
the milestones fill them in. `app/page.tsx` and `app/layout.tsx` currently hold
the default create-next-app content and will be replaced.

### Read path (pages)
- `page.tsx` and `archive/page.tsx` are **async Server Components**.
- They call a cached data-access function (`lib/`), e.g. `getArticles(category)`
  and `getSummaries(category)`, which wrap the Supabase query in `use cache`
  with `cacheTag('articles')` / `cacheTag('summaries')`.
- Category switching is done with `CategoryTabs` (client component for
  interactivity) driving either a `?category=` search param or client-side
  filtering of already-fetched data — decided in Milestone 5.

### Write path (cron route)
`POST /api/refresh-news` (Node runtime) performs, in order:
1. **Authorize** the request (see §6).
2. For each category: fetch from NewsAPI → normalize → **upsert** into
   `articles` (on `url` conflict).
3. For each category: gather the day's articles → call Claude → **upsert** into
   `summaries`.
4. **Prune** rows older than 7 days.
5. `revalidateTag('articles')` and `revalidateTag('summaries')` so the next page
   load serves fresh content.
6. Return a JSON status report.

Long-running, non-blocking side effects (e.g. logging, secondary summary passes)
can be deferred with **`after()`** from `next/server` so the cron response
returns promptly.

---

## 6. Refresh & Scheduling

- **Trigger:** Vercel Cron entry in `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/refresh-news", "schedule": "0 6 * * *" }] }
  ```
  (Daily at 06:00 UTC — exact time tunable. Vercel Hobby supports daily cron.)
- **Authorization:** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
  The Route Handler rejects (`401`) any request whose bearer token does not
  match `process.env.CRON_SECRET`. This prevents the public endpoint from being
  abused to burn NewsAPI/Anthropic quota.
- **Runtime/limits:** Cache Components requires the default Node.js runtime and
  rejects an explicit `runtime` route export, so the route relies on that
  default for the Anthropic SDK + service-role Supabase work. It raises
  `export const maxDuration` to cover the multi-step fetch+LLM work.
- **Idempotency:** upserts on `url` (articles) and `(category, summary_date)`
  (summaries) mean re-running the job — manually or on retry — never duplicates.
- **Manual trigger:** the same endpoint can be invoked manually (with the
  bearer secret) during development to seed/refresh on demand.

---

## 7. Claude Summaries

- One summary per category per run, generated in `lib/anthropic.ts` using
  prompts in `lib/prompts.ts`.
- Input: the category's recent articles (titles + descriptions + sources).
- Output: a concise markdown digest (the "what mattered today in X") stored in
  `summaries.content` and rendered by `SummaryCard`.
- The model id is read from a single constant/env so it can be upgraded in one
  place, and is recorded per row in `summaries.model` for auditability.

> Model selection, token budget, and exact prompt wording are finalized in
> Milestone 3 after reading the bundled Anthropic SDK guidance (see the
> `claude-api` reference) — do not hard-code a model from memory.

---

## 8. Rendering & Caching Model

The read path is built on **Cache Components** (`cacheComponents: true` in
`next.config.ts`), which is the version-appropriate caching model in Next.js 16:

- Data-access functions use the **`use cache`** directive with **`cacheLife`**
  (a daily-ish profile) and **`cacheTag`**.
- The daily job calls **`revalidateTag(...)`** after writing, giving
  stale-while-revalidate freshness with zero per-request third-party calls.
- This yields a static shell that renders instantly, with the cached article/
  summary data baked in until the next refresh.
- Route Handlers are **not** cached by default in Next.js 16 (GET became dynamic
  in v15), so the refresh endpoint always runs fresh — exactly what we want.

Optional polish (later milestone): `export const unstable_instant` on the
dashboard route to validate instant client-side navigation between category
views. This export only works with Cache Components enabled.

---

## 9. Environment Variables

Already present in `.env.local` (and to be configured in Vercel project
settings for production):

| Variable                       | Scope        | Used by |
| ------------------------------ | ------------ | ------- |
| `NEWS_API_KEY`                 | server       | `lib/news.ts` (ingestion only) |
| `ANTHROPIC_API_KEY`            | server       | `lib/anthropic.ts` |
| `NEXT_PUBLIC_SUPABASE_URL`     | server+client| Supabase client URL |
| `SUPABASE_SERVICE_ROLE_KEY`    | server only  | `lib/supabase.ts` (writes + privileged reads) |
| `CRON_SECRET`                  | server only  | `/api/refresh-news` authorization |

> Only `NEXT_PUBLIC_*` values are ever shipped to the browser. The service-role
> key and all API keys stay server-side.

---

## 10. Deployment (Vercel)

- Push to the connected Git repo; Vercel builds with `next build`.
- Configure all env vars (§9) in the Vercel project (Production + Preview).
- `vercel.json` registers the daily cron.
- Provision the Supabase tables/migrations before the first production cron run,
  and run one manual refresh to seed data.

---

## 11. Version-Specific Notes

Confirmed against `node_modules/next/dist/docs/` for Next.js 16.2.9 — these
differ from older mental models:

- **Route Handlers are dynamic by default**; `GET` caching is opt-in only. Our
  refresh handler is a `POST` and intentionally uncached.
- **`context.params` is a Promise** in Route Handlers (`await params`).
- **`after()`** is stable (`import { after } from 'next/server'`) for
  post-response work; on Vercel it is backed by `waitUntil`.
- **Caching uses the Cache Components model**: `use cache`, `cacheLife`,
  `cacheTag`, and `revalidateTag` from `next/cache` (requires
  `cacheComponents: true`). The legacy `fetch`-level caching is the fallback
  "previous model" and is not the path chosen here.
- **`unstable_instant`** route export exists in v16 for instant-navigation
  validation, Cache-Components-only, and cannot be used in Client Components.
- **Runtime:** Cache Components requires Node.js and rejects an explicit
  `runtime` route export. The refresh route therefore uses the Node.js default;
  Edge is unsupported and cannot run this service-role/Anthropic work safely.
- The React Compiler is on, so avoid manual memoization.

---

## 12. Out of Scope (v1)

- User accounts / personalization.
- Real-time / sub-daily updates (refresh is fixed at 24h).
- Editing or moderating articles.
- Additional categories beyond the three required.
- Email/push digests (the dashboard is the only surface).
