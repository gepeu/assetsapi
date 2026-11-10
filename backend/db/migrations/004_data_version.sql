-- One row that moves whenever served data changes. The API keeps responses in memory until it does.
-- Statement triggers move it on every write to a data table, from a job, a hand correction or a
-- migration, so nobody has to remember to. The update commits with the data, so a replica never sees
-- the new version before the new data.
CREATE TABLE data_version (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  version    bigint NOT NULL DEFAULT 1,
  changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO data_version DEFAULT VALUES;

CREATE FUNCTION bump_data_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE data_version SET version = version + 1, changed_at = now();
  RETURN NULL;
END
$$;

-- Every table the API reads. Run records, keys and migrations aren't served, so they're left out.
-- A table added later needs the same trigger; a test fails until it has one or is listed as unserved.
DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'source', 'organization', 'asset', 'asset_alias', 'asset_organization', 'network', 'token',
    'field', 'field_value', 'financial_measure', 'financial_current', 'financial_timeseries'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER bump_data_version AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I '
      'FOR EACH STATEMENT EXECUTE FUNCTION bump_data_version()',
      name
    );
  END LOOP;
END
$$;
