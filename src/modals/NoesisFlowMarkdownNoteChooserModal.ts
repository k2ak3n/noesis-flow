import { Notice, Modal, Setting, TFile } from "obsidian";
export class NoesisFlowMarkdownNoteChooserModal extends Modal {
  onChoose: any;
  title: any;
  constructor(app, title, onChoose) {
    super(app);
    this.title = title || "Choose note";
    this.onChoose = onChoose;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog");
    contentEl.addClass("noesis-flow-choice-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Path to a Markdown note",
      attr: { "aria-label": "Path to a Markdown note" }
    });
    input.addClass("noesis-flow-dialog-text-input");

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Enter the exact vault-relative path to a Markdown note, for example Projects/Tasks.md."
    });

    const choose = async (file) => {
      this.close();
      try {
        await this.onChoose(file);
      } catch (error) {
        console.error(error);
        new Notice(`Could not select note: ${error.message || error}`);
      }
    };

    const chooseInput = () => {
      const path = input.value.trim();
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== "md") {
        new Notice("Enter the path to an existing Markdown note.");
        return;
      }
      void choose(file);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        chooseInput();
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Choose");
        button.setCta();
        button.onClick(chooseInput);
      })
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      });

    window.setTimeout(() => input.focus(), 0);
  }
}
