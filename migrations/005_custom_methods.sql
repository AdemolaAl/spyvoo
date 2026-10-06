-- Custom payment methods (bank transfer, mobile money, a USDT wallet address...): the customer pays by hand, adds proof,
-- and an admin approves or rejects. Additive only: nothing is dropped or rewritten.
ALTER TABLE orders ADD COLUMN pay_amount REAL;                       -- exact amount in the method's currency (price lock)
ALTER TABLE orders ADD COLUMN pay_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE orders ADD COLUMN proof TEXT NOT NULL DEFAULT '';        -- reference / transaction id typed by the customer
ALTER TABLE orders ADD COLUMN proof_file TEXT NOT NULL DEFAULT '';   -- screenshot file name under <data>/proofs
ALTER TABLE orders ADD COLUMN proof_at TEXT;
ALTER TABLE orders ADD COLUMN review_note TEXT NOT NULL DEFAULT '';  -- admin's reason when rejecting (or note on approval)
ALTER TABLE orders ADD COLUMN reviewed_at TEXT;
ALTER TABLE orders ADD COLUMN reviewed_by TEXT NOT NULL DEFAULT '';
-- Existing manual methods (the seeded "Bank transfer") become custom methods: their name, countries, instructions, on/off
-- and order are kept; only missing settings get defaults.
UPDATE payment_methods SET config = json_set(config,
  '$.icon', COALESCE(json_extract(config, '$.icon'), 'bank'),
  '$.currency', COALESCE(json_extract(config, '$.currency'), 'USD'),
  '$.rate', COALESCE(json_extract(config, '$.rate'), 1),
  '$.proof_mode', COALESCE(json_extract(config, '$.proof_mode'), 'either'),
  '$.details', json(COALESCE(json_extract(config, '$.details'), '[]')))
WHERE provider = 'manual' AND json_valid(config);
