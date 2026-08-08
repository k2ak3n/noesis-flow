import { moment } from "../time";
import type { Moment } from "moment";
import { findNoesisFlowDateMarker, isMarkdownCodeFenceLine } from "../utils";

export function parseHolidayEntries(content: unknown, settings: unknown): Map<string, string[]> {
  const holidays = new Map<string, string[]>();
  let inCodeBlock = false;
  for (const line of String(content || "").split(/\r?\n/)) {
    if (isMarkdownCodeFenceLine(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const marker = findNoesisFlowDateMarker(line, settings);
    if (!marker) continue;
    const label = line
      .replace(/^\s*[-*]\s+/, "")
      .replace(/^\s*#+\s+/, "")
      .replace(marker.raw, "")
      .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
      .trim() || "Holiday";
    const entries = holidays.get(marker.dateKey) || [];
    entries.push(label);
    holidays.set(marker.dateKey, entries);
  }
  return holidays;
}

export function serializeHolidayEntries(holidays: Map<string, string[]>): string {
  return JSON.stringify(Array.from(holidays.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

export interface HolidayCounterEntry {
  type: "holiday";
  label: string;
  date: Moment;
  meta: "Holiday";
}

export function getNextHolidayCounterEntry(holidayEntries: Map<string, string[]>, today: Moment = moment()): HolidayCounterEntry | null {
  if (!(holidayEntries instanceof Map) || !holidayEntries.size) return null;
  const todayStart = today.clone().startOf("day");
  const candidates: HolidayCounterEntry[] = [];
  for (const [dateKey, entries] of holidayEntries.entries()) {
    const date = moment(dateKey, "YYYY-MM-DD", true).startOf("day");
    if (!date.isValid() || date.isBefore(todayStart, "day")) continue;
    candidates.push({ type: "holiday", label: (entries || []).join(", ") || "Holiday", date, meta: "Holiday" });
  }
  candidates.sort((a, b) => a.date.valueOf() - b.date.valueOf());
  return candidates[0] || null;
}
