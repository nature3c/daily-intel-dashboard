import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Article, NormalizedArticle, Summary } from "@/types/news";

type InsertableArticle = Omit<Article, "id" | "fetched_at" | "created_at"> & {
  id?: string;
  fetched_at?: string;
  created_at?: string;
};

type UpdatableArticle = Partial<InsertableArticle>;

type InsertableSummary = Omit<Summary, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

type UpdatableSummary = Partial<InsertableSummary>;

export type Database = {
  public: {
    Tables: {
      articles: {
        Row: Article;
        Insert: InsertableArticle;
        Update: UpdatableArticle;
        Relationships: [];
      };
      summaries: {
        Row: Summary;
        Insert: InsertableSummary;
        Update: UpdatableSummary;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for Supabase server client.");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for Supabase server client.");
}

// Server-only: never import this module into a Client Component. The service-role
// key is intentionally not NEXT_PUBLIC_ and must never reach the browser.
export const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export async function upsertArticles(
  articles: NormalizedArticle[],
): Promise<number> {
  if (articles.length === 0) {
    return 0;
  }

  const { count, error } = await supabase
    .from("articles")
    .upsert(articles, { onConflict: "url", count: "exact" });

  if (error) {
    throw new Error(`Failed to upsert articles: ${error.message}`);
  }

  return count ?? articles.length;
}
