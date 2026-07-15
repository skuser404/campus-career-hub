import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads this to diff `src/db/schema.ts` against the committed
 * migration history and emit SQL. Generating migrations does not require a
 * live database; applying them does.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
