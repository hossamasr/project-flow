'use client';

import { useState } from 'react';
import { XIcon, UserPlusIcon, MagnifyingGlassIcon, CircleNotchIcon } from '@phosphor-icons/react/dist/ssr';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserSummary } from '@projectflow/shared';
import { cn } from '@/lib/utils';
import { useProjectMembers } from '@/features/projects/hooks';
import { useAssignTask, useUnassignTask } from '../hooks';

interface AssigneeSelectorProps {
  taskId: string;
  projectId: string;
  currentAssignee: UserSummary | null;
  canAssign: boolean;
  canAssignOthers: boolean;
  currentUserId: string;
  onAssigneeChange: () => void;
}

export function AssigneeSelector({
  taskId,
  projectId,
  currentAssignee,
  canAssign,
  canAssignOthers,
  currentUserId,
  onAssigneeChange,
}: AssigneeSelectorProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { data: members = [], isLoading: isLoadingMembers } = useProjectMembers(projectId);
  const assignMutation = useAssignTask(taskId, projectId);
  const unassignMutation = useUnassignTask(taskId, projectId);

  const isSelf = currentAssignee?.id === currentUserId;
  const isAssigned = currentAssignee !== null;
  const canUnassign = canAssign && (canAssignOthers || isSelf);

  const filteredMembers = members.filter(
    (member) =>
      member.user.name.toLowerCase().includes(search.toLowerCase()) ||
      member.user.email.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAssign = async (memberId: string) => {
    try {
      await assignMutation.mutateAsync({ assigneeId: memberId });
      onAssigneeChange();
    } catch {
    }
  };

  const handleUnassign = async () => {
    try {
      await unassignMutation.mutateAsync();
      onAssigneeChange();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-1.5">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
        Assignee
      </h2>

      {isAssigned ? (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[13px]',
                'hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-60',
                !canAssign && 'opacity-60 cursor-not-allowed',
              )}
              disabled={!canAssign || assignMutation.isPending || unassignMutation.isPending}
            >
              <Avatar user={currentAssignee!} size="sm" />
              <span className="truncate font-medium">{currentAssignee!.name}</span>
              <XIcon size={14} className="text-subtle-foreground ml-auto" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="capitalize">
              {currentAssignee!.name}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canUnassign && (
              <DropdownMenuItem
                onClick={handleUnassign}
                disabled={unassignMutation.isPending}
                className="text-danger focus:text-danger"
              >
                {unassignMutation.isPending ? (
                  <>
                    <CircleNotchIcon size={13} className="mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Unassign'
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setIsOpen(true)}
              disabled={!canAssignOthers && !isSelf || assignMutation.isPending}
              className={cn((!canAssignOthers && !isSelf) && 'opacity-50')}
            >
              <UserPlusIcon size={13} className="mr-2" />
              Reassign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[13px]',
                'hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-60',
                'data-[placeholder]:text-subtle-foreground',
                !canAssign && 'opacity-60 cursor-not-allowed',
              )}
              disabled={!canAssign || assignMutation.isPending}
            >
              <div className="h-6 w-6 rounded-full border border-border bg-surface-strong" />
              <span className="truncate">Assign user</span>
              <UserPlusIcon size={14} className="text-subtle-foreground ml-auto" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="p-1">
              <div className="relative">
                <MagnifyingGlassIcon size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-subtle-foreground" />
                <Input
                  placeholder="Search members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-[13px]"
                  onFocus={() => setIsOpen(true)}
                  autoComplete="off"
                  disabled={isLoadingMembers}
                />
              </div>
            </div>
            <DropdownMenuSeparator />
            {isLoadingMembers ? (
              <div className="py-2 space-y-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <DropdownMenuLabel className="py-2 text-center text-muted-foreground">
                No members found
              </DropdownMenuLabel>
            ) : (
              filteredMembers.map((member) => (
                <DropdownMenuItem
                  key={member.user.id}
                  onClick={() => handleAssign(member.user.id)}
                  disabled={assignMutation.isPending}
                >
                  <Avatar user={member.user} size="sm" className="mr-2" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{member.user.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{member.user.email}</p>
                  </div>
                  {assignMutation.variables?.assigneeId === member.user.id && assignMutation.isPending && (
                    <CircleNotchIcon size={13} className="ml-2 animate-spin text-primary" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}