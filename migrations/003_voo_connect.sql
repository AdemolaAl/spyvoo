-- Voo Connect (VooSquare). The kit's event outbox lives in the database so queued events survive restarts and deploys.
CREATE TABLE voo_queue (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  queue TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
-- Searches are batched: one search_run event per user per hour (UTC), sent once the hour is over.
CREATE TABLE voo_activity (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hour TEXT NOT NULL,              -- 2026-10-05T14
  searches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, hour)
);
-- Events VooSquare refused for good (shown in Admin → Settings → VooSquare and kept for 90 days).
CREATE TABLE voo_failed (
  id INTEGER PRIMARY KEY, event_id TEXT NOT NULL, type TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_orders_paid_user ON orders(user_id, paid_at);
