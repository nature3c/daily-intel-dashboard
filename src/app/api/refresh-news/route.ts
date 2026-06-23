import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import type { CategorySummaryResult } from "@/lib/anthropic";
import type { CategoryIngestionResult } from "@/lib/news";
import type { PrunedRowCounts } from "@/lib/supabase";

export const maxDuration = 300;

type RefreshStage = "ingestion" | "summaries" | "pruning" | "revalidation";

function hashToken(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedToken = authorization.slice("Bearer ".length);

  if (!suppliedToken) {
    return false;
  }

  return timingSafeEqual(hashToken(suppliedToken), hashToken(cronSecret));
}

async function runRefresh(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  let stage: RefreshStage = "ingestion";
  let ingestion: CategoryIngestionResult[] = [];
  let summaries: CategorySummaryResult[] = [];
  let pruned: PrunedRowCounts | null = null;

  try {
    const [
      { ingestAllCategories },
      { summarizeAllCategories },
      { pruneExpiredContent },
    ] = await Promise.all([
      import("@/lib/news"),
      import("@/lib/anthropic"),
      import("@/lib/supabase"),
    ]);

    ingestion = await ingestAllCategories();

    stage = "summaries";
    summaries = await summarizeAllCategories(startedAt);

    stage = "pruning";
    pruned = await pruneExpiredContent(startedAt);

    stage = "revalidation";
    revalidateTag("articles", "max");
    revalidateTag("summaries", "max");

    const completedAt = new Date();

    return Response.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      ingestion,
      summaries,
      pruned,
    });
  } catch (error) {
    const completedAt = new Date();

    return Response.json(
      {
        ok: false,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        failedStage: stage,
        ingestion,
        summaries,
        pruned,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return runRefresh(request);
}

// Vercel Cron invokes configured paths with GET requests.
export async function GET(request: Request): Promise<Response> {
  return runRefresh(request);
}
