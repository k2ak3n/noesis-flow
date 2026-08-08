import { TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { RecurringTaskHost, RecurringTaskService } from "../src/tasks/RecurringTaskService";
import { DEFAULT_SETTINGS } from "../src/utils";

function file(path: string): TFile {
  return Object.assign(new TFile(), { path, extension: "md" }) as TFile;
}

function createRecoveryHost(contents: Map<string, string>, files: TFile[]) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.recurringTasksEnabled = true;
  let saves = 0;
  let refreshes = 0;
  let managerRefreshes = 0;
  const host: RecurringTaskHost = {
    vault: {
      async read(target: TFile) { return contents.get(target.path) || ""; }
    } as RecurringTaskHost["vault"],
    settings,
    async processTaskFile() { throw new Error("Recovery must not write Markdown files."); },
    async refreshCalendarTaskCounts() { refreshes += 1; },
    getRecurringTaskDateSettings() { return settings; },
    getRecurringTaskSeriesDates(series) { return series.occurrenceDates || []; },
    getRecurringTaskSourceFiles() { return files; },
    async saveSettings() { saves += 1; },
    refreshRecurringTaskManagerViews() { managerRefreshes += 1; }
  };
  return { host, settings, counters: () => ({ saves, refreshes, managerRefreshes }) };
}

describe("RecurringTaskService", () => {
  it("persists and refreshes series status and removal changes", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.recurringTaskSeries = [{
      id: "weekly-review",
      text: "Weekly review",
      section: "Unassigned",
      marker: "H",
      sourcePath: "Tasks.md",
      startDate: "2026-07-20",
      recurrence: { rule: "weekly" },
      occurrenceCount: 1,
      status: "active",
      createdAt: "2026-07-20T00:00:00.000Z"
    }];
    let saves = 0;
    let refreshes = 0;
    let managerRefreshes = 0;
    const host: RecurringTaskHost = {
      vault: {} as RecurringTaskHost["vault"],
      settings,
      async processTaskFile() {},
      async refreshCalendarTaskCounts() { refreshes += 1; },
      getRecurringTaskDateSettings() { return settings; },
      getRecurringTaskSeriesDates() { return []; },
      getRecurringTaskSourceFiles() { return []; },
      async saveSettings() { saves += 1; },
      refreshRecurringTaskManagerViews() { managerRefreshes += 1; }
    };
    const service = new RecurringTaskService(host);

    await expect(service.setSeriesStatus("weekly-review", "paused")).resolves.toBe(true);
    expect(settings.recurringTaskSeries[0].status).toBe("paused");
    await expect(service.removeSeries("weekly-review")).resolves.toBe(true);
    expect(settings.recurringTaskSeries).toEqual([]);
    expect({ saves, refreshes, managerRefreshes }).toEqual({ saves: 2, refreshes: 2, managerRefreshes: 2 });
  });

  it("rebuilds empty tracking from configured task notes without rewriting Markdown", async () => {
    const tasks = file("Tasks.md");
    const content = `## Operations
- [H] Daily check #2026-08-01 <!-- noesis-flow-series:daily-check -->
- [H] Daily check #2026-08-02 <!-- noesis-flow-series:daily-check -->
- [x] Weekly report #2026-08-03 <!-- noesis-flow-series:weekly-report --> <!-- noesis-flow-priority:H -->
- [H] Weekly report #2026-08-10 <!-- noesis-flow-series:weekly-report -->
- [M] Month end #2026-01-31 <!-- noesis-flow-series:month-end -->
- [M] Month end #2026-02-28 <!-- noesis-flow-series:month-end -->
- [L] Team follow-up #2026-08-03 <!-- noesis-flow-series:team-follow-up -->
- [L] Team follow-up #2026-08-05 <!-- noesis-flow-series:team-follow-up -->
- [L] Team follow-up #2026-08-10 <!-- noesis-flow-series:team-follow-up -->
- [L] Team follow-up #2026-08-12 <!-- noesis-flow-series:team-follow-up -->`;
    const contents = new Map([[tasks.path, content]]);
    const { host, settings, counters } = createRecoveryHost(contents, [tasks]);
    const service = new RecurringTaskService(host);

    await expect(service.recoverSeriesFromConfiguredSources()).resolves.toBe(4);
    expect(settings.recurringTaskRecoveryVersion).toBe(1);
    expect(settings.recurringTaskSeries.map((series) => series.id).sort()).toEqual([
      "daily-check", "month-end", "team-follow-up", "weekly-report"
    ]);
    expect(settings.recurringTaskSeries.find((series) => series.id === "daily-check")?.recurrence.rule).toBe("daily");
    expect(settings.recurringTaskSeries.find((series) => series.id === "weekly-report")?.recurrence.rule).toBe("weekly");
    expect(settings.recurringTaskSeries.find((series) => series.id === "month-end")?.recurrence.rule).toBe("monthly");
    expect(settings.recurringTaskSeries.find((series) => series.id === "team-follow-up")?.recurrence.rule).toBe("custom-weekdays");
    expect(settings.recurringTaskSeries.find((series) => series.id === "weekly-report")?.marker).toBe("H");
    expect(settings.recurringTaskSeries.find((series) => series.id === "weekly-report")?.occurrenceDates).toEqual(["2026-08-03", "2026-08-10"]);
    expect(contents.get(tasks.path)).toBe(content);
    expect(counters()).toEqual({ saves: 1, refreshes: 1, managerRefreshes: 1 });
    await expect(service.recoverSeriesFromConfiguredSources()).resolves.toBe(0);
  });

  it("records an empty recovery attempt without creating duplicate series", async () => {
    const tasks = file("Tasks.md");
    const { host, settings, counters } = createRecoveryHost(new Map([[tasks.path, "## Unassigned\n- [ ] One-off #2026-08-01"]]), [tasks]);
    const service = new RecurringTaskService(host);

    await expect(service.recoverSeriesFromConfiguredSources()).resolves.toBe(0);
    expect(settings.recurringTaskSeries).toEqual([]);
    expect(settings.recurringTaskRecoveryVersion).toBe(1);
    expect(counters()).toEqual({ saves: 1, refreshes: 0, managerRefreshes: 1 });
    await expect(service.recoverSeriesFromConfiguredSources(true)).resolves.toBe(0);
    expect(settings.recurringTaskSeries).toEqual([]);
  });
});