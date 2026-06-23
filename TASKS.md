# Daily Intel Dashboard — Tasks

Work is organized into **7 milestones**. Each milestone is independently
shippable/testable and builds on the previous one. See `ARCHITECTURE.md` for the
design these tasks implement.

> **Before writing any code:** this repo runs Next.js 16.2.9, whose APIs differ
> from older versions. Read the relevant guide in `node_modules/next/dist/docs/`
> first (per `AGENTS.md`). For anything touching Claude/Anthropic, consult the
> `claude-api` reference — do not hard-code a model from memory.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Milestone 0 — Foundations & Types
*Goal: shared contracts and config in place before any feature work.*

- [x] Define shared types in `src/types/news.ts`: `Category` (`'ai_ml' | 'finance' | 'world'`), `Article`, `Summary`, and the normalized article shape.
- [x] Add a single source of truth for the category list + display labels (used by UI and ingestion).
- [x] Enable Cache Components in `next.config.ts` (`cacheComponents: true`) alongside the existing `reactCompiler: true`.
- [x] Confirm `.env.local` keys load correctly; document each in the README.
- [x] Add `.env.example` (names only, no secret values).

**Done when:** types compile, category enum is importable, config builds clean.

---

## Milestone 1 — Supabase Persistence Layer
*Goal: the database exists and is reachable from the server.*

- [x] Create the `articles` table (schema per ARCHITECTURE §4) with the `(category, published_at desc)` index and `UNIQUE(url)`.
- [x] Create the `summaries` table with `UNIQUE(category, summary_date)`.
- [x] Enable RLS on both tables; no public anon policies (server/service-role access only).
- [x] Capture the schema as a committed SQL migration in the repo.
- [x] Implement `src/lib/supabase.ts`: a server-only client using `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`.
- [x] Smoke test: insert + read a dummy row from a server context.

**Done when:** tables exist, migration is committed, server can read/write.

---

## Milestone 2 — News Ingestion (NewsAPI)
*Goal: fetch and normalize real articles for all three categories.*

- [x] Read NewsAPI docs; finalize endpoint + query per category (AI/ML, Finance, World).
- [x] Implement `src/lib/news.ts`: `fetchCategory(category)` → normalized `Article[]` (map fields, drop items missing url/title, parse `published_at`).
- [x] Implement an `upsertArticles(articles)` DB helper (conflict on `url`).
- [x] Handle NewsAPI errors/rate limits gracefully (per-category failure shouldn't abort the others).
- [x] Verify: running ingestion populates `articles` with deduped rows.

**Done when:** all three categories fetch, normalize, and upsert without dupes.

---

## Milestone 3 — Claude Summaries (Anthropic)
*Goal: generate and store a per-category digest.*

- [x] Read the `claude-api` reference; pick the model id (single constant/env).
- [x] Write prompt templates in `src/lib/prompts.ts` (one digest per category from titles/descriptions/sources).
- [x] Implement `src/lib/anthropic.ts`: client init + `summarize(category, articles)` → markdown.
- [x] Implement `upsertSummary(...)` DB helper (conflict on `(category, summary_date)`, record `model` + `article_count`).
- [x] Verify: a summary is generated and stored for each category.

**Done when:** each category has a stored, readable Claude summary for the day.

---

## Milestone 4 — Refresh Route + Scheduling + Retention
*Goal: one daily job that ingests, summarizes, prunes, and revalidates.*

- [x] Read the Route Handler + `after()` + route-segment-config docs.
- [x] Implement `POST /api/refresh-news` (`src/app/api/refresh-news/route.ts`): orchestrate fetch → upsert → summarize → prune → `revalidateTag`.
- [x] Use the Cache Components Node.js runtime default and set an appropriate `maxDuration` on the route.
- [x] Authorize via `Authorization: Bearer ${CRON_SECRET}`; return `401` otherwise.
- [x] Implement 7-day retention: delete `articles`/`summaries` older than `now() - 7 days`.
- [x] Add `vercel.json` with a daily cron pointing at `/api/refresh-news`.
- [x] Return a JSON status report (counts per category, pruned count, timing).
- [x] Verify: manual authorized call runs end-to-end and is idempotent on re-run.

**Done when:** one authorized call refreshes everything and prunes old data; unauthorized calls are rejected.

---

## Milestone 5 — Dashboard UI (read path)
*Goal: users see today's news + summaries, switchable by category.*

- [ ] Replace default `src/app/layout.tsx` branding/metadata for the dashboard.
- [ ] Implement cached data-access helpers (`getArticles`, `getSummaries`) using `use cache` + `cacheTag` + `cacheLife`.
- [ ] Build `src/components/ArticleCard.tsx`, `SummaryCard.tsx`, `CategoryTabs.tsx`.
- [ ] Implement `src/app/page.tsx` (async Server Component): summary + article list for the selected category.
- [ ] Wire `CategoryTabs` to switch categories (search param or client filter).
- [ ] Handle empty/loading states (e.g. before the first cron run).

**Done when:** the dashboard renders real articles + summaries and switches categories.

---

## Milestone 6 — Archive (7-day history)
*Goal: browse the rolling window beyond today.*

- [ ] Implement `src/app/archive/page.tsx`: articles/summaries grouped by day across the 7-day window.
- [ ] Reuse the cached data-access helpers (extend for date ranges).
- [ ] Add navigation between dashboard and archive.
- [ ] Verify the window correctly shows ≤7 days and nothing older.

**Done when:** archive shows the full retained history, grouped by day.

---

## Milestone 7 — Deployment & Hardening
*Goal: live on Vercel, refreshing daily, with confidence.*

- [ ] Configure all env vars (ARCHITECTURE §9) in Vercel (Production + Preview).
- [ ] Run Supabase migrations against the production project.
- [ ] Deploy; trigger one manual authorized refresh to seed data.
- [ ] Confirm the Vercel Cron entry is registered and fires.
- [ ] Verify secrets never reach the client (only `NEXT_PUBLIC_*` in the bundle).
- [ ] Run `/security-review` on the diff before launch.
- [ ] (Optional) Add `unstable_instant` to the dashboard route and validate instant navigation.
- [ ] Update README with setup, env, and operational runbook (manual refresh, etc.).

**Done when:** the app is deployed, the daily cron runs, and a fresh visitor sees current news with no client-side secrets.

---

## Cross-cutting / Definition of Done
- [ ] `next build` passes; no type errors.
- [ ] No secret is exposed to the client.
- [ ] Ingestion + summaries are idempotent (safe to re-run).
- [ ] Retention keeps exactly a 7-day rolling window.
- [ ] Refresh endpoint is unauthenticated-proof (`CRON_SECRET` enforced).
