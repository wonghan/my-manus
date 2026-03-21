import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDbClient(connectionString: string) {
  const pool = new Pool({
    connectionString
  });

  return drizzle(pool);
}
