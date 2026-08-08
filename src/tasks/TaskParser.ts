import { parseTaskMetadata, TaskMetadata } from "./TaskMetadata";

export interface ParsedMarkdownTaskLine {
  checkbox: string;
  body: string;
  metadata: TaskMetadata;
}

/** Parses one Markdown task line without applying Noesis Flow-specific display rules. */
export function parseMarkdownTaskLine(line: string): ParsedMarkdownTaskLine | null {
  const match = String(line || "").match(/^\s*-\s+\[([^\]]*)\]\s+(.+?)\s*$/);
  if (!match) return null;
  return {
    checkbox: match[1],
    body: match[2],
    metadata: parseTaskMetadata(match[2])
  };
}
