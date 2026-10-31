import { describe, expect, it } from 'vitest';
import {
  formatClockTime,
  formatConversationTime,
  formatDayLabel,
  groupMessagesByDay,
  sortConversations,
} from '@/lib/utils/line-chat';

const NOW = new Date('2026-10-31T05:00:00Z'); // 12:00 Bangkok

describe('formatClockTime', () => {
  it('prints Bangkok time', () => {
    expect(formatClockTime('2026-10-31T02:05:00Z')).toBe('09:05');
  });

  it('returns a dash for empty or unparseable input', () => {
    expect(formatClockTime('')).toBe('-');
    expect(formatClockTime('not-a-date')).toBe('-');
  });
});

describe('formatDayLabel', () => {
  it('labels today and yesterday', () => {
    expect(formatDayLabel('2026-10-31T01:00:00Z', NOW)).toBe('วันนี้');
    expect(formatDayLabel('2026-10-30T01:00:00Z', NOW)).toBe('เมื่อวาน');
  });

  it('uses the Bangkok calendar day, not UTC', () => {
    expect(formatDayLabel('2026-10-30T18:00:00Z', NOW)).toBe('วันนี้');
    expect(formatDayLabel('2026-10-30T16:59:00Z', NOW)).toBe('เมื่อวาน');
  });

  it('prints the date for older days', () => {
    expect(formatDayLabel('2026-10-29T01:00:00Z', NOW)).toBe('29/10/2026');
  });
});

describe('formatConversationTime', () => {
  it('shows the clock for today and the day label otherwise', () => {
    expect(formatConversationTime('2026-10-31T02:05:00Z', NOW)).toBe('09:05');
    expect(formatConversationTime('2026-10-30T02:05:00Z', NOW)).toBe('เมื่อวาน');
    expect(formatConversationTime('2026-10-01T02:05:00Z', NOW)).toBe('01/10/2026');
  });
});

describe('sortConversations', () => {
  it('sorts newest first, keeps empty rooms last and does not mutate', () => {
    const rooms = [
      { id: 'empty', last_message_at: null },
      { id: 'old', last_message_at: '2026-10-01T00:00:00Z' },
      { id: 'new', last_message_at: '2026-10-30T00:00:00Z' },
    ];
    expect(sortConversations(rooms).map((r) => r.id)).toEqual(['new', 'old', 'empty']);
    expect(rooms[0].id).toBe('empty');
  });
});

describe('groupMessagesByDay', () => {
  const msg = (direction: string, created_at: string) => ({ direction, created_at });

  it('returns nothing for no messages', () => {
    expect(groupMessagesByDay([], NOW)).toEqual([]);
  });

  it('splits on the Bangkok day boundary', () => {
    const groups = groupMessagesByDay([
      msg('IN', '2026-10-30T16:50:00Z'),
      msg('IN', '2026-10-30T17:10:00Z'),
    ], NOW);
    expect(groups.map((g) => g.label)).toEqual(['เมื่อวาน', 'วันนี้']);
    expect(groups[0].items[0].endsRun).toBe(true);
    expect(groups[1].items[0].startsRun).toBe(true);
  });

  it('joins same-side messages within five minutes into one run', () => {
    const [{ items }] = groupMessagesByDay([
      msg('IN', '2026-10-31T02:00:00Z'),
      msg('IN', '2026-10-31T02:05:00Z'),
      msg('IN', '2026-10-31T02:10:01Z'),
    ], NOW);
    expect(items.map((i) => [i.startsRun, i.endsRun])).toEqual([
      [true, false],
      [false, true],
      [true, true],
    ]);
  });

  it('breaks a run when the side changes', () => {
    const [{ items }] = groupMessagesByDay([
      msg('IN', '2026-10-31T02:00:00Z'),
      msg('OUT', '2026-10-31T02:01:00Z'),
    ], NOW);
    expect(items.every((i) => i.startsRun && i.endsRun)).toBe(true);
  });
});
