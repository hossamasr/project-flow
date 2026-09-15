'use client';

import { ArrowLeftIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CommentList } from '@/features/comments/components/comment-list';
import { formatDate } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/hooks';
import { useTask, useTaskActivity } from '../hooks';
import { useProjectMembers } from '@/features/projects/hooks';
import { AssigneeSelector } from './assignee-selector';
import { ActivityTimeline } from './activity-timeline';
import { TaskPriorityBadge } from './task-priority-badge';
import { TaskStatusSelect } from './task-status-select';

interface TaskViewProps {
  projectId: string;
  taskId: string;
}

function canManageProject(projectRole: string | null, orgRole: string | null): boolean {
  return orgRole === 'OWNER' || orgRole === 'ADMIN' || projectRole === 'PROJECT_MANAGER';
}

export function TaskView({ projectId, taskId }: TaskViewProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: task, isPending, isError, error } = useTask(taskId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: activityData } = useTaskActivity(taskId);

  const currentUserId = currentUser?.id ?? '';
  const userProjectRole = members.find((m) => m.user.id === currentUserId)?.role ?? null;
  const userOrgRole = currentUser?.organizations?.[0]?.role ?? null;
  const canAssign = canManageProject(userProjectRole, userOrgRole) || userProjectRole === 'MEMBER';
  const canAssignOthers = canManageProject(userProjectRole, userOrgRole);

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-[13px] text-danger">
        {error.message}
      </p>
    );
  }

  const handleAssigneeChange = () => {
    // The mutations handle cache updates optimistically
    // Just invalidate to ensure sync
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon size={14} />
        {task.project.name}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <p className="font-mono text-[12px] text-muted-foreground">{task.key}</p>
            <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground">
              {task.title}
            </h1>
          </div>

          <section aria-label="Description">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Description</h2>
            {task.description ? (
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground">
                {task.description}
              </p>
            ) : (
              <p className="text-[13px] italic text-subtle-foreground">
                No description was provided.
              </p>
            )}
          </section>

          <CommentList taskId={taskId} />
        </div>

        <aside className="space-y-5 lg:border-l lg:border-border lg:pl-6">
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
              Status
            </h2>
            <TaskStatusSelect taskId={task.id} projectId={projectId} status={task.status} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
              Priority
            </h2>
            <TaskPriorityBadge priority={task.priority} />
          </div>

          <AssigneeSelector
            taskId={task.id}
            projectId={projectId}
            currentAssignee={task.assignee}
            canAssign={canAssign}
            canAssignOthers={canAssignOthers}
            currentUserId={currentUserId}
            onAssigneeChange={handleAssigneeChange}
          />

          <div className="space-y-1.5">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
              Created by
            </h2>
            <div className="flex items-center gap-2">
              <Avatar user={task.createdBy} size="sm" />
              <span className="truncate text-[13px] text-foreground">{task.createdBy.name}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
              Created
            </h2>
            <p className="text-[13px] text-muted-foreground">{formatDate(task.createdAt)}</p>
          </div>
        </aside>
      </div>

      <section aria-label="Activity" className="mt-10 pt-6 border-t border-border">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Activity</h2>
        <ActivityTimeline
          activities={activityData?.items ?? []}
          currentUserId={currentUserId}
        />
      </section>
    </div>
  );
}
