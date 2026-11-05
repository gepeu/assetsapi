-- asset.asset_class now holds RWA.xyz's asset class name word for word, replacing our own labels.
-- The list is RWA.xyz's to change, so the column no longer restricts it.
ALTER TABLE asset DROP CONSTRAINT asset_asset_class_check;

UPDATE asset a
SET asset_class = latest.value
FROM (
  SELECT DISTINCT ON (c.asset_id) c.asset_id, c.normalized_value #>> '{}' AS value
  FROM claim c
  JOIN field f ON f.id = c.field_id AND f.key = 'classification.asset_class'
  JOIN source s ON s.id = c.source_id AND s.key = 'rwa_xyz'
  WHERE c.withdrawn_at IS NULL
  ORDER BY c.asset_id, c.observed_at DESC, c.id DESC
) latest
WHERE latest.asset_id = a.id;

COMMENT ON COLUMN asset.asset_class IS 'RWA.xyz''s asset class name, word for word. Set by the RWA.xyz load.';
