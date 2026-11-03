import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { seed } from "../src/db/seed.ts";

const pool = createPool();
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No new migrations.");
  await seed(pool);

  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM field)::int AS fields,
      (SELECT count(*) FROM asset)::int AS assets,
      (SELECT count(*) FROM source)::int AS sources
  `);
  console.log("Seeded:", rows[0]);
} finally {
  await pool.end();
}
