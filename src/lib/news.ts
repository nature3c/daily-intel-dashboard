import "server-only";

import { upsertArticles } from "@/lib/supabase";
import { CATEGORIES, type Category, type NormalizedArticle } from "@/types/news";

const NEWS_API_BASE_URL = "https://newsapi.org/v2";
const DEFAULT_PAGE_SIZE = "50";

type NewsApiEndpoint = "everything" | "top-headlines";

type CategoryQueryConfig = {
  endpoint: NewsApiEndpoint;
  params: Record<string, string>;
};

type NewsApiArticle = {
  source?: {
    id?: string | null;
    name?: string | null;
  } | null;
  author?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
};

type NewsApiOkResponse = {
  status: "ok";
  totalResults: number;
  articles: NewsApiArticle[];
};

type NewsApiErrorResponse = {
  status: "error";
  code?: string;
  message?: string;
};

type NewsApiResponse = NewsApiOkResponse | NewsApiErrorResponse;

export type CategoryIngestionResult = {
  category: Category;
  fetched: number;
  upserted: number;
  error?: string;
};

export const CATEGORY_QUERY_CONFIG: Record<Category, CategoryQueryConfig> = {
  ai_ml: {
    endpoint: "everything",
    params: {
      q: '"artificial intelligence" OR "machine learning" OR LLM',
      language: "en",
      sortBy: "publishedAt",
      pageSize: DEFAULT_PAGE_SIZE,
      page: "1",
    },
  },
  finance: {
    endpoint: "top-headlines",
    params: {
      country: "us",
      category: "business",
      pageSize: DEFAULT_PAGE_SIZE,
      page: "1",
    },
  },
  world: {
    endpoint: "top-headlines",
    params: {
      country: "us",
      category: "general",
      pageSize: DEFAULT_PAGE_SIZE,
      page: "1",
    },
  },
};

function requireNewsApiKey(): string {
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing NEWS_API_KEY.");
  }

  return apiKey;
}

function buildCategoryUrl(category: Category): URL {
  const config = CATEGORY_QUERY_CONFIG[category];
  const url = new URL(`${NEWS_API_BASE_URL}/${config.endpoint}`);

  for (const [key, value] of Object.entries(config.params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown): string | null {
  return normalizeOptionalString(value);
}

function normalizePublishedAt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeArticle(
  category: Category,
  article: NewsApiArticle,
): NormalizedArticle | null {
  const title = normalizeRequiredString(article.title);
  const url = normalizeRequiredString(article.url);
  const publishedAt = normalizePublishedAt(article.publishedAt);

  if (!title || !url || !publishedAt) {
    return null;
  }

  return {
    category,
    title,
    description: normalizeOptionalString(article.description),
    url,
    source: normalizeOptionalString(article.source?.name),
    author: normalizeOptionalString(article.author),
    image_url: normalizeOptionalString(article.urlToImage),
    published_at: publishedAt,
  };
}

function formatNewsApiError(response: NewsApiErrorResponse): string {
  const code = response.code ? `${response.code}: ` : "";
  return `${code}${response.message ?? "NewsAPI returned an error."}`;
}

function isNewsApiResponse(value: unknown): value is NewsApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value.status === "ok" || value.status === "error")
  );
}

export async function fetchCategory(
  category: Category,
): Promise<NormalizedArticle[]> {
  const response = await fetch(buildCategoryUrl(category), {
    cache: "no-store",
    headers: {
      "X-Api-Key": requireNewsApiKey(),
    },
  });

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `NewsAPI ${category} request failed with HTTP ${response.status}; response was not valid JSON.`,
    );
  }

  if (!isNewsApiResponse(payload)) {
    throw new Error(`NewsAPI ${category} response had an unexpected shape.`);
  }

  if (!response.ok || payload.status === "error") {
    const details =
      payload.status === "error"
        ? formatNewsApiError(payload)
        : `HTTP ${response.status}`;

    throw new Error(`NewsAPI ${category} request failed: ${details}`);
  }

  if (!Array.isArray(payload.articles)) {
    throw new Error(`NewsAPI ${category} response did not include articles.`);
  }

  return payload.articles
    .map((article) => normalizeArticle(category, article))
    .filter((article): article is NormalizedArticle => article !== null);
}

export async function ingestAllCategories(): Promise<
  CategoryIngestionResult[]
> {
  const results: CategoryIngestionResult[] = [];

  for (const category of CATEGORIES) {
    try {
      const articles = await fetchCategory(category);
      const upserted = await upsertArticles(articles);

      results.push({
        category,
        fetched: articles.length,
        upserted,
      });
    } catch (error) {
      results.push({
        category,
        fetched: 0,
        upserted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
