-- Rule-based breakdowns were rewritten (no repeated hook/offer, cleaner punctuation). Drop the cached ones so they regenerate.
DELETE FROM ad_analysis WHERE model = 'spyvoo-basic';
