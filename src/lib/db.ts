import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";

type SqlValue = string | number | boolean | null;
type QueryParams = Record<string, SqlValue>;

declare global {
  var __crmInliftSql: Sql | undefined;
  var __crmInliftDbInitPromise: Promise<void> | undefined;
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/crm_inlift";
}

function getSqlClient() {
  if (!global.__crmInliftSql) {
    global.__crmInliftSql = postgres(getDatabaseUrl(), {
      max: 5,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10
    });
  }
  return global.__crmInliftSql;
}

function convertNamedQuery(query: string, params: QueryParams) {
  const values: SqlValue[] = [];
  const text = query.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key: string) => {
    if (!(key in params)) throw new Error(`Missing SQL parameter: ${key}`);
    values.push(params[key]);
    return `$${values.length}`;
  });
  return { text, values };
}

async function runMigrations(sql: Sql) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file;
    const [applied] = await sql<{ id: string }[]>`SELECT id FROM schema_migrations WHERE id = ${id}`;
    if (applied) continue;

    const body = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (id) VALUES (${id})`;
    });
  }
}

async function initDb() {
  if (!global.__crmInliftDbInitPromise) {
    global.__crmInliftDbInitPromise = runMigrations(getSqlClient());
  }
  await global.__crmInliftDbInitPromise;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function run<T = { changes: number; lastInsertRowid?: number }>(query: string, params: QueryParams = {}) {
  await initDb();
  const sql = getSqlClient();
  let statement = query.trim();
  const isInsert = /^\s*insert\s+/i.test(statement);
  if (isInsert && !/\breturning\b/i.test(statement)) {
    statement = `${statement} RETURNING id`;
  }
  const { text, values } = convertNamedQuery(statement, params);
  const rows = await sql.unsafe<Array<{ id?: number }>>(text, values);
  return {
    changes: rows.length,
    lastInsertRowid: rows[0]?.id != null ? Number(rows[0].id) : undefined
  } as T;
}

export async function get<T>(query: string, params: QueryParams = {}) {
  await initDb();
  const { text, values } = convertNamedQuery(query, params);
  const rows = await getSqlClient().unsafe<T[]>(text, values);
  return rows[0];
}

export async function all<T>(query: string, params: QueryParams = {}) {
  await initDb();
  const { text, values } = convertNamedQuery(query, params);
  return getSqlClient().unsafe<T[]>(text, values);
}

export { initDb, getSqlClient };
