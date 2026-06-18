import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { CATEGORIES } = await import("../src/types/news.ts");
const { ingestAllCategories } = await import("../src/lib/news.ts");
const { supabase } = await import("../src/lib/supabase.ts");

async function getCategoryCount(category) {
  const { count, error } = await supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("category", category);

  if (error) {
    throw new Error(`Failed to count ${category} articles: ${error.message}`);
  }

  return count ?? 0;
}

const beforeCounts = Object.fromEntries(
  await Promise.all(
    CATEGORIES.map(async (category) => [category, await getCategoryCount(category)]),
  ),
);

const results = await ingestAllCategories();

const afterCounts = Object.fromEntries(
  await Promise.all(
    CATEGORIES.map(async (category) => [category, await getCategoryCount(category)]),
  ),
);

console.log("News ingestion results:");

for (const result of results) {
  const before = beforeCounts[result.category];
  const after = afterCounts[result.category];
  const inserted = after - before;
  const status = result.error ? `error=${result.error}` : "ok";

  console.log(
    `${result.category}: fetched=${result.fetched} upserted=${result.upserted} before=${before} after=${after} inserted=${inserted} ${status}`,
  );
}

if (results.some((result) => result.error)) {
  process.exitCode = 1;
}
