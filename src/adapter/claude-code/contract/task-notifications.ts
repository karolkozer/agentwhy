/**
 * A report delivered late (`specs/2026-09-15-where-the-value-went.md` R1, R5). An agent started in the background
 * answers its delegating call with a launch notice, and its report reaches the calling agent afterwards, in a
 * notification on a user line of its own. A `queue-operation` line queues the same words first; it is not a delivery,
 * since a queued line can be removed, and it stays skipped.
 */
export const TASK_NOTIFICATION = {
  opening: '<task-notification>',
  closing: '</task-notification>',
  /** The tag holding the id of the call a notification answers: a delegating call's, 6 of 6 measured. */
  callIdTag: 'tool-use-id',
} as const;

/** On a delegating result's payload: the field, and the value that makes the result a launch notice. */
export const LAUNCH_NOTICE = {
  statusField: 'status',
  launchedStatus: 'async_launched',
} as const;

export interface Notification {
  /** The id its call tag holds. Absent when the notification carries no such tag. */
  readonly callId?: string;
  /** The notification as written, from its opening tag to its closing one - or to the next opening, or the end. */
  readonly text: string;
}

const CALL_ID = new RegExp(`<${TASK_NOTIFICATION.callIdTag}>\\s*([^<\\s]+)\\s*</${TASK_NOTIFICATION.callIdTag}>`);

/** Every notification in a line's words, in the order written. */
export function notificationsIn(words: string): Notification[] {
  const { opening, closing } = TASK_NOTIFICATION;
  const notifications: Notification[] = [];

  for (let from = words.indexOf(opening); from !== -1; ) {
    const next = words.indexOf(opening, from + opening.length);
    const close = words.indexOf(closing, from);
    const end = close !== -1 && (next === -1 || close < next) ? close + closing.length : next === -1 ? words.length : next;
    const text = words.slice(from, end);
    const callId = CALL_ID.exec(text)?.[1];
    notifications.push(callId === undefined ? { text } : { callId, text });
    from = next;
  }
  return notifications;
}
