-- Clearer plan taglines (who each plan is for). Only replaces the original wording, so taglines edited in Admin stay.
UPDATE plans SET tagline = 'Try Spyvoo and find your first winner.' WHERE id = 'free' AND tagline = 'Try it and find your first winner.';
UPDATE plans SET tagline = 'For solo buyers and affiliates running a few offers.' WHERE id = 'starter' AND tagline = 'Solo media buyers and affiliates.';
UPDATE plans SET tagline = 'For full-time buyers launching new creatives every week.' WHERE id = 'pro' AND tagline = 'Full-time buyers scaling every week.';
UPDATE plans SET tagline = 'For agencies and teams running many ad accounts.' WHERE id = 'agency' AND tagline = 'Teams running many accounts.';
