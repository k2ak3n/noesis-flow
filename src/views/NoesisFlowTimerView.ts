import { ItemView, Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type NoesisFlowPlugin from "../main";
import type { PomodoroMode } from "../utils";
import {
  NOESIS_FLOW_TIMER_VIEW_TYPE,
  getPomodoroNextStep,
  getPomodoroSessionSettings,
  normalizePomodoroMode
} from "../utils";
import { createNoesisFlowWidgetShell, setTooltip } from "../ui/NoesisFlowUi";

export class NoesisFlowTimerView extends ItemView {
  audio: HTMLAudioElement | null;
  audioUrl: string;
  completedFocusCycles: number;
  endsAt: number;
  lastTickAt: number;
  mode: PomodoroMode;
  pendingCompletion: boolean;
  plugin: NoesisFlowPlugin;
  remainingSeconds: number;
  running: boolean;
  timer: number | null;

  constructor(leaf: WorkspaceLeaf, plugin: NoesisFlowPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.mode = "focus";
    this.completedFocusCycles = 0;
    this.endsAt = 0;
    this.pendingCompletion = false;
    this.remainingSeconds = this.getModeSeconds();
    this.running = false;
    this.lastTickAt = 0;
    this.timer = null;
    this.audio = null;
    this.audioUrl = "";
    this.restoreStoredSession();
  }

  getViewType() {
    return NOESIS_FLOW_TIMER_VIEW_TYPE;
  }

  getDisplayText() {
    return "Pomodoro Timer";
  }

  getIcon() {
    return "timer";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("noesis-flow-time-view-content");
    await this.plugin.refreshTimerSoundFiles(false);
    if (this.pendingCompletion) {
      this.completeCurrentMode();
      return;
    }
    if (this.running) {
      this.resumeRunningSession();
      return;
    }
    this.render();
  }

  async onClose() {
    this.persistSession();
    this.stopTicker();
    this.stopSound();
    this.contentEl.empty();
    this.contentEl.removeClass("noesis-flow-time-view-content");
  }

  getSessionSettings() {
    return getPomodoroSessionSettings(this.plugin.settings);
  }

  restoreStoredSession() {
    const stored = this.plugin.settings && this.plugin.settings.timerSessionState;
    if (!stored || typeof stored !== "object") return;

    this.mode = normalizePomodoroMode(stored.mode);
    const session = this.getSessionSettings();
    this.completedFocusCycles = Math.max(0, Math.min(session.totalCycles, Number(stored.completedFocusCycles) || 0));
    const savedRemaining = Math.max(0, Math.min(this.getModeSeconds(), Math.round(Number(stored.remainingSeconds) || 0)));

    if (!stored.running) {
      this.remainingSeconds = savedRemaining || this.getModeSeconds();
      return;
    }

    this.endsAt = Number(stored.endsAt) || 0;
    this.remainingSeconds = this.endsAt
      ? Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000))
      : savedRemaining;
    this.pendingCompletion = this.remainingSeconds <= 0;
    this.running = !this.pendingCompletion;
  }

  persistSession() {
    this.plugin.settings.timerSessionState = {
      mode: this.mode,
      completedFocusCycles: this.completedFocusCycles,
      remainingSeconds: this.remainingSeconds,
      running: this.running,
      endsAt: this.running ? this.endsAt : 0
    };
    this.plugin.saveSettings().catch((error) => console.error("Noesis Flow: unable to save Pomodoro session", error));
  }

  resumeRunningSession() {
    if (!this.running || this.timer !== null) return;
    if (!this.endsAt) this.endsAt = Date.now() + this.remainingSeconds * 1000;
    this.lastTickAt = Date.now();
    this.timer = window.setInterval(() => this.tick(), 500);
    void this.playSelectedSound();
    this.render();
    this.plugin.refreshDailyBriefViews();
  }

  getModeLabel(mode = this.mode) {
    const cleanMode = normalizePomodoroMode(mode);
    if (cleanMode === "break") return "Short Break";
    if (cleanMode === "long-break") return "Long Break";
    return "Focus";
  }

  getModeSeconds(mode = this.mode) {
    const session = this.getSessionSettings();
    const cleanMode = normalizePomodoroMode(mode);
    if (cleanMode === "break") return Math.round(session.shortBreakMinutes * 60);
    if (cleanMode === "long-break") return Math.round(session.longBreakMinutes * 60);
    return Math.round(session.focusMinutes * 60);
  }

  getCycleText() {
    const session = this.getSessionSettings();
    const completed = Math.min(this.completedFocusCycles, session.totalCycles);
    const currentFocus = this.mode === "focus"
      ? Math.min(completed + 1, session.totalCycles)
      : completed;
    return `Cycle ${currentFocus} of ${session.totalCycles}`;
  }

  setMode(mode: PomodoroMode) {
    this.mode = normalizePomodoroMode(mode);
    this.running = false;
    this.endsAt = 0;
    this.stopTicker();
    this.stopSound();
    this.remainingSeconds = this.getModeSeconds();
    this.persistSession();
    this.render();
    this.plugin.refreshDailyBriefViews();
  }

  start() {
    if (this.running) return;
    if (this.remainingSeconds <= 0) this.remainingSeconds = this.getModeSeconds();
    this.running = true;
    this.lastTickAt = Date.now();
    this.endsAt = this.lastTickAt + this.remainingSeconds * 1000;
    this.timer = window.setInterval(() => this.tick(), 500);
    this.persistSession();
    this.render();
    this.plugin.refreshDailyBriefViews();
    void this.playSelectedSound();
  }

  pause(options: { render?: boolean; sync?: boolean } = {}) {
    const { render = true, sync = true } = options;
    if (sync && this.running) {
      this.syncRemainingTime();
      if (this.remainingSeconds <= 0) {
        this.completeCurrentMode();
        return;
      }
    }
    this.running = false;
    this.endsAt = 0;
    this.stopTicker();
    this.stopSound();
    this.persistSession();
    if (render) this.render();
    this.plugin.refreshDailyBriefViews();
  }

  reset() {
    this.running = false;
    this.endsAt = 0;
    this.stopTicker();
    this.stopSound();
    this.remainingSeconds = this.getModeSeconds();
    this.persistSession();
    this.render();
    this.plugin.refreshDailyBriefViews();
  }

  newSession() {
    this.running = false;
    this.endsAt = 0;
    this.stopTicker();
    this.stopSound();
    this.mode = "focus";
    this.completedFocusCycles = 0;
    this.remainingSeconds = this.getModeSeconds();
    this.persistSession();
    this.render();
    this.plugin.refreshDailyBriefViews();
  }

  advanceWorkflow(options: { render?: boolean } = {}) {
    const { render = true } = options;
    this.running = false;
    this.endsAt = 0;
    this.stopTicker();
    this.stopSound();
    const nextStep = getPomodoroNextStep(this.mode, this.completedFocusCycles, this.plugin.settings);
    this.mode = nextStep.mode;
    this.completedFocusCycles = nextStep.completedFocusCycles;
    this.remainingSeconds = this.getModeSeconds();
    this.persistSession();
    if (render) this.render();
    this.plugin.refreshDailyBriefViews();
    return nextStep;
  }

  completeCurrentMode() {
    const completedLabel = this.getModeLabel();
    this.pause({ render: false, sync: false });
    const nextStep = this.advanceWorkflow({ render: false });
    const nextLabel = this.getModeLabel();
    const message = nextStep.sessionComplete
      ? "Pomodoro session complete. New focus cycle ready."
      : `${completedLabel} complete. ${nextLabel} ready.`;
    void this.playCompletionSound();
    this.notifyCompletion(message);
    this.render();
    this.plugin.refreshDailyBriefViews();
  }

  stopTicker() {
    window.clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    if (!this.running) return;
    this.syncRemainingTime();
    if (this.remainingSeconds <= 0) {
      this.completeCurrentMode();
      return;
    }
    this.render();
    this.plugin.refreshDailyBriefViews();
  }

  syncRemainingTime() {
    if (!this.running) return;
    const now = Date.now();
    if (this.endsAt) {
      this.remainingSeconds = Math.max(0, Math.ceil((this.endsAt - now) / 1000));
      this.lastTickAt = now;
      return;
    }

    const elapsed = Math.max(0, Math.floor((now - this.lastTickAt) / 1000));
    if (elapsed <= 0) return;
    this.lastTickAt += elapsed * 1000;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsed);
  }

  async playCompletionSound() {
    const soundPath = this.plugin.settings.timerSoundPath || "";
    if (!this.plugin.settings.timerCompletionSoundEnabled || !soundPath) return;

    try {
      const url = await this.plugin.createTimerSoundObjectUrl(soundPath);
      const audio = new Audio(url);
      audio.volume = 0.7;
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    } catch (error) {
      console.error(error);
    }
  }

  notifyCompletion(message: string): void {
    new Notice(message, 8000);
    if (!this.plugin.settings.timerDesktopNotifications || !("Notification" in window) || Notification.permission !== "granted") return;
    new Notification("Pomodoro Timer", { body: message });
  }

  stopSound() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = "";
    }
  }

  async playSelectedSound() {
    this.stopSound();
    const soundPath = this.plugin.settings.timerSoundPath || "";
    if (!soundPath || !this.running || this.mode !== "focus") return;

    try {
      const url = await this.plugin.createTimerSoundObjectUrl(soundPath);
      if (!this.running || this.mode !== "focus") {
        URL.revokeObjectURL(url);
        return;
      }

      this.audioUrl = url;
      this.audio = new Audio(url);
      this.audio.loop = true;
      this.audio.volume = 0.48;
      await this.audio.play();
    } catch (error) {
      console.error(error);
      const label = this.plugin.getTimerSoundFiles().find((sound) => sound.path === soundPath)?.label || "focus sound";
      new Notice(`Could not play ${label}.`);
    }
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  render() {
    if (!this.contentEl) return;
    this.contentEl.empty();

    if (!this.plugin.settings.timerAddonEnabled) {
      this.contentEl.createDiv({ cls: "noesis-flow-calendar-empty", text: "Pomodoro Timer is disabled in Noesis Flow settings." });
      return;
    }

    const totalSeconds = this.getModeSeconds();
    const progress = totalSeconds > 0 ? 1 - (this.remainingSeconds / totalSeconds) : 0;
    const shell = this.contentEl.createDiv({ cls: "noesis-flow-time-shell" });
    shell.classList.toggle("noesis-flow-timer-display-digital-v2", this.plugin.settings.timerDisplayStyle === "timer");
    const { body: card } = createNoesisFlowWidgetShell(shell, {
      shellClass: "noesis-flow-time-card noesis-flow-timer-card",
      bodyClass: "noesis-flow-timer-body"
    });

    const displayStage = card.createDiv({ cls: "noesis-flow-timer-display-stage" });

    const digital = displayStage.createDiv({ cls: "noesis-flow-timer-digital-display" });
    digital.createDiv({ cls: "noesis-flow-timer-digital-time", text: this.formatTime(this.remainingSeconds) });
    digital.createDiv({ cls: "noesis-flow-timer-digital-mode", text: this.getModeLabel() });

    const circle = displayStage.createDiv({ cls: "noesis-flow-timer-circle" });
    circle.style.setProperty("--noesis-flow-timer-progress", `${Math.round(progress * 360)}deg`);
    circle.createDiv({ cls: "noesis-flow-timer-time", text: this.formatTime(this.remainingSeconds) });
    circle.createDiv({ cls: "noesis-flow-timer-mode", text: this.getModeLabel() });

    const cycleRow = card.createDiv({ cls: "noesis-flow-timer-cycle-row" });
    const cycleMarkers = cycleRow.createDiv({ cls: "noesis-flow-timer-cycle-markers", attr: { role: "img", "aria-label": this.getCycleText() } });
    const totalCycles = this.getSessionSettings().totalCycles;
    for (let index = 0; index < totalCycles; index += 1) {
      const marker = cycleMarkers.createSpan({ cls: "noesis-flow-timer-cycle-marker", attr: { "aria-hidden": "true" } });
      marker.classList.toggle("complete", index < this.completedFocusCycles);
      marker.classList.toggle("current", this.mode === "focus" && index === this.completedFocusCycles);
    }

    const actions = card.createDiv({ cls: "noesis-flow-time-actions noesis-flow-pomodoro-actions" });
    const reset = actions.createEl("button", {
      cls: "noesis-flow-time-button icon-only",
      attr: { type: "button", "aria-label": `Reset ${this.getModeLabel()} timer` }
    });
    setIcon(reset, "rotate-ccw");
    setTooltip(reset, `Reset ${this.getModeLabel()} timer`);
    reset.addEventListener("click", () => this.reset());

    const primary = actions.createEl("button", {
      cls: "noesis-flow-time-button icon-only primary",
      attr: {
        type: "button",
        "aria-label": this.running ? `Pause ${this.getModeLabel()} timer` : `Start ${this.getModeLabel()} timer`
      }
    });
    primary.createSpan({ cls: `noesis-flow-pomodoro-primary-glyph ${this.running ? "is-pause" : "is-play"}`, attr: { "aria-hidden": "true" } });
    setTooltip(primary, this.running ? `Pause ${this.getModeLabel()} timer` : `Start ${this.getModeLabel()} timer`);
    primary.addEventListener("click", () => this.running ? this.pause() : this.start());

    const skip = actions.createEl("button", {
      cls: "noesis-flow-time-button icon-only",
      attr: { type: "button", "aria-label": `Skip ${this.getModeLabel()}` }
    });
    setIcon(skip, "skip-forward");
    setTooltip(skip, `Skip ${this.getModeLabel()}`);
    skip.addEventListener("click", () => this.advanceWorkflow());
  }
}
