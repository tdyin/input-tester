const DEFAULT_BIN_SIZE_MS = 8;
const DEFAULT_BIN_COUNT = 25;

export class StatsTracker {
  constructor(binSizeMs = DEFAULT_BIN_SIZE_MS, binCount = DEFAULT_BIN_COUNT) {
    this.binSizeMs = binSizeMs;
    this.binCount = binCount;
    this.reset();
  }

  reset() {
    this.samples = [];
    this.count = 0;
    this.sum = 0;
    this.min = Number.POSITIVE_INFINITY;
    this.max = Number.NEGATIVE_INFINITY;
    this.latest = null;
    this.bins = Array.from({ length: this.binCount }, () => 0);
  }

  addSample(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
      return;
    }

    this.samples.push(ms);
    this.count += 1;
    this.sum += ms;
    this.min = Math.min(this.min, ms);
    this.max = Math.max(this.max, ms);
    this.latest = ms;

    const rawIndex = Math.floor(ms / this.binSizeMs);
    const index = Math.min(rawIndex, this.binCount - 1);
    this.bins[index] += 1;
  }

  getSummary() {
    if (this.count === 0) {
      return {
        count: 0,
        latest: null,
        min: null,
        avg: null,
        max: null,
      };
    }

    return {
      count: this.count,
      latest: this.latest,
      min: this.min,
      avg: this.sum / this.count,
      max: this.max,
    };
  }

  getBins() {
    return this.bins.map((count, index) => {
      const start = index * this.binSizeMs;
      const end = start + this.binSizeMs;
      const label = index === this.binCount - 1 ? `${start}+` : `${start}-${end}`;
      return { label, count };
    });
  }
}
