import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const smokeUrl = "https://example.com/daily-intel-dashboard/smoke-supabase";

function throwIfError(step, error) {
  if (error) {
    throw new Error(`${step} failed: ${error.message}`);
  }
}

const article = {
  category: "ai_ml",
  title: "Supabase smoke test article",
  description: "Temporary row inserted by scripts/smoke-supabase.mjs.",
  url: smokeUrl,
  source: "Smoke Test",
  author: "daily-intel-dashboard",
  image_url: null,
  published_at: new Date().toISOString(),
};

const { error: upsertError } = await supabase
  .from("articles")
  .upsert(article, { onConflict: "url" });
throwIfError("upsert", upsertError);

const { data, error: readError } = await supabase
  .from("articles")
  .select("id, category, title, url, published_at")
  .eq("url", smokeUrl)
  .single();
throwIfError("read", readError);

console.log("Supabase smoke row:", data);

const { error: deleteError } = await supabase
  .from("articles")
  .delete()
  .eq("url", smokeUrl);
throwIfError("cleanup", deleteError);

console.log("Supabase smoke cleanup complete.");
