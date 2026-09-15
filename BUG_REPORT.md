
# BUG REPORT: Unauthorized Task Status Modification

## Executive Summary
**VULNERABILITY CONFIRMED** - Any authenticated user can change the status of any task by knowing its ID, regardless of project membership.

## Root Cause
The `updateStatus` method in `TasksService` (apps/api/src/tasks/tasks.service.ts:121-128) performs **zero authorization checks**:

```typescript
async updateStatus(taskId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);  // Gets task by ID only
    task.status = dto.status;
    await task.save();
    return this.toDetail(task);  // Returns updated task
}
```

The controller endpoint (`tasks.controller.ts:76-82`) doesn't pass the current user's ID:
```typescript
@Patch('tasks/:taskId/status')
updateStatus(@Param('taskId') taskId: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(toObjectId(taskId, 'task id'), dto);
}
```

**Missing:** No `CurrentUser` decorator, no `userId` parameter, no `ProjectAccessService.assertCanView()` call.

## Reproduction Steps

### Manual Reproduction
1. Create two users: Alice (Project A member) and Bob (not in Project A)
2. Alice creates Task X in Project A
3. Bob authenticates and calls: `PATCH /tasks/{taskX_id}/status` with `{ "status": "DONE" }`
4. **Result: 200 OK** - Bob successfully modified a task in a project he's not a member of

## Impact
- Unauthorized data modification
- **Affected endpoints:** `PATCH /tasks/:taskId/status`
- Violates project membership isolation requirement (RULE #1)

## Fix Applied

### Files Changed

#### 1. `apps/api/src/tasks/tasks.service.ts`
```typescript
// BEFORE (vulnerable)
async updateStatus(taskId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail>

// AFTER (fixed)
async updateStatus(taskId: Types.ObjectId, userId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    await this.projectAccessService.assertCanView(task.projectId, userId);  // ADDED
    task.status = dto.status;
    await task.save();
    return this.toDetail(task);
}
```

#### 2. `apps/api/src/tasks/tasks.controller.ts`
```typescript
// BEFORE (vulnerable)
@Patch('tasks/:taskId/status')
updateStatus(@Param('taskId') taskId: string, @Body() dto: UpdateTaskStatusDto)

// AFTER (fixed)
@Patch('tasks/:taskId/status')
updateStatus(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,  // ADDED
    @Body() dto: UpdateTaskStatusDto,
) {
    return this.tasksService.updateStatus(
        toObjectId(taskId, 'task id'),
        toObjectId(userId, 'user id'),  // ADDED
        dto
    );
}
```

## Regression Prevention

### Test Added: `apps/api/src/tasks/tasks.service.spec.ts`
Tests verify:
1. Project member CAN update task status
2. Project OWNER/ADMIN/PM CAN update task status  
3. Non-member CANNOT update task status (403 Forbidden)
4. Organization OWNER/ADMIN CAN update task status (elevated org role)
5. Task creator CAN update task status (existing behavior preserved)

## Lessons Learned
1. All endpoints must validate server-side
2. All mutating endpoints should use `ProjectAccessService`