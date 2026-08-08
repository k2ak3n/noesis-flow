import { moment } from "../time";
import { CalendarTask, NoesisFlowProject } from "../types";

export interface ResolvedTaskProject {
  project?: NoesisFlowProject;
  /** Existing headings remain useful project context before they are registered. */
  legacySection?: string;
}

export interface TaskQuerySnapshot {
  active: CalendarTask[];
  completed: CalendarTask[];
  actionable: CalendarTask[];
  archivedProjectTasks: CalendarTask[];
  pastScheduled: CalendarTask[];
  unscheduledInbox: CalendarTask[];
  noProject: CalendarTask[];
  unregisteredProject: CalendarTask[];
  stale: CalendarTask[];
  nextWeek: CalendarTask[];
  completedThisWeek: CalendarTask[];
  completedLastWeek: CalendarTask[];
  recentCompleted: CalendarTask[];
  projectsOverdue: NoesisFlowProject[];
  projectsDueSoon: NoesisFlowProject[];
  isActionable(task: CalendarTask): boolean;
  resolveProject(task: CalendarTask): ResolvedTaskProject;
}

function date(value: string | undefined) {
  const parsed = moment(String(value || ""), "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
}

function normalized(value: string | undefined) {
  return String(value || "").trim().toLocaleLowerCase();
}

function projectLocationKey(sourcePath: string | undefined, section: string | undefined) {
  return `${String(sourcePath || "")}\u0000${normalized(section)}`;
}

export function resolveTaskProject(task: CalendarTask, projects: NoesisFlowProject[]): ResolvedTaskProject {
  const projectId = String(task.projectId || "").trim();
  const direct = projectId ? projects.find((project) => project.id === projectId) : undefined;
  if (direct) return { project: direct };

  const section = normalized(task.section);
  const matched = projects.find((project) => projectLocationKey(project.sourcePath, project.section) === projectLocationKey(task.sourcePath, task.section));
  if (matched) return { project: matched };
  return section && !["inbox", "unassigned"].includes(section) ? { legacySection: String(task.section).trim() } : {};
}

function createProjectResolver(projects: NoesisFlowProject[]) {
  const projectsById = new Map<string, NoesisFlowProject>();
  const projectsByLocation = new Map<string, NoesisFlowProject>();
  for (const project of projects) {
    // Match Array.prototype.find semantics if an old settings file contains duplicates.
    if (!projectsById.has(project.id)) projectsById.set(project.id, project);
    const location = projectLocationKey(project.sourcePath, project.section);
    if (!projectsByLocation.has(location)) projectsByLocation.set(location, project);
  }

  return (task: CalendarTask): ResolvedTaskProject => {
    const projectId = String(task.projectId || "").trim();
    const direct = projectId ? projectsById.get(projectId) : undefined;
    if (direct) return { project: direct };

    const section = normalized(task.section);
    const matched = projectsByLocation.get(projectLocationKey(task.sourcePath, task.section));
    if (matched) return { project: matched };
    return section && !["inbox", "unassigned"].includes(section) ? { legacySection: String(task.section).trim() } : {};
  };
}

/**
 * The one place Noesis Flow defines task state. Views consume this snapshot instead
 * of silently reinterpreting task dates and unassigned-task semantics.
 */
export function queryTasks(
  activeTasks: CalendarTask[],
  completedTasks: CalendarTask[],
  projects: NoesisFlowProject[] = [],
  today = moment().startOf("day"),
  options: { staleDays?: number; dueSoonDays?: number } = {}
): TaskQuerySnapshot {
  const day = today.clone().startOf("day");
  const staleCutoff = day.clone().subtract(Math.max(1, Number(options.staleDays) || 14), "day");
  const dueSoonEnd = day.clone().add(Math.max(1, Number(options.dueSoonDays) || 7), "day");
  const resolveProject = createProjectResolver(projects);
  const isActionable = (task: CalendarTask) => {
    const resolved = resolveProject(task).project;
    return !resolved || resolved.status === "active";
  };
  const archivedProjectTasks = activeTasks.filter((task) => resolveProject(task).project?.status === "archived");
  const actionable = activeTasks.filter(isActionable);
  const pastScheduled = actionable.filter((task) => {
    const taskDate = date(task.dateKey);
    return !!taskDate && taskDate.isBefore(day, "day");
  });
  const unscheduledInbox = actionable.filter((task) => !task.dateKey && ["inbox", "unassigned"].includes(normalized(task.section)));
  const noProject = actionable.filter((task) => {
    const resolved = resolveProject(task);
    return !resolved.project && !resolved.legacySection;
  });
  const unregisteredProject = actionable.filter((task) => !!resolveProject(task).legacySection);
  const stale = actionable.filter((task) => {
    const reference = date(task.dateKey);
    return !!reference && reference.isBefore(staleCutoff, "day");
  });
  const nextWeek = actionable.filter((task) => {
    const scheduled = date(task.dateKey);
    return !!scheduled && scheduled.isBetween(day, day.clone().add(7, "day"), "day", "[]");
  });
  const completedThisWeek = completedTasks.filter((task) => task.completedAt && moment(task.completedAt).isSame(day, "isoWeek"));
  const completedLastWeek = completedTasks.filter((task) => task.completedAt && moment(task.completedAt).isSame(day.clone().subtract(1, "week"), "isoWeek"));
  const recentCompleted = completedTasks
    .filter((task) => task.completedAt && moment(task.completedAt).isAfter(day.clone().subtract(7, "day")))
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const projectsOverdue = projects.filter((project) => {
    const due = date(project.dueDate);
    return project.status !== "archived" && !!due && due.isBefore(day, "day");
  });
  const projectsDueSoon = projects.filter((project) => {
    const due = date(project.dueDate);
    return project.status !== "archived" && !!due && due.isBetween(day, dueSoonEnd, "day", "[]");
  });

  return {
    active: activeTasks,
    completed: completedTasks,
    actionable,
    archivedProjectTasks,
    pastScheduled,
    unscheduledInbox,
    noProject,
    unregisteredProject,
    stale,
    nextWeek,
    completedThisWeek,
    completedLastWeek,
    recentCompleted,
    projectsOverdue,
    projectsDueSoon,
    isActionable,
    resolveProject
  };
}
