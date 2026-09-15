'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, TaskActivityEntry, TaskDetail, TaskStatus, TaskSummary } from '@projectflow/shared';
import { queryKeys } from '@/lib/query-keys';
import {
  assignTask,
  createTask,
  fetchProjectTasks,
  fetchTask,
  fetchTaskActivity,
  type CreateTaskPayload,
  unassignTask,
  updateTaskStatus,
} from './api';

export function useProjectTasks(projectId: string) {
  return useQuery<Paginated<TaskSummary>>({
    queryKey: queryKeys.projectTasks(projectId),
    queryFn: () => fetchProjectTasks(projectId),
    enabled: projectId.length > 0,
  });
}

export function useTask(taskId: string) {
  return useQuery<TaskDetail>({
    queryKey: queryKeys.task(taskId),
    queryFn: () => fetchTask(taskId),
    enabled: taskId.length > 0,
  });
}

export function useTaskActivity(taskId: string) {
  return useQuery<Paginated<TaskActivityEntry>>({
    queryKey: ['tasks', taskId, 'activity'],
    queryFn: () => fetchTaskActivity(taskId),
    enabled: taskId.length > 0,
  });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, CreateTaskPayload>({
    mutationFn: (payload) => createTask(projectId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
    },
  });
}

export function useUpdateTaskStatus(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, TaskStatus>({
    mutationFn: (status) => updateTaskStatus(taskId, status),
    onSuccess: async (task) => {
      queryClient.setQueryData(queryKeys.task(taskId), task);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useAssignTask(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, { assigneeId?: string }, { previousTask?: TaskDetail }>({
    mutationFn: (payload) => assignTask(taskId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previousTask = queryClient.getQueryData<TaskDetail>(queryKeys.task(taskId));
      
      if (previousTask) {
        const assignee = payload.assigneeId 
          ? { id: payload.assigneeId, name: 'Loading...', email: '', avatarUrl: null }
          : null;
        queryClient.setQueryData(queryKeys.task(taskId), {
          ...previousTask,
          assignee,
        });
      }
      
      return { previousTask };
    },
    onError: (_err, _payload, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(queryKeys.task(taskId), context.previousTask);
      }
    },
    onSuccess: async (task) => {
      queryClient.setQueryData(queryKeys.task(taskId), task);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
      await queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'activity'] });
    },
  });
}

export function useUnassignTask(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void, { previousTask?: TaskDetail }>({
    mutationFn: () => unassignTask(taskId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.task(taskId) });
      const previousTask = queryClient.getQueryData<TaskDetail>(queryKeys.task(taskId));
      
      if (previousTask) {
        queryClient.setQueryData(queryKeys.task(taskId), {
          ...previousTask,
          assignee: null,
        });
      }
      
      return { previousTask };
    },
    onError: (_err, _payload, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(queryKeys.task(taskId), context.previousTask);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
      await queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'activity'] });
    },
  });
}
