# Noesis Flow

A private, Markdown-native task hub for Obsidian.

Noesis Flow keeps tasks in the Markdown notes you choose. Its core workflow is simple: capture into a task note, organize tasks by project, and plan dates when useful. Calendar, Kanban, Monthly Planner, recurring tasks, Timeline, and Pomodoro are optional tools around that core.

## What it does

- Captures tasks into one Markdown task note and indexes additional task notes without moving them.
- Keeps task text ordinary Markdown with optional Noesis Flow metadata comments for status, project links, completion timestamps, and stable identity.
- Provides Dashboard, Task List, and Calendar for focused daily work.
- Supports task details, safe cross-note moves, recurring series, source-aware undo, and recovery after external edits.
- Keeps a cached shared task index so every view sees the same task state without reparsing unchanged source notes.
- Includes optional Monthly Planner, Kanban, Timeline, holidays/events, and Pomodoro Timer modules.

## First run

1. Open **Noesis Flow settings** and create or select a task note.
2. In **Quick setup**, choose **Enable core workflow**.
3. Use **New task** or **Capture task**.
4. Use Dashboard and Task List for daily work; use Monthly Planner when you want to arrange a month of scheduled work.

New unassigned tasks go beneath `## Unassigned`. Add existing Markdown notes in **Tasks → Additional task sources** when you want Noesis Flow to index them alongside the task note.

## Task data and compatibility

Tasks remain standard Markdown checkbox lines. Noesis Flow does not modify a note merely because it indexes it.

```md
- [H] Prepare release #2026-07-24
```

Optional Noesis Flow metadata lives on the same line and is ignored by tools that do not understand it:

```md
- [H] Prepare release #2026-07-24 <!-- noesis-flow-task:release-1 --> <!-- noesis-flow-status:next -->
```

Noesis Flow preserves unrelated HTML comments during task edits. It never guesses when an externally edited legacy task is ambiguous; it stops safely and refreshes instead.

### Scheduling fields

- **Date:** the day you intend to work on the task; it drives Calendar, Monthly Planner, and workload.
- **Overdue:** an active task whose Date is before today.

### Projects

Projects are still Markdown headings. In **Tasks → Projects**, register an existing (or new) `## Heading` to give it a stable identity, status, and optional project due date. Noesis Flow adds the heading's note to the task index when needed, but does not move tasks or rewrite the heading. Existing unregistered headings remain valid project context, so registration is gradual rather than a migration.

When a task is assigned to a registered project, Noesis Flow stores an optional stable `noesis-flow-project` comment on its task line. Removing a project registration only removes that registry entry; it intentionally keeps the heading and all task lines.

## Task safety and recovery

Noesis Flow preserves unrelated Markdown comments during task edits and source moves. Source-aware undo refuses to overwrite an ambiguous task after outside edits.

## Optional planning tools

- **Calendar:** date-based planning, capture, workload signals, holidays, and milestones.
- **Monthly Planner:** a **MONTHLY CALENDAR** for arranging scheduled work.
- **Kanban:** project, date, or priority boards.
- **Task List and Kanban filters:** filter by workflow status, availability, due-date risk, priority, schedule, project, and source note.
- **Recurring tasks:** daily, weekly, monthly, weekday, selected-weekday, and after-completion series.
- **Timeline:** upcoming milestones and holidays.
- **Pomodoro Timer:** local focus and break cycles.

## Privacy

Noesis Flow sends no vault content or usage data over the network and includes no telemetry. It edits only the Markdown task notes you select. All plugin preferences stay in the vault's local plugin data.

## Install manually

Run:

```text
pnpm run build
```

Copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to:

```text
.obsidian/plugins/noesis-flow/
```

Then enable **Noesis Flow** under Community plugins.

## Development checks

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm run build
```

## License

ISC. See [LICENSE](LICENSE).
