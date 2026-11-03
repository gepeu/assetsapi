-- Text extracted from stored documents, for full-text search in the chat agent.

-- One row per stored file processed, so files with no usable text are visible too.
CREATE TABLE document_text (
  stored_file_id bigint PRIMARY KEY REFERENCES stored_file (id),
  status         text NOT NULL CHECK (status IN ('indexed', 'no_text', 'unsupported', 'failed')),
  error          text,
  char_count     integer NOT NULL DEFAULT 0,
  indexed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_chunk (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stored_file_id bigint NOT NULL REFERENCES stored_file (id),
  chunk_index    integer NOT NULL,
  page           integer,
  content        text NOT NULL,
  search         tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  UNIQUE (stored_file_id, chunk_index)
);
CREATE INDEX document_chunk_search_idx ON document_chunk USING gin (search);

-- Only each document's newest saved version counts. Failed fetches have no key, and empty
-- shells have no useful text, so neither can be searched.
CREATE VIEW searchable_file AS
SELECT DISTINCT ON (f.document_id) f.*
FROM stored_file f
WHERE f.storage_key IS NOT NULL
ORDER BY f.document_id, f.id DESC;

CREATE VIEW searchable_chunk AS
SELECT
  c.id, c.stored_file_id, c.chunk_index, c.page, c.content, c.search,
  f.document_id, f.sha256
FROM document_chunk c
JOIN searchable_file f ON f.id = c.stored_file_id
WHERE NOT f.is_empty_shell;
