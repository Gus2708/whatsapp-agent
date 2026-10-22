const sqlite3 = require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');
const dbPath = '/home/node/.n8n/database.sqlite';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  console.log('=== Ingestion/Prune Optimization for n8n SQLite Database ===');
  db.get('SELECT COUNT(*) as count FROM execution_entity', (err, row) => {
    if (err) {
      console.error('Error querying execution count:', err);
      return;
    }
    const total = row ? row.count : 0;
    console.log(`Current total executions in DB: ${total}`);

    // Keep the latest 200 executions
    const keepCount = 200;
    db.get(`SELECT id FROM execution_entity ORDER BY id DESC LIMIT 1 OFFSET ${keepCount}`, (err, cutoffRow) => {
      if (err) {
        console.error('Error finding cutoff ID:', err);
        finishWithVacuum();
        return;
      }

      if (!cutoffRow || !cutoffRow.id) {
        console.log(`Total executions (${total}) is <= ${keepCount}. No deletions needed.`);
        finishWithVacuum();
        return;
      }

      const cutoffId = cutoffRow.id;
      console.log(`Pruning executions older than ID ${cutoffId} (keeping newest ${keepCount})...`);

      db.run('DELETE FROM execution_data WHERE executionId <= ?', [cutoffId], function(err) {
        if (err) console.error('Error deleting execution_data:', err);
        else console.log(`[PASS] Deleted ${this.changes} rows from execution_data`);

        db.run('DELETE FROM execution_entity WHERE id <= ?', [cutoffId], function(err) {
          if (err) console.error('Error deleting execution_entity:', err);
          else console.log(`[PASS] Deleted ${this.changes} rows from execution_entity`);

          db.run('DELETE FROM insights_raw WHERE executionId <= ?', [cutoffId], function(err) {
            if (err) console.warn('Note: insights_raw delete:', err.message);
            else console.log(`[PASS] Deleted ${this.changes} rows from insights_raw`);

            finishWithVacuum();
          });
        });
      });
    });
  });
});

function finishWithVacuum() {
  console.log('Executing PRAGMA wal_checkpoint(TRUNCATE)...');
  db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
    if (err) console.error('Error on checkpoint:', err);
    else console.log('[PASS] WAL file truncated.');

    console.log('Executing VACUUM to reclaim disk and memory space...');
    db.run('VACUUM', (err) => {
      if (err) console.error('Error on VACUUM:', err);
      else console.log('[PASS] Database VACUUM complete!');

      db.close((err) => {
        if (err) console.error('Error closing DB:', err);
        else console.log('=== Database optimization finished successfully ===');
      });
    });
  });
}
