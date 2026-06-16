create extension if not exists "pgcrypto";

drop table if exists public.summaries cascade;
drop table if exists public.articles cascade;

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  category text not null constraint articles_category_check check (category in ('ai_ml', 'finance', 'world')),
  title text not null,
  description text,
  url text not null unique,
  source text,
  author text,
  image_url text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index articles_category_published_at_idx
  on public.articles (category, published_at desc);

alter table public.articles enable row level security;

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  category text not null constraint summaries_category_check check (category in ('ai_ml', 'finance', 'world')),
  summary_date date not null,
  content text not null,
  model text not null,
  article_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (category, summary_date)
);

alter table public.summaries enable row level security;
