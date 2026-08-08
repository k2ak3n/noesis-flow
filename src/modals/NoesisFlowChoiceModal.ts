import { Modal, Setting, Notice } from "obsidian";
import { asVoidHandler } from "../utils";

export class NoesisFlowChoiceModal extends Modal {
  onCancel: any;
  renderMeta: any;
  renderTitle: any;
  choices: any;
  didCancel: any;
  didChoose: any;
  onChoose: any;
  title: any;
  constructor(app, onChoose, options: any = {}) {
    super(app);
    this.onChoose = onChoose;
    this.title = options.title || "Choose an option";
    this.choices = options.choices || [];
    this.renderTitle = typeof options.renderTitle === "function" ? options.renderTitle : (c) => String(c.label || c);
    this.renderMeta = typeof options.renderMeta === "function" ? options.renderMeta : (c) => String(c.description || "");
    this.onCancel = typeof options.onCancel === "function" ? options.onCancel : null;
    this.didChoose = false;
    this.didCancel = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog");
    contentEl.addClass("noesis-flow-choice-modal");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });

    const list = contentEl.createDiv({ cls: "noesis-flow-dialog-chooser-list" });
    for (const choice of this.choices) {
      const item = list.createEl("button", { cls: "noesis-flow-dialog-chooser-item" });
      item.type = "button";
      item.createEl("span", {
        cls: "noesis-flow-dialog-chooser-title",
        text: this.renderTitle(choice)
      });
      item.createEl("span", {
        cls: "noesis-flow-dialog-chooser-meta",
        text: this.renderMeta(choice)
      });
      item.addEventListener("click", asVoidHandler(async () => {
        this.didChoose = true;
        this.close();
        try {
          await this.onChoose(choice);
        } catch (error) {
          console.error(error);
          new Notice(`Noesis Flow command failed: ${error.message || error}`);
        }
      }));
    }

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      });
  }

  onClose() {
    if (this.didChoose || this.didCancel || !this.onCancel) return;
    this.didCancel = true;
    this.onCancel();
  }
}
