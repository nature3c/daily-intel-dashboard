export const CATEGORIES = ["ai_ml", "finance", "world"] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ai_ml: "AI / ML",
  finance: "Finance",
  world: "World",
};

export type Article = {
  id: string;
  category: Category;
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  author: string | null;
  image_url: string | null;
  published_at: string;
  fetched_at: string;
  created_at: string;
};

export type Summary = {
  id: string;
  category: Category;
  summary_date: string;
  content: string;
  model: string;
  article_count: number;
  created_at: string;
};

export type NormalizedArticle = Omit<Article, "id" | "fetched_at" | "created_at">;
