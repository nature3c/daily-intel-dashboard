# Daily Intel Dashboard

A daily news intelligence dashboard that aggregates **AI/ML**, **Finance**, and
**World** news, generates Claude-written summaries per category, stores articles
for a rolling 7-day window, and refreshes automatically every 24 hours.

- **Architecture & design:** see [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Roadmap & progress:** see [`TASKS.md`](./TASKS.md)

## Stack

Next.js 16 (App Router, React 19, React Compiler) · Supabase (Postgres) ·
Anthropic API (Claude) · NewsAPI · deployed on Vercel.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` from the template and fill in your values:
   ```bash
   cp .env.example .env.local
   ```
   Required variables (see [`.env.example`](./.env.example)):
   | Variable | Purpose |
   | --- | --- |
   | `NEWS_API_KEY` | NewsAPI key (article ingestion) |
   | `ANTHROPIC_API_KEY` | Claude summaries |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access (never exposed to the client) |
   | `CRON_SECRET` | Authorizes the daily refresh endpoint |
3. Apply the database schema (Supabase SQL editor or CLI):
   ```
   supabase/migrations/0001_init.sql
   ```
4. Verify the database connection:
   ```bash
   node scripts/smoke-supabase.mjs
   ```

## Development

```bash
npm run dev      # start the dev server (http://localhost:3000)
npm run build    # production build
npm run lint     # lint
npm run ingest-news # fetch NewsAPI articles and upsert them into Supabase
```

## Project layout

```
src/
├── app/         # routes: dashboard, archive, /api/refresh-news
├── components/  # ArticleCard, SummaryCard, CategoryTabs
├── lib/         # supabase, news (NewsAPI), anthropic, prompts
└── types/       # shared Article / Summary / Category types
supabase/
└── migrations/  # database schema
scripts/         # operational scripts (e.g. smoke test)
```
