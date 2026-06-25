// Standalone migration runner: applies backend/drizzle/* to the Postgres at DATABASE_URL
// (defaults to the local docker-compose db). Idempotent — drizzle tracks applied
// migrations in __drizzle_migrations. Run: pnpm db:migrate
import { createRuntimeDb } from "../src/db";

const url =
  process.env.DATABASE_URL ??
  "postgresql://creatoros:creatoros@localhost:5432/creatoros";

const { pool } = await createRuntimeDb({ connectionString: url });
const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
console.log(`✓ migrations applied to ${masked}`);
await pool.end();
