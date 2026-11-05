-- The Kamino lending universe includes stablecoins, which no existing class or type describes.
ALTER TABLE asset DROP CONSTRAINT asset_asset_class_check;
ALTER TABLE asset ADD CONSTRAINT asset_asset_class_check CHECK (asset_class IN
  ('equity', 'treasuries', 'private_credit', 'reinsurance', 'commodities', 'cryptocurrency', 'onchain_yield', 'stablecoin'));

ALTER TABLE asset DROP CONSTRAINT asset_asset_type_check;
ALTER TABLE asset ADD CONSTRAINT asset_asset_type_check CHECK (asset_type IN
  ('tokenized_equity', 'tokenized_fund', 'tokenized_commodity', 'wrapped_crypto', 'native_crypto', 'defi_yield', 'stablecoin'));

ALTER TABLE field DROP CONSTRAINT field_applicable_asset_types_check;
ALTER TABLE field ADD CONSTRAINT field_applicable_asset_types_check CHECK (
  cardinality(applicable_asset_types) > 0 AND applicable_asset_types <@
  ARRAY['tokenized_equity', 'tokenized_fund', 'tokenized_commodity', 'wrapped_crypto', 'native_crypto', 'defi_yield', 'stablecoin']);
