function normalizeSectionName(value: unknown): string {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^#+\s*/, "")
    .trim();
}

function isCodeFenceLine(line: unknown): boolean {
  return /^\s*(?:```|~~~)/.test(String(line || ""));
}

export function getMarkdownLineEnding(text: unknown): "\r\n" | "\n" {
  return String(text || "").includes("\r\n") ? "\r\n" : "\n";
}

export function findCalendarSectionHeading(lines: string[], sectionName: string): number {
  const target = sectionName.trim().toLowerCase();
  return lines.findIndex((line) => {
    const match = line.match(/^##\s+(.+?)\s*$/);
    return !!match && match[1].trim().toLowerCase() === target;
  });
}

export function getMarkdownH2Sections(content: unknown): string[] {
  const sections: string[] = [];
  const seen = new Set<string>();
  let inCodeBlock = false;
  for (const line of String(content || "").split(/\r?\n/)) {
    if (isCodeFenceLine(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^##(?!#)\s+(.+?)\s*$/);
    if (!match) continue;
    const section = normalizeSectionName(match[1].replace(/\s+#+\s*$/, ""));
    const key = section.toLowerCase();
    if (!section || seen.has(key)) continue;
    seen.add(key);
    sections.push(section);
  }
  return sections;
}

export function insertCalendarTaskInSection(content: unknown, sectionName: string, taskLine: string): string {
  return insertCalendarTasksInSection(content, sectionName, [taskLine]);
}

export function insertCalendarTasksInSection(content: unknown, sectionName: string, taskLines: string[]): string {
  const linesToInsert = (Array.isArray(taskLines) ? taskLines : [taskLines])
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (!linesToInsert.length) return String(content || "");

  const eol = getMarkdownLineEnding(content);
  const text = String(content || "");
  const section = normalizeSectionName(sectionName);
  if (!text.trim()) return `## ${section}${eol}${eol}${linesToInsert.join(eol)}${eol}`;

  const lines = text.split(/\r?\n/);
  const headingIndex = findCalendarSectionHeading(lines, section);
  if (headingIndex === -1) {
    const trimmed = text.replace(/[\r\n\s]*$/g, "");
    return `${trimmed}${eol}${eol}## ${section}${eol}${eol}${linesToInsert.join(eol)}${eol}`;
  }

  let nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && /^#{1,2}\s+/.test(line));
  if (nextHeadingIndex === -1) nextHeadingIndex = lines.length;
  let insertIndex = nextHeadingIndex;
  while (insertIndex > headingIndex + 1 && lines[insertIndex - 1].trim() === "") insertIndex -= 1;

  const before = lines.slice(0, insertIndex);
  const after = lines.slice(insertIndex);
  const insertion: string[] = [];
  if (before[before.length - 1] && /^##\s+/.test(before[before.length - 1])) insertion.push("");
  insertion.push(...linesToInsert);
  if (after.length && after[0].trim() !== "") insertion.push("");
  return [...before, ...insertion, ...after].join(eol);
}
