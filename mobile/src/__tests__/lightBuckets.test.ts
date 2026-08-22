import { addLuxSample, createLightBucket, finalizeLightBucket } from '../data/lightBuckets';

describe('light bucket', () => {
  it('aggregates count, mean, min and max', () => {
    const at = Date.UTC(2026, 7, 22, 23, 0, 0);
    let bucket = createLightBucket('night-1', at);
    bucket = addLuxSample(bucket, 2, at);
    bucket = addLuxSample(bucket, 8, at + 200);
    expect(finalizeLightBucket(bucket)).toMatchObject({ count: 2, mean: 5, min: 2, max: 8, gapMs: 0 });
  });

  it('records time missing beyond the expected 5Hz interval', () => {
    const at = Date.UTC(2026, 7, 22, 23, 0, 0);
    let bucket = createLightBucket('night-1', at);
    bucket = addLuxSample(bucket, 2, at);
    bucket = addLuxSample(bucket, 3, at + 1_200);
    expect(finalizeLightBucket(bucket)?.gapMs).toBe(1_000);
  });

  it('can carry the previous sample time across a minute boundary', () => {
    const previous = Date.UTC(2026, 7, 22, 23, 0, 59, 800);
    const at = previous + 1_200;
    let bucket = createLightBucket('night-1', at);
    bucket.lastSampleAt = previous;
    bucket = addLuxSample(bucket, 3, at);
    expect(finalizeLightBucket(bucket)?.gapMs).toBe(1_000);
  });
});
