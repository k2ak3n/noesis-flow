import { describe, expect, it } from "vitest";
import { getTaskRepositoryIndexSignature, TaskRepository } from "../src/tasks/TaskRepository";
import { DEFAULT_SETTINGS } from "../src/utils";

describe("TaskRepository", () => {
  it("reuses unchanged source indexes and reparses only invalidated notes", async () => {
    const contents = new Map([
      ["Inbox.md", "## Inbox\n- [ ] Capture task #2026-07-20"],
      ["Projects.md", "## Project\n- [H] Ship release #2026-07-21"]
    ]);
    const reads: string[] = [];
    const repository = new TaskRepository({
      read: async (file: any) => {
        reads.push(file.path);
        return contents.get(file.path) || "";
      }
    } as any);
    const files = [{ path: "Inbox.md" }, { path: "Projects.md" }] as any[];

    let index = await repository.refresh(files as any, DEFAULT_SETTINGS as any);
    expect(reads).toEqual(["Inbox.md", "Projects.md"]);
    expect(index.undatedTasks).toHaveLength(0);
    expect(Array.from(index.tasksByDate.values()).flat()).toHaveLength(2);

    await repository.refresh(files as any, DEFAULT_SETTINGS as any);
    expect(reads).toEqual(["Inbox.md", "Projects.md"]);

    contents.set("Projects.md", "## Project\n- [H] Ship release #2026-07-22");
    repository.invalidate("Projects.md");
    index = await repository.refresh(files as any, DEFAULT_SETTINGS as any);
    expect(reads).toEqual(["Inbox.md", "Projects.md", "Projects.md"]);
    expect(index.tasksByDate.get("2026-07-22")).toHaveLength(1);
  });

  it("changes the view signature when task metadata or source position changes", async () => {
    const repository = new TaskRepository({
      read: async () => "## Inbox\n- [ ] Release <!-- noesis-flow-status:inbox -->"
    } as any);
    const files = [{ path: "Inbox.md" }] as any[];
    const first = await repository.refresh(files, DEFAULT_SETTINGS as any);
    const firstSignature = getTaskRepositoryIndexSignature(first);

    const task = first.undatedTasks[0];
    task.status = "doing";
    task.lineIndex = 9;
    const changed = {
      ...first,
      undatedTasks: [task]
    };

    expect(getTaskRepositoryIndexSignature(changed)).not.toBe(firstSignature);
  });
});
