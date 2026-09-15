# ADR: Concurrent Task Creation - Atomic Sequence Number Generation

## Context
Tasks have a project-scoped sequential identifier (`ENG-101`, `ENG-102`, etc.). The original implementation used a read-then-write pattern:

```typescript
const taskCount = await this.taskModel.countDocuments({ projectId });
const number = taskCount + 1;
await this.taskModel.create({ ..., number, key: `${project.key}-${number}` });
```

This has a **race condition**: two concurrent requests can read the same count, both compute `count + 1`, and both attempt to insert with the same number. The unique index on `{ projectId: 1, number: 1 }` would cause one to fail with a duplicate key error (MongoDB error 11000), but the error wasn't handled.

## Decision
Use a dedicated **counter collection** with MongoDB's atomic `findOneAndUpdate` + `$inc`:

```typescript
const counter = await this.counterModel.findOneAndUpdate(
  { projectId },
  { $inc: { seq: 1 } },
  { new: true, upsert: true, setDefaultsOnInsert: true },
).exec();
const number = counter.seq;
```

## Why This Approach

| Approach | Pros | Cons | Chosen? |
|----------|------|------|---------|
| **Counter collection + `$inc`** | Atomic, single round-trip, no retries, linearizable | Extra collection | ✅ Yes |
| Unique index + retry on duplicate | Simple, no extra collection | Non-deterministic retries, higher latency under contention | No |
| Application-level lock (mutex) | Works across any DB | Doesn't scale across replicas, single point of failure | No |
| `countDocuments` + optimistic lock | Familiar pattern | Race condition still exists | No |

## Key Properties

1. **Atomicity**: `findOneAndUpdate` with `$inc` is a single atomic operation in MongoDB. No two requests can get the same sequence value.

2. **Linearizable**: Each increment is totally ordered. Request A gets N, Request B gets N+1.

3. **Upsert**: `upsert: true` creates the counter document on first task creation for a project.

4. **Idempotent-ish**: If the task creation fails after counter increment, the number is "burned" (gap in sequence). This is acceptable for display IDs.

5. **Performance**: One extra write per task creation. Counter document stays in memory (small, frequently accessed).

## Schema
```typescript
// apps/api/src/tasks/schemas/task-counter.schema.ts
@Schema({ collection: 'task_counters' })
export class TaskCounter {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, unique: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  seq: number;
}
```

Unique index on `projectId` ensures one counter per project.

## Migration Note
Existing tasks keep their numbers. New tasks continue from the highest existing number + 1 because the counter starts at 0 and increments on first use. The first concurrent creation after deployment gets `max(existing) + 1` via the atomic increment.

## Testing
- Unit test: Verify `create()` calls `counterModel.findOneAndUpdate` with correct params
- Concurrency test: Fire N parallel `create` requests, assert all N tasks have unique sequential numbers
