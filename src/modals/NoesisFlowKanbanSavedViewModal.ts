import { Modal, Notice } from "obsidian";

export class NoesisFlowKanbanSavedViewModal extends Modal {
  savedView: any;
  title: string;
  submitLabel: string;
  onSubmit: any;

  constructor(app, savedView, onSubmit, options: any = {}) {
    super(app);
    this.savedView = savedView || {};
    this.onSubmit = onSubmit;
    this.title = options.title || "Save Kanban view";
    this.submitLabel = options.submitLabel || "Save view";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog", "noesis-flow-kanban-saved-view-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });
    contentEl.createEl("p", { cls: "setting-item-description", text: "Name the layout, then optionally add a short description." });

    const form = contentEl.createDiv({ cls: "noesis-flow-kanban-task-form" });
    let fieldIndex = 0;
    const createField = (label, control) => {
      const field = form.createDiv({ cls: "noesis-flow-kanban-task-field" });
      const labelEl = field.createEl("label", { text: label });
      const controlId = `noesis-flow-kanban-saved-view-${fieldIndex++}`;
      control.id = controlId;
      labelEl.htmlFor = controlId;
      field.appendChild(control);
      return field;
    };
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = this.savedView.name || "";
    nameInput.placeholder = "View name";
    createField("Name", nameInput);

    const descriptionInput = document.createElement("input");
    descriptionInput.type = "text";
    descriptionInput.value = this.savedView.description || "";
    descriptionInput.placeholder = "Optional short description";
    createField("Description", descriptionInput);

    const actions = contentEl.createDiv({ cls: "noesis-flow-kanban-task-actions" });
    actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: this.submitLabel, attr: { type: "button" } });
    save.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) {
        new Notice("Enter a saved view name.");
        return;
      }
      save.disabled = true;
      try {
        await this.onSubmit({ name, description: descriptionInput.value.trim() });
        this.close();
      } catch (error) {
        save.disabled = false;
        new Notice(`Could not save view: ${error.message || error}`);
      }
    });
    window.setTimeout(() => nameInput.focus(), 0);
  }
}
