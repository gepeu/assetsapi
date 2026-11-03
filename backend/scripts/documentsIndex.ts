import { indexDocuments } from "../src/documents/indexDocuments.ts";
import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { createBucketStorage } from "../src/storage.ts";

const pool = createPool();
try {
  await migrate(pool);
  console.log(await indexDocuments(pool, createBucketStorage()));
  const { rows } = await pool.query(`SELECT status, count(*)::int AS files FROM document_text GROUP BY 1 ORDER BY 1`);
  console.table(rows);
} finally {
  await pool.end();
}
