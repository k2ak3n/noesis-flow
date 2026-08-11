import { describe, expect, it } from "vitest";
import { BUILT_IN_SLOW_TICK_SOUND_PATH, DEFAULT_SETTINGS } from "../src/utils";
import { normalizeSettingsSchema } from "../src/settings/SettingsNormalizer";

describe("settings schema normalization", () => {
  it("clamps timer values and restores required main-pane placements", () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as any;
    settings.timerFocusMinutes = 999;
    settings.timerLongBreakInterval = 0;
    normalizeSettingsSchema(settings, {
      viewPlacements: {
        "noesis-flow-task-list-view": "left",
        "noesis-flow-kanban-view": "right"
      }
    });

    expect(settings.timerFocusMinutes).toBe(240);
    expect(settings.timerLongBreakInterval).toBe(1);
    expect(settings.viewPlacements["noesis-flow-task-list-view"]).toBe("main");
    expect(settings.viewPlacements["noesis-flow-kanban-view"]).toBe("main");
  });

  it("discards malformed timer sessions and recurrence entries", () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as any;
    settings.recurringTaskSeries = [{ id: "ok", text: "Review", occurrenceCount: 0 }, { id: 4 }];
    normalizeSettingsSchema(settings, { timerSessionState: { mode: "invalid", remainingSeconds: -5 } });

    expect(settings.timerSessionState).toMatchObject({ mode: "focus", remainingSeconds: 0 });
    expect(settings.recurringTaskSeries).toEqual([expect.objectContaining({ id: "ok", occurrenceCount: 1 })]);
  });

  it("keeps the bundled slow tick selected and clears unknown sounds", () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as any;
    settings.timerSoundPath = BUILT_IN_SLOW_TICK_SOUND_PATH;
    normalizeSettingsSchema(settings, {});
    expect(settings.timerSoundPath).toBe(BUILT_IN_SLOW_TICK_SOUND_PATH);

    settings.timerSoundPath = "media/ocean.ogg";
    normalizeSettingsSchema(settings, {});
    expect(settings.timerSoundPath).toBe("");
  });
  it("normalizes calendar date appearance settings", () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as any;
    settings.calendarPlainDateNumbers = "yes";
    settings.calendarDateCellShape = "triangle";
    normalizeSettingsSchema(settings, {});

    expect(settings.calendarPlainDateNumbers).toBe(true);
    expect(settings.calendarDateCellShape).toBe("square");

    settings.calendarPlainDateNumbers = false;
    settings.calendarDateCellShape = "circle";
    normalizeSettingsSchema(settings, {});

    expect(settings.calendarPlainDateNumbers).toBe(false);
    expect(settings.calendarDateCellShape).toBe("circle");
  });
});
