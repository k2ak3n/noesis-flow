import { describe, expect, it } from "vitest";
import { sanitizeSettingsSnapshot } from "../src/settings/SettingsSnapshot";

describe("sanitizeSettingsSnapshot", () => {
  it("keeps current settings while rejecting unknown keys", () => {
    expect(sanitizeSettingsSnapshot({
      tasksAddonEnabled: false,
      calendarTaskCaptureEnabled: true,
      dailyBriefAddonEnabled: true,
      taskListAddonEnabled: true,
      unknownSetting: true
    })).toEqual({
      tasksAddonEnabled: false,
      calendarTaskCaptureEnabled: true,
      dailyBriefAddonEnabled: true,
      taskListAddonEnabled: true
    });
  });

  it("rejects non-object input", () => {
    expect(sanitizeSettingsSnapshot(null)).toEqual({});
    expect(sanitizeSettingsSnapshot([])).toEqual({});
  });
});
