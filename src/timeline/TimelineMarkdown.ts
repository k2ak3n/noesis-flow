import { TimelineEntry } from "../types";
import { moment } from "../time";
import {
  clampNumber,
  findNoesisFlowDateMarker,
  formatDateMarker,
  isMarkdownCodeFenceLine,
  normalizeCalendarSectionName,
  normalizeCalendarTaskText
} from "../utils";

export function parseTimelineEntries(content: unknown, settings: unknown, sourcePath = ""): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const lines = String(content || "").split(/\r?\n/);
  let section = "";
  let inCodeBlock = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (isMarkdownCodeFenceLine(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      section = normalizeCalendarSectionName(headingMatch[1]);
      continue;
    }
    const marker = findNoesisFlowDateMarker(line, settings);
    if (!marker) continue;
    const date = moment(marker.dateKey, "YYYY-MM-DD", true).startOf("day");
    if (!date.isValid()) continue;
    const label = line
      .replace(/^\s*[-*]\s+/, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(marker.raw, "")
      .replace(/^[:|,@\-\s]+|[:|,@\-\s]+$/g, "")
      .trim() || "Event";
    entries.push({ type: "event", date, dateKey: marker.dateKey, label, section, lineIndex, sourcePath });
  }
  return entries;
}

export function getTimelineEntries(
  eventEntries: TimelineEntry[],
  holidayEntries: Map<string, string[]>,
  settings: { timelineRangeDays?: number; timelineIncludeEvents?: boolean; timelineIncludeHolidays?: boolean },
  today = moment()
): TimelineEntry[] {
  const todayStart = today.clone().startOf("day");
  const endDate = todayStart.clone().add(clampNumber(settings?.timelineRangeDays, 1, 365, 60) - 1, "day");
  const entries = settings?.timelineIncludeEvents === false ? [] : Array.isArray(eventEntries) ? eventEntries.slice() : [];
  if (settings?.timelineIncludeHolidays && holidayEntries instanceof Map) {
    for (const [dateKey, holidays] of holidayEntries.entries()) {
      const date = moment(dateKey, "YYYY-MM-DD", true).startOf("day");
      if (!date.isValid()) continue;
      for (const label of holidays || []) entries.push({ type: "holiday", date, dateKey, label: label || "Holiday", section: "Holiday" });
    }
  }
  return entries
    .filter((entry) => entry?.date?.isValid())
    .filter((entry) => !entry.date.isBefore(todayStart, "day") && !entry.date.isAfter(endDate, "day"))
    .sort((a, b) => a.date.valueOf() - b.date.valueOf() || String(a.label).localeCompare(String(b.label)));
}

export function serializeTimelineEntries(entries: TimelineEntry[]): string {
  return JSON.stringify((entries || [])
    .map((entry) => [entry.dateKey, entry.type, entry.section || "", entry.label || ""])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3]))));
}

export function createTimelineEventLine(label: string, dateKey: string, settings: unknown): string {
  return `- ${normalizeCalendarTaskText(label)} ${formatDateMarker(dateKey, settings)}`;
}

export function insertTimelineEventInSection(content: unknown, sectionName: string, eventLine: string): string {
  const section = normalizeCalendarSectionName(sectionName);
  const newline = String(content || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(content || "").split(/\r?\n/);
  if (!section) return `${String(content || "").replace(/\s*$/, "")}${String(content || "").trim() ? `${newline}${newline}` : ""}${eventLine}${newline}`;
  let headingIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (match && normalizeCalendarSectionName(match[1]) === section) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex < 0) {
    const trimmed = String(content || "").replace(/\s*$/, "");
    return `${trimmed}${trimmed ? `${newline}${newline}` : ""}## ${section}${newline}${eventLine}${newline}`;
  }
  let insertIndex = headingIndex + 1;
  while (insertIndex < lines.length && !/^##\s+/.test(lines[insertIndex])) insertIndex += 1;
  lines.splice(insertIndex, 0, eventLine);
  return lines.join(newline);
}

export function updateTimelineEventInContent(
  content: unknown,
  entry: TimelineEntry,
  updates: Partial<Pick<TimelineEntry, "label" | "dateKey" | "section">>,
  settings: unknown
): { changed: boolean; content: string } {
  const newline = String(content || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(content || "").split(/\r?\n/);
  const expectedDate = String(entry?.dateKey || "");
  const expectedLabel = String(entry?.label || "").trim();
  const matchesEntry = (line: string) => {
    const marker = findNoesisFlowDateMarker(line, settings);
    if (!marker || marker.dateKey !== expectedDate) return false;
    const label = String(line || "").replace(/^\s*[-*]\s+/, "").replace(/^#{1,6}\s+/, "")
      .replace(marker.raw, "").replace(/^[:|,@\-\s]+|[:|,@\-\s]+$/g, "").trim();
    return label === expectedLabel;
  };
  const targetIndex = Number.isInteger(Number(entry?.lineIndex)) && matchesEntry(lines[Number(entry.lineIndex)])
    ? Number(entry.lineIndex)
    : lines.findIndex(matchesEntry);
  if (targetIndex < 0) return { changed: false, content: String(content || "") };

  const nextLabel = normalizeCalendarTaskText(Object.hasOwn(updates, "label") ? updates.label : entry.label);
  const nextDateKey = String(Object.hasOwn(updates, "dateKey") ? updates.dateKey : entry.dateKey || "").trim();
  const currentSection = normalizeCalendarSectionName(entry.section);
  const nextSection = normalizeCalendarSectionName(Object.hasOwn(updates, "section") ? updates.section : currentSection);
  if (!nextLabel || !moment(nextDateKey, "YYYY-MM-DD", true).isValid()) return { changed: false, content: String(content || "") };
  const nextLine = createTimelineEventLine(nextLabel, nextDateKey, settings);
  if (nextSection === currentSection) {
    lines[targetIndex] = `${String(lines[targetIndex] || "").match(/^\s*/)?.[0] || ""}${nextLine}`;
    const nextContent = lines.join(newline);
    return { changed: nextContent !== content, content: nextContent };
  }
  lines.splice(targetIndex, 1);
  const nextContent = insertTimelineEventInSection(lines.join(newline), nextSection, nextLine);
  return { changed: nextContent !== content, content: nextContent };
}

export function deleteTimelineEventInContent(
  content: unknown,
  entry: TimelineEntry,
  settings: unknown
): { changed: boolean; content: string } {
  const newline = String(content || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(content || "").split(/\r?\n/);
  const expectedDate = String(entry?.dateKey || "");
  const expectedLabel = String(entry?.label || "").trim();
  const matchesEntry = (line: string) => {
    const marker = findNoesisFlowDateMarker(line, settings);
    if (!marker || marker.dateKey !== expectedDate) return false;
    const label = String(line || "").replace(/^\s*[-*]\s+/, "").replace(/^#{1,6}\s+/, "")
      .replace(marker.raw, "").replace(/^[:|,@\-\s]+|[:|,@\-\s]+$/g, "").trim();
    return label === expectedLabel;
  };
  const targetIndex = Number.isInteger(Number(entry?.lineIndex)) && matchesEntry(lines[Number(entry.lineIndex)])
    ? Number(entry.lineIndex)
    : lines.findIndex(matchesEntry);
  if (targetIndex < 0) return { changed: false, content: String(content || "") };
  lines.splice(targetIndex, 1);
  return { changed: true, content: lines.join(newline) };
}