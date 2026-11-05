-- Financial data: prices, NAV, yields, supply, volumes, holders and fund terms. These change daily
-- and have no place in the field catalog or its coverage, so they sit beside claims rather than in
-- them. A row with token_id NULL describes the whole asset; otherwise it describes that one token.

-- What one load saw: every financial field on the asset and token records.
CREATE TABLE financial_snapshot (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingestion_run_id bigint NOT NULL REFERENCES ingestion_run (id),
  asset_id         integer NOT NULL REFERENCES asset (id),
  token_id         integer REFERENCES token (id),
  metric           text NOT NULL,
  -- The current figure and the source's own lookbacks. NULL for text, yes/no and list values.
  value            double precision,
  value_7d         double precision,
  value_30d        double precision,
  value_90d        double precision,
  -- The value exactly as the API returned it, including its change figures.
  raw              jsonb NOT NULL,
  as_of            date NOT NULL,
  observed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (ingestion_run_id, asset_id, token_id, metric)
);
CREATE INDEX financial_snapshot_asset_idx ON financial_snapshot (asset_id, ingestion_run_id);
CREATE INDEX financial_snapshot_token_idx ON financial_snapshot (token_id) WHERE token_id IS NOT NULL;

-- Each asset's most recent load, so a metric the source has since dropped doesn't linger.
CREATE VIEW financial_latest AS
SELECT s.*
FROM financial_snapshot s
WHERE s.ingestion_run_id = (
  SELECT max(m.ingestion_run_id) FROM financial_snapshot m WHERE m.asset_id = s.asset_id
);

-- The units the source gives its history measures, such as dollar or percent.
CREATE TABLE financial_measure (
  slug text PRIMARY KEY,
  name text,
  unit text
);

-- Daily history. A later load overwrites a day, because the source can restate it.
CREATE TABLE financial_timeseries (
  asset_id         integer NOT NULL REFERENCES asset (id),
  token_id         integer REFERENCES token (id),
  measure          text NOT NULL REFERENCES financial_measure (slug),
  day              date NOT NULL,
  value            double precision NOT NULL,
  ingestion_run_id bigint NOT NULL REFERENCES ingestion_run (id),
  UNIQUE NULLS NOT DISTINCT (asset_id, token_id, measure, day)
);
CREATE INDEX financial_timeseries_measure_idx ON financial_timeseries (measure, day);
