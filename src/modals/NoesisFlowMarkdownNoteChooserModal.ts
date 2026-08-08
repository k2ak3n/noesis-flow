import { Notice, Modal, Setting } from "obsidian";
export class NoesisFlowMarkdownNoteChooserModal extends Modal {
  onChoose: any;
  query: any;
  title: any;
  constructor(app, title, onChoose) {
    super(app);
    this.title = title || "Choose note";
    this.onChoose = onChoose;
    this.query = "";
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
      placeholder: "Search notes",
      attr: { "aria-label": "Search notes" }
    });
    input.addClass("noesis-flow-dialog-text-input");

    const list = contentEl.createDiv({ cls: "noesis-flow-dialog-chooser-list" });
    const getMatches = () => {
      const query = this.query.trim().toLowerCase();
      return this.app.vault.getMarkdownFiles()
        .filter((file) => !query || file.path.toLowerCase().includes(query) || file.basename.toLowerCase().includes(query))
        .slice(0, 60);
    };

    const choose = async (file) => {
      this.close();
      try {
        await this.onChoose(file);
      } catch (error) {
        console.error(error);
        new Notice(`Could not select note: ${error.message || error}`);
      }
    };

    const render = () => {
      list.empty();
      const matches = getMatches();
      if (!matches.length) {
        list.createEl("p", { text: "No matching notes." });
        return;
      }

      for (const file of matches) {
        const item = list.createEl("button", { cls: "noesis-flow-dialog-chooser-item" });
        item.type = "button";
        item.createEl("span", { cls: "noesis-flow-dialog-chooser-title", text: file.basename });
        item.createEl("span", { cls: "noesis-flow-dialog-chooser-meta", text: file.path });
        item.addEventListener("click", () => choose(file));
      }
    };

    input.addEventListener("input", () => {
      this.query = input.value;
      render();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
      if (event.key === "Enter") {
        const first = getMatches()[0];
        if (!first) return;
        event.preventDefault();
        choose(first);
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      });

    render();
    window.setTimeout(() => input.focus(), 0);
  }
}
