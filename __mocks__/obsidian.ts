export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class Modal {}
export class TFile {}
export class ItemView {}
export const MarkdownRenderer = {
  renderMarkdown(markdown: string, el: any) {
    if (el && typeof el.setText === "function") el.setText(markdown);
    return Promise.resolve();
  },
  render(_app: any, markdown: string, el: any) {
    if (el && typeof el.setText === "function") el.setText(markdown);
    return Promise.resolve();
  }
};
export const moment = require("moment");
export function normalizePath(path: string) { return path; }
export function setIcon() {}
