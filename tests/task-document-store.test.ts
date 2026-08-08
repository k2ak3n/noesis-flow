import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { TaskDocumentStore } from "../src/tasks/TaskDocumentStore";
import {
  createCalendarTaskLine,
  deleteCalendarTaskInContent,
  markCalendarTaskCompletedInContent,
  parseCalendarTaskIndex,
  updateCalendarTaskInContent
} from "../src/utils";

const settings = { dateMarkerStyle: "tag" };

function taskFrom(content: string, dateKey = "2026-07-17") {
  return parseCalendarTaskIndex(content, settings, "Tasks.md").tasksByDate.get(dateKey)?.[0];
}

describe("TaskDocumentStore", () => {
  it("serializes concurrent writes to the same Markdown note", async () => {
    let content = "";
    const vault = {
      async process(_file: TFile, processor) {
        const next = await processor(content);
        content = next;
      }
    };
    const store = new TaskDocumentStore(vault);
    const file = { path: "Tasks.md" } as TFile;

    await Promise.all([
      store.process(file, async (current) => `${current}first\n`),
      store.process(file, async (current) => `${current}second\n`),
      store.process(file, async (current) => `${current}third\n`)
    ]);

    expect(content).toBe("first\nsecond\nthird\n");
  });

  it("reserves every file in a coordinated multi-note operation", async () => {
    const store = new TaskDocumentStore({ async process() {} });
    const inbox = { path: "Inbox.md" } as TFile;
    const projects = { path: "Projects.md" } as TFile;
    const order: string[] = [];

    await Promise.all([
      store.processFiles([inbox, projects], async () => {
        order.push("first-start");
        await Promise.resolve();
        order.push("first-end");
      }),
      store.processFiles([projects, inbox], async () => {
        order.push("second-start");
        order.push("second-end");
      })
    ]);

    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("keeps a task stable through update, completion, reopen, and deletion", async () => {
    let content = `## Inbox\n${createCalendarTaskLine("Prepare release", { marker: "H" }, "2026-07-17", settings, { taskId: "release-task" })}\n`;
    const vault = {
      async process(_file: TFile, processor) {
        content = await processor(content);
      }
    };
    const store = new TaskDocumentStore(vault);
    const file = { path: "Tasks.md" } as TFile;

    const original = taskFrom(content);
    expect(original).toMatchObject({ id: "release-task", section: "Inbox", marker: "H" });

    await store.process(file, (current) => updateCalendarTaskInContent(
      current,
      original,
      { section: "Release", dateKey: "2026-07-18", text: "Publish release" },
      settings
    ).content);
    const moved = taskFrom(content, "2026-07-18");
    expect(moved).toMatchObject({ id: "release-task", section: "Release", text: "Publish release" });

    await store.process(file, (current) => markCalendarTaskCompletedInContent(current, moved, settings).content);
    expect(content).toContain("- [x] Publish release #2026-07-18 <!-- noesis-flow-task:release-task -->");

    const completed = parseCalendarTaskIndex(content, settings, "Tasks.md").completedTasksByDate.get("2026-07-18")?.[0];
    await store.process(file, (current) => updateCalendarTaskInContent(current, completed, { marker: "H" }, settings).content);
    const reopened = taskFrom(content, "2026-07-18");
    expect(reopened).toMatchObject({ id: "release-task", marker: "H" });

    await store.process(file, (current) => deleteCalendarTaskInContent(current, reopened, settings).content);
    expect(content).not.toContain("release-task");
  });
});
