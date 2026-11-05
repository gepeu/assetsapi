-- These seven primary market terms repeat `primary.*` catalog fields, which cover more assets, and for
-- investor types the two sources disagree. The values stay stored, and the API reads the fields.
UPDATE financial_measure SET served = false
WHERE slug IN (
  'primary_market__subscription_frequency',
  'primary_market__redemption_frequency',
  'primary_market__subscription_description',
  'primary_market__redemption_description',
  'primary_market__investor_types',
  'primary_market__is_kyc_required',
  'primary_market__base_asset_ticker'
);
