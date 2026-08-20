export function normalizeEventTimestamp(eventTimeStamp) {
  if (!Number.isFinite(eventTimeStamp)) {
    return performance.now();
  }

  if (eventTimeStamp > 1e12) {
    return eventTimeStamp - performance.timeOrigin;
  }

  return eventTimeStamp;
}

export class LatencyEngine {
  constructor(onSample) {
    this.onSample = onSample;
    this.pendingInputs = [];
    this.rafId = null;
  }

  recordInput(eventType, eventTimeStamp, inputValue) {
    const inputTime = normalizeEventTimestamp(eventTimeStamp);
    this.pendingInputs.push({ eventType, inputTime, inputValue });

    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame((paintTime) => {
      this.rafId = null;
      const inputs = this.pendingInputs;
      this.pendingInputs = [];

      for (const input of inputs) {
        const latencyMs = paintTime - input.inputTime;
        this.onSample({
          eventType: input.eventType,
          inputValue: input.inputValue,
          inputTime: input.inputTime,
          paintTime,
          latencyMs,
        });
      }
    });
  }
}
