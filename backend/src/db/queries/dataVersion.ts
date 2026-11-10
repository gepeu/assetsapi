/** The served data's version, which triggers move on every write to a data table. */
import type { Queryable } from '../pool.ts';

/** As text, because Postgres returns a bigint as a string and it's only ever compared. */
export async function readDataVersion(db: Queryable): Promise<string> {
  const { rows } = await db.query<{ version: string }>('SELECT version FROM data_version');
  const version = rows[0]?.version;
  if (version === undefined) throw new Error('data_version has no row');
  return version;
}
