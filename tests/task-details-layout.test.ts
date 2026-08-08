import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Task Details layout contract", () => {
  it("uses the New Task modal width while keeping its field grid independent", () => {
    const css = workspaceFile("styles.css");

    expect(css).toContain(".modal.noesis-flow-task-details-modal-container");
    expect(css).toContain("width: min(480px, calc(100vw - 32px));");
    expect(css).toContain("--noesis-flow-task-details-task-width: 100%;");
    expect(css).toContain("width: var(--noesis-flow-task-details-task-width);");
    expect(css).toContain(".noesis-flow-task-details-modal .noesis-flow-kanban-task-fields");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).toMatch(/\.noesis-flow-task-details-actions\s*\{[^}]*margin-top: 16px;/s);
  });

  it("keeps the No date control inside the Date field header", () => {
    const modal = workspaceFile("src/modals/NoesisFlowTaskDetailsModal.ts");

    expect(modal).toContain('dateField.addClass("noesis-flow-kanban-date-field")');
    expect(modal).toContain('dateLabel.createSpan({ cls: "noesis-flow-kanban-no-date-option" })');
    expect(modal).toContain('dateField.toggleClass("is-undated", noDate.checked)');
  });
});
