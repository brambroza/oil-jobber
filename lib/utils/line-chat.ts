/**
 * Display helpers for the LINE chat page. Dates follow the system-wide
 * `DD/MM/YYYY` Bangkok format from `date-format.ts`.
 */

import { formatDate, formatDateTime } from '@/lib/utils/date-format';

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_GAP_MS = 5 * 60 * 1000;

type ChatMessageLike = { direction: string; created_at: string };

export type MessageRunItem<T> = {
  message: T;
  startsRun: boolean;
  endsRun: boolean;
};

export type MessageDayGroup<T> = {
  key: string;
  label: string;
  items: MessageRunItem<T>[];
};

/**
 * Formats the clock part of an instant.
 *
 * @param value - ISO timestamp
 * @returns `HH:mm` in Bangkok time, or `-` when unparseable
 */
export function formatClockTime(value: string): string {
  return formatDateTime(value, '').split(' ')[1] ?? '-';
}

/**
 * Labels a calendar day relative to now.
 *
 * @param value - ISO timestamp
 * @param now - reference instant
 * @returns `วันนี้`, `เมื่อวาน` or `DD/MM/YYYY`
 */
export function formatDayLabel(value: string, now: Date = new Date()): string {
  const day = formatDate(value);
  if (day === formatDate(now)) return 'วันนี้';
  if (day === formatDate(new Date(now.getTime() - DAY_MS))) return 'เมื่อวาน';
  return day;
}

/**
 * Formats the timestamp shown on a conversation row.
 *
 * @param value - ISO timestamp
 * @param now - reference instant
 * @returns `HH:mm` for today, otherwise the day label
 */
export function formatConversationTime(value: string, now: Date = new Date()): string {
  const label = formatDayLabel(value, now);
  return label === 'วันนี้' ? formatClockTime(value) : label;
}

/**
 * Orders conversations newest first; rooms without messages go last.
 *
 * @param conversations - rows from `/api/line/customers`
 * @returns a sorted copy
 */
export function sortConversations<T extends { last_message_at: string | null }>(conversations: T[]): T[] {
  const time = (c: T) => (c.last_message_at ? new Date(c.last_message_at).getTime() || 0 : 0);
  return [...conversations].sort((a, b) => time(b) - time(a));
}

function isSameRun(a: ChatMessageLike | undefined, b: ChatMessageLike | undefined): boolean {
  if (!a || !b || a.direction !== b.direction) return false;
  if (formatDate(a.created_at) !== formatDate(b.created_at)) return false;
  return Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) <= RUN_GAP_MS;
}

/**
 * Splits messages into day sections and marks runs of consecutive messages
 * from one side, so a run can share a single timestamp and avatar.
 *
 * @param messages - messages in ascending time order
 * @param now - reference instant for the day labels
 * @returns day groups in the same order
 */
export function groupMessagesByDay<T extends ChatMessageLike>(messages: T[], now: Date = new Date()): MessageDayGroup<T>[] {
  const groups: MessageDayGroup<T>[] = [];
  messages.forEach((message, index) => {
    const key = formatDate(message.created_at);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatDayLabel(message.created_at, now), items: [] };
      groups.push(group);
    }
    group.items.push({
      message,
      startsRun: !isSameRun(messages[index - 1], message),
      endsRun: !isSameRun(message, messages[index + 1]),
    });
  });
  return groups;
}
