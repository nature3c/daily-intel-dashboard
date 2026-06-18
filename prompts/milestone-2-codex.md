# Codex Task — Milestone 2: News Ingestion (NewsAPI)

You are working in the `daily-intel-dashboard` repo (Next.js 16.2.9, TypeScript,
Supabase). Milestone 1 (the Supabase persistence layer) is complete. Your job is
**Milestone 2 only**: fetch and normalize real articles for all three categories
and upsert them into the `articles` table — deduped and idempotent.

## Before you write any code (required reading)

1. `AGENTS.md` / `CLAUDE.md`: this is **Next.js 16.2.9**, whose APIs differ from
   older versions. Do not assume conventions from memory.
2. **NewsAPI docs** (https://newsapi.org/docs) — confirm the exact request shape,
   auth header/param, response fields, page-size limits, and error/rate-limit
   response format before coding. Do **not** hard-code field assumptions.
3. `ARCHITECTURE.md` §3 (Categories) and §4 (Data Model) — the category keys and
   `articles` columns are the stable contract.
4. Existing code you must reuse, not duplicate:
   - `src/types/news.ts` — `Category`, `Article`, and `NormalizedArticle`
     (`Omit<Article, "id" | "fetched_at" | "created_at">`). Map NewsAPI fields to
     `NormalizedArticle`.
   - `src/lib/supabase.ts` — the server-only `supabase` client (typed `Database`).
     Use this for all DB access; never create a second client.
   - `scripts/smoke-supabase.mjs` — the upsert pattern (`onConflict: "url"`) and
     the env-loading approach (`@next/env` `loadEnvConfig`) to copy for your
     verification script.

## Environment

- `NEWS_API_KEY` is already provisioned in `.env.local` (server-only — never
  `NEXT_PUBLIC_`).
- Add `NEWS_API_KEY=` to `.env.example` (name only, no value) and document it in
  the README env table.

## Category → query contract (from ARCHITECTURE §3)

Finalize the exact endpoint/query/page-size here in M2; keep the internal keys fixed.

| Internal key | Strategy (indicative — confirm against NewsAPI docs) |
|---|---|
| `ai_ml`   | `everything` endpoint, keyword query (e.g. `"artificial intelligence" OR "machine learning" OR LLM`), English, sorted by recency |
| `finance` | `top-headlines?category=business` (optionally refined with a finance keyword) |
| `world`   | `top-headlines` general/world headlines |

Centralize per-category query config so it sits next to the category source of truth.

## Deliverables (the M2 checklist in `TASKS.md`)

1. **`src/lib/news.ts`** — `fetchCategory(category: Category): Promise<NormalizedArticle[]>`:
   - Build the per-category NewsAPI request, send it, parse the response.
   - Map NewsAPI fields → `NormalizedArticle` (title, description, url, source
     name, author, image_url, `published_at`).
   - **Drop items missing `url` or `title`.** Parse `published_at` into a valid
     ISO timestamptz string; drop/skip items with an unparseable date.
   - Use `image_url: null` / `description: null` etc. when the source omits them
     (match the nullable columns in the schema).

2. **`upsertArticles(articles: NormalizedArticle[])`** DB helper — conflict on
   `url` (idempotent; re-running must not create dupes). Put it where the other
   DB access lives (e.g. `src/lib/supabase.ts` or `src/lib/news.ts` — pick one and
   be consistent); return how many rows were processed. Handle the empty-array case.

3. **Graceful error / rate-limit handling** — a single category failing (network
   error, non-200, NewsAPI `status: "error"`, or 429 rate limit) **must not abort
   the other categories**. Surface a per-category result `{ category, fetched,
   upserted, error? }` rather than throwing out of the whole run.

4. **Verification** — add a small ingestion runner (mirror `scripts/smoke-supabase.mjs`:
   `@next/env` for env, plain `.mjs` or a `tsx`-run script) that ingests all three
   categories and prints per-category counts. Running it twice must show no
   duplicate rows (idempotency). Add an `npm` script for it (and optionally one for
   the existing supabase smoke test).

## Constraints & guardrails

- **Server-only.** `NEWS_API_KEY` and the Supabase service-role key must never
  reach the client bundle. Do not import `news.ts`/`supabase.ts` into a Client
  Component.
- **Do not** build the `/api/refresh-news` route, scheduling, retention/pruning,
  or Claude summaries — those are Milestones 3–4. M2 is fetch → normalize → upsert
  only.
- Keep the public API of `news.ts` typed against `src/types/news.ts`; don't leak
  raw NewsAPI response shapes into the rest of the system.
- `next build` must pass with no type errors; `npm run lint` clean.

## Done when

All three categories fetch, normalize, and upsert into `articles` with no
duplicates, per-category failures are isolated, and the verification script proves
idempotency on re-run. Then tick the Milestone 2 boxes in `TASKS.md` and commit.
