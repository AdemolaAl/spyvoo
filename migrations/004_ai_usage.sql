-- Every AI call (any provider) with its tokens and, for OpenRouter, its cost. Admin → Ad data & AI shows today's total.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', feature TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON ai_usage(day);
