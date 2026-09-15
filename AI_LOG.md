# AI Usage Log

## 01 Tools Used
- **Claude (Opencode agent)** Primary assistant for all implementation, debugging, and review tasks

## 02 How Used
- **Exploration**: Codebase walkthrough to understand existing patterns (modules, authZ, shared types, FE hooks)
- **Planning**: Created implementation plans for task assignment, activity history, concurrent creation, scaling
- **Implementation**: helping in frontend (components, hooks, API)
- **Debugging**: Fixed circular dependency (TasksService ↔ TaskActivityService) , lint errors, import issues
- **Test generation**: Created 28 integration tests covering all business rules for assignment/activity/concurrency

## 03 Suggestions Rejected
- **Retry-on-duplicate for task numbers**: AI initially suggested catching duplicate key error and retrying with new count. Rejected non-deterministic latency, fails under high contention. Chose atomic counter with `$inc` instead.
- **Offset pagination at scale**: Rejected O(N) scan degrades. Chose cursor-based (index seek)
- **Sharding by taskId early**: Rejected adds operational complexity.

## 04 Generated Code Modified
- **TaskActivityService**: AI first injected `TasksService` creating circular dependency. Modified to inject `TaskModel` directly and do `findById` locally.
- **Concurrency test**: AI generated test with `Promise.all` but MongoDB Memory Server timed out in this environment. Test logic is correct; kept for documentation. Build/lint pass.
