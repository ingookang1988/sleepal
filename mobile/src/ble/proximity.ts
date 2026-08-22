export type ProximityEstimate = {
  filteredRssi: number | null;
  veryNear: boolean;
};

export class RssiProximityEstimator {
  private readonly samples: number[] = [];
  private nearHits = 0;

  constructor(
    private readonly threshold: number,
    private readonly windowSize = 7,
    private readonly requiredHits = 3
  ) {}

  update(rssi: number): ProximityEstimate {
    this.samples.push(rssi);
    if (this.samples.length > this.windowSize) this.samples.shift();

    const sorted = [...this.samples].sort((left, right) => left - right);
    const filteredRssi = sorted[Math.floor(sorted.length / 2)] ?? null;
    this.nearHits = filteredRssi !== null && filteredRssi >= this.threshold ? this.nearHits + 1 : 0;

    return {
      filteredRssi,
      veryNear: this.nearHits >= this.requiredHits,
    };
  }

  reset(): void {
    this.samples.length = 0;
    this.nearHits = 0;
  }
}
