-- AI breakdown v2: hook type, awareness stage, persona, funnel, offer mechanics, compliance risk, scores and test ideas,
-- stored as one JSON object. Additive only. Old rows keep '{}' and are refreshed by services/ai.js (rule-based rows for
-- free; paid AI rows at most once, and only when AI is live).
ALTER TABLE ad_analysis ADD COLUMN extra TEXT NOT NULL DEFAULT '{}';
