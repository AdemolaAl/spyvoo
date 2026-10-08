-- 24/7 AI support (the Spyvoo support agent) with human hand-off. Additive only.
-- One thread per customer (or per website visitor before sign-up). The agent answers; an admin can take over.
CREATE TABLE support_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  visitor TEXT,                                -- sha256 of the visitor cookie (website chat before sign-up)
  status TEXT NOT NULL DEFAULT 'open',         -- open | closed
  mode TEXT NOT NULL DEFAULT 'ai',             -- ai = the agent answers | human = an admin took over (agent quiet)
  needs_human INTEGER NOT NULL DEFAULT 0,      -- 1 = the agent handed it to a person
  priority TEXT NOT NULL DEFAULT 'normal',     -- normal | high
  handoff_reason TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',              -- short label written by the agent ("Payment not showing")
  rating INTEGER,                              -- 1 = thumbs down, 5 = thumbs up
  unread_admin INTEGER NOT NULL DEFAULT 0,
  unread_user INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX support_threads_user ON support_threads(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX support_threads_visitor ON support_threads(visitor) WHERE visitor IS NOT NULL;
CREATE INDEX support_threads_inbox ON support_threads(needs_human, last_message_at);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,                        -- user | agent | human | system
  body TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',             -- what the agent did (tools), the admin's name for human replies
  created_at TEXT NOT NULL
);
CREATE INDEX support_messages_thread ON support_messages(thread_id, id);
