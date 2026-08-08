import { describe, expect, it } from "vitest";
import { moment } from "../src/time";
import { queryTasks, resolveTaskProject } from "../src/tasks/TaskQuery";
import { CalendarTask, NoesisFlowProject } from "../src/types";

const project: NoesisFlowProject = {
  id: "project-alpha", name: "Alpha", sourcePath: "Projects.md", section: "Alpha", status: "active", createdAt: "2026-01-01T00:00:00.000Z"
};

function task(overrides: Partial<CalendarTask>): CalendarTask {
  return { dateKey: "", marker: " ", priorityLabel: "No priority", section: "Inbox", sourcePath: "Inbox.md", text: "Task", lineIndex: 0, ...overrides };
}

describe("shared task query", () => {
  it("uses Date for past work and ignores legacy availability and deadline fields", () => {
    const snapshot = queryTasks([
      task({ text: "Legacy availability", startDate: "2026-07-22" }), task({ text: "Legacy deadline", dueDate: "2026-07-19" }),
      task({ text: "Past Date", dateKey: "2026-07-19" })
    ], [], [project], moment("2026-07-20"));
    expect(snapshot.actionable.map((item) => item.text)).toContain("Legacy availability");
    expect(snapshot.pastScheduled.map((item) => item.text)).toEqual(["Past Date"]);
  });

  it("recognizes explicit registrations while preserving legacy Markdown headings", () => {
    const registered = task({ sourcePath: "Projects.md", section: "Alpha", projectId: "project-alpha" });
    const legacy = task({ sourcePath: "Projects.md", section: "Unregistered heading" });
    const inbox = task({ section: "Inbox" });
    const snapshot = queryTasks([registered, legacy, inbox], [], [project], moment("2026-07-20"));
    expect(resolveTaskProject(registered, [project]).project?.name).toBe("Alpha");
    expect(snapshot.unregisteredProject).toEqual([legacy]);
    expect(snapshot.noProject).toEqual([inbox]);
  });

  it("keeps archived project tasks out of actionable work without confusing them with unavailable work", () => {
    const archived = { ...project, status: "archived" as const };
    const assigned = task({ sourcePath: "Projects.md", section: "Alpha", projectId: archived.id });
    const snapshot = queryTasks([assigned], [], [archived], moment("2026-07-20"));
    expect(snapshot.actionable).toEqual([]);
    expect(snapshot.archivedProjectTasks).toEqual([assigned]);
  });

  it("keeps paused project tasks out of actionable and available-later work", () => {
    const paused = { ...project, status: "paused" as const };
    const assigned = task({ sourcePath: "Projects.md", section: "Alpha", projectId: paused.id, startDate: "2026-07-22" });
    const snapshot = queryTasks([assigned], [], [paused], moment("2026-07-20"));
    expect(snapshot.actionable).toEqual([]);
  });
});
