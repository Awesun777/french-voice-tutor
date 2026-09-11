/**
 * Apply one of the hand-written DDL files in drizzle/manual/ to the database.
 * drizzle-kit migrate is broken in this repo, so schema changes ship as
 * idempotent `CREATE TABLE IF NOT EXISTS` files and are applied with:
 *
 *   railway run --service french-voice-tutor -- node scripts/apply-manual-sql.mjs drizzle/manual/<file>.sql
 *
 * Uses MYSQL_PUBLIC_URL when present (reachable from a laptop), else
 * DATABASE_URL (inside Railway).
 */
import fs from "node:fs";
import mysql from "mysql2/promise";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-manual-sql.mjs drizzle/manual/<file>.sql");
  process.exit(2);
}
const url = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("MYSQL_PUBLIC_URL / DATABASE_URL not set (run through `railway run`)");
  process.exit(2);
}
const statements = fs
  .readFileSync(file, "utf8")
  .split(";")
  .map(s => s.replace(/--[^\n]*/g, "").trim())
  .filter(Boolean);

const conn = await mysql.createConnection(url);
try {
  for (const stmt of statements) {
    await conn.query(stmt);
    console.log("ok:", stmt.split("\n")[0].slice(0, 80));
  }
} finally {
  await conn.end();
}
