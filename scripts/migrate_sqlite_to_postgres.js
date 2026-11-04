/**
 * Idempotent, read-only SQLite to PostgreSQL state migration for n8n (v2.25.x).
 *
 * Designed to run inside the whatsapp-agent-n8n container image, dynamically
 * resolving sqlite3 and pg from n8n's pnpm store without modifying the image.
 *
 * Safety guarantees:
 *   - Opens /home/node/.n8n/database.sqlite strictly in sqlite3.OPEN_READONLY mode.
 *   - Executes all PostgreSQL mutations inside a single ACID transaction (BEGIN/COMMIT).
 *   - Never logs row payloads, credentials, API keys, passwords, or secrets.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PNPM_ROOT = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
const SQLITE_PATH = process.env.SQLITE_DB_PATH || '/home/node/.n8n/database.sqlite';
const MIN_EXPECTED_MIGRATIONS = 190;

const EXCLUDED_TABLES = new Set([
  'migrations',
  'execution_entity',
  'execution_data',
  'execution_metadata',
  'execution_annotations',
  'execution_annotation_tags',
  'insights_raw',
  'insights_by_period',
  'insights_metadata',
  'workflow_statistics',
  'sqlite_sequence',
  'sqlite_stat1',
  'sqlite_stat4',
]);

// Ordered to satisfy foreign-key dependencies in n8n 2.25.x.
const ORDERED_STATE_TABLES = [
  'role',
  'scope',
  'role_scope',
  'settings',
  'deployment_key',
  'instance_version_history',
  'mcp_registry_server',
  'user',
  'project',
  'project_relation',
  'user_api_keys',
  'dynamic_credential_resolver',
  'dynamic_credential_entry',
  'dynamic_credential_user_entry',
  'credentials_entity',
  'shared_credentials',
  'tag_entity',
  'annotation_tag_entity',
  'folder',
  'folder_tag',
  'variables',
  'workflow_entity',
  'workflow_history',
  'workflow_published_version',
  'shared_workflow',
  'workflows_tags',
  'webhook_entity',
  'workflow_dependency',
  'credential_dependency',
  'workflow_publish_history',
];

const DO_NOTHING_CONFLICT_TABLES = new Set(['role', 'scope', 'role_scope']);

function resolveContainerModule(pkgName) {
  if (fs.existsSync(PNPM_ROOT)) {
    const entries = fs.readdirSync(PNPM_ROOT);
    for (const entry of entries) {
      if (entry.startsWith(`${pkgName}@`)) {
        const candidate = path.join(PNPM_ROOT, entry, 'node_modules', pkgName);
        if (fs.existsSync(candidate)) {
          return require(candidate);
        }
      }
    }
  }
  return require(pkgName);
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function openSqliteReadOnly(sqlite3, filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new Error(`SQLite database file not found at ${filePath}`));
      return;
    }
    const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function sqliteClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function coerceValueForPostgres(rawValue, pgColMeta) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const dataType = (pgColMeta.data_type || '').toLowerCase();
  const udtName = (pgColMeta.udt_name || '').toLowerCase();

  if (dataType === 'boolean' || udtName === 'bool') {
    if (typeof rawValue === 'boolean') return rawValue;
    if (typeof rawValue === 'number') return rawValue !== 0;
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 't') return true;
      if (normalized === '0' || normalized === 'false' || normalized === 'f') return false;
      if (normalized === '' && pgColMeta.is_nullable === 'YES') return null;
    }
    return Boolean(rawValue);
  }

  if (dataType === 'json' || dataType === 'jsonb' || udtName === 'json' || udtName === 'jsonb') {
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (trimmed === '') {
        return pgColMeta.is_nullable === 'YES' ? null : 'null';
      }
      // Validate JSON syntax while keeping string representation so node-postgres
      // does not misinterpret top-level JS arrays as PostgreSQL array literals.
      JSON.parse(trimmed);
      return trimmed;
    }
    if (Buffer.isBuffer(rawValue)) {
      const text = rawValue.toString('utf8').trim();
      JSON.parse(text);
      return text;
    }
    return JSON.stringify(rawValue);
  }

  if (
    dataType.startsWith('timestamp') ||
    dataType === 'date' ||
    udtName === 'timestamp' ||
    udtName === 'timestamptz' ||
    udtName === 'date'
  ) {
    if (typeof rawValue === 'number') {
      return new Date(rawValue).toISOString();
    }
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (trimmed === '') return null;
      if (/^\d+$/.test(trimmed)) {
        return new Date(Number(trimmed)).toISOString();
      }
      return trimmed;
    }
    return rawValue;
  }

  if (
    dataType === 'smallint' ||
    dataType === 'integer' ||
    udtName === 'int2' ||
    udtName === 'int4'
  ) {
    if (typeof rawValue === 'boolean') return rawValue ? 1 : 0;
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (trimmed === '') return null;
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid integer value for column ${pgColMeta.column_name}`);
      }
      return parsed;
    }
    return rawValue;
  }

  if (dataType === 'bigint' || udtName === 'int8') {
    if (typeof rawValue === 'boolean') return rawValue ? '1' : '0';
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      return trimmed === '' ? null : trimmed;
    }
    return String(rawValue);
  }

  if (dataType === 'bytea' || udtName === 'bytea') {
    if (Buffer.isBuffer(rawValue)) return rawValue;
    if (typeof rawValue === 'string') return Buffer.from(rawValue, 'utf8');
    return rawValue;
  }

  if (dataType === 'uuid' || udtName === 'uuid') {
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      return trimmed === '' ? null : trimmed;
    }
    return rawValue;
  }

  return rawValue;
}

async function loadPostgresSchema(pgClient) {
  const tablesRes = await pgClient.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const pgTables = new Set(tablesRes.rows.map((r) => r.table_name));

  const colsRes = await pgClient.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const pgColumnsByTable = new Map();
  for (const row of colsRes.rows) {
    if (!pgColumnsByTable.has(row.table_name)) {
      pgColumnsByTable.set(row.table_name, new Map());
    }
    pgColumnsByTable.get(row.table_name).set(row.column_name, row);
  }

  const pkRes = await pgClient.query(`
    SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);
  const pgPrimaryKeysByTable = new Map();
  for (const row of pkRes.rows) {
    if (!pgPrimaryKeysByTable.has(row.table_name)) {
      pgPrimaryKeysByTable.set(row.table_name, []);
    }
    pgPrimaryKeysByTable.get(row.table_name).push(row.column_name);
  }

  const fkRes = await pgClient.query(`
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
  `);

  return {
    pgTables,
    pgColumnsByTable,
    pgPrimaryKeysByTable,
    pgForeignKeys: fkRes.rows,
  };
}

function sortRemainingTablesByFk(tables, pgForeignKeys) {
  const tableSet = new Set(tables);
  const deps = new Map();
  for (const t of tables) deps.set(t, new Set());

  for (const fk of pgForeignKeys) {
    if (
      tableSet.has(fk.source_table) &&
      tableSet.has(fk.target_table) &&
      fk.source_table !== fk.target_table
    ) {
      deps.get(fk.source_table).add(fk.target_table);
    }
  }

  const ordered = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(t) {
    if (visited.has(t)) return;
    if (visiting.has(t)) return;
    visiting.add(t);
    for (const dep of deps.get(t) || []) {
      visit(dep);
    }
    visiting.delete(t);
    visited.add(t);
    ordered.push(t);
  }

  for (const t of tables) visit(t);
  return ordered;
}

async function reconcileBootstrapRows(pgClient, tableName, sqliteRows) {
  if (sqliteRows.length === 0) return;

  // n8n's Db.init() pre-generates active deployment_key entries with fresh UUIDs.
  // Because deployment_key enforces partial unique indexes per active key type,
  // remove bootstrap-only UUIDs so the original SQLite keys upsert cleanly.
  if (tableName === 'deployment_key') {
    const ids = sqliteRows.map((r) => String(r.id));
    await pgClient.query(
      'DELETE FROM "deployment_key" WHERE NOT ("id" = ANY($1::varchar[]))',
      [ids]
    );
    return;
  }

  // Remove any unconfigured owner placeholder and its default personal project
  // created during Db.init() if they are not part of the migrated SQLite state.
  if (tableName === 'user') {
    const userIds = sqliteRows.map((r) => String(r.id));
    await pgClient.query(
      `DELETE FROM "project_relation"
       WHERE "userId" IN (
         SELECT "id"::text::uuid FROM "user"
         WHERE "email" IS NULL AND NOT ("id"::text = ANY($1::text[]))
       )
       OR "projectId" IN (
         SELECT "id" FROM "project"
         WHERE "creatorId" IN (
           SELECT "id"::text::uuid FROM "user"
           WHERE "email" IS NULL AND NOT ("id"::text = ANY($1::text[]))
         )
       )`,
      [userIds]
    );
    await pgClient.query(
      `DELETE FROM "project"
       WHERE "creatorId" IN (
         SELECT "id"::text::uuid FROM "user"
         WHERE "email" IS NULL AND NOT ("id"::text = ANY($1::text[]))
       )`,
      [userIds]
    );
    await pgClient.query(
      'DELETE FROM "user" WHERE "email" IS NULL AND NOT ("id"::text = ANY($1::text[]))',
      [userIds]
    );
  }
}

async function upsertTableRows({
  pgClient,
  tableName,
  sqliteRows,
  commonColumns,
  pgColMap,
  pkColumns,
  nullifyColumns = new Set(),
  forceDoNothing = false,
}) {
  if (sqliteRows.length === 0 || commonColumns.length === 0) {
    return 0;
  }

  const quotedTable = quoteIdent(tableName);
  const quotedCols = commonColumns.map(quoteIdent).join(', ');

  let conflictClause = '';
  if (forceDoNothing) {
    conflictClause = ' ON CONFLICT DO NOTHING';
  } else if (pkColumns.length > 0 && pkColumns.every((pk) => commonColumns.includes(pk))) {
    const quotedPk = pkColumns.map(quoteIdent).join(', ');
    const nonPkCols = commonColumns.filter((c) => !pkColumns.includes(c));
    if (nonPkCols.length === 0) {
      conflictClause = ` ON CONFLICT (${quotedPk}) DO NOTHING`;
    } else {
      const updateSet = nonPkCols
        .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
        .join(', ');
      conflictClause = ` ON CONFLICT (${quotedPk}) DO UPDATE SET ${updateSet}`;
    }
  }

  const batchSize = 100;
  let processed = 0;

  for (let offset = 0; offset < sqliteRows.length; offset += batchSize) {
    const chunk = sqliteRows.slice(offset, offset + batchSize);
    const params = [];
    const valueTuples = [];

    for (const row of chunk) {
      const placeholders = [];
      for (const col of commonColumns) {
        const rawVal = nullifyColumns.has(col) ? null : row[col];
        const coerced = coerceValueForPostgres(rawVal, pgColMap.get(col));
        params.push(coerced);
        placeholders.push(`$${params.length}`);
      }
      valueTuples.push(`(${placeholders.join(', ')})`);
    }

    const sql = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES ${valueTuples.join(', ')}${conflictClause}`;
    await pgClient.query(sql, params);
    processed += chunk.length;
  }

  return processed;
}

async function syncPostgresSequences(pgClient, tables, pgColumnsByTable) {
  const intTypes = new Set(['smallint', 'integer', 'bigint', 'int2', 'int4', 'int8']);
  let syncedCount = 0;

  for (const tableName of tables) {
    const colMap = pgColumnsByTable.get(tableName);
    if (!colMap) continue;

    for (const [colName, meta] of colMap.entries()) {
      const dtype = (meta.data_type || '').toLowerCase();
      const udt = (meta.udt_name || '').toLowerCase();
      if (!intTypes.has(dtype) && !intTypes.has(udt)) continue;

      const seqRes = await pgClient.query(
        'SELECT pg_get_serial_sequence($1, $2) AS seq_name',
        [`public.${quoteIdent(tableName)}`, colName]
      );
      const seqName = seqRes.rows[0] && seqRes.rows[0].seq_name;
      if (!seqName) continue;

      const maxRes = await pgClient.query(
        `SELECT MAX(${quoteIdent(colName)}) AS max_val FROM ${quoteIdent(tableName)}`
      );
      const maxVal = maxRes.rows[0] ? maxRes.rows[0].max_val : null;
      if (maxVal !== null && maxVal !== undefined && Number(maxVal) >= 1) {
        await pgClient.query('SELECT setval($1, $2::bigint, true)', [seqName, String(maxVal)]);
      } else {
        await pgClient.query('SELECT setval($1, 1, false)', [seqName]);
      }
      syncedCount += 1;
    }
  }

  return syncedCount;
}

async function main() {
  const sqlite3 = resolveContainerModule('sqlite3');
  const { Client } = resolveContainerModule('pg');

  if (!process.env.DB_POSTGRESDB_PASSWORD) {
    throw new Error('DB_POSTGRESDB_PASSWORD environment variable is required.');
  }

  const sqliteDb = await openSqliteReadOnly(sqlite3, SQLITE_PATH);
  const pgClient = new Client({
    host: process.env.DB_POSTGRESDB_HOST || 'postgres',
    port: parseInt(process.env.DB_POSTGRESDB_PORT || '5432', 10),
    database: process.env.DB_POSTGRESDB_DATABASE || 'n8n',
    user: process.env.DB_POSTGRESDB_USER || 'n8n',
    password: process.env.DB_POSTGRESDB_PASSWORD,
  });

  await pgClient.connect();

  try {
    const migTableCheck = await pgClient.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'migrations'
      ) AS exists
    `);
    if (!migTableCheck.rows[0].exists) {
      throw new Error(
        'PostgreSQL migrations table does not exist. Initialize n8n schema before running state migration.'
      );
    }

    const migCountRes = await pgClient.query('SELECT COUNT(*)::int AS count FROM "migrations"');
    const pgMigrationCount = migCountRes.rows[0].count;
    if (pgMigrationCount < MIN_EXPECTED_MIGRATIONS) {
      throw new Error(
        `PostgreSQL migrations table has ${pgMigrationCount} rows (expected >= ${MIN_EXPECTED_MIGRATIONS}).`
      );
    }
    console.log(`[check] PostgreSQL schema verified (migrations=${pgMigrationCount})`);

    const sqliteMasterTables = await sqliteAll(
      sqliteDb,
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const sqliteTables = new Set(sqliteMasterTables.map((r) => r.name));

    const { pgTables, pgColumnsByTable, pgPrimaryKeysByTable, pgForeignKeys } =
      await loadPostgresSchema(pgClient);

    // Build complete migration list: explicit FK-safe list + any additional non-empty SQLite state tables.
    const plannedSet = new Set(ORDERED_STATE_TABLES);
    const extraNonEmptyCandidates = [];
    for (const tbl of sqliteTables) {
      if (EXCLUDED_TABLES.has(tbl) || plannedSet.has(tbl) || !pgTables.has(tbl)) continue;
      const cntRows = await sqliteAll(sqliteDb, `SELECT COUNT(*) AS c FROM ${quoteIdent(tbl)}`);
      if (Number(cntRows[0].c) > 0) {
        extraNonEmptyCandidates.push(tbl);
      }
    }
    const sortedExtras = sortRemainingTablesByFk(extraNonEmptyCandidates, pgForeignKeys);
    const finalTablePlan = [...ORDERED_STATE_TABLES, ...sortedExtras].filter(
      (tbl) => !EXCLUDED_TABLES.has(tbl) && sqliteTables.has(tbl) && pgTables.has(tbl)
    );

    const summary = [];
    let deferredWorkflowActiveVersions = [];

    await pgClient.query('BEGIN');
    try {
      for (const tableName of finalTablePlan) {
        const sqliteColInfo = await sqliteAll(sqliteDb, `PRAGMA table_info(${quoteIdent(tableName)})`);
        const sqliteColNames = sqliteColInfo.map((c) => c.name);
        const pgColMap = pgColumnsByTable.get(tableName) || new Map();
        const commonColumns = sqliteColNames.filter((c) => pgColMap.has(c));
        const pkColumns = pgPrimaryKeysByTable.get(tableName) || [];

        const sqliteRows = await sqliteAll(sqliteDb, `SELECT * FROM ${quoteIdent(tableName)}`);
        await reconcileBootstrapRows(pgClient, tableName, sqliteRows);

        const nullifyColumns = new Set();
        if (tableName === 'workflow_entity' && commonColumns.includes('activeVersionId')) {
          nullifyColumns.add('activeVersionId');
          deferredWorkflowActiveVersions = sqliteRows
            .filter((r) => r.activeVersionId !== null && r.activeVersionId !== undefined && r.activeVersionId !== '')
            .map((r) => ({ id: r.id, activeVersionId: r.activeVersionId }));
        }

        await upsertTableRows({
          pgClient,
          tableName,
          sqliteRows,
          commonColumns,
          pgColMap,
          pkColumns,
          nullifyColumns,
          forceDoNothing: DO_NOTHING_CONFLICT_TABLES.has(tableName),
        });

        if (tableName === 'workflow_history' && deferredWorkflowActiveVersions.length > 0) {
          for (const item of deferredWorkflowActiveVersions) {
            await pgClient.query(
              'UPDATE "workflow_entity" SET "activeVersionId" = $1 WHERE "id" = $2',
              [item.activeVersionId, item.id]
            );
          }
          deferredWorkflowActiveVersions = [];
        }

        const pgCountRes = await pgClient.query(
          `SELECT COUNT(*)::int AS count FROM ${quoteIdent(tableName)}`
        );
        summary.push({
          table: tableName,
          sqliteCount: sqliteRows.length,
          postgresCount: pgCountRes.rows[0].count,
        });
      }

      if (deferredWorkflowActiveVersions.length > 0) {
        for (const item of deferredWorkflowActiveVersions) {
          await pgClient.query(
            'UPDATE "workflow_entity" SET "activeVersionId" = $1 WHERE "id" = $2',
            [item.activeVersionId, item.id]
          );
        }
      }

      const syncedSequences = await syncPostgresSequences(
        pgClient,
        finalTablePlan,
        pgColumnsByTable
      );

      await pgClient.query('COMMIT');
      console.log(`[commit] Transaction committed successfully (sequences_synced=${syncedSequences})`);
    } catch (txErr) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    }

    console.log('--- Table Row Counts (SQLite -> PostgreSQL) ---');
    for (const item of summary) {
      if (item.sqliteCount > 0 || item.postgresCount > 0) {
        console.log(
          `${item.table.padEnd(32)} sqlite=${String(item.sqliteCount).padStart(5)}  postgres=${String(item.postgresCount).padStart(5)}`
        );
      }
    }
  } finally {
    await pgClient.end().catch(() => {});
    await sqliteClose(sqliteDb).catch(() => {});
  }
}

main().catch((err) => {
  console.error(`[error] State migration failed: ${err.message}`);
  process.exit(1);
});
