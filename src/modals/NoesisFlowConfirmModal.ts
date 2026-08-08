import { Modal, Notice } from "obsidian";

export class NoesisFlowConfirmModal extends Modal {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: any;

  constructor(app, options: any = {}) {
    super(app);
    this.title = options.title || "Confirm action";
    this.message = options.message || "Are you sure you want to continue?";
    this.confirmLabel = options.confirmLabel || "Confirm";
    this.onConfirm = options.onConfirm;
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
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        await this.onConfirm();
        this.close();
      } catch (error) {
        console.error(error);
        new Notice(`Noesis Flow command failed: ${error.message || error}`);
        confirm.disabled = false;
      }
    });
  }
}
