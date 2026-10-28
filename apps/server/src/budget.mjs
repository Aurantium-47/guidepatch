import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createBudget(databasePath, budgetUsd, phase = 'development', sharedAllowanceUsd = budgetUsd) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, model TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'development',
      reserved_micros INTEGER NOT NULL, cost_micros INTEGER,
      dispatched INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
      prompt_tokens INTEGER, completion_tokens INTEGER, duration_ms INTEGER
    );`);
  if (!db.prepare('PRAGMA table_info(requests)').all().some((column) => column.name === 'phase')) db.exec("ALTER TABLE requests ADD COLUMN phase TEXT NOT NULL DEFAULT 'development'");
  const spent = db.prepare('SELECT COALESCE(SUM(COALESCE(cost_micros, reserved_micros)), 0) AS amount FROM requests WHERE phase=?');
  const committed = db.prepare('SELECT COALESCE(SUM(COALESCE(cost_micros,reserved_micros)),0) AS amount FROM requests');
  return {
    reserve(id, model, micros) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (spent.get(phase).amount + micros > Math.floor(budgetUsd * 1_000_000) || committed.get().amount + micros > Math.floor(sharedAllowanceUsd * 1_000_000)) throw new Error('budget_exhausted');
        db.prepare('INSERT INTO requests (id,created_at,model,phase,reserved_micros,status) VALUES (?,?,?,?,?,?)').run(id, new Date().toISOString(), model, phase, micros, 'reserved');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    dispatch(id) {
      db.prepare('UPDATE requests SET dispatched=1 WHERE id=?').run(id);
    },
    finish(id, status, durationMs, usage, costMicros) {
      db.prepare('UPDATE requests SET status=?,duration_ms=?,prompt_tokens=?,completion_tokens=?,cost_micros=? WHERE id=?').run(status, durationMs, usage?.prompt_tokens ?? null, usage?.completion_tokens ?? null, costMicros ?? null, id);
    },
    status() {
      const liveCalls = db.prepare('SELECT COUNT(*) AS count FROM requests WHERE dispatched=1 AND phase=?').get(phase).count;
      const lastStatus = db.prepare('SELECT status FROM requests WHERE phase=? ORDER BY rowid DESC LIMIT 1').get(phase)?.status;
      const lastError = lastStatus && !['reserved', 'succeeded'].includes(lastStatus) ? lastStatus : undefined;
      const totals = db.prepare('SELECT COALESCE(SUM(cost_micros),0) AS spent, COALESCE(SUM(CASE WHEN cost_micros IS NULL THEN reserved_micros ELSE 0 END),0) AS reserved FROM requests WHERE phase=?').get(phase);
      const totalCommitted = committed.get().amount;
      return {
        phase,
        budgetUsd,
        remainingUsd: Math.max(0, Math.min(Math.floor(budgetUsd * 1_000_000) - spent.get(phase).amount, Math.floor(sharedAllowanceUsd * 1_000_000) - totalCommitted) / 1_000_000),
        spentUsd: totals.spent / 1_000_000,
        reservedUsd: totals.reserved / 1_000_000,
        totalCommittedUsd: totalCommitted / 1_000_000,
        liveCalls,
        ...(lastError ? { lastError } : {}),
      };
    },
    close() { db.close(); },
  };
}
