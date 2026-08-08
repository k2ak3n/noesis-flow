/** Coalesces bursty cache events into one asynchronous refresh. */
export class RefreshScheduler {
  private pending = false;
  private timer: number | null = null;

  constructor(private readonly run: () => Promise<void> | void, private readonly delayMs = 120) {}

  schedule(): void {
    if (this.pending) return;
    this.pending = true;
    this.timer = window.setTimeout(() => {
      this.pending = false;
      this.timer = null;
      void Promise.resolve(this.run()).catch((error) => console.error("Noesis Flow: scheduled refresh failed", error));
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.pending = false;
  }
}
