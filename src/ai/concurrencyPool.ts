export interface QueueState {
  active: number;
  waiting: number;
  limit: number;
}
export class ConcurrencyPool {
  active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    public limit: number,
    public maxQueue = 256,
    private observer?: (state: QueueState) => void,
  ) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Invalid concurrency");
  }
  snapshot(): QueueState {
    return {
      active: this.active,
      waiting: this.waiting.length,
      limit: this.limit,
    };
  }
  private publish() {
    this.observer?.(this.snapshot());
  }
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxQueue)
        throw new Error("Decision queue is full");
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        this.publish();
      });
    } else {
      this.active++;
      this.publish();
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
      this.publish();
    }
  }
}
