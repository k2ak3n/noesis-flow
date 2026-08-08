import { App, Notice, Modal, Setting } from "obsidian";

type TextPromptOptions = {
  allowEmpty?: boolean;
  onCancel?: () => void;
  requiredMessage?: string;
  submitButtonText?: string;
};

export class NoesisFlowTextPromptModal extends Modal {
  onCancel: (() => void) | null;
  defaultValue: string;
  didCancel: boolean;
  didSubmit: boolean;
  onSubmit: (value: string) => void | Promise<unknown>;
  requiredMessage: string;
  submitButtonText: string;
  title: string;
  placeholder: string;
  allowEmpty: boolean;
  constructor(app: App, title: string, placeholder: string, defaultValue: string, onSubmit: (value: string) => void | Promise<unknown>, options: TextPromptOptions = {}) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.defaultValue = defaultValue || "";
    this.onSubmit = onSubmit;
    this.requiredMessage = options.requiredMessage || "This field is required.";
    this.allowEmpty = !!options.allowEmpty;
    this.submitButtonText = options.submitButtonText || "Save";
    this.onCancel = typeof options.onCancel === "function" ? options.onCancel : null;
    this.didSubmit = false;
    this.didCancel = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("noesis-flow-dialog");
    const header = contentEl.createDiv({ cls: "noesis-flow-modal-header" });
    header.createEl("h2", { text: this.title });

    const input = contentEl.createEl("input", {
      type: "text",
      value: this.defaultValue,
      placeholder: this.placeholder,
      attr: { "aria-label": this.placeholder }
    });
    input.addClass("noesis-flow-dialog-text-input");

    const submit = async () => {
      const value = input.value.trim();
      if (!value && !this.allowEmpty) {
        new Notice(this.requiredMessage);
        return;
      }
      this.didSubmit = true;
      this.close();
      try {
        await this.onSubmit(value);
      } catch (error) {
        console.error(error);
        new Notice(`Noesis Flow command failed: ${error.message || error}`);
      }
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel");
        button.onClick(() => this.close());
      })
      .addButton((button) => {
        button.setButtonText(this.submitButtonText);
        button.setCta();
        button.onClick(submit);
      });

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  onClose() {
    if (this.didSubmit || this.didCancel || !this.onCancel) return;
    this.didCancel = true;
    this.onCancel();
  }
}
