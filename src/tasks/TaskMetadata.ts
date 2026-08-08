export const TASK_STATUS_VALUES = ["inbox", "next", "doing", "waiting"] as const;
export type TaskStatus = typeof TASK_STATUS_VALUES[number];

export interface TaskMetadata {
  taskId: string;
  seriesId: string;
  status?: TaskStatus;
  completedAt?: string;
  projectId?: string;
  priorityMarker?: string;
}

export interface TaskMetadataUpdates {
  status?: TaskStatus | null;
  completedAt?: string | null;
  projectId?: string | null;
  priorityMarker?: string | null;
}

const EMPTY_TASK_METADATA: TaskMetadata = {
  taskId: "",
  seriesId: "",
};

const COMMENT_PATTERN = /<!--\s*([\s\S]*?)\s*-->/g;
function isIsoTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function normalizeStatus(value: string): TaskStatus | undefined {
  const status = String(value || "").trim().toLowerCase();
  return (TASK_STATUS_VALUES as readonly string[]).includes(status) ? status as TaskStatus : undefined;
}

function normalizePriorityMarker(value: string): string | undefined {
  const marker = String(value || "").trim().toUpperCase();
  if (!marker || marker === "NONE" || marker === "NO PRIORITY") return " ";
  return ["!", "H", "M", "L"].includes(marker) ? marker : undefined;
}

export function getHtmlComments(text: string): string[] {
  const comments: string[] = [];
  for (const match of String(text || "").matchAll(COMMENT_PATTERN)) {
    comments.push(match[0]);
  }
  return comments;
}

export function parseTaskMetadata(text: string): TaskMetadata {
  const metadata: TaskMetadata = { ...EMPTY_TASK_METADATA };
  for (const comment of getHtmlComments(text)) {
    const body = comment.replace(/^<!--\s*|\s*-->$/g, "").trim();
    const match = body.match(/^noesis-flow-([a-z-]+):\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === "task" && /^[A-Za-z0-9_-]+$/.test(value)) metadata.taskId = value;
    if (key === "series" && /^[^\s>]+$/.test(value)) metadata.seriesId = value;
    if (key === "status") {
      const status = normalizeStatus(value);
      if (status) metadata.status = status;
    }
    if (key === "completed" && isIsoTimestamp(value)) metadata.completedAt = value;
    if (key === "project" && /^[A-Za-z0-9_-]+$/.test(value)) metadata.projectId = value;
    if (key === "priority") {
      const priorityMarker = normalizePriorityMarker(value);
      if (priorityMarker !== undefined) metadata.priorityMarker = priorityMarker;
    }
  }
  return metadata;
}

function commentKey(comment: string) {
  const body = String(comment || "").replace(/^<!--\s*|\s*-->$/g, "").trim();
  const match = body.match(/^noesis-flow-([a-z-]+):/i);
  return match ? match[1].toLowerCase() : "";
}

function formatMetadataComment(key: string, value: string | number) {
  return `<!-- noesis-flow-${key}:${value} -->`;
}

/**
 * Applies only the supplied metadata fields. All unknown comments and all
 * untouched Noesis Flow metadata remain exactly as they were in the source task.
 */
export function updateTaskMetadataInText(text: string, updates: TaskMetadataUpdates = {}) {
  const keys = Object.keys(updates).filter((key) => Object.prototype.hasOwnProperty.call(updates, key));
  if (!keys.length) return String(text || "");

  const metadataKeys: Record<string, string> = {
    status: "status",
    completedAt: "completed",
    projectId: "project",
    priorityMarker: "priority"
  };
  const targeted = new Set(keys.map((key) => metadataKeys[key]).filter(Boolean));
  const preserved = getHtmlComments(text).filter((comment) => {
    const key = commentKey(comment);
    return !targeted.has(key);
  });
  let result = String(text || "").replace(COMMENT_PATTERN, "").replace(/\s+/g, " ").trim();
  const comments = [...preserved];

  if (Object.prototype.hasOwnProperty.call(updates, "status") && updates.status) {
    comments.push(formatMetadataComment("status", updates.status));
  }
  if (Object.prototype.hasOwnProperty.call(updates, "completedAt") && updates.completedAt && isIsoTimestamp(updates.completedAt)) {
    comments.push(formatMetadataComment("completed", updates.completedAt));
  }
  if (Object.prototype.hasOwnProperty.call(updates, "projectId") && updates.projectId && /^[A-Za-z0-9_-]+$/.test(updates.projectId)) {
    comments.push(formatMetadataComment("project", updates.projectId));
  }
  if (Object.prototype.hasOwnProperty.call(updates, "priorityMarker")) {
    const priorityMarker = normalizePriorityMarker(String(updates.priorityMarker || ""));
    if (priorityMarker !== undefined) comments.push(formatMetadataComment("priority", priorityMarker === " " ? "none" : priorityMarker));
  }

  if (comments.length) result = `${result} ${comments.join(" ")}`.trim();
  return result;
}

/** Carries every source-line HTML comment forward, without duplicating comments already present. */
export function preserveTaskLineComments(sourceLine: string, replacementLine: string) {
  const result = String(replacementLine || "").trimEnd();
  const existing = new Set(getHtmlComments(result).map((comment) => comment.replace(/\s+/g, " ").trim()));
  const missing = getHtmlComments(sourceLine)
    .filter((comment) => !existing.has(comment.replace(/\s+/g, " ").trim()));
  return missing.length ? `${result} ${missing.join(" ")}` : result;
}
