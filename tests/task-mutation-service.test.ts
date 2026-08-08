import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { TaskMutationHost, TaskMutationService } from "../src/tasks/TaskMutationService";
import { DEFAULT_SETTINGS, parseCalendarTaskIndex } from "../src/utils";

function file(path: string): TFile {
  return Object.assign(new TFile(), { path, extension: "md" }) as TFile;
}

function createHost(contents: Map<string, string>, files: Map<string, TFile>): TaskMutationHost {
  const vault = {
    async read(target: TFile) {
      return contents.get(target.path) || "";
    },
    async process(target: TFile, processor: (content: string) => string | Promise<string>) {
      contents.set(target.path, await processor(contents.get(target.path) || ""));
    },
    getAbstractFileByPath(path: string) {
      return files.get(path) || null;
    }
  };
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    vault: vault as TaskMutationHost["vault"],
    settings,
    async processTaskFile(target, processor) { await vault.process(target, processor); },
    async processTaskFiles(_targets, operation) { await operation(); },
    async refreshCalendarTaskCounts() {},
    getCalendarTaskFileForTask(task) { return files.get(task.sourcePath) || null; },
    getTaskSourcePaths() { return Array.from(files.keys()); },
    getRecurringTaskSeries() { return settings.recurringTaskSeries; },
    getRecurringTaskDateSettings() { return settings; },
    getRecurringTaskSeriesDates(series) { return series.occurrenceDates || []; },
    async saveSettings() {},
    refreshRecurringTaskManagerViews() {}
  };
}

describe("TaskMutationService", () => {
  it("moves a task across configured notes while retaining its stable identity", async () => {
    const inbox = file("Inbox.md");
    const project = file("Project.md");
    const contents = new Map([
      ["Inbox.md", "## Inbox\n- [H] Prepare release #2026-07-21 <!-- noesis-flow-task:release-task -->\n"],
      ["Project.md", "## Release\n"]
    ]);
    const files = new Map([[inbox.path, inbox], [project.path, project]]);
    const host = createHost(contents, files);
    const task = parseCalendarTaskIndex(contents.get(inbox.path), host.settings, inbox.path)
      .tasksByDate.get("2026-07-21")?.[0];
    expect(task).toBeDefined();

    const service = new TaskMutationService(host);
    await expect(service.moveCalendarTaskToSource(task!, project.path, { section: "Release" })).resolves.toBe(true);

    expect(contents.get(inbox.path)).not.toContain("release-task");
    expect(contents.get(project.path)).toContain("<!-- noesis-flow-task:release-task -->");
    expect(contents.get(project.path)).toContain("## Release");
  });

  it("rolls back the destination when the source task changes during a move", async () => {
    const inbox = file("Inbox.md");
    const project = file("Project.md");
    const contents = new Map([
      ["Inbox.md", "## Inbox\n- [ ] Prepare release #2026-07-21 <!-- noesis-flow-task:release-task -->\n"],
      ["Project.md", "## Release\n"]
    ]);
    const files = new Map([[inbox.path, inbox], [project.path, project]]);
    const host = createHost(contents, files);
    const originalProcess = host.vault.process.bind(host.vault);
    let targetWasWritten = false;
    host.vault.process = async (target, processor) => {
      if (target.path === project.path) targetWasWritten = true;
      if (target.path === inbox.path && targetWasWritten) {
        contents.set(inbox.path, "## Inbox\n- [ ] Changed externally #2026-07-21 <!-- noesis-flow-task:external-task -->\n");
      }
      await originalProcess(target, processor);
    };
    const task = parseCalendarTaskIndex(contents.get(inbox.path), host.settings, inbox.path)
      .tasksByDate.get("2026-07-21")?.[0];

    const service = new TaskMutationService(host);
    await expect(service.moveCalendarTaskToSource(task!, project.path)).resolves.toBe(false);

    expect(contents.get(project.path)).not.toContain("release-task");
    expect(contents.get(project.path)).not.toContain("Prepare release");
  });
});
