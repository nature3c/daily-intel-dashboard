import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { CATEGORIES } = await import("../src/types/news.ts");
const {
  ANTHROPIC_MODEL,
  summarizeAllCategories,
} = await import("../src/lib/anthropic.ts");
const { supabase } = await import("../src/lib/supabase.ts");

const now = new Date();
const summaryDate = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

async function getSummaryCount(category) {
  const { count, error } = await supabase
    .from("summaries")
    .select("id", { count: "exact", head: true })
    .eq("category", category)
    .eq("summary_date", summaryDate);

  if (error) {
    throw new Error(`Failed to count ${category} summaries: ${error.message}`);
  }

  return count ?? 0;
}

const beforeCounts = Object.fromEntries(
  await Promise.all(
    CATEGORIES.map(async (category) => [
      category,
      await getSummaryCount(category),
    ]),
  ),
);

const results = await summarizeAllCategories();

const afterCounts = Object.fromEntries(
  await Promise.all(
    CATEGORIES.map(async (category) => [
      category,
      await getSummaryCount(category),
    ]),
  ),
);

console.log(`Claude summary results for ${summaryDate}:`);

for (const result of results) {
  const before = beforeCounts[result.category];
  const after = afterCounts[result.category];
  const status = result.error
    ? `error=${result.error}`
    : result.skipped
      ? `skipped=${result.skipped}`
      : "ok";

  console.log(
    `${result.category}: article_count=${result.article_count} model=${result.model} upserted=${result.upserted} before=${before} after=${after} ${status}`,
  );
}

if (ANTHROPIC_MODEL !== results[0]?.model) {
  throw new Error("Summary results reported an unexpected model.");
}

if (results.some((result) => result.error)) {
  process.exitCode = 1;
}
