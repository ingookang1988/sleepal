import { EXPECTED_LUX_INTERVAL_MS } from '../ble/constants';

export type LightBucketDraft = {
  sessionId: string;
  minuteAt: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  gapMs: number;
  lastSampleAt: number | null;
};

export type LightBucket = {
  sessionId: string;
  minuteAt: number;
  count: number;
  mean: number;
  min: number;
  max: number;
  gapMs: number;
};

export function minuteStart(at: number): number {
  return Math.floor(at / 60_000) * 60_000;
}

export function createLightBucket(sessionId: string, at: number): LightBucketDraft {
  return {
    sessionId,
    minuteAt: minuteStart(at),
    count: 0,
    sum: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    gapMs: 0,
    lastSampleAt: null,
  };
}

export function addLuxSample(bucket: LightBucketDraft, value: number, at: number): LightBucketDraft {
  if (!Number.isFinite(value) || value < 0) throw new Error('Lux must be a non-negative number');
  if (minuteStart(at) !== bucket.minuteAt) throw new Error('Sample belongs to a different minute');

  const delta = bucket.lastSampleAt === null ? 0 : at - bucket.lastSampleAt;
  const gap = delta > EXPECTED_LUX_INTERVAL_MS * 2 ? delta - EXPECTED_LUX_INTERVAL_MS : 0;

  return {
    ...bucket,
    count: bucket.count + 1,
    sum: bucket.sum + value,
    min: Math.min(bucket.min, value),
    max: Math.max(bucket.max, value),
    gapMs: bucket.gapMs + gap,
    lastSampleAt: at,
  };
}

export function finalizeLightBucket(bucket: LightBucketDraft): LightBucket | null {
  if (bucket.count === 0) return null;
  return {
    sessionId: bucket.sessionId,
    minuteAt: bucket.minuteAt,
    count: bucket.count,
    mean: bucket.sum / bucket.count,
    min: bucket.min,
    max: bucket.max,
    gapMs: bucket.gapMs,
  };
}
