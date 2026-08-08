import { MarkdownRenderer, setIcon } from "obsidian";
import { CalendarTask } from "../types";

type NoesisFlowElement = HTMLElement & {
  empty(): void;
  addClass(className: string): void;
  createDiv(options?: { cls?: string; text?: string }): NoesisFlowElement;
  createSpan(options?: { cls?: string; text?: string }): NoesisFlowElement;
  createEl(tag: string, options?: { cls?: string; text?: string; attr?: Record<string, string> }): NoesisFlowElement;
};

export interface NoesisFlowWidgetOptions {
  shellClass?: string;
  headerClass?: string;
  titleClass?: string;
  titleTag?: string;
  title?: string;
  actionsClass?: string;
  bodyClass?: string;
  meta?: string;
  metaClass?: string;
  renderTitle?: (element: NoesisFlowElement) => void;
  renderActions?: (element: NoesisFlowElement) => void;
}

export interface NoesisFlowMarkdownOptions {
  app?: unknown;
  component?: unknown;
  sourcePath?: string;
}

export interface NoesisFlowTaskRowCallbacks {
  app?: unknown;
  component?: unknown;
  sourcePath?: string;
  actionsPlacement?: "top" | "meta";
  hideProjectMeta?: boolean;
  onComplete?: (task: CalendarTask, button: HTMLButtonElement) => void;
  onOpen?: (task: CalendarTask) => void;
}

export function getCalendarTaskPriorityClass(marker: string): string {
  if (marker === "!") return "priority-critical";
  if (marker === "H") return "priority-h";
  if (marker === "M") return "priority-m";
  if (marker === "L") return "priority-l";
  return "priority-none";
}

export function setTooltip(element: HTMLElement | null | undefined, text: string): void {
  if (!element) return;
  element.setAttribute("aria-label", text);
  element.setAttribute("title", text);
}

export function createCalendarIconButton(
  container: NoesisFlowElement,
  icon: string,
  label: string,
  onClick: () => void,
  fallback = "",
  extraClass = ""
): NoesisFlowElement {
  const button = container.createEl("button", {
    cls: `noesis-flow-calendar-icon-button ${extraClass}`.trim(),
    attr: { type: "button" }
  });
  if (typeof setIcon === "function" && icon.length > 1) setIcon(button, icon);
  else button.setText(fallback || icon);
  setTooltip(button, label);
  button.addEventListener("click", onClick);
  return button;
}

export function enhanceNoesisFlowDatePicker(input: HTMLInputElement): void {
  const existing = input.parentElement?.closest(".noesis-flow-date-input-control");
  if (existing) {
    existing.classList.toggle("is-date-input", input.type === "date");
    const button = existing.querySelector<HTMLButtonElement>(".noesis-flow-date-picker-button");
    if (button) button.hidden = input.type !== "date";
    return;
  }
  if (input.type !== "date" || !input.parentElement) return;
  const parent = input.parentElement;
  const wrapper = parent.createDiv({ cls: "noesis-flow-date-input-control is-date-input" });
  parent.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const button = wrapper.createEl("button", { cls: "noesis-flow-date-picker-button", attr: { type: "button" } });
  setIcon(button, "calendar-days");
  setTooltip(button, "Open date picker");
  button.addEventListener("click", () => {
    if (input.disabled) return;
    input.focus();
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof pickerInput.showPicker === "function") pickerInput.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  });
}

export function enhanceNoesisFlowDatePickers(container: HTMLElement): void {
  container.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach(enhanceNoesisFlowDatePicker);
}
export function createNoesisFlowWidgetShell(container: NoesisFlowElement, options: NoesisFlowWidgetOptions = {}) {
  const shell = container.createDiv({ cls: `noesis-flow-productivity-widget noesis-flow-widget-shell ${options.shellClass || ""}`.trim() });
  const header = shell.createDiv({ cls: `noesis-flow-widget-header ${options.headerClass || ""}`.trim() });
  const titleArea = header.createDiv({ cls: "noesis-flow-widget-title-area" });
  const titleRow = titleArea.createDiv({ cls: "noesis-flow-widget-title-row" });
  const title = titleRow.createEl((options.titleTag || "h3") as keyof HTMLElementTagNameMap, { cls: `noesis-flow-widget-title ${options.titleClass || ""}`.trim() });
  if (options.renderTitle) options.renderTitle(title);
  else title.setText(options.title || "");

  const actions = titleRow.createDiv({ cls: `noesis-flow-widget-actions ${options.actionsClass || ""}`.trim() });
  if (options.renderActions) options.renderActions(actions);
  else if (options.meta) actions.createDiv({ cls: `noesis-flow-widget-meta ${options.metaClass || ""}`.trim(), text: options.meta });
  else actions.addClass("is-empty");
  if (options.meta && options.renderActions) titleArea.createDiv({ cls: `noesis-flow-widget-meta ${options.metaClass || ""}`.trim(), text: options.meta });

  const body = shell.createDiv({ cls: `noesis-flow-widget-body ${options.bodyClass || ""}`.trim() });
  return { shell, header, titleArea, titleRow, title, actions, body };
}

export function createNoesisFlowWidgetEmpty(container: NoesisFlowElement, text: string, extraClass = ""): NoesisFlowElement {
  return container.createDiv({ cls: `noesis-flow-widget-empty ${extraClass}`.trim(), text });
}

export function renderNoesisFlowMarkdown(container: NoesisFlowElement, markdown: string, options: NoesisFlowMarkdownOptions = {}): NoesisFlowElement {
  const value = String(markdown || "").trim();
  container.empty();
  container.addClass("noesis-flow-markdown-inline");
  if (!value) return container;

  const renderer = MarkdownRenderer as unknown as {
    render?: (app: unknown, markdown: string, container: HTMLElement, sourcePath: string, component: unknown) => Promise<void>;
    renderMarkdown?: (markdown: string, container: HTMLElement, sourcePath: string, component: unknown) => Promise<void>;
  };
  try {
    if (renderer.render && options.app) {
      void renderer.render(options.app, value, container, options.sourcePath || "", options.component || null).catch(() => container.setText(value));
      return container;
    }
    if (renderer.renderMarkdown) {
      void renderer.renderMarkdown(value, container, options.sourcePath || "", options.component || null).catch(() => container.setText(value));
      return container;
    }
  } catch (error) {
    console.error(error);
  }
  container.setText(value);
  return container;
}

export function renderNoesisFlowTaskRow(
  container: NoesisFlowElement,
  task: CalendarTask,
  callbacks: NoesisFlowTaskRowCallbacks = {},
  extraClass = ""
): NoesisFlowElement {
  const item = container.createDiv({ cls: `noesis-flow-today-task-item ${extraClass}`.trim() });
  const completed = !!task.completed;
  const actionsPlacement = callbacks.actionsPlacement === "meta" ? "meta" : "top";
  item.classList.toggle("actions-in-meta", actionsPlacement === "meta");
  item.classList.toggle("is-completed", completed);
  item.addClass(getCalendarTaskPriorityClass(task.marker));
  const priorityLabel = task.marker === "!" ? "critical" : task.marker === "H" ? "high" : task.marker === "M" ? "medium" : task.marker === "L" ? "low" : "no-priority";
  const completeButton = item.createEl("button", {
    cls: "noesis-flow-today-task-marker noesis-flow-today-task-complete",
    text: completed ? "\u2713" : "",
    attr: { type: "button" }
  });
  setTooltip(completeButton, completed ? `Completed ${priorityLabel} task: ${task.text}` : `Mark ${priorityLabel} task complete: ${task.text}`);
  if (completed) completeButton.disabled = true;
  if (!completed && callbacks.onComplete) {
    completeButton.addEventListener("click", (event) => {
      event.preventDefault();
      callbacks.onComplete?.(task, completeButton);
    });
  }

  const body = item.createDiv({ cls: "noesis-flow-today-task-body" });
  const main = body.createDiv({ cls: "noesis-flow-task-main-row" });
  if (callbacks.onOpen) {
    main.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement).closest("a, button, input, select")) return;
      callbacks.onOpen?.(task);
    });
  }
  renderNoesisFlowMarkdown(main.createDiv({ cls: "noesis-flow-today-task-text" }), task.text, {
    app: callbacks.app, component: callbacks.component, sourcePath: task.sourcePath || callbacks.sourcePath || ""
  });
  const renderActions = (target: NoesisFlowElement) => {
    if (callbacks.onOpen) createCalendarIconButton(target, "panel-right-open", `Open task details: ${task.text}`, () => callbacks.onOpen?.(task), "", "noesis-flow-task-edit-button");
  };
  if (actionsPlacement === "top") renderActions(main.createDiv({ cls: "noesis-flow-task-edit-actions" }));

  const taskMeta = [
  ].filter(Boolean);
  if (task.section || taskMeta.length || actionsPlacement === "meta") {
    const metaRow = body.createDiv({ cls: "noesis-flow-task-meta-row" });
    const metadata = metaRow.createDiv({ cls: "noesis-flow-task-metadata" });
    if (!callbacks.hideProjectMeta) metadata.createDiv({ cls: "noesis-flow-today-task-meta", text: task.section || "" });
    for (const label of taskMeta) metadata.createSpan({ cls: "noesis-flow-task-meta-detail", text: label });
    if (actionsPlacement === "meta") renderActions(metaRow.createDiv({ cls: "noesis-flow-task-edit-actions" }));
  }
  return item;
}
