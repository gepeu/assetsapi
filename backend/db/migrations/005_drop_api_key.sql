-- The API is public, so it no longer checks keys and their table goes. IF EXISTS keeps this safe on
-- a database restored from a dump taken after the drop.
-- squawk-ignore ban-drop-table
DROP TABLE IF EXISTS api_key;
