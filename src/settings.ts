import { PluginSettingTab, Setting, Notice } from "obsidian";
import { moment } from "./time";
import { NoesisFlowMarkdownNoteChooserModal } from "./modals/NoesisFlowMarkdownNoteChooserModal";
import { NoesisFlowCalendarSectionModal } from "./modals/NoesisFlowCalendarSectionModal";
import { NoesisFlowTextPromptModal } from "./modals/NoesisFlowTextPromptModal";
import { NoesisFlowKanbanSavedViewModal } from "./modals/NoesisFlowKanbanSavedViewModal";
import { NoesisFlowConfirmModal } from "./modals/NoesisFlowConfirmModal";
import { NoesisFlowSettings } from "./types";
import type NoesisFlowPlugin from "./main";
import { DATE_TASK_FILTER_OPTIONS, KANBAN_TASK_VIEW_OPTIONS, CALENDAR_TASK_PRIORITIES, asVoidHandler, sanitizeCssText, clampNumber, getDateMarkerLabel, downloadText, DEFAULT_SETTINGS, normalizeDateTaskFilter, normalizeKanbanCardAccentPosition, normalizeKanbanCardContextPlacement, normalizeKanbanCardContextAlignment, normalizeKanbanTaskView, parseCalendarTaskIndex, parseKanbanSavedViewsExport, serializeKanbanSavedViews } from "./utils";
import { getMarkdownH2Sections } from "./tasks/TaskMarkdown";

export class NoesisFlowSettingTab extends PluginSettingTab {
  openSettingsSections: Set<string>;
  plugin: NoesisFlowPlugin;
  settingsSearchQuery: string;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.openSettingsSections = new Set();
    this.settingsSearchQuery = "";
  }

  captureOpenSettingsSections() {
    if (!this.containerEl) return;
    this.containerEl.querySelectorAll("details.noesis-flow-settings-section[data-noesis-flow-section-key]").forEach((details: any) => {
      const key = details.dataset.noesisFlowSectionKey;
      if (!key) return;
      if (details.open) {
        this.openSettingsSections.add(key);
      } else {
        this.openSettingsSections.delete(key);
      }
    });
  }

  createSettingsDetails(containerEl, title, description = "") {
    const key = title;
    const details = containerEl.createEl("details", {
      cls: "noesis-flow-settings-details noesis-flow-settings-section"
    });
    details.dataset.noesisFlowSectionKey = key;
    details.open = this.openSettingsSections.has(key);
    details.addEventListener("toggle", () => {
      if (details.open) {
        this.openSettingsSections.add(key);
      } else {
        this.openSettingsSections.delete(key);
      }
    });
    const summary = details.createEl("summary");
    summary.createSpan({ cls: "noesis-flow-settings-summary-title", text: title });
    if (description) {
      summary.createSpan({ cls: "noesis-flow-settings-summary-desc", text: description });
    }
    this.renderSectionResetAction(details, title);
    return details;
  }

  getSectionResetKeys(title: string) {
    const resetKeys = {
      "Date Parser": ["dateMarkerStyle"],
      "Dashboard": ["dailyBriefAddonEnabled", "dailyBriefTaskFilter", "dailyBriefShowTodayTasks", "dailyBriefShowOverdueTasks", "dailyBriefShowNextHoliday", "dailyBriefShowWeekend", "dailyBriefShowTimer"],
      "Calendar": ["calendarAddonEnabled", "calendarLayoutStyle", "calendarWeekStart", "calendarShowWeekNumbers", "calendarShowWeekNumbersRight", "calendarShadeWeekendColumns", "calendarWeekendDays", "calendarShowQuarters", "calendarShowTodayButton", "calendarShowTodayButtonOnMobile", "calendarHeaderDateScale", "calendarDateNumberScale", "calendarSelectedDateRadius", "calendarQuarterRailSpacing", "calendarOverflowDateOpacity", "calendarWeekendTintStrength", "calendarWeekendTintTone"],
      "Tasks": ["tasksAddonEnabled", "calendarTaskCaptureEnabled", "calendarTaskTargetNote", "taskInboxNote", "taskSourceNotes", "projects", "calendarShowTaskCounts", "calendarMarkOverdueTasks", "calendarTaskWorkloadThreshold", "calendarTaskOrangePriorityThreshold", "calendarTaskRedPriorityThreshold", "calendarTaskCriticalColor", "calendarTaskHighColor", "calendarTaskMediumColor", "calendarTaskLowColor", "recurringTasksEnabled", "recurringTaskOccurrenceLimit", "recurringTaskAutoExtend", "recurringTasksUseSeparateNote", "recurringTaskTargetNote", "recurringTaskManagerEnabled"],
      "Task List": ["taskListAddonEnabled", "taskListColumnOrder", "taskListVisibleColumns", "taskListColumnWidths", "taskListSortColumn", "taskListSortDirection", "taskListFilter", "taskListStatuses", "taskListPriorityFilters", "taskListUnscheduledFilter", "taskListSourceFilter", "taskAuditEnabled", "taskAuditNote"],
      "Monthly Planner": ["planningAddonEnabled"],
      "Kanban": ["kanbanTasksAddonEnabled", "kanbanTaskFilter", "kanbanTaskView", "kanbanTaskStatus", "kanbanTaskStatuses", "kanbanPriorityFilters", "kanbanUnscheduledFilter", "kanbanSavedViews", "kanbanDateHideWeekends", "kanbanCardOrder", "kanbanCompactCards", "kanbanCardPriorityBorders", "kanbanCardAccentPosition", "kanbanCardContextDivider", "kanbanCardContextPlacement", "kanbanCardContextAlignment", "kanbanCardCornerRadius"],
      "Holidays": ["holidayCalendarEnabled", "holidayCalendarNote"],
      "Milestones / Events": ["calendarEventsEnabled", "calendarEventColor", "timelineNote"],
      "Timeline Widget": ["timelineAddonEnabled", "timelineRangeDays", "timelineIncludeEvents", "timelineIncludeHolidays"],
      "Pomodoro Timer": ["timerAddonEnabled", "timerFocusMinutes", "timerBreakMinutes", "timerLongBreakMinutes", "timerFocusCycles", "timerLongBreakInterval", "timerSoundPath", "timerCompletionSoundEnabled", "timerDesktopNotifications"]
    };
    return resetKeys[title] || [];
  }

  renderSectionResetAction(details, title: string) {
    const keys = this.getSectionResetKeys(title);
    if (!keys.length) return;
    const action = details.createDiv({ cls: "noesis-flow-settings-section-action" });
    const button = action.createEl("button", { text: "Reset this section", attr: { type: "button" } });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new NoesisFlowConfirmModal(this.app, {
        title: `Reset ${title}`,
        message: title === "Kanban"
          ? "Restore the Kanban defaults? This also removes saved Kanban views."
          : `Restore the default settings for ${title}?`,
        confirmLabel: "Reset section",
        onConfirm: async () => {
          const updates: any = {};
          for (const key of keys) {
            const value = DEFAULT_SETTINGS[key];
            updates[key] = value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
          }
          await this.plugin.applyPluginSettingsSnapshot(updates);
          new Notice(`${title} settings reset.`);
          this.display();
        }
      }).open();
    });
  }

  renderSettingsSectionHeading(containerEl, title) {
    new Setting(containerEl)
      .setName(title)
      .setHeading()
      .setClass("noesis-flow-settings-group-heading");
  }

  renderSettingsSearch(containerEl) {
    const wrapper = containerEl.createDiv({ cls: "noesis-flow-settings-search" });
    const input = wrapper.createEl("input", {
      type: "search",
      value: this.settingsSearchQuery,
      placeholder: "Search Noesis Flow settings",
      attr: { "aria-label": "Search Noesis Flow settings" }
    });
    input.addClass("noesis-flow-settings-text-input");
    input.addEventListener("input", () => {
      this.settingsSearchQuery = input.value.trim();
      this.applySettingsSearch();
    });
  }

  applySettingsSearch() {
    if (!this.containerEl) return;
    const query = this.settingsSearchQuery.trim().toLowerCase();
    const sections = Array.from(this.containerEl.querySelectorAll<HTMLDetailsElement>("details.noesis-flow-settings-section"));
    const headings = Array.from(this.containerEl.querySelectorAll(".noesis-flow-settings-group-heading"));

    for (const section of sections) {
      const settingItems = Array.from(section.querySelectorAll<HTMLElement>(".setting-item"));
      let hasMatchingControl = false;
      for (const item of settingItems) {
        const name = String(item.querySelector(".setting-item-name")?.textContent || "").trim().toLowerCase();
        const discoveryOnly = item.classList.contains("noesis-flow-settings-discovery-only");
        const matches = (!query && !discoveryOnly) || (!!query && item.textContent.toLowerCase().includes(query));
        const exactMatch = !!query && name === query;
        item.classList.toggle("noesis-flow-settings-search-hidden", !matches);
        item.classList.toggle("noesis-flow-settings-search-exact", exactMatch);
        hasMatchingControl ||= matches;
      }
      const summaryText = String(section.querySelector(":scope > summary")?.textContent || "").toLowerCase();
      const matches = !query || summaryText.includes(query) || hasMatchingControl;
      section.classList.toggle("noesis-flow-settings-search-hidden", !matches);
      if (query && matches) section.open = true;
      if (!query) {
        const key = section.dataset.noesisFlowSectionKey;
        section.open = !!key && this.openSettingsSections.has(key);
      }
    }

    for (const heading of headings) {
      const nextSections = [];
      let cursor = heading.nextElementSibling;
      while (cursor && !cursor.matches(".noesis-flow-settings-group-heading, hr.noesis-flow-settings-divider")) {
        if (cursor.matches && cursor.matches("details.noesis-flow-settings-section")) nextSections.push(cursor);
        cursor = cursor.nextElementSibling;
      }
      const hasVisibleSection = nextSections.some((section) => !section.classList.contains("noesis-flow-settings-search-hidden"));
      heading.classList.toggle("noesis-flow-settings-search-hidden", !!query && !hasVisibleSection && !heading.textContent.toLowerCase().includes(query));
    }
  }

  display() {
    const { containerEl } = this;
    this.captureOpenSettingsSections();
    containerEl.empty();
    containerEl.addClass("noesis-flow-settings");

    containerEl.createEl("p", {
      text: "Configure your Markdown task workflow and optional planning tools."
    });
    this.renderSettingsSearch(containerEl);
    this.renderModuleOnboarding(containerEl);

    this.renderSettingsSectionHeading(containerEl, "Workflow");
    this.renderDateParserSettings(containerEl);
    this.renderDailyBriefAddons(containerEl);
    this.renderCalendarAddons(containerEl);
    this.renderTaskAddons(containerEl);
    this.renderSettingsSectionHeading(containerEl, "Planning tools");
    this.renderTaskListSettings(containerEl);
    this.renderPlanningSettings(containerEl);
    this.renderKanbanAddons(containerEl);
    this.renderTimelineAddons(containerEl);
    this.renderTimerAddons(containerEl);
    this.applySettingsSearch();
  }

  renderDisabledFeatureDiscovery(containerEl, feature: string, parent: string, onEnable: () => Promise<void>) {
    const setting = new Setting(containerEl)
      .setName(`${feature} requires ${parent}`)
      .setDesc(`Enable ${parent} to configure ${feature}.`);
    setting.settingEl.addClass("noesis-flow-settings-discovery-only");
    setting.addButton((button) => {
      button.setButtonText(`Enable ${parent}`);
      button.setCta();
      button.onClick(async () => {
        await onEnable();
        this.display();
      });
    });
  }

  async countTasksWithDateMarker(style: "tag" | "double-hash") {
    const markerSettings = { ...this.plugin.settings, dateMarkerStyle: style };
    let count = 0;
    for (const path of this.plugin.getTaskSourcePaths()) {
      const file = this.app.vault.getFileByPath(path);
      if (!file) continue;
      try {
        const index = parseCalendarTaskIndex(await this.app.vault.read(file), markerSettings, path);
        for (const tasks of index.tasksByDate.values()) count += tasks.length;
        for (const tasks of index.completedTasksByDate.values()) count += tasks.length;
      } catch (error) {
        console.warn(`Noesis Flow: unable to inspect task markers in ${path}`, error);
      }
    }
    return count;
  }

  renderModuleOnboarding(containerEl) {
    const onboarding = this.createSettingsDetails(containerEl, "Quick setup", "Set up the core task workflow, then enable only the extras you need.");
    const inboxPath = this.plugin.settings.taskInboxNote || this.plugin.settings.calendarTaskTargetNote;
    if (!inboxPath) {
      onboarding.open = true;
    }
    const taskNote = new Setting(onboarding)
      .setName("Task note")
      .setDesc(inboxPath
        ? `New tasks are stored in ${inboxPath}.`
        : "Create a task note or choose the Markdown note where Noesis Flow should store new tasks.");
    taskNote.addButton((button) => {
      button.setButtonText("Use active note");
      button.setCta();
      button.onClick(async () => {
        if (await this.plugin.useActiveNoteAsCalendarTaskTarget()) this.display();
      });
    });
    taskNote.addButton((button) => {
      button.setButtonText("Choose note");
      button.onClick(() => new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose task note", async (file) => {
        await this.plugin.setTaskInboxNote(file.path);
        this.display();
      }).open());
    });
    if (!inboxPath) {
      taskNote.addButton((button) => {
        button.setButtonText("Create task note");
        button.onClick(async () => {
          if (await this.plugin.createTaskInbox()) this.display();
        });
      });
    }
    const coreWorkflowEnabled = this.plugin.settings.tasksAddonEnabled
      && this.plugin.settings.calendarTaskCaptureEnabled
      && this.plugin.settings.dailyBriefAddonEnabled
      && this.plugin.settings.taskListAddonEnabled;
    new Setting(onboarding)
      .setName("Core task workflow")
      .setDesc("Use task capture, Dashboard, and Task List as one focused workflow.")
      .addToggle((toggle) => {
        toggle.setValue(coreWorkflowEnabled);
        toggle.onChange(async (enabled) => {
          await this.plugin.applyPluginSettingsSnapshot(enabled
            ? {
                tasksAddonEnabled: true,
                calendarTaskCaptureEnabled: true,
                dailyBriefAddonEnabled: true,
                taskListAddonEnabled: true
              }
            : {
                tasksAddonEnabled: false,
                calendarTaskCaptureEnabled: false,
                dailyBriefAddonEnabled: false,
                taskListAddonEnabled: false
              });
          this.display();
        });
      });
    const modules = [
      {
        name: "Calendar", desc: "Browse dates and calendar markers.", enabled: () => this.plugin.settings.calendarAddonEnabled,
        enableUpdates: { calendarAddonEnabled: true }, disableUpdates: { calendarAddonEnabled: false }
      },
      {
        name: "Tasks", desc: "Capture, parse, and manage Markdown tasks.", enabled: () => this.plugin.settings.tasksAddonEnabled,
        enableUpdates: { tasksAddonEnabled: true }, disableUpdates: { tasksAddonEnabled: false }
      },
      {
        name: "Kanban", desc: "Plan tasks on Project, Date, and Priority boards.", enabled: () => this.plugin.settings.tasksAddonEnabled && this.plugin.settings.kanbanTasksAddonEnabled,
        enableUpdates: { tasksAddonEnabled: true, kanbanTasksAddonEnabled: true }, disableUpdates: { kanbanTasksAddonEnabled: false }
      },
      {
        name: "Monthly Planner", desc: "Plan tasks in a monthly drag-to-reschedule calendar.", enabled: () => this.plugin.settings.tasksAddonEnabled && this.plugin.settings.planningAddonEnabled,
        enableUpdates: { tasksAddonEnabled: true, planningAddonEnabled: true }, disableUpdates: { planningAddonEnabled: false }
      },
      {
        name: "Dashboard", desc: "Open the task and calendar overview.", enabled: () => this.plugin.settings.dailyBriefAddonEnabled,
        enableUpdates: { dailyBriefAddonEnabled: true }, disableUpdates: { dailyBriefAddonEnabled: false }
      },
      {
        name: "Timeline", desc: "Track upcoming holidays and milestones.", enabled: () => this.plugin.settings.calendarAddonEnabled && this.plugin.settings.timelineAddonEnabled,
        enableUpdates: { calendarAddonEnabled: true, timelineAddonEnabled: true }, disableUpdates: { timelineAddonEnabled: false }
      },
      {
        name: "Pomodoro Timer", desc: "Run focus and break cycles.", enabled: () => this.plugin.settings.timerAddonEnabled,
        enableUpdates: { timerAddonEnabled: true }, disableUpdates: { timerAddonEnabled: false }
      }
    ];
    for (const module of modules) {
      const enabled = module.enabled();
      const setting = new Setting(onboarding)
        .setName(module.name)
        .setDesc(module.desc);
      setting.addToggle((toggle) => {
        toggle.setValue(enabled);
        toggle.onChange(async (nextEnabled) => {
          await this.plugin.applyPluginSettingsSnapshot(nextEnabled ? module.enableUpdates : module.disableUpdates);
          this.display();
        });
      });
    }
  }

  renderDateParserSettings(containerEl) {
    const parserGroup = this.createSettingsDetails(
      containerEl,
      "Date Parser",
      "Shared date marker behavior for tasks, holidays, and milestones/events."
    );

    new Setting(parserGroup)
      .setName("Date marker")
      .setDesc(`Reads only the selected marker style. Changing it does not migrate existing Markdown notes.`)
      .addDropdown((dropdown) => {
        dropdown.addOption("tag", "#YYYY-MM-DD");
        dropdown.addOption("double-hash", "##YYYY-MM-DD");
        const currentValue = this.plugin.settings.dateMarkerStyle === "double-hash" ? "double-hash" : "tag";
        dropdown.setValue(currentValue);
        dropdown.onChange(async (value) => {
          const nextValue = value === "double-hash" ? "double-hash" : "tag";
          if (nextValue === currentValue) return;
          dropdown.setValue(currentValue);
          const [currentCount, nextCount] = await Promise.all([
            this.countTasksWithDateMarker(currentValue),
            this.countTasksWithDateMarker(nextValue)
          ]);
          const currentLabel = getDateMarkerLabel({ ...this.plugin.settings, dateMarkerStyle: currentValue });
          const nextLabel = getDateMarkerLabel({ ...this.plugin.settings, dateMarkerStyle: nextValue });
          new NoesisFlowConfirmModal(this.app, {
            title: "Change date marker",
            message: `Noesis Flow found ${currentCount} dated task${currentCount === 1 ? "" : "s"} using ${currentLabel} and ${nextCount} using ${nextLabel} in your configured task notes. Existing Markdown will not be migrated. Tasks using ${currentLabel} will no longer be recognized until you switch back or update those task lines.`,
            confirmLabel: "Use new marker",
            onConfirm: async () => {
              this.plugin.settings.dateMarkerStyle = nextValue;
              await this.plugin.saveSettings();
              await this.plugin.refreshCalendarTaskCounts(true);
              await this.plugin.refreshHolidayCalendar(true);
              await this.plugin.refreshTimelineEntries(true);
              this.display();
            }
          }).open();
        });
      });
  }

  renderDailyBriefAddons(containerEl) {
    const briefGroup = this.createSettingsDetails(
      containerEl,
      "Dashboard",
      "A main-tab command center for tasks, holidays, milestones, and timer status."
    );

    new Setting(briefGroup)
      .setName("Dashboard")
      .setDesc("Adds a dashboard tab and ribbon action.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.dailyBriefAddonEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.dailyBriefAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateDailyBriefAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Open");
        button.setCta();
        button.onClick(() => this.plugin.openDailyBriefView());
      });

    if (!this.plugin.settings.dailyBriefAddonEnabled) return;

    new Setting(briefGroup)
      .setName("Default task filter")
      .setDesc("Initial task scope for the Dashboard task section.")
      .addDropdown((dropdown) => {
        for (const option of DATE_TASK_FILTER_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown.setValue(this.plugin.settings.dailyBriefTaskFilter || "today");
        dropdown.onChange(async (value) => {
          this.plugin.settings.dailyBriefTaskFilter = normalizeDateTaskFilter(value);
          await this.plugin.saveSettings();
          this.plugin.refreshDailyBriefViews();
        });
      });

    const briefSections = [
      {
        key: "dailyBriefShowTodayTasks",
        name: "Today tasks",
        desc: "Shows open tasks dated today."
      },
      {
        key: "dailyBriefShowOverdueTasks",
        name: "Deadline-overdue tasks",
        desc: "Shows active tasks whose Date is before today."
      },
      {
        key: "dailyBriefShowNextHoliday",
        name: "Next holiday",
        desc: "Shows the next configured holiday."
      },
      {
        key: "dailyBriefShowWeekend",
        name: "Weekend countdown",
        desc: "Shows days until the next configured weekend day."
      },
      {
        key: "dailyBriefShowTimer",
        name: "Pomodoro Timer status",
        desc: "Shows the current Pomodoro Timer or focus session state."
      }
    ];

    for (const section of briefSections) {
      new Setting(briefGroup)
        .setName(section.name)
        .setDesc(section.desc)
        .addToggle((toggle) => {
          toggle.setValue(!!this.plugin.settings[section.key]);
          toggle.onChange(async (value) => {
            this.plugin.settings[section.key] = value;
            await this.plugin.saveSettings();
            await this.plugin.updateDailyBriefAddonState();
          });
        });
    }
  }



  renderCalendarAddons(containerEl) {
    containerEl = this.createSettingsDetails(
      containerEl,
      "Calendar",
      "A quiet date panel with navigation and optional markers."
    );

    new Setting(containerEl)
      .setName("Calendar panel")
      .setDesc("Enables the ribbon action, command palette entry, and sidebar calendar view.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarAddonEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateCalendarAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Open");
        button.setCta();
        button.onClick(() => this.plugin.openCalendarView());
      });

    if (!this.plugin.settings.calendarAddonEnabled) {
      this.renderDisabledFeatureDiscovery(containerEl, "Holidays", "Calendar", async () => {
        await this.plugin.applyPluginSettingsSnapshot({ calendarAddonEnabled: true });
      });
      this.renderDisabledFeatureDiscovery(containerEl, "Milestones / Events", "Calendar", async () => {
        await this.plugin.applyPluginSettingsSnapshot({ calendarAddonEnabled: true });
      });
      return;
    }

    const displayGroup = this.createSettingsDetails(containerEl, "Calendar layout");
    new Setting(displayGroup)
      .setName("Calendar style")
      .setDesc("Choose between the classic header and a centered month with weekday band.")
      .addDropdown((dropdown) => {
        dropdown.addOption("classic", "Classic");
        dropdown.addOption("centered-weekdays", "Centered");
        dropdown.setValue(this.plugin.settings.calendarLayoutStyle || "classic");
        dropdown.onChange(async (value) => {
          this.plugin.settings.calendarLayoutStyle = value === "centered-weekdays" ? "centered-weekdays" : "classic";
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        });
      });

    new Setting(displayGroup)
      .setName("Week origin")
      .setDesc("Sets the first day column and week reference calculation.")
      .addDropdown((dropdown) => {
        dropdown.addOption("monday", "Monday");
        dropdown.addOption("sunday", "Sunday");
        dropdown.addOption("saturday", "Saturday");
        dropdown.addOption("locale", "Locale default");
        dropdown.setValue(this.plugin.settings.calendarWeekStart || "monday");
        dropdown.onChange(async (value) => {
          this.plugin.settings.calendarWeekStart = ["monday", "sunday", "saturday", "locale"].includes(value)
            ? value as NoesisFlowSettings["calendarWeekStart"]
            : "monday";
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        });
      });

    new Setting(displayGroup)
      .setName("Week reference rail")
      .setDesc("Adds a slim week reference beside the date grid.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarShowWeekNumbers);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarShowWeekNumbers = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
          this.display();
        });
      });

    if (this.plugin.settings.calendarShowWeekNumbers) {
      new Setting(displayGroup)
        .setName("Place rail on right")
        .setDesc("Places the week reference after the date columns.")
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.calendarShowWeekNumbersRight);
          toggle.onChange(async (value) => {
            this.plugin.settings.calendarShowWeekNumbersRight = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCalendarViews();
          });
        });
    }

    new Setting(displayGroup)
      .setName("Quarter rail")
      .setDesc("Adds the segmented quarter jump row above the weekday labels.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarShowQuarters);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarShowQuarters = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        });
      });

    new Setting(displayGroup)
      .setName("Today control")
      .setDesc("Adds a compact return-to-today action in the calendar header.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarShowTodayButton);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarShowTodayButton = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
          this.display();
        });
      });


    new Setting(displayGroup)
      .setName("Weekend column tint")
      .setDesc("Applies a restrained accent tint to weekend columns.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarShadeWeekendColumns);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarShadeWeekendColumns = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        });
      });

    if (this.plugin.settings.calendarShowTodayButton) {
      new Setting(displayGroup)
        .setName("Keep Today in compact panes")
        .setDesc("Keeps the Today action visible when the sidebar is narrow.")
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.calendarShowTodayButtonOnMobile);
          toggle.onChange(async (value) => {
            this.plugin.settings.calendarShowTodayButtonOnMobile = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCalendarViews();
          });
        });
    }

    const appearanceGroup = this.createSettingsDetails(
      containerEl,
      "Calendar appearance",
      "Fine-tune Calendar typography, date-cell geometry, and weekend color."
    );
    const addAppearanceSlider = (name, desc, key, min, max, step, fallback) => {
      new Setting(appearanceGroup)
        .setName(name)
        .setDesc(desc)
        .addSlider((slider) => {
          slider
            .setLimits(min, max, step)
            .setValue(clampNumber(this.plugin.settings[key], min, max, fallback))
            .onChange(async (value) => {
              this.plugin.settings[key] = value;
              await this.plugin.saveSettings();
              this.plugin.refreshCalendarViews();
            });
        });
    };
    addAppearanceSlider("Header date scale", "Adjusts the month and year label size.", "calendarHeaderDateScale", 0.95, 1.5, 0.05, 1);
    addAppearanceSlider("Date number scale", "Adjusts the calendar day-number size.", "calendarDateNumberScale", 0.7, 1.05, 0.05, 0.8);
    addAppearanceSlider("Selected date radius", "Adjusts rounding for selected and active date controls.", "calendarSelectedDateRadius", 0, 12, 1, 6);
    addAppearanceSlider("Quarter rail spacing", "Adjusts space around the optional quarter rail.", "calendarQuarterRailSpacing", 0, 18, 1, 4);
    addAppearanceSlider("Overflow date opacity", "Adjusts the visibility of dates outside the active month.", "calendarOverflowDateOpacity", 0.05, 0.7, 0.05, 0.25);
    addAppearanceSlider("Weekend tint strength", "Adjusts the tint applied to shaded weekend columns.", "calendarWeekendTintStrength", 0, 12, 1, 6);
    new Setting(appearanceGroup)
      .setName("Weekend tint tone")
      .setDesc("Choose the color used for shaded weekend columns.")
      .addDropdown((dropdown) => {
        dropdown.addOption("accent", "Accent");
        dropdown.addOption("red", "Red");
        dropdown.setValue(this.plugin.settings.calendarWeekendTintTone === "red" ? "red" : "accent");
        dropdown.onChange(async (value) => {
          this.plugin.settings.calendarWeekendTintTone = value === "red" ? "red" : "accent";
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        });
      });

    this.renderHolidayCalendar(containerEl);
    this.renderCalendarEvents(containerEl);
  }

  renderTaskAddons(containerEl) {
    const taskGroup = this.createSettingsDetails(
      containerEl,
      "Tasks",
      "Calendar task capture, workload markers, and priority rules."
    );

    new Setting(taskGroup)
      .setName("Tasks add-on")
      .setDesc("Enables task capture, task parsing, calendar task indicators, Task List, Monthly Planner, Kanban, and Recurring Tasks.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.tasksAddonEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.tasksAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateTaskListAddonState();
          await this.plugin.updatePlanningAddonState();
          await this.plugin.updateKanbanAddonState();
          await this.plugin.updateRecurringTaskManagerState();
          await this.plugin.updateDailyBriefAddonState();
          await this.plugin.refreshCalendarTaskCounts(true);
          this.display();
        });
      });

    if (!this.plugin.settings.tasksAddonEnabled) {
      for (const feature of ["Recurring tasks", "Task indicators", "Task note", "Additional task sources", "Projects"]) {
        this.renderDisabledFeatureDiscovery(taskGroup, feature, "Tasks", async () => {
          await this.plugin.applyPluginSettingsSnapshot({ tasksAddonEnabled: true });
        });
      }
      return;
    }

    this.renderTaskCaptureSettings(taskGroup);
    this.renderTaskIndicatorSettings(taskGroup);
    this.renderTaskPanelSettings(taskGroup);
    this.renderTaskNoteSettings(taskGroup);
    this.renderTaskSourceSettings(taskGroup);
    this.renderProjectSettings(taskGroup);
  }

  renderTaskCaptureSettings(taskGroup: HTMLElement) {
    new Setting(taskGroup)
      .setName("Date task capture")
      .setDesc("Turns calendar date clicks into a guided task capture flow.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarTaskCaptureEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarTaskCaptureEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
          this.display();
        });
      });

    new Setting(taskGroup)
      .setName("Recurring task capture")
      .setDesc("Adds a repeat step to calendar-created tasks. Noesis Flow writes only a bounded set of dated task lines and skips duplicates.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.recurringTasksEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.recurringTasksEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateRecurringTaskManagerState();
          this.display();
        });
      });

    if (this.plugin.settings.recurringTasksEnabled) {
      new Setting(taskGroup)
        .setName("Recurring-task manager")
        .setDesc("Tracks new repeating tasks in one place, where a series can be paused or resumed.")
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.recurringTaskManagerEnabled !== false);
          toggle.onChange(async (value) => {
            this.plugin.settings.recurringTaskManagerEnabled = value;
            await this.plugin.saveSettings();
            await this.plugin.updateRecurringTaskManagerState();
            this.display();
          });
        })
        .addButton((button) => {
          button.setButtonText("Open");
          button.onClick(() => this.plugin.openRecurringTaskManager());
        });

      new Setting(taskGroup)
        .setName("Recurring occurrence limit")
        .setDesc("Number of future dates kept ready for an ongoing recurring task.")
        .addSlider((slider) => {
          slider
            .setLimits(2, 26, 1)
            .setValue(clampNumber(this.plugin.settings.recurringTaskOccurrenceLimit, 2, 26, 6))
            .onChange(async (value) => {
              this.plugin.settings.recurringTaskOccurrenceLimit = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(taskGroup)
        .setName("Maintain upcoming occurrences")
        .setDesc("On startup, extend active open-ended series so this many future dates remain planned. Explicit end dates and counts are respected.")
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.recurringTaskAutoExtend !== false);
          toggle.onChange(async (value) => {
            this.plugin.settings.recurringTaskAutoExtend = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(taskGroup)
        .setName("Separate recurring note")
        .setDesc("Routes recurring calendar-created tasks into a dedicated note while one-off tasks stay in the task note.")
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.recurringTasksUseSeparateNote);
          toggle.onChange(async (value) => {
            this.plugin.settings.recurringTasksUseSeparateNote = value;
            await this.plugin.saveSettings();
            await this.plugin.refreshCalendarTaskCounts(true);
            this.display();
          });
        });

      if (this.plugin.settings.recurringTasksUseSeparateNote) {
        new Setting(taskGroup)
          .setName("Recurring task note")
          .setDesc("Vault markdown note that receives recurring calendar-created tasks.")
          .addText((text) => {
            const applyRecurringTaskNote = async (value) => {
              this.plugin.settings.recurringTaskTargetNote = value.trim();
              await this.plugin.saveSettings();
              await this.plugin.refreshCalendarTaskCounts(true);
            };
            text.setPlaceholder("Recurring Tasks.md");
            text.setValue(this.plugin.settings.recurringTaskTargetNote || "");
            text.onChange(applyRecurringTaskNote);
          })
          .addButton((button) => {
            button.setButtonText("Choose");
            button.onClick(() => {
              new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose recurring task note", async (file) => {
                this.plugin.settings.recurringTaskTargetNote = file.path;
                await this.plugin.saveSettings();
                await this.plugin.refreshCalendarTaskCounts(true);
                this.display();
              }).open();
            });
          })
          .addButton((button) => {
            button.setButtonText("Use active note");
            button.onClick(async () => {
              const changed = await this.plugin.useActiveNoteAsRecurringTaskTarget();
              if (changed) this.display();
            });
          });
      }
    }
  }

  renderTaskIndicatorSettings(taskGroup: HTMLElement) {
    new Setting(taskGroup)
      .setName("Task indicators")
      .setDesc("Shows subtle dots and workload color on dates with date-marked tasks.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarShowTaskCounts);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarShowTaskCounts = value;
          await this.plugin.saveSettings();
          await this.plugin.refreshCalendarTaskCounts(true);
          this.display();
        });
      });

    if (this.plugin.settings.calendarShowTaskCounts) {
      new Setting(taskGroup)
        .setName("Past-scheduled task marker")
        .setDesc("Marks past dates red when they still have open tasks.")
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.calendarMarkOverdueTasks);
          toggle.onChange(async (value) => {
            this.plugin.settings.calendarMarkOverdueTasks = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCalendarViews();
          });
        });

      new Setting(taskGroup)
        .setName("Workload threshold")
        .setDesc("Total date-marked tasks required before a date receives workload color.")
        .addSlider((slider) => {
          slider
            .setLimits(1, 20, 1)
            .setValue(clampNumber(this.plugin.settings.calendarTaskWorkloadThreshold, 1, 20, 5))
            .onChange(async (value) => {
              this.plugin.settings.calendarTaskWorkloadThreshold = value;
              await this.plugin.saveSettings();
              this.plugin.refreshCalendarViews();
            });
        });

      new Setting(taskGroup)
        .setName("Orange priority threshold")
        .setDesc("High or critical tasks needed at workload threshold before the date turns orange.")
        .addSlider((slider) => {
          slider
            .setLimits(1, 10, 1)
            .setValue(clampNumber(this.plugin.settings.calendarTaskOrangePriorityThreshold, 1, 10, 1))
            .onChange(async (value) => {
              this.plugin.settings.calendarTaskOrangePriorityThreshold = value;
              await this.plugin.saveSettings();
              this.plugin.refreshCalendarViews();
            });
        });

      new Setting(taskGroup)
        .setName("Red priority threshold")
        .setDesc("High or critical tasks needed at workload threshold before the date turns red.")
        .addSlider((slider) => {
          slider
            .setLimits(1, 10, 1)
            .setValue(clampNumber(this.plugin.settings.calendarTaskRedPriorityThreshold, 1, 10, 2))
            .onChange(async (value) => {
              this.plugin.settings.calendarTaskRedPriorityThreshold = value;
              await this.plugin.saveSettings();
              this.plugin.refreshCalendarViews();
            });
        });
    }

    const priorityDetails = this.createSettingsDetails(
      taskGroup,
      "Priority markers",
      "Recognized task checkbox priorities."
    );
    for (const priority of CALENDAR_TASK_PRIORITIES) {
      priorityDetails.createEl("div", {
        cls: "noesis-flow-priority-row",
        text: `${priority.marker === " " ? "[ ]" : `[${priority.marker}]`} ${priority.label} - ${priority.description}`
      });
    }
    priorityDetails.createEl("div", {
      cls: "noesis-flow-priority-row muted",
      text: "[x] Completed tasks are ignored by indicators."
    });
  }

  renderTaskPanelSettings(taskGroup: HTMLElement) {
    const priorityColors = [
      ["Critical task color", "calendarTaskCriticalColor", "#ea4458"],
      ["High task color", "calendarTaskHighColor", "#fd884b"],
      ["Medium task color", "calendarTaskMediumColor", "#f1c24d"],
      ["Low task color", "calendarTaskLowColor", "#5cdf95"]
    ];
    for (const [name, key, fallback] of priorityColors) {
      new Setting(taskGroup)
        .setName(name)
        .setDesc("Used by calendar task indicators and the task popover.")
        .addColorPicker((color) => {
          color.setValue(this.plugin.settings[key] || fallback);
          color.onChange(async (value) => {
            this.plugin.settings[key] = sanitizeCssText(value, fallback);
            await this.plugin.saveSettings();
            this.plugin.refreshCalendarViews();
          });
        });
    }
  }

  renderTaskListSettings(containerEl: HTMLElement) {
    const taskListGroup = this.createSettingsDetails(
      containerEl,
      "Task List",
      "Spreadsheet-style task editing, filtering, and optional history."
    );
    new Setting(taskListGroup)
      .setName("Enable Task List")
      .setDesc("Adds a spreadsheet-style task table with direct editing for task, date, project, and priority.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.taskListAddonEnabled !== false);
        toggle.onChange(async (value) => {
          this.plugin.settings.taskListAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateTaskListAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        if (!this.plugin.settings.tasksAddonEnabled) {
          button.setButtonText("Enable Tasks");
          button.setCta();
          button.onClick(async () => {
            await this.plugin.applyPluginSettingsSnapshot({ tasksAddonEnabled: true, taskListAddonEnabled: true });
            this.display();
          });
        } else if (!this.plugin.settings.taskListAddonEnabled) {
          button.setButtonText("Enable Task List");
          button.setCta();
          button.onClick(async () => {
            await this.plugin.applyPluginSettingsSnapshot({ taskListAddonEnabled: true });
            this.display();
          });
        } else {
          button.setButtonText("Open");
          button.onClick(() => this.plugin.openTaskListView());
        }
      });

    if (!this.plugin.settings.tasksAddonEnabled) {
      taskListGroup.createEl("p", { cls: "setting-item-description", text: "Tasks is required. Use the Enable Tasks action above to turn on both features." });
    }

    new Setting(taskListGroup)
      .setName("Task History")
      .setDesc("Optional audit log for task edits, completion, deletion, and undo. It is off by default and is not required for any task feature.")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.settings.taskAuditEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.taskAuditEnabled = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (!this.plugin.settings.taskAuditEnabled) {
      taskListGroup.createEl("p", {
        cls: "setting-item-description",
        text: "No history note will be created or written until you enable Task History and choose an existing note."
      });
      return;
    }

    new Setting(taskListGroup)
      .setName("History note")
      .setDesc("Existing Markdown note where history entries are appended. Noesis Flow will not create this note for you.")
      .addText((text) => {
        text.setPlaceholder("Choose an existing note");
        text.setValue(this.plugin.settings.taskAuditNote || "");
        text.onChange(async (value) => {
          this.plugin.settings.taskAuditNote = value.trim();
          await this.plugin.saveSettings();
        });
      })
      .addButton((button) => {
        button.setButtonText("Choose");
        button.onClick(() => {
          new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose Task History note", async (file) => {
            this.plugin.settings.taskAuditNote = file.path;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("Use active note");
        button.onClick(async () => {
          const file = this.plugin.getActiveMarkdownFile();
          if (!file) {
            new Notice("Open an existing Markdown note first.");
            return;
          }
          this.plugin.settings.taskAuditNote = file.path;
          await this.plugin.saveSettings();
          this.display();
        });
      });
  }

  renderPlanningSettings(containerEl: HTMLElement) {
    const plannerGroup = this.createSettingsDetails(
      containerEl,
      "Monthly Planner",
      "Monthly task planning with drag-to-reschedule."
    );
    new Setting(plannerGroup)
      .setName("Enable Monthly Planner")
      .setDesc("Adds a monthly drag-to-reschedule calendar for your tasks.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.planningAddonEnabled !== false);
        toggle.onChange(async (value) => {
          this.plugin.settings.planningAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updatePlanningAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        if (!this.plugin.settings.tasksAddonEnabled) {
          button.setButtonText("Enable Tasks");
          button.setCta();
          button.onClick(async () => {
            await this.plugin.applyPluginSettingsSnapshot({ tasksAddonEnabled: true, planningAddonEnabled: true });
            this.display();
          });
        } else if (!this.plugin.settings.planningAddonEnabled) {
          button.setButtonText("Enable Monthly Planner");
          button.setCta();
          button.onClick(async () => {
            await this.plugin.applyPluginSettingsSnapshot({ planningAddonEnabled: true });
            this.display();
          });
        } else {
          button.setButtonText("Open");
          button.onClick(() => this.plugin.openPlanningView());
        }
      });

    if (!this.plugin.settings.tasksAddonEnabled) {
      plannerGroup.createEl("p", { cls: "setting-item-description", text: "Tasks is required. Use the Enable Tasks action above to turn on both features." });
    }
  }

  renderKanbanAddons(containerEl) {
    const kanbanGroup = this.createSettingsDetails(
      containerEl,
      "Kanban",
      "Board layout, filters, and saved views."
    );
    new Setting(kanbanGroup)
      .setName("Kanban board")
      .setDesc("Adds a main-tab task board grouped by Project, Date, or Priority.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.kanbanTasksAddonEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.kanbanTasksAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateKanbanAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Open");
        button.onClick(() => this.plugin.openKanbanView());
      });

    if (!this.plugin.settings.kanbanTasksAddonEnabled || !this.plugin.settings.tasksAddonEnabled) {
      kanbanGroup.createEl("p", { cls: "setting-item-description", text: "Enable Tasks and Kanban to configure the board." });
      return;
    }

    new Setting(kanbanGroup)
      .setName("Hide weekends in Scheduled view")
      .setDesc("Shows only Monday through Friday when Kanban is grouped by Date.")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.settings.kanbanDateHideWeekends);
        toggle.onChange(async (value) => {
          this.plugin.settings.kanbanDateHideWeekends = value;
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(kanbanGroup)
      .setName("Default Kanban filter")
      .setDesc("Initial Date scope outside the weekly Date view. All also includes unscheduled tasks.")
      .addDropdown((dropdown) => {
        for (const option of DATE_TASK_FILTER_OPTIONS) dropdown.addOption(option.value, option.label);
        dropdown.setValue(this.plugin.settings.kanbanTaskFilter || "all");
        dropdown.onChange(async (value) => {
          this.plugin.settings.kanbanTaskFilter = normalizeDateTaskFilter(value);
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(kanbanGroup)
      .setName("Default Kanban view")
      .setDesc("Choose whether Kanban columns represent Projects, Dates, or Priorities.")
      .addDropdown((dropdown) => {
        for (const option of KANBAN_TASK_VIEW_OPTIONS) dropdown.addOption(option.value, option.label);
        dropdown.setValue(this.plugin.settings.kanbanTaskView || "sections");
        dropdown.onChange(async (value) => {
          this.plugin.settings.kanbanTaskView = normalizeKanbanTaskView(value);
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(kanbanGroup)
      .setName("Card order")
      .setDesc("Priority keeps a consistent priority-first order. Custom lets you drag cards to reorder them within a Project lane.")
      .addDropdown((dropdown) => {
        dropdown.addOption("priority", "Priority");
        dropdown.addOption("custom", "Custom (Projects only)");
        dropdown.setValue(this.plugin.settings.kanbanCardOrder || "priority");
        dropdown.onChange(async (value) => {
          this.plugin.settings.kanbanCardOrder = value === "custom" ? "custom" : "priority";
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    const cardStyleGroup = this.createSettingsDetails(
      kanbanGroup,
      "Kanban card style",
      "Optional priority color, accent, divider, and density treatments."
    );
    new Setting(cardStyleGroup)
      .setName("Compact cards")
      .setDesc("Tightens card spacing for denser Kanban boards without hiding task actions.")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.settings.kanbanCompactCards);
        toggle.onChange(async (value) => {
          this.plugin.settings.kanbanCompactCards = value;
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(cardStyleGroup)
      .setName("Card corner radius")
      .setDesc("Controls how rounded Kanban task cards are. Set to 0 for square corners.")
      .addSlider((slider) => {
        slider
          .setLimits(0, 12, 1)
          .setValue(this.plugin.settings.kanbanCardCornerRadius);
        slider.onChange(async (value) => {
          this.plugin.settings.kanbanCardCornerRadius = value;
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(cardStyleGroup)
      .setName("Priority borders")
      .setDesc("Tints each card's thin border with its priority color.")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.settings.kanbanCardPriorityBorders);
        toggle.onChange(async (value) => {
          this.plugin.settings.kanbanCardPriorityBorders = value;
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(cardStyleGroup)
      .setName("Accent bar")
      .setDesc("Choose where each card's priority accent appears.")
      .addDropdown((dropdown) => {
        dropdown.addOption("left", "Left");
        dropdown.addOption("top", "Top");
        dropdown.setValue(normalizeKanbanCardAccentPosition(this.plugin.settings.kanbanCardAccentPosition));
        dropdown.onChange(async (value) => {
          this.plugin.settings.kanbanCardAccentPosition = normalizeKanbanCardAccentPosition(value);
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(cardStyleGroup)
      .setName("Context placement")
      .setDesc("Place the Project, Date, and Priority context above or below the task.")
      .addDropdown((dropdown) => {
        dropdown.addOption("top", "Top");
        dropdown.addOption("bottom", "Bottom");
        dropdown.setValue(normalizeKanbanCardContextPlacement(this.plugin.settings.kanbanCardContextPlacement));
        dropdown.onChange(async (value) => {
          this.plugin.settings.kanbanCardContextPlacement = normalizeKanbanCardContextPlacement(value);
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(cardStyleGroup)
      .setName("Context alignment")
      .setDesc("Align the Project, Date, and Priority context with the card content or its center.")
      .addDropdown((dropdown) => {
        dropdown.addOption("left", "Left");
        dropdown.addOption("center", "Center");
        dropdown.setValue(normalizeKanbanCardContextAlignment(this.plugin.settings.kanbanCardContextAlignment));
        dropdown.onChange(async (value) => {
          this.plugin.settings.kanbanCardContextAlignment = normalizeKanbanCardContextAlignment(value);
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    new Setting(cardStyleGroup)
      .setName("Context divider")
      .setDesc("Adds a thin priority-colored divider between card context and task name.")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.settings.kanbanCardContextDivider);
        toggle.onChange(async (value) => {
          this.plugin.settings.kanbanCardContextDivider = value;
          await this.plugin.saveSettings();
          this.plugin.refreshKanbanViews();
        });
      });

    this.renderKanbanSavedViews(kanbanGroup);
  }

  renderKanbanSavedViews(containerEl) {
    const savedViews = Array.isArray(this.plugin.settings.kanbanSavedViews) ? this.plugin.settings.kanbanSavedViews : [];
    const savedGroup = this.createSettingsDetails(
      containerEl,
      "Kanban saved views",
      savedViews.length ? `${savedViews.length} saved ${savedViews.length === 1 ? "view" : "views"}.` : "Save a Kanban view to manage it here."
    );
    new Setting(savedGroup)
      .setName("Import / export")
      .setDesc("Export a portable backup or import saved Kanban views. Imported names replace matching existing views.")
      .addButton((button) => {
        button.setButtonText("Export JSON");
        button.onClick(() => downloadText("noesis-flow-kanban-views.json", serializeKanbanSavedViews(savedViews)));
      })
      .addButton((button) => {
        button.setButtonText("Import JSON");
        button.onClick(() => {
          const input = savedGroup.createEl("input");
          input.type = "file";
          input.accept = "application/json,.json";
          input.style.display = "none";
          input.addEventListener("change", asVoidHandler(async () => {
            const file = input.files && input.files[0];
            if (!file) {
              input.remove();
              return;
            }
            try {
              const imported = parseKanbanSavedViewsExport(await file.text());
              const next = savedViews.slice();
              for (const view of imported) {
                const existingIndex = next.findIndex((candidate) => String(candidate && candidate.name || "").toLowerCase() === view.name.toLowerCase());
                if (existingIndex === -1) next.push(view);
                else next[existingIndex] = view;
              }
              this.plugin.settings.kanbanSavedViews = next;
              await this.plugin.saveSettings();
              new Notice(`Imported ${imported.length} Kanban ${imported.length === 1 ? "view" : "views"}.`);
              this.display();
            } catch (error) {
              new Notice(`Import failed: ${error.message || error}`);
            } finally {
              input.remove();
            }
          }));
          input.click();
        });
      });

    if (!savedViews.length) {
      savedGroup.createEl("p", { cls: "setting-item-description", text: "No saved Kanban views yet. Save a view, or import a backup here." });
      return;
    }

    savedViews.forEach((saved, index) => {
      const viewName = saved && saved.name ? saved.name : `View ${index + 1}`;
      const summary = `${(KANBAN_TASK_VIEW_OPTIONS.find((option) => option.value === saved.view) || KANBAN_TASK_VIEW_OPTIONS[0]).label} · ${saved.filter || "all"}`;
      new Setting(savedGroup)
        .setName(viewName)
        .setDesc([saved.description, summary].filter(Boolean).join(" · "))
        .addButton((button) => {
          button.setButtonText("Open");
          button.onClick(async () => {
            await this.plugin.applyKanbanSavedView(saved);
          });
        })
        .addButton((button) => {
          button.setButtonText("Edit");
          button.onClick(() => new NoesisFlowKanbanSavedViewModal(this.app, saved, async (details) => {
            const next = this.plugin.settings.kanbanSavedViews.slice();
            next[index] = Object.assign({}, next[index], details);
            this.plugin.settings.kanbanSavedViews = next;
            await this.plugin.saveSettings();
            this.display();
          }, { title: "Edit saved Kanban view", submitLabel: "Save changes" }).open());
        })
        .addButton((button) => {
          button.setButtonText("Delete");
          button.setDestructive();
          button.onClick(() => new NoesisFlowConfirmModal(this.app, {
            title: "Delete saved Kanban view",
            message: `Delete “${viewName}”?`,
            confirmLabel: "Delete view",
            onConfirm: async () => {
              this.plugin.settings.kanbanSavedViews = this.plugin.settings.kanbanSavedViews.filter((_, savedIndex) => savedIndex !== index);
              await this.plugin.saveSettings();
              this.display();
            }
          }).open());
        });
    });
  }

  renderTaskNoteSettings(taskGroup: HTMLElement) {
    new Setting(taskGroup)
      .setName("Task note")
      .setDesc("Vault markdown note that receives new tasks. Tasks without a project go under its Unassigned heading.")
      .addText((text) => {
        let appliedValue = this.plugin.settings.taskInboxNote || this.plugin.settings.calendarTaskTargetNote || "";
        const applyTaskNote = async () => {
          const value = text.getValue().trim();
          if (value === appliedValue) return;
          if (await this.plugin.setTaskInboxNote(value)) {
            appliedValue = value;
          } else {
            text.setValue(appliedValue);
          }
        };
        text.setPlaceholder("Tasks.md");
        text.setValue(appliedValue);
        text.inputEl.addEventListener("blur", () => void applyTaskNote());
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void applyTaskNote();
          }
        });
      })
      .addButton((button) => {
        button.setButtonText("Choose");
        button.onClick(() => {
          new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose task note", async (file) => {
            await this.plugin.setTaskInboxNote(file.path);
            this.display();
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("Use active note");
        button.onClick(async () => {
          const changed = await this.plugin.useActiveNoteAsCalendarTaskTarget();
          if (changed) this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Create task note");
        button.onClick(async () => {
          if (await this.plugin.createTaskInbox()) this.display();
        });
      });
  }

  renderTaskSourceSettings(taskGroup: HTMLElement) {
    const sources = this.plugin.getTaskSourcePaths();
    const inbox = this.plugin.getCalendarTaskTargetPath();
    const setting = new Setting(taskGroup)
      .setName("Additional task sources")
      .setDesc("Index tasks from other Markdown notes. New captures still go to the task note.");
    setting.addButton((button) => {
      button.setButtonText("Add note");
      button.onClick(() => new NoesisFlowMarkdownNoteChooserModal(this.app, "Add task source", async (file) => {
        if (await this.plugin.addTaskSourceNote(file.path)) this.display();
      }).open());
    });

    const list = taskGroup.createDiv({ cls: "noesis-flow-task-source-list" });
    for (const path of sources) {
      const row = list.createDiv({ cls: "noesis-flow-task-source-row" });
      row.createSpan({ text: path });
      if (path === inbox) {
        row.createSpan({ cls: "noesis-flow-task-source-label", text: "Task note" });
      } else {
        const remove = row.createEl("button", { text: "Remove", attr: { type: "button" } });
        remove.addEventListener("click", asVoidHandler(async () => {
          if (await this.plugin.removeTaskSourceNote(path)) this.display();
        }));
      }
    }
  }

  renderProjectSettings(taskGroup: HTMLElement) {
    const setting = new Setting(taskGroup)
      .setName("Projects")
      .setDesc("Register Markdown ## headings as projects. Existing headings keep working without registration; registration adds stable status and due-date context.");
    setting.addButton((button) => {
      button.setButtonText("Register heading");
      button.setCta();
      button.onClick(() => new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose project note", async (file) => {
        let sections: string[] = [];
        try {
          const content = await this.app.vault.read(file);
          sections = Array.from(new Set([
            ...this.plugin.getProjectSectionsForSource(file.path),
            ...getMarkdownH2Sections(content)
          ]));
        } catch {
          new Notice(`Could not read ${file.path}.`);
          return;
        }
        new NoesisFlowCalendarSectionModal(this.app, sections, async (section) => {
          if (!this.plugin.getTaskSourcePaths().includes(file.path)) await this.plugin.addTaskSourceNote(file.path);
          if (await this.plugin.registerProject(file.path, section)) this.display();
        }, { title: "Register project heading", submitButtonText: "Register" }).open();
      }).open());
    });

    const projects = this.plugin.getProjects();
    if (!projects.length) {
      taskGroup.createDiv({ cls: "setting-item-description", text: "No headings are registered yet. You can keep using plain headings, or register important projects here." });
      return;
    }
    const list = taskGroup.createDiv({ cls: "noesis-flow-task-source-list" });
    for (const project of projects) {
      const row = list.createDiv({ cls: "noesis-flow-task-source-row" });
      row.createSpan({ text: `${project.name} · ${project.sourcePath} / ${project.section}` });
      row.createSpan({ cls: "noesis-flow-task-source-label", text: project.status });
      const toggle = row.createEl("button", { text: project.status === "active" ? "Pause" : "Activate", attr: { type: "button" } });
      toggle.addEventListener("click", asVoidHandler(async () => {
        await this.plugin.updateProject(project.id, { status: project.status === "active" ? "paused" : "active" });
        this.display();
      }));
      const archive = row.createEl("button", { text: project.status === "archived" ? "Restore" : "Archive", attr: { type: "button" } });
      archive.addEventListener("click", asVoidHandler(async () => {
        await this.plugin.updateProject(project.id, { status: project.status === "archived" ? "active" : "archived" });
        this.display();
      }));
      const due = row.createEl("button", { text: project.dueDate ? `Due ${project.dueDate}` : "Set due", attr: { type: "button" } });
      due.addEventListener("click", () => new NoesisFlowTextPromptModal(this.app, "Project due date", "YYYY-MM-DD (leave blank to clear)", project.dueDate || "", async (value) => {
        const next = String(value || "").trim();
        if (next && !moment(next, "YYYY-MM-DD", true).isValid()) {
          new Notice("Use date format YYYY-MM-DD.");
          return;
        }
        await this.plugin.updateProject(project.id, { dueDate: next || undefined });
        this.display();
      }, { submitButtonText: "Save", allowEmpty: true }).open());
      const remove = row.createEl("button", { text: "Remove", attr: { type: "button" } });
      remove.addEventListener("click", () => new NoesisFlowConfirmModal(this.app, {
        title: "Remove project registration",
        message: `Remove ${project.name} from Noesis Flow? Its Markdown heading and task lines will be kept.`,
        confirmLabel: "Remove registration",
        onConfirm: async () => { await this.plugin.removeProject(project.id); this.display(); }
      }).open());
    }
  }

  renderTimelineAddons(containerEl) {
    const timelineGroup = this.createSettingsDetails(
      containerEl,
      "Timeline Widget",
      "Upcoming holidays and milestones/events from Calendar sources."
    );

    new Setting(timelineGroup)
      .setName("Timeline widget")
      .setDesc("Adds a simple upcoming-events tab and ribbon action. It uses Calendar sources.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.timelineAddonEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.timelineAddonEnabled = value;
          if (value && !this.plugin.settings.calendarAddonEnabled) {
            this.plugin.settings.calendarAddonEnabled = true;
            await this.plugin.updateCalendarAddonState();
          }
          await this.plugin.saveSettings();
          await this.plugin.updateTimelineAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Open");
        button.setCta();
        button.onClick(() => this.plugin.openTimelineView());
      });

    if (!this.plugin.settings.timelineAddonEnabled) return;

    new Setting(timelineGroup)
      .setName("Timeline range")
      .setDesc("Number of upcoming days to include from holidays and milestones/events.")
      .addSlider((slider) => {
        slider
          .setLimits(7, 365, 1)
          .setValue(clampNumber(this.plugin.settings.timelineRangeDays, 7, 365, 60))
          .onChange(async (value) => {
            this.plugin.settings.timelineRangeDays = value;
            await this.plugin.saveSettings();
            this.plugin.refreshTimelineViews();
          });
      });

    new Setting(timelineGroup)
      .setName("Include milestones / events")
      .setDesc("Adds entries from the configured milestones/events note to the Timeline widget.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.timelineIncludeEvents !== false);
        toggle.onChange(async (value) => {
          this.plugin.settings.timelineIncludeEvents = value;
          await this.plugin.saveSettings();
          this.plugin.refreshTimelineViews();
          this.plugin.refreshDailyBriefViews();
        });
      });

    new Setting(timelineGroup)
      .setName("Include holidays")
      .setDesc("Adds configured holiday calendar entries to the Timeline widget.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.timelineIncludeHolidays);
        toggle.onChange(async (value) => {
          this.plugin.settings.timelineIncludeHolidays = value;
          await this.plugin.saveSettings();
          this.plugin.refreshTimelineViews();
          this.plugin.refreshDailyBriefViews();
        });
      });
  }

  renderCalendarEvents(containerEl) {
    const eventGroup = this.createSettingsDetails(
      containerEl,
      "Milestones / Events",
      "Marks dated milestones and events from a markdown note."
    );

    new Setting(eventGroup)
      .setName("Milestones / Events dates")
      .setDesc("Marks dated entries from the milestones/events note in Calendar.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.calendarEventsEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.calendarEventsEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.refreshTimelineEntries(true);
          this.plugin.refreshCalendarViews();
          this.display();
        });
      });

    new Setting(eventGroup)
      .setName("Milestones / Events note")
      .setDesc(`Reads lines that contain ${getDateMarkerLabel(this.plugin.settings)} from this note.`)
      .addText((text) => {
        text.setPlaceholder("Milestones.md");
        text.setValue(this.plugin.settings.timelineNote || "");
        text.onChange(async (value) => {
          this.plugin.settings.timelineNote = value.trim();
          await this.plugin.saveSettings();
          await this.plugin.refreshTimelineEntries(true);
        });
      })
      .addButton((button) => {
        button.setButtonText("Choose");
        button.onClick(() => {
          new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose milestones/events note", async (file) => {
            this.plugin.settings.timelineNote = file.path;
            await this.plugin.saveSettings();
            await this.plugin.refreshTimelineEntries(true);
            this.display();
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("Use active note");
        button.onClick(async () => {
          const changed = await this.plugin.useActiveNoteAsTimelineTarget();
          if (changed) this.display();
        });
      });

    new Setting(eventGroup)
      .setName("Calendar event color")
      .setDesc("Color used for milestone/event dates in Calendar.")
      .addColorPicker((color) => {
        color.setValue(this.plugin.settings.calendarEventColor || "#eab308");
        color.onChange(async (value) => {
          this.plugin.settings.calendarEventColor = sanitizeCssText(value, "#eab308");
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        });
      });
  }



  renderHolidayCalendar(containerEl) {
    const holidayGroup = this.createSettingsDetails(
      containerEl,
      "Holidays",
      "Marks configured holiday dates in the calendar."
    );

    new Setting(holidayGroup)
      .setName("Holiday dates")
      .setDesc("Reads holiday dates from a markdown note and marks them red in Calendar.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.holidayCalendarEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.holidayCalendarEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.refreshHolidayCalendar(true);
          this.display();
        });
      });

    if (!this.plugin.settings.holidayCalendarEnabled) return;

    new Setting(holidayGroup)
      .setName("Holiday note")
      .setDesc("Markdown note with dates like 2026-12-25 Holiday name.")
      .addText((text) => {
        const applyHolidayNote = async (value) => {
          this.plugin.settings.holidayCalendarNote = value.trim();
          await this.plugin.saveSettings();
          await this.plugin.refreshHolidayCalendar(true);
        };
        text.setPlaceholder("Holidays.md");
        text.setValue(this.plugin.settings.holidayCalendarNote || "");
        text.onChange(applyHolidayNote);
      })
      .addButton((button) => {
        button.setButtonText("Choose");
        button.onClick(() => {
          new NoesisFlowMarkdownNoteChooserModal(this.app, "Choose holiday note", async (file) => {
            this.plugin.settings.holidayCalendarNote = file.path;
            await this.plugin.saveSettings();
            await this.plugin.refreshHolidayCalendar(true);
            this.display();
          }).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("Use active note");
        button.onClick(async () => {
          const changed = await this.plugin.useActiveNoteAsHolidayCalendarTarget();
          if (changed) this.display();
        });
      });
  }



  renderTimerAddons(containerEl) {
    const timerGroup = this.createSettingsDetails(
      containerEl,
      "Pomodoro Timer",
      "Focus cycles, short breaks, long breaks, and display style."
    );

    new Setting(timerGroup)
      .setName("Pomodoro Timer")
      .setDesc("Adds a Pomodoro Timer tab and ribbon action.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.timerAddonEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.timerAddonEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.updateTimerAddonState();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("Open");
        button.onClick(() => this.plugin.openTimerView());
      });

    if (!this.plugin.settings.timerAddonEnabled) return;

    new Setting(timerGroup)
      .setName("Timer display")
      .setDesc("Choose the compact Timer display or the Pomodoro progress circle.")
      .addDropdown((dropdown) => {
        dropdown.addOption("timer", "Timer");
        dropdown.addOption("circle", "Pomodoro Circle");
        dropdown.setValue(this.plugin.settings.timerDisplayStyle === "timer" ? "timer" : "circle");
        dropdown.onChange(async (value) => {
          this.plugin.settings.timerDisplayStyle = value === "timer" ? "timer" : "circle";
          await this.plugin.saveSettings();
          this.plugin.refreshTimerViews();
        });
      });

    new Setting(timerGroup)
      .setName("Focus minutes")
      .setDesc("Length of each focus cycle.")
      .addSlider((slider) => {
        slider
          .setLimits(1, 240, 1)
          .setValue(clampNumber(this.plugin.settings.timerFocusMinutes, 1, 240, 25))
          .onChange(async (value) => {
            this.plugin.settings.timerFocusMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.refreshTimerViews();
          });
      });

    new Setting(timerGroup)
      .setName("Short break minutes")
      .setDesc("Length of each regular break.")
      .addSlider((slider) => {
        slider
          .setLimits(1, 120, 1)
          .setValue(clampNumber(this.plugin.settings.timerBreakMinutes, 1, 120, 5))
          .onChange(async (value) => {
            this.plugin.settings.timerBreakMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.refreshTimerViews();
          });
      });

    new Setting(timerGroup)
      .setName("Long break minutes")
      .setDesc("Length of the long break.")
      .addSlider((slider) => {
        slider
          .setLimits(1, 120, 1)
          .setValue(clampNumber(this.plugin.settings.timerLongBreakMinutes, 1, 120, 20))
          .onChange(async (value) => {
            this.plugin.settings.timerLongBreakMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.refreshTimerViews();
          });
      });

    new Setting(timerGroup)
      .setName("Focus cycles")
      .setDesc("Number of focus cycles in one Pomodoro session.")
      .addSlider((slider) => {
        slider
          .setLimits(1, 12, 1)
          .setValue(clampNumber(this.plugin.settings.timerFocusCycles, 1, 12, 4))
          .onChange(async (value) => {
            this.plugin.settings.timerFocusCycles = value;
            if (this.plugin.settings.timerLongBreakInterval > value) {
              this.plugin.settings.timerLongBreakInterval = value;
            }
            await this.plugin.saveSettings();
            this.plugin.refreshTimerViews();
            this.display();
          });
      });

    new Setting(timerGroup)
      .setName("Long break after")
      .setDesc("Completed focus cycles before the long break starts.")
      .addSlider((slider) => {
        const cycleLimit = clampNumber(this.plugin.settings.timerFocusCycles, 1, 12, 4);
        slider
          .setLimits(1, cycleLimit, 1)
          .setValue(Math.min(cycleLimit, clampNumber(this.plugin.settings.timerLongBreakInterval, 1, 12, 4)))
          .onChange(async (value) => {
            this.plugin.settings.timerLongBreakInterval = value;
            await this.plugin.saveSettings();
            this.plugin.refreshTimerViews();
          });
      });

    new Setting(timerGroup)
      .setName("Focus sound")
      .setDesc("Choose the timer media file to play during focus periods.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Silent");
        const sounds = this.plugin.getTimerSoundFiles();
        for (const sound of sounds) dropdown.addOption(sound.path, sound.label);
        const configuredSound = this.plugin.settings.timerSoundPath || "";
        dropdown.setValue(sounds.some((sound) => sound.path === configuredSound) ? configuredSound : "");
        dropdown.onChange(async (value) => {
          this.plugin.settings.timerSoundPath = value;
          await this.plugin.saveSettings();
        });
      });
    new Setting(timerGroup)
      .setName("Completion sound")
      .setDesc("Play the selected focus sound once when a focus or break period ends.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.timerCompletionSoundEnabled)
          .onChange(async (value) => {
            this.plugin.settings.timerCompletionSoundEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(timerGroup)
      .setName("Desktop completion notification")
      .setDesc("Show a system notification at the end of a period when Obsidian has permission.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.timerDesktopNotifications)
          .onChange(async (value) => {
            this.plugin.settings.timerDesktopNotifications = value;
            await this.plugin.saveSettings();
          });
      });
  }

}
