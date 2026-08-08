import type { NoesisFlowSettings } from "../types";
import { DEFAULT_SETTINGS } from "../utils";

const CURRENT_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Limits UI-provided settings updates to the current persisted schema.
 *
 * This keeps live controls within the current persisted schema.
 */
export function sanitizeSettingsSnapshot(value: unknown): Partial<NoesisFlowSettings> {
  if (!isRecord(value)) return {};

  const result: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(value)) {
    if (CURRENT_SETTING_KEYS.has(key)) result[key] = setting;
  }

  return result;
}
