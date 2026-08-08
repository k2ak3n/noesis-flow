import { App, Modal, Notice } from "obsidian";
import { asVoidHandler } from "../utils";

type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<unknown>;
};

export class NoesisFlowConfirmModal extends Modal {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;

  constructor(app: App, options: ConfirmOptions = {}) {
    super(app);
    this.title = options.title || "Confirm action";
    this.message = options.message || "Are you sure you want to continue?";
    this.confirmLabel = options.confirmLabel || "Confirm";
    this.onConfirm = options.onConfirm || (() => undefined);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog", "noesis-flow-confirm-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });
    contentEl.createEl("p", { cls: "noesis-flow-confirm-message", text: this.message });
    const actions = contentEl.createDiv({ cls: "noesis-flow-kanban-task-actions" });
    actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: this.confirmLabel, attr: { type: "button" } });
    confirm.addClass("mod-warning");
    confirm.addEventListener("click", asVoidHandler(async () => {
      confirm.disabled = true;
      try {
        await this.onConfirm();
        this.close();
      } catch (error) {
        console.error(error);
        new Notice(`Noesis Flow command failed: ${error instanceof Error ? error.message : String(error)}`);
        confirm.disabled = false;
      }
    }));
  }
}
