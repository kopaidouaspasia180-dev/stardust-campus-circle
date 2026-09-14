import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import {fileURLToPath} from "node:url"
import pg from "pg"
import "dotenv/config"

const {Pool} = pg
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.resolve(currentDir, "../schema.sql")
const migrationsDir = path.resolve(currentDir, "../migrations")
const dryRun = process.argv.includes("--dry-run")
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) throw new Error("DATABASE_URL is required")

async function discoverMigrations() {
  const initial = {id: "001_initial_schema", path: schemaPath}
  let entries = []
  try {
    entries = await fs.readdir(migrationsDir, {withFileTypes: true})
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  const additions = entries
    .filter(entry => entry.isFile() && /^\d{3,}_[a-z0-9_]+\.sql$/i.test(entry.name))
    .map(entry => ({id: entry.name.replace(/\.sql$/i, ""), path: path.join(migrationsDir, entry.name)}))
    .sort((left, right) => left.id.localeCompare(right.id))
  const ids = new Set([initial.id])
  for (const migration of additions) {
    if (ids.has(migration.id)) throw new Error(`duplicate migration id: ${migration.id}`)
    ids.add(migration.id)
  }
  return [initial, ...additions]
}

const migrations = await Promise.all((await discoverMigrations()).map(async migration => {
  const sql = await fs.readFile(migration.path, "utf8")
  return {...migration, sql, checksum: crypto.createHash("sha256").update(sql).digest("hex")}
}))
const pool = new Pool({connectionString: databaseUrl})
const client = await pool.connect()

try {
  await client.query("select pg_advisory_lock(hashtext('stardust-campus-circle-schema'))")
  await client.query(`create table if not exists schema_migrations (
    id text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`)
  const applied = await client.query("select id,checksum from schema_migrations")
  const appliedById = new Map(applied.rows.map(row => [row.id, row.checksum]))
  for (const migration of migrations) {
    const existingChecksum = appliedById.get(migration.id)
    if (existingChecksum) {
      if (existingChecksum !== migration.checksum) {
        throw new Error(`${migration.id} has changed after being applied; create a new migration instead of rewriting it`)
      }
      console.log(`${migration.id}: already applied`)
      continue
    }
    if (dryRun) {
      console.log(`${migration.id}: pending (${migration.sql.length} bytes)`)
      continue
    }
    await client.query("begin")
    try {
      await client.query(migration.sql)
      await client.query("insert into schema_migrations(id,checksum) values($1,$2)", [migration.id, migration.checksum])
      await client.query("commit")
      console.log(`${migration.id}: applied`)
    } catch (error) {
      await client.query("rollback")
      throw error
    }
  }
} finally {
  try { await client.query("select pg_advisory_unlock(hashtext('stardust-campus-circle-schema'))") } catch {}
  client.release()
  await pool.end()
}
