import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { buildDigestPrompt } from "@/lib/prompts";
import {
  getArticlesForCategoryDate,
  upsertSummary,
} from "@/lib/supabase";
import { CATEGORIES, type Article, type Category } from "@/types/news";

export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

const MAX_TOKENS = 2_000;

export type CategorySummaryResult = {
  category: Category;
  article_count: number;
  model: string;
  upserted: number;
  skipped?: string;
  error?: string;
};

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  anthropicClient ??= new Anthropic({ apiKey });
  return anthropicClient;
}

function getSummaryDay(now: Date): {
  summaryDate: string;
  startInclusive: string;
  endExclusive: string;
} {
  const summaryDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const startInclusive = `${summaryDate}T00:00:00.000Z`;
  const end = new Date(startInclusive);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    summaryDate,
    startInclusive,
    endExclusive: end.toISOString(),
  };
}

export async function summarize(
  category: Category,
  articles: Article[],
): Promise<string> {
  if (articles.length === 0) {
    throw new Error(`Cannot summarize ${category} without articles.`);
  }

  const response = await getAnthropicClient().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: buildDigestPrompt(category, articles),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    const detail = response.stop_details?.explanation;
    throw new Error(
      `Anthropic refused the ${category} summary${detail ? `: ${detail}` : "."}`,
    );
  }

  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!content) {
    throw new Error(`Anthropic returned no text for the ${category} summary.`);
  }

  return content;
}

export async function summarizeAllCategories(
  now = new Date(),
): Promise<CategorySummaryResult[]> {
  const { summaryDate, startInclusive, endExclusive } = getSummaryDay(now);
  const results: CategorySummaryResult[] = [];

  for (const category of CATEGORIES) {
    let articleCount = 0;

    try {
      const articles = await getArticlesForCategoryDate(
        category,
        startInclusive,
        endExclusive,
      );
      articleCount = articles.length;

      if (articleCount === 0) {
        results.push({
          category,
          article_count: 0,
          model: ANTHROPIC_MODEL,
          upserted: 0,
          skipped: `No articles published on ${summaryDate}.`,
        });
        continue;
      }

      const content = await summarize(category, articles);
      const upserted = await upsertSummary({
        category,
        summary_date: summaryDate,
        content,
        model: ANTHROPIC_MODEL,
        article_count: articleCount,
      });

      results.push({
        category,
        article_count: articleCount,
        model: ANTHROPIC_MODEL,
        upserted,
      });
    } catch (error) {
      results.push({
        category,
        article_count: articleCount,
        model: ANTHROPIC_MODEL,
        upserted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
