-- Every chat agent response, as returned by POST /api/agent/messages.
CREATE TABLE agent_response (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question   text NOT NULL,
  -- Null when our sources don't answer the question.
  answer     text,
  citations  jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
