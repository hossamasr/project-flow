# Scaling the Activity System

## Current State (5K users)
- Single `task_activities` collection
- Offset pagination (`skip`/`limit`)
- Synchronous writes in assignment path
- No retention policy
- Queries: `findByTask(taskId)` sorted by `createdAt: -1`

---

## Evolution Plan

### Phase 1: 50K Users (~5M records)   Immediate

#### Cursor-Based Pagination
**Change:** Replace offset with cursor (`createdAt` + `_id` tiebreaker)

```typescript
// Before: skip/limit (O(N) scan)
find({ taskId }).sort({ createdAt: -1 }).skip(10000).limit(25)

// After: cursor (index seek)
find({ taskId, $or: [
  { createdAt: { $lt: cursorDate } },
  { createdAt: cursorDate, _id: { $lt: cursorId } }
]}).sort({ createdAt: -1, _id: -1 }).limit(25)
```

**Why:** Offset pagination requires scanning skipped documents. Cursor uses index seek O(log N) regardless of page depth.

#### Background Job for Activity Writes
**Change:** Decouple activity creation from assignment request

```typescript
// In assign():
await this.taskActivityQueue.add('log-assignee-change', {
  taskId, actorId, from, to
});
return this.toDetail(task, access.project); // Fast response
```

**Why:** Assignment latency no longer includes activity write. Queue absorbs bursts. Retryable on failure.

**Queue:** BullMQ (Redis) or Kafka. Start with BullMQ   simpler ops.

---

### Phase 2: 200K Users (~20M records)   6-12 Months

#### Partitioned Collection (Time-Based)
**Change:** Split `task_activities` by month: `task_activities_2026_01`, `task_activities_2026_02`, ...

**Why:** 
- Smaller working set per partition
- Faster indexes, cheaper compaction
- Easy archival (drop old partitions)

### Phase 3: 500K Users (~50M+ records)   12-18 Months

#### Materialized Aggregations
**Change:** Pre-compute common queries

| Query | Aggregation |
|-------|-------------|
| "How many assignments this week?" | Daily counter in `task_activity_daily_stats` |
| "Top assignees" | Incremental leaderboard in Redis sorted set |
| "Activity feed for user" | Denormalized per-user feed (write fan-out) |

**Why:** Avoid scanning millions of docs for dashboards.

#### Observability
**Add:**
- Metrics: `activity_write_latency_p99`, `activity_queue_lag`, `partition_size_gb`
- Alerts: queue lag > 5min, partition > 10GB
---


## What NOT to Do

| Anti-Pattern | Why |
|--------------|-----|
| Elasticsearch for activity search | Not required activity is chronological, not full-text |
| Delete old activity | Compliance risk; archive instead |

---

Each phase ships value independently. No big bang rewrite.