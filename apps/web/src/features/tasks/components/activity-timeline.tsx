'use client';

import { ClockIcon } from '@phosphor-icons/react/dist/ssr';
import { formatDistanceToNow } from 'date-fns';
import { formatDateTime } from '@/lib/format';
import type { TaskActivityEntry } from '@projectflow/shared';
import { cn } from '@/lib/utils';

interface ActivityTimelineProps {
  activities: TaskActivityEntry[];
  currentUserId: string;
}

function formatActivity(activity: TaskActivityEntry, currentUserId: string): string {
  const { actor, metadata, type } = activity;
  const { from, to } = metadata;
  const isCurrentUser = actor.id === currentUserId;
  const actorName = isCurrentUser ? 'You' : actor.name;

  if (type === 'TASK_ASSIGNEE_CHANGED') {
    if (!from && to) {
      // Unassigned → Assigned
      const toName = to.id === currentUserId ? 'yourself' : to.name;
      return `${actorName} assigned ${toName}`;
    }
    if (from && !to) {
      // Assigned → Unassigned
      const fromName = from.id === currentUserId ? 'yourself' : from.name;
      return `${actorName} removed ${fromName}`;
    }
    if (from && to) {
      // Assigned → Different user
      const fromName = from.id === currentUserId ? 'themselves' : from.name;
      const toName = to.id === currentUserId ? 'yourself' : to.name;
      return `${actorName} changed the assignee from ${fromName} to ${toName}`;
    }
  }

  return `${actorName} updated the task`;
}

export function ActivityTimeline({ activities, currentUserId }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <ClockIcon size={24} className="mx-auto text-subtle-foreground mb-2" />
        <p className="text-[13px] text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => (
        <div
          key={activity.id}
          className={cn(
            'relative pl-6',
            index < activities.length - 1 && 'before:absolute before:left-[7px] before:top-[20px] before:bottom-0 before:w-[1px] before:bg-border',
          )}
        >
          <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
              <div className="h-3 w-3 rounded-full bg-primary border-2 border-background" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-[13px] text-foreground">{formatActivity(activity, currentUserId)}</p>
              <time
                className="block text-[11px] text-muted-foreground"
                dateTime={activity.createdAt}
                title={formatDateTime(activity.createdAt)}
              >
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </time>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}