import { describe, it, expect } from 'vitest';
import { BUILT_IN_SLOW_TICK_SOUND_PATH, clampNumber, normalizeTimerSoundPath, normalizeMarkdownPath, findNoesisFlowDateMarker, stripNoesisFlowDateMarker, getCalendarWeekStart, getCalendarWeekdays, DEFAULT_SETTINGS, normalizeKanbanCardAccentPosition, normalizeKanbanCardContextPlacement, normalizeKanbanCardContextAlignment } from '../src/utils';



describe('utils', () => {
  describe('focused defaults', () => {
    it('starts new users with one core task workflow and opt-in advanced modules', () => {
      expect(DEFAULT_SETTINGS).toMatchObject({
        calendarAddonEnabled: true,
        tasksAddonEnabled: true,
        calendarTaskCaptureEnabled: true,
        taskListAddonEnabled: true,
        dailyBriefAddonEnabled: true,
        planningAddonEnabled: false,
        kanbanTasksAddonEnabled: false,
        recurringTasksEnabled: false,
        timelineAddonEnabled: false,
        timerAddonEnabled: false,
        timerDisplayStyle: 'circle',
        calendarHeaderDateScale: 1,
        calendarDateNumberScale: 0.8,
        calendarSelectedDateRadius: 6,
        calendarQuarterRailSpacing: 4,
        calendarOverflowDateOpacity: 0.25,
        calendarWeekendTintStrength: 6,
        calendarWeekendTintTone: 'accent'
      });
    });
  });

  describe('clampNumber', () => {
    it('clamps to max', () => {
      expect(clampNumber(10, 0, 5, 2)).toBe(5);
    });
    it('clamps to min', () => {
      expect(clampNumber(-10, 0, 5, 2)).toBe(0);
    });
    it('returns value if within bounds', () => {
      expect(clampNumber(3, 0, 5, 2)).toBe(3);
    });
    it('returns fallback if NaN', () => {
      expect(clampNumber(NaN, 0, 5, 2)).toBe(2);
      expect(clampNumber('not a number' as any, 0, 5, 2)).toBe(2);
    });
  });

  describe('normalizeTimerSoundPath', () => {
    it('keeps the bundled slow tick and clears unknown sounds', () => {
      expect(normalizeTimerSoundPath(BUILT_IN_SLOW_TICK_SOUND_PATH)).toBe(BUILT_IN_SLOW_TICK_SOUND_PATH);
      expect(normalizeTimerSoundPath('media/ticking_fast.mp3')).toBe('');
    });
  });


});

  describe('normalizeMarkdownPath', () => {
    it('normalizes normal paths', () => {
      expect(normalizeMarkdownPath('my-file.md')).toBe('my-file.md');
      expect(normalizeMarkdownPath('Folder/my-file')).toBe('Folder/my-file.md');
    });
    it('normalizes markdown wikilinks', () => {
      expect(normalizeMarkdownPath('[[my-file]]')).toBe('my-file.md');
      expect(normalizeMarkdownPath('![[my-file.jpg]]')).toBe('my-file.jpg.md');
      expect(normalizeMarkdownPath('[[my-file|alias]]')).toBe('my-file.md');
      expect(normalizeMarkdownPath('[[my-file#header]]')).toBe('my-file.md');
    });
    it('trims whitespace and slashes', () => {
      expect(normalizeMarkdownPath('  ///folder/note  ')).toBe('folder/note.md');
    });
  });

  describe('findNoesisFlowDateMarker', () => {
    it('finds standard tag markers', () => {
      const res = findNoesisFlowDateMarker('Todo #2024-05-15 task', { dateMarkerStyle: 'tag' } as any);
      expect(res).toBeDefined();
      expect(res?.dateKey).toBe('2024-05-15');
      expect(res?.marker).toBe('#');
    });
    it('finds double hash markers', () => {
      const res = findNoesisFlowDateMarker('Todo ##2024-05-15 task', { dateMarkerStyle: 'double-hash' } as any);
      expect(res).toBeDefined();
      expect(res?.dateKey).toBe('2024-05-15');
      expect(res?.marker).toBe('##');
    });
    it('returns null if no marker', () => {
      expect(findNoesisFlowDateMarker('Todo task', { dateMarkerStyle: 'tag' } as any)).toBeNull();
    });
  });

  describe('stripNoesisFlowDateMarker', () => {
    it('strips standard tag marker', () => {
      expect(stripNoesisFlowDateMarker('Todo #2024-05-15 task', '2024-05-15', { dateMarkerStyle: 'tag' } as any)).toBe('Todo  task');
    });
    it('strips double hash marker', () => {
       expect(stripNoesisFlowDateMarker('Todo ##2024-05-15 task', '2024-05-15', { dateMarkerStyle: 'double-hash' } as any)).toBe('Todo  task');
    });
  });
  describe('getCalendarWeekStart', () => {
    it('returns correct day index', () => {
      expect(getCalendarWeekStart({ calendarWeekStart: 'sunday' } as any)).toBe(0);
      expect(getCalendarWeekStart({ calendarWeekStart: 'monday' } as any)).toBe(1);
      expect(getCalendarWeekStart({ calendarWeekStart: 'saturday' } as any)).toBe(6);
      expect(getCalendarWeekStart({} as any)).toBe(1); // default to monday
    });
  });
  describe('getCalendarWeekdays', () => {
    it('generates array of 7 days starting with weekStart', () => {
      expect(getCalendarWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(getCalendarWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
      expect(getCalendarWeekdays(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    });
  });
describe('Kanban card appearance options', () => {
  it('keeps the existing card treatment by default and normalizes accent placement', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      kanbanCardPriorityBorders: false,
      kanbanCardAccentPosition: 'left',
      kanbanCardContextDivider: false,
      kanbanCardContextPlacement: 'top',
      kanbanCardContextAlignment: 'left',
      kanbanCardCornerRadius: 6
    });
    expect(normalizeKanbanCardAccentPosition('top')).toBe('top');
    expect(normalizeKanbanCardAccentPosition('invalid')).toBe('left');
    expect(normalizeKanbanCardContextPlacement('bottom')).toBe('bottom');
    expect(normalizeKanbanCardContextPlacement('invalid')).toBe('top');
    expect(normalizeKanbanCardContextAlignment('center')).toBe('center');
    expect(normalizeKanbanCardContextAlignment('invalid')).toBe('left');
  });
});
