-- Spyvoo schema. SQLite (built into Node 22). Lists like countries and platforms are stored as ",BR,MX," so a
-- LIKE '%,BR,%' filter is exact and indexable enough at this size. Full-text search uses FTS5 (ads_fts).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  voo_id TEXT UNIQUE,
  country TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',            -- user | admin
  plan_id TEXT NOT NULL DEFAULT 'free',
  plan_interval TEXT NOT NULL DEFAULT 'month',  -- month | year
  plan_renews_at TEXT,                          -- NULL on Free
  team_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Agency seat: uses the owner's plan
  onboarding TEXT NOT NULL DEFAULT '{}',        -- {tour_seen, niche, goal, ...}
  referred_by TEXT NOT NULL DEFAULT '',
  marketing_opt_out INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_users_plan ON users(plan_id, plan_renews_at);
CREATE INDEX idx_users_team ON users(team_owner_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT, ua TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, data TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '',
  price_month REAL NOT NULL DEFAULT 0, price_year REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
  searches_per_day INTEGER NOT NULL DEFAULT 10,   -- -1 = unlimited
  saves_limit INTEGER NOT NULL DEFAULT 20,
  ai_per_month INTEGER NOT NULL DEFAULT 5,
  downloads_per_month INTEGER NOT NULL DEFAULT 0,
  scripts_per_month INTEGER NOT NULL DEFAULT 0,
  follows_limit INTEGER NOT NULL DEFAULT 1,
  seats INTEGER NOT NULL DEFAULT 1,
  features TEXT NOT NULL DEFAULT '[]',
  popular INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE advertisers (
  id INTEGER PRIMARY KEY, page_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  logo_url TEXT NOT NULL DEFAULT '', page_url TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
  ad_count INTEGER NOT NULL DEFAULT 0, active_ads INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE INDEX idx_adv_name ON advertisers(name);

CREATE TABLE ads (
  id INTEGER PRIMARY KEY,
  library_id TEXT NOT NULL UNIQUE,
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  platforms TEXT NOT NULL DEFAULT ',facebook,',
  countries TEXT NOT NULL DEFAULT ',',
  status TEXT NOT NULL DEFAULT 'active',         -- active | inactive
  start_date TEXT, end_date TEXT,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  days_running INTEGER NOT NULL DEFAULT 0,
  variation_count INTEGER NOT NULL DEFAULT 1,
  collation_id TEXT NOT NULL DEFAULT '',
  cta_text TEXT NOT NULL DEFAULT '', cta_type TEXT NOT NULL DEFAULT '',
  landing_url TEXT NOT NULL DEFAULT '', landing_domain TEXT NOT NULL DEFAULT '',
  primary_text TEXT NOT NULL DEFAULT '', headline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '', niche TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'image',      -- video | image | carousel
  winner_score INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'apify',          -- apify | demo | ...
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ads_score ON ads(hidden, winner_score DESC);
CREATE INDEX idx_ads_days ON ads(hidden, days_running DESC);
CREATE INDEX idx_ads_new ON ads(hidden, start_date DESC);
CREATE INDEX idx_ads_var ON ads(hidden, variation_count DESC);
CREATE INDEX idx_ads_adv ON ads(advertiser_id, start_date DESC);
CREATE INDEX idx_ads_status ON ads(status);
CREATE INDEX idx_ads_niche ON ads(niche);
CREATE INDEX idx_ads_domain ON ads(landing_domain);
CREATE INDEX idx_ads_seen ON ads(last_seen_at);
CREATE INDEX idx_ads_coll ON ads(collation_id);

CREATE VIRTUAL TABLE ads_fts USING fts5(primary_text, headline, advertiser, domain, transcript, tokenize = 'unicode61 remove_diacritics 2');

CREATE TABLE ad_media (
  id INTEGER PRIMARY KEY, ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                            -- video | image
  position INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NOT NULL DEFAULT '', poster_source_url TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL DEFAULT '', poster_key TEXT NOT NULL DEFAULT '',
  duration_s REAL, width INTEGER, height INTEGER, bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | done | failed
  attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT, error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_media_ad ON ad_media(ad_id, position);
CREATE INDEX idx_media_status ON ad_media(status, next_at);

CREATE TABLE ad_analysis (
  ad_id INTEGER PRIMARY KEY REFERENCES ads(id) ON DELETE CASCADE,
  hook TEXT NOT NULL DEFAULT '', angle TEXT NOT NULL DEFAULT '', offer TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '', triggers TEXT NOT NULL DEFAULT '[]', format TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '', why TEXT NOT NULL DEFAULT '', how_to_adapt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);

CREATE TABLE ad_scripts (
  id INTEGER PRIMARY KEY, ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX idx_scripts_user ON ad_scripts(user_id, created_at);

CREATE TABLE tracking_rules (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL,     -- keyword | advertiser | domain
  value TEXT NOT NULL, countries TEXT NOT NULL DEFAULT ',ALL,', platforms TEXT NOT NULL DEFAULT ',facebook,instagram,',
  niche TEXT NOT NULL DEFAULT '', results_limit INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1, interval_hours INTEGER NOT NULL DEFAULT 6,
  last_run_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL,     -- scrape | media | analysis | refresh | alerts | report
  rule_id INTEGER, ref TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',         -- queued | running | done | failed
  ads_found INTEGER NOT NULL DEFAULT 0, ads_new INTEGER NOT NULL DEFAULT 0, credits_used REAL NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_kind ON jobs(kind, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '', share_token TEXT UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE board_items (
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, PRIMARY KEY (board_id, ad_id)
);

CREATE TABLE follows (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  alert INTEGER NOT NULL DEFAULT 1, last_notified_at TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, advertiser_id)
);
CREATE INDEX idx_follows_adv ON follows(advertiser_id);

CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, query TEXT NOT NULL, alert INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '', read_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 0, analyses INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0, scripts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL, interval TEXT NOT NULL DEFAULT 'month',
  amount_usd REAL NOT NULL, list_usd REAL NOT NULL, coupon TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL, method_id INTEGER, provider_ref TEXT NOT NULL DEFAULT '', checkout_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid | failed | refunded
  meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, paid_at TEXT
);
CREATE INDEX idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status, created_at);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY, percent REAL NOT NULL DEFAULT 0, amount_off REAL NOT NULL DEFAULT 0,
  plans TEXT NOT NULL DEFAULT '', intervals TEXT NOT NULL DEFAULT '', first_purchase_only INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);

CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,   -- gatevoo | manual
  scope TEXT NOT NULL DEFAULT 'global',          -- global | local
  countries TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE email_log (
  id INTEGER PRIMARY KEY, to_email TEXT NOT NULL, template TEXT NOT NULL, subject TEXT NOT NULL,
  status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX idx_email_log ON email_log(created_at DESC);

CREATE TABLE voo_outbox (
  id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
  next_at TEXT NOT NULL, sent_at TEXT, failed_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX idx_audit ON audit_log(created_at DESC);

-- Which ads a user has opened the AI breakdown for (each counts once against the plan's AI limit).
CREATE TABLE unlocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, PRIMARY KEY (user_id, ad_id)
);
-- Recently viewed ads (for the dashboard home).
CREATE TABLE views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL, PRIMARY KEY (user_id, ad_id)
);
CREATE INDEX idx_views ON views(user_id, viewed_at DESC);
