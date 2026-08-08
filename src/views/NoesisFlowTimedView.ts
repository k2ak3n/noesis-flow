import { ItemView } from "obsidian";

/** Shared lifecycle plumbing for views that only need a periodic rerender. */
export abstract class NoesisFlowTimedView extends ItemView {
  private refreshTimer: number | null = null;

  protected startPeriodicRender(intervalMs: number): void {
    this.stopPeriodicRender();
    this.refreshTimer = window.setInterval(() => this.render(), intervalMs);
    this.registerInterval(this.refreshTimer);
  }

  protected stopPeriodicRender(): void {
    if (this.refreshTimer !== null) window.clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  abstract render(): void;
}
