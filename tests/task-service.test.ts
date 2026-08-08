import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { TaskService } from "../src/tasks/TaskService";
import { DEFAULT_SETTINGS } from "../src/utils";

describe("TaskService", () => {
  it("serializes a mutation and invalidates the shared index", async () => {
    let content = "## Inbox\n- [ ] Initial #2026-07-21";
    const service = new TaskService({
      async read() { return content; },
      async process(_file, processor) { content = await processor(content); }
    });
    const file = { path: "Inbox.md" } as TFile;

    await service.refresh([file], DEFAULT_SETTINGS);
    await service.process(file, (current) => current.replace("Initial", "Updated"));
    const index = await service.refresh([file], DEFAULT_SETTINGS);

    expect(index.tasksByDate.get("2026-07-21")?.[0]?.text).toBe("Updated");
  });
});
