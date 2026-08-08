import { describe, expect, it } from "vitest";
import {
  parseTaskMetadata,
  preserveTaskLineComments,
  updateTaskMetadataInText
} from "../src/tasks/TaskMetadata";
import { createCalendarTaskLine, getTaskCaptureSection, markCalendarTaskCompletedInContent, parseCalendarTaskIndex, updateCalendarTaskInContent } from "../src/utils";

describe("task metadata contract", () => {
  it("keeps legacy Markdown tasks valid without assigning hidden semantics", () => {
    const metadata = parseTaskMetadata("Review proposal #2026-07-24");
    expect(metadata).toEqual({ taskId: "", seriesId: "" });
  });

  it("reads only valid optional Noesis Flow metadata", () => {
    const metadata = parseTaskMetadata([
      "Plan release",
      "<!-- noesis-flow-task:release-1 -->",
      "<!-- noesis-flow-series:weekly-release -->",
      "<!-- noesis-flow-status:next -->",
      "<!-- noesis-flow-project:project-alpha -->",
      "<!-- noesis-flow-priority:H -->",
      "<!-- noesis-flow-status:not-a-status -->"
    ].join(" "));

    expect(metadata).toEqual({
      taskId: "release-1",
      seriesId: "weekly-release",
      status: "next",
      projectId: "project-alpha",
      priorityMarker: "H"
    });
  });

  it("writes and clears a stable project link without touching other metadata", () => {
    const source = "- [ ] Write outline <!-- noesis-flow-task:task-1 --> <!-- noesis-flow-project:old-project -->";
    const updated = updateTaskMetadataInText(source, { projectId: "project-new" });
    expect(updated).toContain("<!-- noesis-flow-project:project-new -->");
    expect(updated).toContain("<!-- noesis-flow-task:task-1 -->");
    expect(updateTaskMetadataInText(updated, { projectId: null })).not.toContain("noesis-flow-project:");
  });

  it("does not expose the stable project link as task text", () => {
    const task = parseCalendarTaskIndex(
      "## Alpha\n- [ ] Write outline #2026-07-24 <!-- noesis-flow-project:project-alpha -->",
      { dateMarkerStyle: "tag" },
      "Projects.md"
    ).tasksByDate.get("2026-07-24")?.[0];
    expect(task).toMatchObject({ text: "Write outline", projectId: "project-alpha" });
  });

  it("carries source comments through a line replacement without duplicate IDs", () => {
    const source = "- [H] Prepare release #2026-07-20 <!-- noesis-flow-task:release-1 --> <!-- custom:keep -->";
    const replacement = "- [H] Publish release #2026-07-21 <!-- noesis-flow-task:release-1 -->";
    const result = preserveTaskLineComments(source, replacement);

    expect(result.match(/noesis-flow-task:release-1/g)).toHaveLength(1);
    expect(result).toContain("<!-- custom:keep -->");
  });

  it("preserves optional and user-owned comments when a task is edited or moved", () => {
    const content = "## Inbox\n- [H] Prepare release #2026-07-20 <!-- noesis-flow-task:release-1 --> <!-- noesis-flow-status:next --> <!-- custom:keep -->";
    const result = updateCalendarTaskInContent(content, {
      id: "release-1",
      text: "Prepare release",
      marker: "H",
      dateKey: "2026-07-20",
      lineIndex: 1,
      section: "Inbox"
    }, {
      text: "Publish release",
      section: "Launch",
      dateKey: "2026-07-21"
    }, { dateMarkerStyle: "tag" });

    expect(result.changed).toBe(true);
    expect(result.content).toContain("## Launch");
    expect(result.content).toContain("- [H] Publish release #2026-07-21");
    expect(result.content).toContain("<!-- noesis-flow-task:release-1 -->");
    expect(result.content).toContain("<!-- noesis-flow-status:next -->");
    expect(result.content).toContain("<!-- custom:keep -->");
  });

  it("updates workflow fields through the shared task mutation path", () => {
    const content = "## Inbox\n- [ ] Plan release #2026-07-20 <!-- noesis-flow-task:release-1 --> <!-- noesis-flow-status:inbox --> <!-- custom:keep -->";
    const task = parseCalendarTaskIndex(content, { dateMarkerStyle: "tag" }, "Inbox.md").tasksByDate.get("2026-07-20")?.[0];
    const result = updateCalendarTaskInContent(content, task, { status: "doing" }, { dateMarkerStyle: "tag" });

    expect(result.changed).toBe(true);
    expect(result.content).toContain("<!-- noesis-flow-status:doing -->");
    expect(result.content).toContain("<!-- custom:keep -->");
    expect(result.content).not.toContain("<!-- noesis-flow-status:inbox -->");
  });

  it("timestamps only a newly completed task when completion metadata is enabled", () => {
    const content = "## Inbox\n- [ ] Finish review #2026-07-20 <!-- noesis-flow-task:review-1 -->";
    const task = parseCalendarTaskIndex(content, { dateMarkerStyle: "tag" }, "Inbox.md").tasksByDate.get("2026-07-20")?.[0];
    const result = markCalendarTaskCompletedInContent(content, task, { dateMarkerStyle: "tag", taskCompletionTimestampsEnabled: true });
    const completed = parseCalendarTaskIndex(result.content, { dateMarkerStyle: "tag" }, "Inbox.md").completedTasksByDate.get("2026-07-20")?.[0];

    expect(result.content).toContain("<!-- noesis-flow-completed:");
    expect(result.content).toContain("<!-- noesis-flow-priority:none -->");
    expect(completed).toMatchObject({ marker: " ", priorityLabel: "No priority" });
    expect(completed?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("retains a priority written by Noesis Flow after native Obsidian completion", () => {
    const source = "## Inbox\n- [H] Finish review #2026-07-20 <!-- noesis-flow-task:review-1 -->";
    const active = parseCalendarTaskIndex(source, { dateMarkerStyle: "tag" }, "Inbox.md").tasksByDate.get("2026-07-20")?.[0];
    const edited = updateCalendarTaskInContent(source, active, { text: "Finish release review" }, { dateMarkerStyle: "tag" });
    const nativeCompletion = edited.content.replace("- [H]", "- [x]");
    const completed = parseCalendarTaskIndex(nativeCompletion, { dateMarkerStyle: "tag" }, "Inbox.md").completedTasksByDate.get("2026-07-20")?.[0];

    expect(edited.content).toContain("<!-- noesis-flow-priority:H -->");
    expect(completed).toMatchObject({
      text: "Finish release review",
      completed: true,
      marker: "H",
      priorityLabel: "High"
    });
  });

  it("writes priority metadata when Noesis Flow completes a task and keeps completion when it is edited", () => {
    const source = "## Inbox\n- [M] Prepare review #2026-07-20 <!-- noesis-flow-task:review-1 -->";
    const active = parseCalendarTaskIndex(source, { dateMarkerStyle: "tag" }, "Inbox.md").tasksByDate.get("2026-07-20")?.[0];
    const completedResult = markCalendarTaskCompletedInContent(source, active, { dateMarkerStyle: "tag", taskCompletionTimestampsEnabled: false });
    const completed = parseCalendarTaskIndex(completedResult.content, { dateMarkerStyle: "tag" }, "Inbox.md").completedTasksByDate.get("2026-07-20")?.[0];
    const edited = updateCalendarTaskInContent(completedResult.content, completed, { text: "Prepare final review" }, { dateMarkerStyle: "tag" });
    const editedCompleted = parseCalendarTaskIndex(edited.content, { dateMarkerStyle: "tag" }, "Inbox.md").completedTasksByDate.get("2026-07-20")?.[0];

    expect(completedResult.content).toContain("<!-- noesis-flow-priority:M -->");
    expect(edited.content).toContain("- [x] Prepare final review");
    expect(editedCompleted).toMatchObject({ completed: true, marker: "M", priorityLabel: "Medium" });
  });

  it("reopens completed tasks with their preserved priority", () => {
    const priorities = [["!", "Critical"], ["H", "High"], ["M", "Medium"], ["L", "Low"], [" ", "No priority"]];

    for (const [marker, priorityLabel] of priorities) {
      const metadataMarker = marker === " " ? "none" : marker;
      const source = `## Inbox\n- [x] Restore priority #2026-07-20 <!-- noesis-flow-priority:${metadataMarker} --> <!-- noesis-flow-completed:2026-08-06T12:00:00.000Z -->`;
      const completed = parseCalendarTaskIndex(source, { dateMarkerStyle: "tag" }, "Inbox.md").completedTasksByDate.get("2026-07-20")?.[0];
      const reopened = updateCalendarTaskInContent(source, completed, { marker: completed?.marker }, { dateMarkerStyle: "tag" });
      const active = parseCalendarTaskIndex(reopened.content, { dateMarkerStyle: "tag" }, "Inbox.md").tasksByDate.get("2026-07-20")?.[0];
      const checkbox = marker === " " ? "- [ ]" : `- [${marker}]`;

      expect(reopened.content).toContain(`${checkbox} Restore priority`);
      expect(reopened.content).not.toContain("<!-- noesis-flow-completed:");
      expect(active).toMatchObject({ completed: false, marker, priorityLabel });
    }
  });
});

describe("task capture defaults", () => {
  it("routes a task without a project into the Unassigned section", () => {
    expect(getTaskCaptureSection("")).toBe("Unassigned");
    expect(getTaskCaptureSection("  Personal  ")).toBe("Personal");
  });

  it("writes selected workflow fields onto a new Markdown task", () => {
    const line = createCalendarTaskLine("Draft brief", { marker: "M" }, "2026-07-24", { dateMarkerStyle: "tag" }, {
      taskId: "brief-1",
      status: "next"
    });
    const task = parseCalendarTaskIndex(`## Inbox\n${line}`, { dateMarkerStyle: "tag" }, "Inbox.md").tasksByDate.get("2026-07-24")?.[0];

    expect(task).toMatchObject({
      id: "brief-1",
      status: "next"
    });
  });
});
