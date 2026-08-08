import { describe, it, expect } from 'vitest';
import moment from 'moment';
import {
  createCalendarTaskLine,
  createCalendarTaskId,
  getCalendarTaskId,
  parseCalendarTaskIndex,
  cleanCalendarTaskText,
  markCalendarTaskCompletedInContent,
  deleteCalendarTaskInContent,
  updateCalendarTaskInContent,
  getCalendarTaskDuplicateKeys,
  getPomodoroSessionSettings,
  getPomodoroNextStep,
  parseKanbanSavedViewsExport,
  serializeKanbanSavedViews,
  normalizeTaskListColumnOrder,
  normalizeTaskListVisibleColumns,
  normalizeTaskListColumnWidths,
  findCalendarTaskLineIndex,
  getCalendarDateClickAction
} from '../src/utils';
import { getDateTaskGroups, isTaskDeadlineOverdue } from '../src/calendar/CalendarTaskData';
import { getMarkdownH2Sections, insertCalendarTaskInSection } from '../src/tasks/TaskMarkdown';
import { parseTimelineEntries, updateTimelineEventInContent } from '../src/timeline/TimelineMarkdown';
import { parseHolidayEntries } from '../src/calendar/HolidayMarkdown';
import {
  getNextAfterCompletionDate,
  getRecurringTaskContinuationDates,
  getRecurringTaskDates,
  getRecurringTaskWeekdays
} from '../src/tasks/TaskRecurrence';

describe('Core Features', () => {

  describe('task date semantics', () => {
    it('uses the task Date as the only overdue signal and ignores legacy availability metadata', () => {
      const today = moment('2026-07-20');
      expect(isTaskDeadlineOverdue({ dateKey: '2026-07-19' }, today)).toBe(true);
      expect(isTaskDeadlineOverdue({ dateKey: '2026-07-20' }, today)).toBe(false);
    });

    it('keeps legacy availability comments inert in date-filter groups', () => {
      const today = moment('2026-07-20');
      const tasksByDate = new Map([[
        '2026-07-20',
        [
          { text: 'Ready', startDate: '2026-07-20' },
          { text: 'Later', startDate: '2026-07-21' }
        ]
      ]]);
      const groups = getDateTaskGroups(tasksByDate, { taskDateFilter: 'today' }, today);
      expect(groups).toHaveLength(1);
      expect(groups[0].tasks.map((task) => task.text)).toEqual(['Ready', 'Later']);
    });
  });

  describe('Task Recurrence Math', () => {
    describe('getRecurringTaskWeekdays', () => {
      it('parses various separators and aliases', () => {
        expect(getRecurringTaskWeekdays('Mon, Wed, Fri')).toEqual([1, 3, 5]);
        expect(getRecurringTaskWeekdays('Monday Tuesday')).toEqual([1, 2]);
        expect(getRecurringTaskWeekdays('Sun/Thu|Sat')).toEqual([0, 4, 6]);
      });

      it('filters out invalid weekdays', () => {
        expect(getRecurringTaskWeekdays('InvalidDay, Mon')).toEqual([1]);
        expect(getRecurringTaskWeekdays('')).toEqual([]);
      });
    });

    describe('getRecurringTaskDates', () => {
      const settings = { recurringTaskOccurrenceLimit: 3 };

      it('generates daily recurrence dates', () => {
        const start = moment('2024-06-01');
        const dates = getRecurringTaskDates(start, { rule: 'daily' }, settings);
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-01',
          '2024-06-02',
          '2024-06-03'
        ]);
      });

      it('generates weekly recurrence dates', () => {
        const start = moment('2024-06-01');
        const dates = getRecurringTaskDates(start, { rule: 'weekly' }, settings);
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-01',
          '2024-06-08',
          '2024-06-15'
        ]);
      });

      it('supports every N weeks', () => {
        const dates = getRecurringTaskDates(
          moment('2024-06-01'),
          { rule: 'weekly', interval: 2 },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-01',
          '2024-06-15',
          '2024-06-29'
        ]);
      });

      it('generates monthly recurrence dates handling short months', () => {
        const start = moment('2024-01-31');
        const dates = getRecurringTaskDates(start, { rule: 'monthly' }, settings);
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-01-31',
          '2024-02-29', // 2024 is leap year
          '2024-03-31'
        ]);
      });

      it('generates weekdays recurrence skipping weekends', () => {
        const start = moment('2024-05-31'); // Friday
        const dates = getRecurringTaskDates(start, { rule: 'weekdays' }, settings);
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-05-31', // Fri
          '2024-06-03', // Mon
          '2024-06-04'  // Tue
        ]);
      });

      it('generates custom weekdays recurrence', () => {
        const start = moment('2024-06-03'); // Monday
        const dates = getRecurringTaskDates(
          start,
          { rule: 'custom-weekdays', weekdays: 'Tue, Thu' },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-03', // Mon (always includes start date)
          '2024-06-04', // Tue
          '2024-06-06'  // Thu
        ]);
      });

      it('supports weekday rules every N weeks', () => {
        const dates = getRecurringTaskDates(
          moment('2024-06-03'),
          { rule: 'custom-weekdays', interval: 2, weekdays: 'Mon, Wed' },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-03',
          '2024-06-05',
          '2024-06-17'
        ]);
      });

      it('skips weekends while maintaining the occurrence count', () => {
        const dates = getRecurringTaskDates(
          moment('2024-05-31'),
          { rule: 'daily', skipWeekends: true },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-05-31',
          '2024-06-03',
          '2024-06-04'
        ]);
      });

      it('stops skipped recurrences at their end date', () => {
        const dates = getRecurringTaskDates(
          moment('2024-06-07'),
          { rule: 'daily', skipWeekends: true, endMode: 'date', endDate: '2024-06-10' },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-07',
          '2024-06-10'
        ]);
      });

      it('skips configured holidays and respects date exceptions', () => {
        const holidayDates = getRecurringTaskDates(
          moment('2024-06-01'),
          { rule: 'daily', skipHolidays: true },
          { recurringTaskOccurrenceLimit: 3, recurringTaskHolidayDates: ['2024-06-02'] }
        );
        expect(holidayDates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-01',
          '2024-06-03',
          '2024-06-04'
        ]);

        const exceptions = getRecurringTaskDates(
          moment('2024-06-01'),
          { rule: 'daily', skipWeekends: true, excludedDates: ['2024-06-03'], includedDates: ['2024-06-02'] },
          settings
        );
        expect(exceptions.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-02',
          '2024-06-04',
          '2024-06-05'
        ]);
      });

      it('respects a per-task occurrence end count', () => {
        const dates = getRecurringTaskDates(
          moment('2024-06-01'),
          { rule: 'daily', endMode: 'count', endCount: 2 },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-01',
          '2024-06-02'
        ]);
      });

      it('stops a recurrence on its selected end date', () => {
        const dates = getRecurringTaskDates(
          moment('2024-06-01'),
          { rule: 'daily', endMode: 'date', endDate: '2024-06-02' },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual([
          '2024-06-01',
          '2024-06-02'
        ]);
      });

      it('materializes only the first after-completion occurrence', () => {
        const dates = getRecurringTaskDates(
          moment('2024-06-03'),
          { rule: 'after-completion', completionRule: 'weekly' },
          settings
        );
        expect(dates.map(d => d.format('YYYY-MM-DD'))).toEqual(['2024-06-03']);
      });

      it('calculates the next post-completion occurrence without a future horizon', () => {
        const next = getNextAfterCompletionDate(
          moment('2024-06-07'),
          { rule: 'after-completion', completionRule: 'daily', skipWeekends: true },
          { recurringTaskOccurrenceLimit: 6 }
        );
        expect(next?.format('YYYY-MM-DD')).toBe('2024-06-10');
      });
    });
  });

  describe('Calendar Task Parsing', () => {
    it('keeps internal task IDs out of visible task text', () => {
      const content = '## Tasks\n- [ ] Review proposal #2024-06-01 <!-- noesis-flow-task:task-abc_123 -->';
      const { tasksByDate } = parseCalendarTaskIndex(content, { dateMarkerStyle: 'tag' }, 'tasks.md');
      const task = tasksByDate.get('2024-06-01')?.[0];
      expect(task?.id).toBe('task-abc_123');
      expect(task?.text).toBe('Review proposal');
    });

    it('creates Markdown-safe task IDs when requested', () => {
      const id = createCalendarTaskId();
      expect(id).toMatch(/^task-[a-z0-9]+-[a-z0-9]+$/);
      expect(createCalendarTaskLine('Review', { marker: ' ' }, '2024-06-01', { dateMarkerStyle: 'tag' }, { taskId: id }))
        .toContain(`<!-- noesis-flow-task:${id} -->`);
    });

    const settings = { dateMarkerStyle: 'tag' };

    it('parses calendar task blocks with different markers', () => {
      const content = `
## 2024-06-01
- [ ] Todo task #2024-06-01
- [/] In-progress task #2024-06-01
- [x] Done task #2024-06-01
`;
      const { tasksByDate, counts } = parseCalendarTaskIndex(content, settings, 'tasks.md');
      const tasks = tasksByDate.get('2024-06-01') || [];
      expect(tasks).toHaveLength(2);
      
      expect(tasks[0]).toMatchObject({
        text: 'Todo task',
        marker: ' ',
        dateKey: '2024-06-01',
        sourcePath: 'tasks.md'
      });
      
      expect(tasks[1]).toMatchObject({
        text: 'In-progress task',
        marker: '/'
      });

      const stats = counts.get('2024-06-01');
      expect(stats).toBeDefined();
      expect(stats?.total).toBe(2);
      expect(stats?.priorities[' ']).toBe(1);
      expect(stats?.priorities['/']).toBe(1);
    });

    it('indexes completed tasks with the configured double-hash date marker', () => {
      const { completedTasksByDate } = parseCalendarTaskIndex(
        '- [x] Power Automate - ClickSend Integration ##2026-07-17',
        { dateMarkerStyle: 'double-hash' },
        'tasks.md'
      );
      expect(completedTasksByDate.get('2026-07-17')).toHaveLength(1);
      expect(completedTasksByDate.get('2026-07-17')?.[0]).toMatchObject({
        text: 'Power Automate - ClickSend Integration',
        completed: true,
        dateKey: '2026-07-17'
      });
    });

    it('keeps undated open tasks separate from calendar counts', () => {
      const content = `
## Misc
- [ ] Eventually task
- [L] Someday low task
- [ ] Dated task #2024-06-01
`;
      const { tasksByDate, counts, undatedTasks } = parseCalendarTaskIndex(content, settings, 'tasks.md');
      expect(tasksByDate.get('2024-06-01')).toHaveLength(1);
      expect(counts.get('2024-06-01')?.total).toBe(1);
      expect(undatedTasks).toHaveLength(2);
      expect(undatedTasks[0]).toMatchObject({
        text: 'Eventually task',
        dateKey: '',
        section: 'Misc'
      });
      expect(undatedTasks[1]).toMatchObject({
        text: 'Someday low task',
        marker: 'L'
      });
    });

    it('correctly cleans date markers from task text', () => {
      expect(cleanCalendarTaskText('Todo task #2024-06-01', '2024-06-01', settings as any)).toBe('Todo task');
      expect(cleanCalendarTaskText('Todo task #2024-06-01 additional', '2024-06-01', settings as any)).toBe('Todo task additional');
    });
  });

  describe('Content Modification/Updates', () => {
    const settings = { dateMarkerStyle: 'tag' };

    it('marks a task as completed in markdown content', () => {
      const content = `
## 2024-06-01
- [ ] Buy groceries #2024-06-01
- [ ] Call dentist #2024-06-01
`;
      const task = {
        text: 'Buy groceries',
        marker: ' ',
        dateKey: '2024-06-01',
        lineIndex: 2
      };

      const result = markCalendarTaskCompletedInContent(content, task, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('- [x] Buy groceries #2024-06-01');
      expect(result.content).toContain('- [ ] Call dentist #2024-06-01');
    });

    it('updates a task properties in place', () => {
      const content = `
## 2024-06-01
- [ ] Send invoice #2024-06-01
`;
      const task = {
        text: 'Send invoice',
        marker: ' ',
        dateKey: '2024-06-01',
        lineIndex: 2,
        section: '2024-06-01'
      };

      const updates = {
        text: 'Send updated invoice',
        marker: '/'
      };

      const result = updateCalendarTaskInContent(content, task, updates, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('- [/] Send updated invoice #2024-06-01');
    });

    it('uses a task ID to update the correct duplicate after its line moved', () => {
      const content = `## Inbox
- [ ] Follow up #2024-06-01 <!-- noesis-flow-task:task-first -->
- [ ] Follow up #2024-06-01 <!-- noesis-flow-task:task-second -->`;
      const result = updateCalendarTaskInContent(content, {
        id: 'task-second',
        text: 'Follow up',
        marker: ' ',
        dateKey: '2024-06-01',
        lineIndex: 0,
        section: 'Inbox'
      }, { text: 'Follow up with legal' }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('Follow up #2024-06-01 <!-- noesis-flow-task:task-first -->');
      expect(result.content).toContain('Follow up with legal #2024-06-01 <!-- noesis-flow-task:task-second -->');
    });

    it('does not update a similarly named task when its stable ID is no longer present', () => {
      const content = `## Inbox
- [ ] Follow up #2024-06-01 <!-- noesis-flow-task:task-first -->`;
      const result = updateCalendarTaskInContent(content, {
        id: 'task-missing', text: 'Follow up', marker: ' ', dateKey: '2024-06-01', lineIndex: 1, section: 'Inbox'
      }, { text: 'Wrong task' }, settings);
      expect(result.changed).toBe(false);
      expect(result.content).toBe(content);
    });

    it('preserves and reads the stable ID on a direct task update', () => {
      const content = `## Inbox
- [ ] Plan release #2024-06-01 <!-- noesis-flow-task:task-plan -->`;
      const result = updateCalendarTaskInContent(content, {
        id: 'task-plan', text: 'Plan release', marker: ' ', dateKey: '2024-06-01', lineIndex: 1, section: 'Inbox'
      }, { text: 'Plan launch' }, settings);
      expect(getCalendarTaskId(result.content)).toBe('task-plan');
    });

    it('updates completed task properties in place', () => {
      const content = `
## 2024-06-01
- [x] Send invoice #2024-06-01
`;
      const task = {
        text: 'Send invoice',
        marker: 'X',
        dateKey: '2024-06-01',
        lineIndex: 2,
        section: '2024-06-01'
      };
      const result = updateCalendarTaskInContent(content, task, { text: 'Sent invoice' }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('- [X] Sent invoice #2024-06-01');
    });

    it('applies direct table-style changes to project, date, and priority together', () => {
      const content = `
## Inbox
- [ ] Plan release #2024-06-01
`;
      const task = {
        text: 'Plan release',
        marker: ' ',
        dateKey: '2024-06-01',
        lineIndex: 2,
        section: 'Inbox'
      };
      const result = updateCalendarTaskInContent(content, task, {
        section: 'Roadmap',
        dateKey: '2024-06-10',
        marker: 'H'
      }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('## Roadmap');
      expect(result.content).toContain('- [H] Plan release #2024-06-10');
      expect(result.content).not.toContain('## Inbox\n- [ ] Plan release');
    });

    it('deletes a task at its source line', () => {
      const content = `## Tasks\n- [ ] Keep this #2024-06-01\n- [H] Remove this #2024-06-01\n`;
      const result = deleteCalendarTaskInContent(content, {
        text: 'Remove this',
        dateKey: '2024-06-01',
        lineIndex: 2
      }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('Keep this');
      expect(result.content).not.toContain('Remove this');
    });

    it('renames undated tasks without adding a date', () => {
      const content = `
## Misc
- [ ] Rename me
`;
      const task = {
        text: 'Rename me',
        marker: ' ',
        dateKey: '',
        lineIndex: 2,
        section: 'Misc'
      };

      const result = updateCalendarTaskInContent(content, task, { text: 'Renamed task' }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('- [ ] Renamed task');
      expect(result.content).not.toContain('#2024');
    });

    it('can add a date to an undated task', () => {
      const content = `
## Misc
- [ ] Schedule me
`;
      const task = {
        text: 'Schedule me',
        marker: ' ',
        dateKey: '',
        lineIndex: 2,
        section: 'Misc'
      };

      const result = updateCalendarTaskInContent(content, task, { dateKey: '2024-06-01' }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toContain('- [ ] Schedule me #2024-06-01');
    });

    it('inserts a calendar task in a specific section', () => {
      const content = `## Tasks\n- [ ] Task 1 #2024-06-01`;
      const taskLine = '- [ ] Task 2 #2024-06-01';
      
      const result = insertCalendarTaskInSection(content, 'Tasks', taskLine);
      expect(result).toBe(`## Tasks\n- [ ] Task 1 #2024-06-01\n- [ ] Task 2 #2024-06-01`);
    });
  });

  describe('Code Block Exclusion', () => {
    const settings = { dateMarkerStyle: 'tag' };

    it('ignores headings and tasks inside code fences during parsing', () => {
      const content = `
## Active Section
- [ ] Active task #2024-06-01

\`\`\`markdown
## Code Block Section
- [ ] Code block task #2024-06-01
\`\`\`
`;
      const { tasksByDate } = parseCalendarTaskIndex(content, settings, 'note.md');
      const tasks = tasksByDate.get('2024-06-01') || [];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('Active task');

      const sections = getMarkdownH2Sections(content);
      expect(sections).toEqual(['Active Section']);
    });

    it('ignores duplicate task keys inside tilde code fences', () => {
      const content = `
## Tasks
- [ ] Active task #2024-06-01

~~~markdown
- [ ] Code block task #2024-06-02
~~~
`;
      const keys = getCalendarTaskDuplicateKeys(content, settings);
      expect(keys.has('tasks\t2024-06-01\tactive task')).toBe(true);
      expect(keys.has('tasks\t2024-06-02\tcode block task')).toBe(false);
    });

    it('ignores holidays and timeline events inside code fences', () => {
      const content = `
## Active
#2024-06-01 Real entry

\`\`\`markdown
#2024-06-02 Code block entry
\`\`\`
`;
      const holidays = parseHolidayEntries(content, settings);
      const events = parseTimelineEntries(content, settings);

      expect(holidays.get('2024-06-01')).toEqual(['Real entry']);
      expect(holidays.has('2024-06-02')).toBe(false);
      expect(events.map((event) => event.dateKey)).toEqual(['2024-06-01']);
    });

    it('updates a timeline event title, date, and project', () => {
      const content = `## Planning\n- Kickoff #2024-06-01\n## Delivery\n`;
      const entry = parseTimelineEntries(content, settings)[0];
      const result = updateTimelineEventInContent(content, entry, {
        label: 'Project kickoff',
        dateKey: '2024-06-03',
        section: 'Delivery'
      }, settings);
      expect(result.changed).toBe(true);
      expect(result.content).toMatch(/## Delivery\n\s*- Project kickoff #2024-06-03/);
      expect(result.content).not.toContain('- Kickoff #2024-06-01');
    });

    it('does not complete tasks located inside code blocks', () => {
      const content = `
## Tasks
- [ ] Active task #2024-06-01

\`\`\`markdown
- [ ] Code block task #2024-06-01
\`\`\`
`;
      const task = {
        text: 'Code block task',
        marker: ' ',
        dateKey: '2024-06-01'
      };

      const result = markCalendarTaskCompletedInContent(content, task, settings);
      expect(result.changed).toBe(false);
    });
  });

  describe('Date Filters', () => {
    const today = moment('2024-06-10');
    const tasksByDate = new Map([
      ['2024-06-09', [{ text: 'Overdue' }]],
      ['2024-06-10', [{ text: 'Today' }]],
      ['2024-06-11', [{ text: 'Tomorrow' }]],
      ['2024-06-16', [{ text: 'Within seven days' }]],
      ['2024-06-17', [{ text: 'Outside seven days' }]]
    ]);

    it('defaults date filtering to today', () => {
      const groups = getDateTaskGroups(tasksByDate, {}, today);
      expect(groups.map(group => group.dateKey)).toEqual(['2024-06-10']);
    });

    it('filters dates to tomorrow', () => {
      const groups = getDateTaskGroups(tasksByDate, { taskDateFilter: 'tomorrow' }, today);
      expect(groups.map(group => group.dateKey)).toEqual(['2024-06-11']);
      expect(groups[0].isTomorrow).toBe(true);
    });

    it('filters dates to the next seven days including today', () => {
      const groups = getDateTaskGroups(tasksByDate, { taskDateFilter: 'next-7' }, today);
      expect(groups.map(group => group.dateKey)).toEqual(['2024-06-10', '2024-06-11', '2024-06-16']);
    });

    it('filters overdue dates only', () => {
      const groups = getDateTaskGroups(tasksByDate, { taskDateFilter: 'overdue' }, today);
      expect(groups.map(group => group.dateKey)).toEqual(['2024-06-09']);
      expect(groups[0].isOverdue).toBe(true);
    });

    it('filters all open dates with overdue first', () => {
      const groups = getDateTaskGroups(tasksByDate, { taskDateFilter: 'all' }, today);
      expect(groups.map(group => group.dateKey)).toEqual([
        '2024-06-09',
        '2024-06-10',
        '2024-06-11',
        '2024-06-16',
        '2024-06-17'
      ]);
    });

    it('tracks new recurring task lines without exposing their marker in the task text', () => {
      const recurringSettings = { dateMarkerStyle: 'tag' };
      const line = createCalendarTaskLine('Weekly review', { marker: 'H' }, '2024-06-01', recurringSettings, { seriesId: 'series-1' });
      expect(line).toBe('- [H] Weekly review #2024-06-01 <!-- noesis-flow-series:series-1 --> <!-- noesis-flow-priority:H -->');

      const active = parseCalendarTaskIndex(`## Work\n${line}`, {
        ...recurringSettings,
        recurringTaskSeries: [{ id: 'series-1', status: 'active' }]
      }, 'tasks.md');
      expect(active.tasksByDate.get('2024-06-01')?.[0]).toMatchObject({ text: 'Weekly review', seriesId: 'series-1' });

      const paused = parseCalendarTaskIndex(`## Work\n${line}`, {
        ...recurringSettings,
        recurringTaskSeries: [{ id: 'series-1', status: 'paused' }]
      }, 'tasks.md');
      expect(paused.tasksByDate.get('2024-06-01')).toBeUndefined();
    });

    it('maintains a bounded future horizon for open-ended recurring series', () => {
      const additions = getRecurringTaskContinuationDates({
        startDate: '2024-06-01',
        recurrence: { rule: 'daily', endMode: 'limit' },
        occurrenceDates: ['2024-06-01', '2024-06-02'],
        occurrenceCount: 2,
        status: 'active'
      }, { recurringTaskOccurrenceLimit: 3 }, moment('2024-06-03'));
      expect(additions).toEqual(['2024-06-03', '2024-06-04', '2024-06-05']);
    });

    it('does not extend a recurring series beyond its explicit count', () => {
      const additions = getRecurringTaskContinuationDates({
        startDate: '2024-06-01',
        recurrence: { rule: 'daily', endMode: 'count', endCount: 3 },
        occurrenceDates: ['2024-06-01', '2024-06-02'],
        occurrenceCount: 2,
        status: 'active'
      }, { recurringTaskOccurrenceLimit: 6 }, moment('2024-06-03'));
      expect(additions).toEqual(['2024-06-03']);
    });

    it('never auto-extends an after-completion series', () => {
      const additions = getRecurringTaskContinuationDates({
        startDate: '2024-06-01',
        recurrence: { rule: 'after-completion', completionRule: 'weekly' },
        occurrenceDates: ['2024-06-01'],
        occurrenceCount: 1,
        status: 'active'
      }, { recurringTaskOccurrenceLimit: 6 }, moment('2024-06-03'));
      expect(additions).toEqual([]);
    });

  });

  describe('Task List Layout', () => {
    it('refuses an ambiguous legacy task match after external duplication', () => {
      const lines = [
        '## Inbox',
        '- [ ] Review proposal #2024-06-01',
        '- [ ] Review proposal #2024-06-01'
      ];
      expect(findCalendarTaskLineIndex(lines, {
        text: 'Review proposal', marker: ' ', dateKey: '2024-06-01', lineIndex: 99, section: 'Inbox'
      }, { dateMarkerStyle: 'tag' })).toBe(-1);
    });

    it('normalizes persisted column order, visibility, and widths', () => {
      expect(normalizeTaskListColumnOrder(['priority', 'text', 'priority', 'unknown'])).toEqual([
        'priority', 'text', 'date', 'section', 'actions'
      ]);
      expect(normalizeTaskListColumnOrder(['actions', 'priority'])).toEqual([
        'actions', 'priority', 'text', 'date', 'section'
      ]);
      expect(normalizeTaskListVisibleColumns(['date', 'text', 'unknown', 'date'])).toEqual(['date', 'text']);
      expect(normalizeTaskListVisibleColumns([])).toEqual(['text']);
      expect(normalizeTaskListColumnWidths({ text: 420.4, date: 10, priority: 1200, unknown: 90 })).toEqual({ text: 420 });
    });

    it('keeps a stable task ID when a direct edit also moves its project', () => {
      const content = '## Inbox\n- [ ] Plan release #2024-06-01 <!-- noesis-flow-task:task-plan -->';
      const result = updateCalendarTaskInContent(content, {
        id: 'task-plan', text: 'Plan release', marker: ' ', dateKey: '2024-06-01', lineIndex: 1, section: 'Inbox'
      }, { section: 'Roadmap', marker: 'H' }, { dateMarkerStyle: 'tag' });
      expect(result.changed).toBe(true);
      expect(result.content).toContain('## Roadmap');
      expect(result.content).toContain('- [H] Plan release #2024-06-01 <!-- noesis-flow-task:task-plan -->');
    });
  });

  describe('Kanban Saved Views', () => {
    it('exports and imports portable saved views with their presentation details', () => {
      const exported = serializeKanbanSavedViews([{
        name: 'This week',
        description: 'Focused weekly plan',
        filter: 'next-7',
        view: 'date',
        statuses: ['active'],
        priorities: ['!', 'H'],
        unscheduledFilter: 'auto',
        search: 'release'
      }]);
      const imported = parseKanbanSavedViewsExport(exported);
      expect(imported).toEqual([{
        name: 'This week',
        description: 'Focused weekly plan',
        filter: 'next-7',
        view: 'date',
        statuses: ['active'],
        priorities: ['!', 'H'],
        unscheduledFilter: 'auto',
        search: 'release'
      }]);
    });

    it('drops invalid and duplicate views during import', () => {
      const imported = parseKanbanSavedViewsExport(JSON.stringify({
        views: [
          { name: 'Active', filter: 'all', view: 'sections' },
          { name: 'active', filter: 'today', view: 'date' },
          { name: '' }
        ]
      }));
      expect(imported).toHaveLength(1);
      expect(imported[0]).toMatchObject({ name: 'Active', statuses: ['active'] });
    });

  });

  describe('Pomodoro Workflow', () => {
    const settings = {
      timerFocusCycles: 4,
      timerLongBreakInterval: 4,
      timerFocusMinutes: 25,
      timerBreakMinutes: 5,
      timerLongBreakMinutes: 20
    };

    it('normalizes Pomodoro session settings', () => {
      expect(getPomodoroSessionSettings(settings)).toEqual({
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 20,
        totalCycles: 4,
        longBreakInterval: 4
      });
    });

    it('moves from focus to short break before the long break interval', () => {
      const next = getPomodoroNextStep('focus', 0, settings);
      expect(next).toEqual({
        mode: 'break',
        completedFocusCycles: 1,
        sessionComplete: false
      });
    });

    it('moves from focus to long break at the long break interval', () => {
      const next = getPomodoroNextStep('focus', 3, settings);
      expect(next).toEqual({
        mode: 'long-break',
        completedFocusCycles: 4,
        sessionComplete: false
      });
    });

    it('starts a fresh session after long break', () => {
      const next = getPomodoroNextStep('long-break', 4, settings);
      expect(next).toEqual({
        mode: 'focus',
        completedFocusCycles: 0,
        sessionComplete: true
      });
    });
  });

  describe('Calendar date clicks', () => {
    it('opens the daily task list whenever the date has active tasks', () => {
      expect(getCalendarDateClickAction(1, false, true)).toBe('tasks');
      expect(getCalendarDateClickAction(3, true, false)).toBe('tasks');
    });

    it('opens task creation only for empty, capturable future dates', () => {
      expect(getCalendarDateClickAction(0, true, false)).toBe('create');
      expect(getCalendarDateClickAction(0, true, true)).toBe('select');
      expect(getCalendarDateClickAction(0, false, false)).toBe('select');
    });
  });

});
