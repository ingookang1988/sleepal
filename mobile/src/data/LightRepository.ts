import * as SQLite from 'expo-sqlite';

import {
  addLuxSample,
  createLightBucket,
  finalizeLightBucket,
  LightBucket,
  LightBucketDraft,
  minuteStart,
} from './lightBuckets';

const DATABASE_NAME = 'sleepal.db';
const SCHEMA_VERSION = 3;

export type LightBucketRow = {
  sessionId: string;
  minuteAt: number;
  count: number;
  mean: number;
  min: number;
  max: number;
  gapMs: number;
};

export class LightRepository {
  private database: SQLite.SQLiteDatabase | null = null;
  private sessionId: string | null = null;
  private bucket: LightBucketDraft | null = null;
  private lastLuxAt: number | null = null;

  async init(): Promise<void> {
    if (this.database) return;
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        cause_in TEXT NOT NULL,
        cause_out TEXT,
        schema_version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS light_buckets (
        session_id TEXT NOT NULL,
        minute_at INTEGER NOT NULL,
        sample_count INTEGER NOT NULL,
        mean REAL NOT NULL,
        min REAL NOT NULL,
        max REAL NOT NULL,
        gap_ms INTEGER NOT NULL,
        PRIMARY KEY (session_id, minute_at)
      );
      CREATE TABLE IF NOT EXISTS sensor_events (
        session_id TEXT NOT NULL,
        t INTEGER NOT NULL,
        kind TEXT NOT NULL,
        duration_ms INTEGER,
        PRIMARY KEY (session_id, t, kind)
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    this.database = database;
  }

  async startSession(causeIn = 'ble-connect', at = Date.now()): Promise<string> {
    await this.init();
    if (this.sessionId) return this.sessionId;
    this.sessionId = `lux-${at}`;
    await this.database!.runAsync(
      `INSERT OR IGNORE INTO sessions
       (id, started_at, ended_at, cause_in, cause_out, schema_version)
       VALUES (?, ?, NULL, ?, NULL, ?)`,
      this.sessionId,
      at,
      causeIn,
      SCHEMA_VERSION
    );
    return this.sessionId;
  }

  async recordLux(value: number, at = Date.now()): Promise<void> {
    const sessionId = await this.startSession('first-lux', at);
    if (!this.bucket || this.bucket.minuteAt !== minuteStart(at)) {
      await this.flush();
      this.bucket = createLightBucket(sessionId, at);
      this.bucket.lastSampleAt = this.lastLuxAt;
    }
    this.bucket = addLuxSample(this.bucket, value, at);
    this.lastLuxAt = at;
  }

  async flush(): Promise<void> {
    if (!this.bucket) return;
    const finalized = finalizeLightBucket(this.bucket);
    if (finalized) await this.upsertBucket(finalized);
  }

  async endSession(causeOut: string, at = Date.now()): Promise<void> {
    await this.flush();
    if (this.database && this.sessionId) {
      await this.database.runAsync(
        'UPDATE sessions SET ended_at = ?, cause_out = ? WHERE id = ?',
        at,
        causeOut,
        this.sessionId
      );
    }
    this.sessionId = null;
    this.bucket = null;
    this.lastLuxAt = null;
  }

  async recentBuckets(limit = 120): Promise<LightBucketRow[]> {
    await this.init();
    return this.database!.getAllAsync<LightBucketRow>(
      `SELECT session_id AS sessionId, minute_at AS minuteAt, sample_count AS count,
              mean, min, max, gap_ms AS gapMs
       FROM light_buckets ORDER BY minute_at DESC LIMIT ?`,
      limit
    );
  }

  private async upsertBucket(bucket: LightBucket): Promise<void> {
    await this.init();
    await this.database!.runAsync(
      `INSERT INTO light_buckets
       (session_id, minute_at, sample_count, mean, min, max, gap_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, minute_at) DO UPDATE SET
         sample_count = excluded.sample_count,
         mean = excluded.mean,
         min = excluded.min,
         max = excluded.max,
         gap_ms = excluded.gap_ms`,
      bucket.sessionId,
      bucket.minuteAt,
      bucket.count,
      bucket.mean,
      bucket.min,
      bucket.max,
      bucket.gapMs
    );
  }
}
