import { App, Modal, Setting, Notice } from "obsidian";
import { asVoidHandler } from "../utils";

type ChoiceDescriptor = { label?: unknown; description?: unknown };
type ChoiceOptions<Choice> = {
  title?: string;
  choices?: Choice[];
  renderTitle?: (choice: Choice) => string;
  renderMeta?: (choice: Choice) => string;
  onCancel?: () => void;
};

export class NoesisFlowChoiceModal<Choice = ChoiceDescriptor | string> extends Modal {
  onCancel: (() => void) | null;
  renderMeta: (choice: Choice) => string;
  renderTitle: (choice: Choice) => string;
  choices: Choice[];
  didCancel: boolean;
  didChoose: boolean;
  onChoose: (choice: Choice) => void | Promise<void>;
  title: string;
  constructor(app: App, onChoose: (choice: Choice) => void | Promise<void>, options: ChoiceOptions<Choice> = {}) {
    super(app);
    this.onChoose = onChoose;
    this.title = options.title || "Choose an option";
    this.choices = options.choices || [];
    this.renderTitle = options.renderTitle || ((choice) => typeof choice === "object" && choice !== null && "label" in choice
      ? String(choice.label || "")
      : String(choice));
    this.renderMeta = options.renderMeta || ((choice) => typeof choice === "object" && choice !== null && "description" in choice
      ? String(choice.description || "")
      : "");
    this.onCancel = options.onCancel || null;
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
          new Notice(`Noesis Flow command failed: ${error instanceof Error ? error.message : String(error)}`);
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
